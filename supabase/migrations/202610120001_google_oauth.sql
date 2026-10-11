-- Google OAuth session and encrypted token storage for NN.
-- Apply this migration manually in the intended Supabase project after review.
-- Never expose SUPABASE_SERVICE_ROLE_KEY or GOOGLE_TOKEN_ENCRYPTION_KEY to the browser.

create table if not exists public.nn_google_oauth_sessions (
  session_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  oauth_state_hash text,
  pkce_verifier text,
  oauth_service text check (oauth_service in ('gmail', 'calendar') or oauth_service is null),
  oauth_expires_at timestamptz
);

create index if not exists nn_google_oauth_sessions_expires_at_idx
  on public.nn_google_oauth_sessions (expires_at);

create table if not exists public.nn_google_connections (
  session_hash text primary key
    references public.nn_google_oauth_sessions(session_hash) on delete cascade,
  google_email text not null,
  scopes text[] not null default '{}',
  access_token_enc text not null,
  refresh_token_enc text not null,
  access_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nn_google_oauth_sessions enable row level security;
alter table public.nn_google_connections enable row level security;

revoke all on table public.nn_google_oauth_sessions from anon, authenticated;
revoke all on table public.nn_google_connections from anon, authenticated;
grant all on table public.nn_google_oauth_sessions to service_role;
grant all on table public.nn_google_connections to service_role;

drop policy if exists nn_google_oauth_sessions_service_role_only on public.nn_google_oauth_sessions;
create policy nn_google_oauth_sessions_service_role_only
  on public.nn_google_oauth_sessions
  for all to service_role
  using (true)
  with check (true);

drop policy if exists nn_google_connections_service_role_only on public.nn_google_connections;
create policy nn_google_connections_service_role_only
  on public.nn_google_connections
  for all to service_role
  using (true)
  with check (true);

comment on table public.nn_google_oauth_sessions is
  'Server-only ephemeral OAuth state and hashed opaque browser sessions. Never query from a browser client.';
comment on table public.nn_google_connections is
  'Server-only Google OAuth connection; OAuth tokens are AES-256-GCM encrypted before persistence.';


-- Server-enforced rolling-hour limits for email sends and calendar invitations.
create table if not exists public.nn_google_rate_limits (
  session_hash text not null
    references public.nn_google_oauth_sessions(session_hash) on delete cascade,
  action text not null check (action in ('gmail_send', 'calendar_create')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (session_hash, action)
);

alter table public.nn_google_rate_limits enable row level security;
revoke all on table public.nn_google_rate_limits from anon, authenticated;
grant all on table public.nn_google_rate_limits to service_role;

create or replace function public.nn_consume_google_rate_limit(
  p_session_hash text,
  p_action text,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_count integer;
begin
  if p_action not in ('gmail_send', 'calendar_create') or p_limit < 1 or p_limit > 1000 then
    return false;
  end if;

  insert into public.nn_google_rate_limits as current_row
    (session_hash, action, window_started_at, request_count)
  values (p_session_hash, p_action, pg_catalog.now(), 1)
  on conflict (session_hash, action) do update
    set window_started_at = case
          when current_row.window_started_at < pg_catalog.now() - interval '1 hour' then pg_catalog.now()
          else current_row.window_started_at
        end,
        request_count = case
          when current_row.window_started_at < pg_catalog.now() - interval '1 hour' then 1
          else current_row.request_count + 1
        end
  returning request_count into new_count;

  return new_count <= p_limit;
end;
$function$;

revoke all on function public.nn_consume_google_rate_limit(text, text, integer) from public, anon, authenticated;
grant execute on function public.nn_consume_google_rate_limit(text, text, integer) to service_role;

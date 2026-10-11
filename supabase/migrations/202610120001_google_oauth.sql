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

export type ApiRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
export type ApiResponse = {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string | string[]): void;
  json(value: unknown): void;
  send(value: unknown): void;
  end(): void;
  redirect(status: number, url: string): void;
};
type DbRow = Record<string, unknown>;
const SESSION_TABLE = 'nn_google_oauth_sessions';
const CONNECTION_TABLE = 'nn_google_connections';
const SESSION_COOKIE = 'nn_google_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

export function env(name: string): string {
  const runtime = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return runtime?.env?.[name] ?? '';
}
export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}
export function methodNotAllowed(res: ApiResponse, allowed: string): void {
  res.setHeader('Allow', allowed);
  sendJson(res, 405, { error: 'method_not_allowed' });
}
export function header(req: ApiRequest, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
export function appOrigin(): string {
  return env('NN_APP_ORIGIN').replace(/\/+$/, '');
}
export function originAllowed(req: ApiRequest): boolean {
  const expected = appOrigin();
  return Boolean(expected && header(req, 'origin') === expected);
}
export function readJson(req: ApiRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try {
      const parsed: unknown = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
}
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
export function randomToken(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64Url(bytes);
}
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function encryptionKey(): Promise<CryptoKey> {
  const raw = fromBase64(env('GOOGLE_TOKEN_ENCRYPTION_KEY'));
  if (raw.byteLength !== 32) throw new Error('token_encryption_key_invalid');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return base64Url(combined);
}
export async function decryptSecret(value: string): Promise<string> {
  const combined = fromBase64(value);
  if (combined.length < 29) throw new Error('encrypted_token_invalid');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, await encryptionKey(), combined.slice(12));
  return new TextDecoder().decode(plain);
}
function cookieValue(req: ApiRequest, name: string): string {
  const cookie = header(req, 'cookie');
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}
function setSessionCookie(res: ApiResponse, value: string): void {
  res.setHeader('Set-Cookie', SESSION_COOKIE + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + String(SESSION_DAYS * 86400) + '; HttpOnly; Secure; SameSite=Lax');
}
function supabaseConfig(): { url: string; key: string } {
  const url = env('SUPABASE_URL').replace(/\/+$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('supabase_server_config_missing');
  return { url, key };
}
async function dbRequest(table: string, query: string, method = 'GET', body?: unknown, prefer?: string): Promise<DbRow[]> {
  const config = supabaseConfig();
  const response = await fetch(config.url + '/rest/v1/' + table + (query ? '?' + query : ''), {
    method,
    headers: {
      apikey: config.key,
      Authorization: 'Bearer ' + config.key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) throw new Error('server_storage_request_failed_' + response.status);
  if (response.status === 204) return [];
  const text = await response.text();
  if (!text) return [];
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed as DbRow[] : [];
}
function filterHash(hash: string): string {
  return 'session_hash=eq.' + encodeURIComponent(hash) + '&select=*';
}
async function getSessionByHash(hash: string): Promise<DbRow | null> {
  const rows = await dbRequest(SESSION_TABLE, filterHash(hash));
  return rows[0] ?? null;
}
async function getConnectionByHash(hash: string): Promise<DbRow | null> {
  const rows = await dbRequest(CONNECTION_TABLE, filterHash(hash));
  return rows[0] ?? null;
}
export async function connectionForSession(hash: string): Promise<DbRow | null> {
  return getConnectionByHash(hash);
}
async function deleteByHash(table: string, hash: string): Promise<void> {
  await dbRequest(table, 'session_hash=eq.' + encodeURIComponent(hash), 'DELETE');
}
export async function getSession(req: ApiRequest): Promise<{ hash: string; row: DbRow } | null> {
  const cookie = cookieValue(req, SESSION_COOKIE);
  if (!cookie) return null;
  const hash = await sha256Hex(cookie);
  const row = await getSessionByHash(hash);
  if (!row || typeof row.expires_at !== 'string' || Date.parse(row.expires_at) <= Date.now()) return null;
  return { hash, row };
}
export async function ensureSession(req: ApiRequest, res: ApiResponse): Promise<{ hash: string; row: DbRow }> {
  const currentCookie = cookieValue(req, SESSION_COOKIE);
  if (currentCookie) {
    const hash = await sha256Hex(currentCookie);
    const row = await getSessionByHash(hash);
    if (row && typeof row.expires_at === 'string' && Date.parse(row.expires_at) > Date.now()) return { hash, row };
    if (row) {
      await deleteByHash(CONNECTION_TABLE, hash);
      await deleteByHash(SESSION_TABLE, hash);
    }
  }
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  const rows = await dbRequest(SESSION_TABLE, 'on_conflict=session_hash&select=*', 'POST', { session_hash: hash, expires_at: expiresAt }, 'resolution=merge-duplicates,return=representation');
  const row = rows[0] ?? await getSessionByHash(hash);
  if (!row) throw new Error('session_create_failed');
  setSessionCookie(res, token);
  return { hash, row };
}
export async function updateSession(hash: string, patch: Record<string, unknown>): Promise<void> {
  await dbRequest(SESSION_TABLE, 'session_hash=eq.' + encodeURIComponent(hash), 'PATCH', patch, 'return=minimal');
}
export async function saveConnection(row: Record<string, unknown>): Promise<DbRow> {
  const rows = await dbRequest(CONNECTION_TABLE, 'on_conflict=session_hash&select=*', 'POST', row, 'resolution=merge-duplicates,return=representation');
  if (rows[0]) return rows[0];
  const hash = String(row.session_hash ?? '');
  const existing = await getConnectionByHash(hash);
  if (!existing) throw new Error('connection_save_failed');
  return existing;
}
export async function deleteConnection(hash: string): Promise<void> {
  await deleteByHash(CONNECTION_TABLE, hash);
}
export async function googleAuthUrl(service: 'gmail' | 'calendar', state: string, challenge: string, existingConnection: DbRow | null): Promise<string> {
  const clientId = env('GOOGLE_CLIENT_ID');
  const redirectUri = env('GOOGLE_REDIRECT_URI');
  if (!clientId || !redirectUri || !appOrigin()) throw new Error('google_oauth_config_missing');
  const scope = service === 'gmail' ? GMAIL_SEND_SCOPE : CALENDAR_SCOPE;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email ' + scope,
    access_type: 'offline',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  if (!existingConnection || typeof existingConnection.refresh_token_enc !== 'string' || !existingConnection.refresh_token_enc) params.set('prompt', 'consent');
  return GOOGLE_AUTH + '?' + params.toString();
}
export async function exchangeGoogleCode(code: string, verifier: string): Promise<Record<string, unknown>> {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  const redirectUri = env('GOOGLE_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) throw new Error('google_oauth_config_missing');
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier })
  });
  if (!response.ok) throw new Error('google_code_exchange_failed');
  return await response.json() as Record<string, unknown>;
}
export async function getGoogleAccessToken(hash: string, requiredScope: string): Promise<{ token: string; connection: DbRow }> {
  const connection = await getConnectionByHash(hash);
  if (!connection) throw new Error('google_not_connected');
  const scopes = Array.isArray(connection.scopes) ? connection.scopes as string[] : [];
  if (!scopes.includes(requiredScope)) throw new Error('google_scope_missing');
  if (typeof connection.access_token_enc !== 'string' || !connection.access_token_enc) throw new Error('google_access_token_missing');
  const expiresAt = typeof connection.access_expires_at === 'string' ? Date.parse(connection.access_expires_at) : 0;
  if (expiresAt > Date.now() + 60000) return { token: await decryptSecret(connection.access_token_enc), connection };
  if (typeof connection.refresh_token_enc !== 'string' || !connection.refresh_token_enc) throw new Error('google_reauthorization_required');
  const refreshToken = await decryptSecret(connection.refresh_token_enc);
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('google_oauth_config_missing');
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  if (!response.ok) throw new Error('google_refresh_failed');
  const tokenResponse = await response.json() as Record<string, unknown>;
  if (typeof tokenResponse.access_token !== 'string') throw new Error('google_refresh_invalid_response');
  const updated = await saveConnection({
    session_hash: hash,
    google_email: connection.google_email,
    scopes,
    access_token_enc: await encryptSecret(tokenResponse.access_token),
    refresh_token_enc: connection.refresh_token_enc,
    access_expires_at: new Date(Date.now() + Number(tokenResponse.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString()
  });
  return { token: tokenResponse.access_token, connection: updated };
}
export function appRedirect(res: ApiResponse, status: string): void {
  const origin = appOrigin();
  if (!origin) {
    sendJson(res, 500, { error: 'app_origin_not_configured' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, origin + '/?google=' + encodeURIComponent(status));
}
export function parseUrl(req: ApiRequest): URL {
  return new URL(req.url ?? '/', 'https://nn.invalid');
}
export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const allowed = ['google_oauth_config_missing', 'google_code_exchange_failed', 'google_refresh_failed', 'google_refresh_invalid_response', 'google_not_connected', 'google_scope_missing', 'google_access_token_missing', 'google_reauthorization_required', 'google_identity_lookup_failed', 'google_refresh_token_missing', 'token_encryption_key_invalid', 'supabase_server_config_missing', 'session_create_failed', 'connection_save_failed', 'encrypted_token_invalid'];
  return allowed.includes(message) ? message : 'server_integration_error';
}
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(GOOGLE_REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
}
export async function googleUserInfo(accessToken: string): Promise<{ email: string }> {
  const response = await fetch(GOOGLE_USERINFO, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!response.ok) throw new Error('google_identity_lookup_failed');
  const data = await response.json() as Record<string, unknown>;
  if (typeof data.email !== 'string' || data.email_verified !== true) throw new Error('google_identity_lookup_failed');
  return { email: data.email };
}
export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function base64UrlText(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

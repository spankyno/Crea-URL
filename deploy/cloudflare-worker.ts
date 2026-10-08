/**
 * Cloudflare Full-Stack Worker / Pages Function for Crea URL
 * Frontend estático + API + D1 (metadatos) + Supabase Storage (HTML)
 */

import { TEMPLATES } from './templates';

export interface D1Statement {
  bind(...params: any[]): D1Statement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<any>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

export interface Env {
  DB: D1Database;
  RATE_LIMIT_KV?: KVNamespace;
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET?: string;
  // Autenticación (Clerk): se necesita CLERK_PUBLISHABLE_KEY o CLERK_ISSUER
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_ISSUER?: string; // p. ej. https://xxxx.clerk.accounts.dev
  ADMIN_USER_IDS?: string; // ids de usuario de Clerk separados por comas
  ADMIN_EMAILS?: string; // correos separados por comas (requiere claim "email" en el token)
  // Contraseñas de página
  PASSWORD_HASH_ITERATIONS?: string; // por defecto 50000; máximo 100000 (límite de Workers)
}

// ---------------------------------------------------------------------------
// Contraseñas de página: PBKDF2-SHA256 con sal aleatoria por página.
// Formato almacenado: pbkdf2$<iteraciones>$<sal base64>$<hash base64>
// Los hashes antiguos (SHA-256 hexadecimal de 64 caracteres) se siguen aceptando
// y se actualizan automáticamente al formato nuevo tras un acceso correcto.
// ---------------------------------------------------------------------------
const MAX_PBKDF2_ITERATIONS = 100000; // límite de WebCrypto en Cloudflare Workers
const DEFAULT_PBKDF2_ITERATIONS = 50000; // ≈7 ms de CPU: cabe en el plan gratuito (10 ms)

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

function configuredIterations(env: Env): number {
  const n = parseInt(env.PASSWORD_HASH_ITERATIONS || '', 10);
  if (!Number.isFinite(n) || n < 1000) return DEFAULT_PBKDF2_ITERATIONS;
  return Math.min(n, MAX_PBKDF2_ITERATIONS);
}

async function hashPassword(password: string, env: Env): Promise<string> {
  const iterations = configuredIterations(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

async function legacySha256(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + '_creaurl_salt');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, saltB64, hashB64] = stored.split('$');
    const iterations = Math.min(parseInt(iterStr, 10) || 0, MAX_PBKDF2_ITERATIONS);
    if (!iterations || !saltB64 || !hashB64) return { ok: false, needsUpgrade: false };
    const computed = await pbkdf2(password, fromBase64(saltB64), iterations);
    return { ok: timingSafeEqual(toBase64(computed), hashB64), needsUpgrade: false };
  }
  // Formato antiguo
  const ok = timingSafeEqual(await legacySha256(password), stored);
  return { ok, needsUpgrade: ok };
}

// ---------------------------------------------------------------------------
// Identidad: se verifica el token de sesión de Clerk (JWT RS256) con las claves
// públicas (JWKS) de Clerk. Las cabeceras x-user-role / x-admin-key YA NO se
// aceptan: solo identifican a invitados anónimos mediante "anon_..."
// ---------------------------------------------------------------------------
type Role = 'anon' | 'user' | 'admin';

interface Identity {
  role: Role;
  userId: string | null; // id de Clerk (registrado) o id anónimo "anon_xxx"
  email?: string;
  authenticated: boolean;
  authConfigured: boolean;
  error?: string; // token presente pero inválido
}

function b64urlToBytes(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return fromBase64(b64);
}

function b64urlToJson(input: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(input)));
}

function clerkIssuer(env: Env): string | null {
  const explicit = cleanEnv(env.CLERK_ISSUER).replace(/\/+$/, '');
  if (explicit) return explicit;
  const pk = cleanEnv(env.CLERK_PUBLISHABLE_KEY);
  const m = pk.match(/^pk_(?:test|live)_(.+)$/);
  if (!m) return null;
  try {
    const host = atob(m[1]).replace(/\$+$/, '').trim();
    return host ? `https://${host}` : null;
  } catch (_) {
    return null;
  }
}

let jwksCache: { issuer: string; keys: any[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 60 * 1000;

async function getJwks(issuer: string, forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (
    jwksCache &&
    jwksCache.issuer === issuer &&
    now - jwksCache.fetchedAt < JWKS_TTL_MS &&
    !(forceRefresh && now - jwksCache.fetchedAt > JWKS_MIN_REFETCH_MS)
  ) {
    return jwksCache.keys;
  }
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`No se pudo obtener las claves de Clerk (${res.status}).`);
  const data: any = await res.json();
  jwksCache = { issuer, keys: data.keys || [], fetchedAt: now };
  return jwksCache.keys;
}

async function verifyClerkToken(token: string, issuer: string): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token con formato inválido.');
  const header = b64urlToJson(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Algoritmo de token no permitido.');

  let keys = await getJwks(issuer);
  let jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(issuer, true);
    jwk = keys.find((k: any) => k.kid === header.kid);
  }
  if (!jwk) throw new Error('Clave de firma desconocida.');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]) as unknown as BufferSource,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error('Firma del token inválida.');

  const claims = b64urlToJson(parts[1]);
  const nowSec = Math.floor(Date.now() / 1000);
  const leeway = 10;
  if (typeof claims.exp !== 'number' || claims.exp + leeway < nowSec) throw new Error('El token ha caducado.');
  if (typeof claims.nbf === 'number' && claims.nbf - leeway > nowSec) throw new Error('El token aún no es válido.');
  if (claims.iss !== issuer) throw new Error('Emisor del token no reconocido.');
  if (!claims.sub) throw new Error('Token sin usuario.');
  return claims;
}

function csvList(v: string | undefined): string[] {
  return cleanEnv(v)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

const ANON_ID_RE = /^anon_[A-Za-z0-9]{4,32}$/;

async function resolveIdentity(request: Request, env: Env): Promise<Identity> {
  const issuer = clerkIssuer(env);
  const authConfigured = Boolean(issuer);
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);

  if (bearer && issuer) {
    try {
      const claims = await verifyClerkToken(bearer[1].trim(), issuer);
      const email: string | undefined =
        claims.email || claims.email_address || claims.primary_email_address || undefined;
      const adminIds = csvList(env.ADMIN_USER_IDS);
      const adminEmails = csvList(env.ADMIN_EMAILS);
      const metaRole = claims.public_metadata?.role ?? claims.metadata?.role ?? claims.role;
      const isAdminUser =
        adminIds.includes(String(claims.sub).toLowerCase()) ||
        (email ? adminEmails.includes(email.toLowerCase()) : false) ||
        metaRole === 'admin';
      return {
        role: isAdminUser ? 'admin' : 'user',
        userId: String(claims.sub),
        email,
        authenticated: true,
        authConfigured,
      };
    } catch (err: any) {
      return {
        role: 'anon',
        userId: null,
        authenticated: false,
        authConfigured,
        error: `Sesión no válida: ${err.message}`,
      };
    }
  }

  if (bearer && !issuer) {
    console.warn('Authorization recibido pero el Worker no tiene CLERK_PUBLISHABLE_KEY ni CLERK_ISSUER: se trata como anónimo.');
  }

  const claimedId = request.headers.get('x-user-id') || '';
  return {
    role: 'anon',
    userId: ANON_ID_RE.test(claimedId) ? claimedId : null,
    authenticated: false,
    authConfigured,
  };
}

function canManage(identity: Identity, ownerId: string | null | undefined): boolean {
  if (identity.role === 'admin') return true;
  return Boolean(identity.userId && ownerId && identity.userId === ownerId);
}

// ---------------------------------------------------------------------------
// Límite de peticiones (rate limiting) con ventanas fijas en D1.
// La tabla se crea sola la primera vez. Si D1 falla, se deja pasar la petición
// (fail-open) para no tumbar la aplicación.
// ---------------------------------------------------------------------------
let rateTableReady = false;

async function ensureRateTable(env: Env): Promise<void> {
  if (rateTableReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_end INTEGER NOT NULL)'
  )
    .bind()
    .run();
  rateTableReady = true;
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

function windowKey(bucket: string, windowSec: number): { key: string; windowEnd: number; retryAfter: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const start = Math.floor(nowSec / windowSec) * windowSec;
  return { key: `${bucket}:${start}`, windowEnd: start + windowSec, retryAfter: start + windowSec - nowSec };
}

/** Registra un intento y devuelve si se ha superado el límite. */
async function rateHit(
  env: Env,
  bucket: string,
  limit: number,
  windowSec: number
): Promise<{ limited: boolean; retryAfter: number }> {
  const { key, windowEnd, retryAfter } = windowKey(bucket, windowSec);
  try {
    await ensureRateTable(env);
    const row = await env.DB.prepare(
      'INSERT INTO rate_limits (key, count, window_end) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count'
    )
      .bind(key, windowEnd)
      .first<any>();
    return { limited: (row?.count || 0) > limit, retryAfter };
  } catch (err) {
    console.error('rateHit falló (se deja pasar):', err);
    return { limited: false, retryAfter };
  }
}

/** Consulta sin incrementar. */
async function ratePeek(
  env: Env,
  bucket: string,
  limit: number,
  windowSec: number
): Promise<{ limited: boolean; retryAfter: number }> {
  const { key, retryAfter } = windowKey(bucket, windowSec);
  try {
    await ensureRateTable(env);
    const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(key).first<any>();
    return { limited: (row?.count || 0) >= limit, retryAfter };
  } catch (err) {
    console.error('ratePeek falló (se deja pasar):', err);
    return { limited: false, retryAfter };
  }
}

function tooManyRequests(message: string, retryAfter: number): Response {
  return new Response(JSON.stringify({ error: message, retryAfterSeconds: retryAfter }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Límites
const PUBLISH_LIMIT_ANON = 10; // por IP y hora
const PUBLISH_LIMIT_USER = 60; // por usuario y hora
const COLLECTION_LIMIT = 20; // por identidad/IP y hora
const EDIT_LIMIT_ANON = 30; // ediciones por hora
const EDIT_LIMIT_USER = 120;
const UNLOCK_FAIL_LIMIT = 10; // contraseñas erróneas por IP+página cada 15 min
const UNLOCK_WINDOW_SEC = 15 * 60;

async function purgeRateLimits(env: Env): Promise<void> {
  try {
    await ensureRateTable(env);
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_end < ?')
      .bind(Math.floor(Date.now() / 1000))
      .run();
  } catch (err) {
    console.error('purgeRateLimits falló:', err);
  }
}

function mapPage(p: any) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    sizeBytes: p.size_bytes,
    userId: p.user_id,
    userEmail: p.user_email,
    userRole: p.user_role,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    expiresAt: p.expires_at,
    isEphemeral: !!p.is_ephemeral,
    hasPassword: !!p.has_password,
    viewsCount: p.views_count,
    lastViewedAt: p.last_viewed_at,
    collectionId: p.collection_id,
  };
}

function mapCollection(c: any) {
  let pageSlugs: string[] = [];
  try {
    pageSlugs = JSON.parse(c.page_slugs || '[]');
  } catch (_) {}
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    userId: c.user_id,
    userEmail: c.user_email,
    pageSlugs,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}


const MAX_SIZE_ANON = 1 * 1024 * 1024; // 1 MB
const MAX_SIZE_REGISTERED = 10 * 1024 * 1024; // 10 MB
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_PASSWORD_LENGTH = 128;
const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomSlug(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join('');
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

// Máximo de páginas a purgar por ejecución. Cada una cuesta una petición a Supabase y
// Workers limita las subpeticiones por invocación (50 en el plan gratuito).
const PURGE_BATCH = 40;

async function purgeExpired(env: Env): Promise<{ purged: number; failed: number; pending: number }> {
  const nowIso = new Date().toISOString();
  const expired = await env.DB.prepare('SELECT slug FROM pages WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?')
    .bind(nowIso, PURGE_BATCH)
    .all<any>();

  const deletedSlugs: string[] = [];
  let failed = 0;
  for (const row of expired.results || []) {
    try {
      await supabaseDelete(env, row.slug); // 404 se considera correcto (ya no existe)
      deletedSlugs.push(row.slug);
    } catch (err) {
      // No borramos el registro: se reintentará en la próxima ejecución
      failed++;
      console.error(`purgeExpired: no se pudo borrar ${row.slug}:`, err);
    }
  }

  if (deletedSlugs.length > 0) {
    const placeholders = deletedSlugs.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM pages WHERE slug IN (${placeholders})`)
      .bind(...deletedSlugs)
      .run();
    await deleteViewStats(env, deletedSlugs);
  }

  const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM pages WHERE expires_at < ?').bind(nowIso).first<any>();
  return { purged: deletedSlugs.length, failed, pending: left?.n || 0 };
}

// ---------------------------------------------------------------------------
// Vista previa al compartir (Open Graph / Twitter): para /p/:slug y /c/:slug el
// Worker sirve el index.html de la SPA con las etiquetas de esa página, de modo que
// WhatsApp, Slack, LinkedIn, etc. muestren su título y descripción.
// ---------------------------------------------------------------------------
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortText(v: unknown, max: number): string {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function injectShareMeta(
  html: string,
  meta: { title: string; description: string; url: string; type: string; origin: string }
): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const u = escapeHtml(meta.url);
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace(/<meta\s+name="robots"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/<link\s+rel="(?:canonical|alternate)"[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  const image = escapeHtml(`${meta.origin}/og-image.png`);
  const tags = [
    `<meta name="description" content="${d}" />`,
    // Páginas de usuarios: no se indexan en buscadores (se comparten por enlace)
    `<meta name="robots" content="noindex, follow" />`,
    `<meta property="og:site_name" content="Crea URL" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:type" content="${escapeHtml(meta.type)}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<link rel="canonical" href="${u}" />`,
  ].join('\n    ');
  return out.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

async function servePreview(request: Request, env: Env, kind: 'p' | 'c', slug: string): Promise<Response | null> {
  if (!env.ASSETS) return null;
  const url = new URL(request.url);
  try {
    let title = '';
    let description = '';

    if (kind === 'p') {
      const p = await env.DB.prepare('SELECT title, description, expires_at, has_password FROM pages WHERE slug = ?')
        .bind(slug)
        .first<any>();
      if (!p || (p.expires_at && new Date(p.expires_at) < new Date())) return null;
      if (p.has_password) {
        // No filtramos título ni descripción de páginas protegidas
        title = 'Página protegida · Crea URL';
        description = 'Esta página está protegida con contraseña.';
      } else {
        title = `${shortText(p.title, 90) || 'Página publicada'} · Crea URL`;
        description = shortText(p.description, 200) || 'Página HTML publicada con Crea URL.';
      }
    } else {
      const c = await env.DB.prepare('SELECT title, description FROM collections WHERE slug = ?')
        .bind(slug)
        .first<any>();
      if (!c) return null;
      title = `${shortText(c.title, 90) || 'Colección'} · Crea URL`;
      description = shortText(c.description, 200) || 'Colección de páginas HTML publicada con Crea URL.';
    }

    const indexUrl = new URL('/index.html', url.origin).toString();
    let indexRes = await env.ASSETS.fetch(new Request(indexUrl));
    if (indexRes.status >= 300 && indexRes.status < 400) {
      indexRes = await env.ASSETS.fetch(new Request(new URL('/', url.origin).toString()));
    }
    if (!indexRes.ok) return null;

    const html = injectShareMeta(await indexRes.text(), {
      title,
      description,
      url: `${url.origin}/${kind}/${slug}`,
      type: kind === 'p' ? 'article' : 'website',
      origin: url.origin,
    });
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, follow',
      },
    });
  } catch (err) {
    console.error('servePreview falló (se sirve la SPA normal):', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Estadísticas de visitas: contador total (pages.views_count) + detalle por día UTC
// (page_views_daily). La tabla se crea sola la primera vez.
// ---------------------------------------------------------------------------
let viewsTableReady = false;
const VIEWS_RETENTION_DAYS = 400;
const BOT_UA = /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|linkedin|embedly|headless|curl|wget|python-requests/i;

function isBot(request: Request): boolean {
  return BOT_UA.test(request.headers.get('user-agent') || '');
}

async function ensureViewsTable(env: Env): Promise<void> {
  if (viewsTableReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS page_views_daily (slug TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (slug, day))'
  )
    .bind()
    .run();
  viewsTableReady = true;
}

async function recordView(env: Env, slug: string): Promise<void> {
  const now = new Date();
  await env.DB.prepare('UPDATE pages SET views_count = views_count + 1, last_viewed_at = ? WHERE slug = ?')
    .bind(now.toISOString(), slug)
    .run();
  try {
    await ensureViewsTable(env);
    await env.DB.prepare(
      'INSERT INTO page_views_daily (slug, day, count) VALUES (?, ?, 1) ON CONFLICT(slug, day) DO UPDATE SET count = count + 1'
    )
      .bind(slug, now.toISOString().slice(0, 10))
      .run();
  } catch (err) {
    console.error('recordView: no se pudo guardar el detalle diario:', err);
  }
}

async function deleteViewStats(env: Env, slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;
  try {
    await ensureViewsTable(env);
    const placeholders = slugs.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM page_views_daily WHERE slug IN (${placeholders})`)
      .bind(...slugs)
      .run();
  } catch (err) {
    console.error('deleteViewStats falló:', err);
  }
}

async function purgeOldViewStats(env: Env): Promise<void> {
  try {
    await ensureViewsTable(env);
    const cutoff = new Date(Date.now() - VIEWS_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM page_views_daily WHERE day < ?').bind(cutoff).run();
  } catch (err) {
    console.error('purgeOldViewStats falló:', err);
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function cleanEnv(v: unknown): string {
  return String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

function supabaseObjectUrl(env: Env, path: string): string {
  const raw = (env as any).SUPABASE_URL;
  const base = cleanEnv(raw).replace(/\/+$/, '').replace(/\/storage\/v1.*$/, '');
  if (!base || !/^https?:\/\//i.test(base)) {
    throw new Error(
      `SUPABASE_URL inválida. El Worker recibe: ${raw === undefined ? 'variable NO definida' : `"${String(raw).slice(0, 12)}…" (${String(raw).length} caracteres)`}. ` +
        'Debe ser tipo "Secret" en Settings → Variables and Secrets (no en Build) y empezar por https://'
    );
  }
  if (!cleanEnv(env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no definida en el Worker (Settings → Variables and Secrets, tipo Secret).'
    );
  }
  const bucket = cleanEnv(env.SUPABASE_STORAGE_BUCKET) || 'html-pages';
  return `${base}/storage/v1/object/${bucket}/${path}`;
}

async function supabaseUpload(env: Env, slug: string, html: string): Promise<void> {
  const res = await fetch(supabaseObjectUrl(env, `${slug}.html`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanEnv(env.SUPABASE_SERVICE_ROLE_KEY)}`,
      'Content-Type': 'text/html; charset=utf-8',
      'x-upsert': 'true',
    },
    body: html,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase upload failed (${res.status}): ${text}`);
  }
}

async function supabaseDownload(env: Env, slug: string): Promise<string | null> {
  const res = await fetch(supabaseObjectUrl(env, `${slug}.html`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanEnv(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase download failed (${res.status}): ${text}`);
  }
  return res.text();
}

async function supabaseDelete(env: Env, slug: string): Promise<void> {
  const res = await fetch(supabaseObjectUrl(env, `${slug}.html`), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cleanEnv(env.SUPABASE_SERVICE_ROLE_KEY)}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase delete failed (${res.status}): ${text}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
        },
      });
    }

    // Identidad verificada (solo en rutas de la API)
    let identity: Identity = { role: 'anon', userId: null, authenticated: false, authConfigured: false };
    if (path.startsWith('/api/')) {
      identity = await resolveIdentity(request, env);
      if (identity.error) {
        return jsonResponse({ error: identity.error, code: 'invalid_session' }, 401);
      }
    }

    // 1. Direct raw HTML serving: /raw/:slug
    if (path.startsWith('/raw/')) {
      const slug = path.replace('/raw/', '').split('/')[0];
      const pageResult = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();

      if (!pageResult) {
        return new Response('Página no encontrada o ha expirado.', {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (pageResult.expires_at && new Date(pageResult.expires_at) < new Date()) {
        return new Response('Esta página ha expirado.', {
          status: 410,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (pageResult.has_password) {
        // La contraseña ya no viaja en la URL: se pide en la página /p/:slug (formulario POST)
        return Response.redirect(`${url.origin}/p/${slug}?protected=1`, 302);
      }

      const html = await supabaseDownload(env, slug);
      if (html === null) {
        return new Response('Contenido HTML no encontrado en Supabase Storage.', { status: 404 });
      }

      if (!isBot(request)) await recordView(env, slug);

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-modals allow-popups;',
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex', // contenido de usuarios: no se indexa
        },
      });
    }

    // 2. API Routes
    if (path === '/api/me' && request.method === 'GET') {
      return jsonResponse({
        role: identity.role,
        userId: identity.userId,
        email: identity.email || null,
        authenticated: identity.authenticated,
        authConfigured: identity.authConfigured,
      });
    }

    if (path === '/api/pages' && request.method === 'GET') {
      const userRole = identity.role;
      const userId = identity.userId;

      let query = 'SELECT * FROM pages ORDER BY created_at DESC';
      let results: any[] = [];

      if (userRole === 'admin') {
        const res = await env.DB.prepare(query).all<any>();
        results = res.results || [];
      } else if (userId) {
        const res = await env.DB.prepare(
          'SELECT * FROM pages WHERE user_id = ? ORDER BY created_at DESC'
        )
          .bind(userId)
          .all<any>();
        results = res.results || [];
      }

      const sanitized = results.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        sizeBytes: p.size_bytes,
        userId: p.user_id,
        userEmail: p.user_email,
        userRole: p.user_role,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        expiresAt: p.expires_at,
        isEphemeral: !!p.is_ephemeral,
        hasPassword: !!p.has_password,
        viewsCount: p.views_count,
        lastViewedAt: p.last_viewed_at,
        collectionId: p.collection_id,
      }));

      return jsonResponse({ pages: sanitized });
    }

    if (path === '/api/pages' && request.method === 'POST') {
      try {
        const userRole = identity.role;
        const maxSize = userRole === 'anon' ? MAX_SIZE_ANON : MAX_SIZE_REGISTERED;

        // Límite de publicaciones por hora
        if (identity.role !== 'admin') {
          const rl =
            identity.role === 'anon'
              ? await rateHit(env, `publish:ip:${clientIp(request)}`, PUBLISH_LIMIT_ANON, 3600)
              : await rateHit(env, `publish:u:${identity.userId}`, PUBLISH_LIMIT_USER, 3600);
          if (rl.limited) {
            return tooManyRequests(
              `Has alcanzado el límite de publicaciones por hora${identity.role === 'anon' ? ' para invitados. Inicia sesión para publicar más' : ''}. Inténtalo de nuevo en ${Math.ceil(rl.retryAfter / 60)} min.`,
              rl.retryAfter
            );
          }
        }

        // Rechazo temprano por Content-Length (margen de 64 KB para el JSON que envuelve al HTML)
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (declaredLength > maxSize + 64 * 1024) {
          return jsonResponse(
            {
              error: `El tamaño de la petición (${formatMB(declaredLength)} MB) supera el límite permitido (${formatMB(maxSize)} MB).${userRole === 'anon' ? ' Inicia sesión para subir hasta 10 MB.' : ''}`,
            },
            413
          );
        }

        let body: any;
        try {
          body = await request.json();
        } catch (_) {
          return jsonResponse({ error: 'El cuerpo de la petición no es un JSON válido.' }, 400);
        }
        const { html, description = '', customSlug, password, isEphemeral = false, collectionId } = body || {};
        const rawTitle = typeof body?.title === 'string' ? body.title.trim() : '';

        if (typeof html !== 'string' || html.trim().length === 0) {
          return jsonResponse({ error: 'El contenido HTML no puede estar vacío.' }, 400);
        }

        const sizeBytes = new TextEncoder().encode(html).length;
        if (sizeBytes > maxSize) {
          return jsonResponse(
            {
              error: `El tamaño del archivo (${formatMB(sizeBytes)} MB) supera el límite permitido (${formatMB(maxSize)} MB).${userRole === 'anon' ? ' Inicia sesión para subir hasta 10 MB.' : ''}`,
            },
            413
          );
        }

        if (rawTitle.length > MAX_TITLE_LENGTH) {
          return jsonResponse({ error: `El título no puede superar los ${MAX_TITLE_LENGTH} caracteres.` }, 400);
        }
        if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
          return jsonResponse({ error: `La descripción no puede superar los ${MAX_DESCRIPTION_LENGTH} caracteres.` }, 400);
        }
        const title = rawTitle;

        if (password !== undefined && password !== null && password !== '') {
          if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
            return jsonResponse({ error: `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.` }, 400);
          }
          if (userRole === 'anon' && password.trim().length > 0) {
            return jsonResponse({ error: 'Proteger con contraseña requiere una cuenta gratuita.' }, 403);
          }
        }

        const userId = identity.userId || `anon_${randomSlug(8)}`;
        const userEmail = identity.email || undefined;

        // Slug: personalizado (3-40 caracteres) o aleatorio
        let slug = '';
        if (customSlug !== undefined && customSlug !== null && String(customSlug).trim() !== '') {
          slug = String(customSlug)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^[-_]+|[-_]+$/g, '');
          if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
            return jsonResponse(
              { error: `El slug personalizado debe tener entre ${SLUG_MIN} y ${SLUG_MAX} caracteres alfanuméricos.` },
              400
            );
          }
          const existing = await env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(slug).first();
          if (existing) {
            return jsonResponse({ error: 'Este slug ya está en uso. Por favor elige otro.' }, 409);
          }
        } else {
          for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = randomSlug(8);
            const taken = await env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(candidate).first();
            if (!taken) {
              slug = candidate;
              break;
            }
          }
          if (!slug) {
            return jsonResponse({ error: 'No se pudo generar un slug único. Inténtalo de nuevo.' }, 500);
          }
        }

        // Si se publica dentro de una colección, debe ser del propio usuario
        if (collectionId) {
          const col0 = await env.DB.prepare('SELECT user_id FROM collections WHERE id = ? OR slug = ?')
            .bind(collectionId, collectionId)
            .first<any>();
          if (col0 && !canManage(identity, col0.user_id)) {
            return jsonResponse({ error: 'No tienes permiso para añadir páginas a esa colección.' }, 403);
          }
        }

        const hasPassword = Boolean(password && String(password).trim().length > 0);
        const passwordHash = hasPassword ? await hashPassword(String(password).trim(), env) : null;

        await supabaseUpload(env, slug, html);

        const now = new Date();
        let expiresAt: Date;
        if (isEphemeral) {
          expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
        } else if (userRole === 'anon') {
          expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        } else {
          expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        }

        const pageId = crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO pages (id, slug, title, description, size_bytes, user_id, user_email, user_role, created_at, updated_at, expires_at, is_ephemeral, has_password, password_hash, views_count, collection_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            pageId,
            slug,
            title || `Página ${slug}`,
            description,
            sizeBytes,
            userId,
            userEmail || null,
            userRole,
            now.toISOString(),
            now.toISOString(),
            expiresAt.toISOString(),
            isEphemeral ? 1 : 0,
            hasPassword ? 1 : 0,
            passwordHash,
            0,
            collectionId || null
          )
          .run();

        if (collectionId) {
          const col = await env.DB.prepare('SELECT * FROM collections WHERE id = ? OR slug = ?')
            .bind(collectionId, collectionId)
            .first<any>();
          if (col) {
            const slugs: string[] = mapCollection(col).pageSlugs;
            if (!slugs.includes(slug)) {
              slugs.push(slug);
              await env.DB.prepare('UPDATE collections SET page_slugs = ?, updated_at = ? WHERE id = ?')
                .bind(JSON.stringify(slugs), now.toISOString(), col.id)
                .run();
            }
          }
        }

        return jsonResponse(
          {
            success: true,
            page: {
              id: pageId,
              slug,
              title: title || `Página ${slug}`,
              description,
              sizeBytes,
              userId,
              userRole,
              createdAt: now.toISOString(),
              expiresAt: expiresAt.toISOString(),
              hasPassword,
              viewsCount: 0,
            },
            publicUrl: `/p/${slug}`,
            rawUrl: `/raw/${slug}`,
          },
          201
        );
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // GET /api/pages/:slug
    const pageMatch = path.match(/^\/api\/pages\/([^/]+)$/);
    if (pageMatch && request.method === 'GET') {
      const slug = decodeURIComponent(pageMatch[1]);
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
      if (p.expires_at && new Date(p.expires_at) < new Date()) {
        return jsonResponse({ error: 'Esta página ha expirado.' }, 410);
      }

      let html: string | undefined;
      if (!p.has_password) {
        html = (await supabaseDownload(env, slug)) || undefined;
        if (html !== undefined && !isBot(request)) {
          await recordView(env, slug);
          p.views_count = (p.views_count || 0) + 1;
        }
      }

      return jsonResponse({
        page: {
          id: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          sizeBytes: p.size_bytes,
          userId: p.user_id,
          userRole: p.user_role,
          createdAt: p.created_at,
          expiresAt: p.expires_at,
          isEphemeral: !!p.is_ephemeral,
          hasPassword: !!p.has_password,
          viewsCount: p.views_count,
        },
        hasPassword: !!p.has_password,
        html,
      });
    }

    // GET /api/pages/:slug/stats?days=30  (solo propietario o admin)
    const statsMatch = path.match(/^\/api\/pages\/([^/]+)\/stats$/);
    if (statsMatch && request.method === 'GET') {
      const slug = decodeURIComponent(statsMatch[1]);
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
      if (!canManage(identity, p.user_id)) {
        return jsonResponse({ error: 'No tienes permiso para ver las estadísticas de esta página.' }, 403);
      }
      const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const startStr = new Date(today.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

      let counts = new Map<string, number>();
      let trackedTotal = 0;
      try {
        await ensureViewsTable(env);
        const rows = await env.DB.prepare(
          'SELECT day, count FROM page_views_daily WHERE slug = ? AND day >= ? ORDER BY day ASC'
        )
          .bind(slug, startStr)
          .all<any>();
        for (const r of rows.results || []) counts.set(r.day, r.count);
        const sum = await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM page_views_daily WHERE slug = ?')
          .bind(slug)
          .first<any>();
        trackedTotal = sum?.n || 0;
      } catch (err) {
        console.error('stats: no se pudo leer el detalle diario:', err);
      }

      const series: { day: string; views: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
        series.push({ day: d, views: counts.get(d) || 0 });
      }
      const viewsInRange = series.reduce((a, x) => a + x.views, 0);
      const last7 = series.slice(-7).reduce((a, x) => a + x.views, 0);
      const best = series.reduce((b, x) => (x.views > (b?.views ?? 0) ? x : b), null as { day: string; views: number } | null);

      return jsonResponse({
        slug,
        title: p.title,
        days,
        series,
        totalViews: p.views_count || 0,
        viewsInRange,
        viewsLast7: last7,
        viewsToday: counts.get(todayStr) || 0,
        bestDay: best && best.views > 0 ? best : null,
        lastViewedAt: p.last_viewed_at || null,
        createdAt: p.created_at,
        viewsBeforeTracking: Math.max(0, (p.views_count || 0) - trackedTotal),
      });
    }

    // GET /api/pages/:slug/source  (solo propietario o admin): HTML original para editarlo
    const sourceMatch = path.match(/^\/api\/pages\/([^/]+)\/source$/);
    if (sourceMatch && request.method === 'GET') {
      const slug = decodeURIComponent(sourceMatch[1]);
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
      if (!canManage(identity, p.user_id)) {
        return jsonResponse({ error: 'No tienes permiso para editar esta página.' }, 403);
      }
      const html = await supabaseDownload(env, slug);
      if (html === null) return jsonResponse({ error: 'Contenido no encontrado en Supabase Storage.' }, 404);
      return jsonResponse({ page: mapPage(p), html });
    }

    // PUT /api/pages/:slug  (solo propietario o admin): actualiza contenido, título y descripción
    // manteniendo la misma URL, caducidad, contraseña y colección.
    if (pageMatch && request.method === 'PUT') {
      try {
        const slug = decodeURIComponent(pageMatch[1]);
        const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
        if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
        if (!canManage(identity, p.user_id)) {
          return jsonResponse({ error: 'No tienes permiso para editar esta página.' }, 403);
        }
        if (p.expires_at && new Date(p.expires_at) < new Date()) {
          return jsonResponse({ error: 'Esta página ha caducado. Prorrógala desde el panel antes de editarla.' }, 410);
        }

        if (identity.role !== 'admin') {
          const who = identity.userId ? `u:${identity.userId}` : `ip:${clientIp(request)}`;
          const rl = await rateHit(env, `edit:${who}`, identity.role === 'anon' ? EDIT_LIMIT_ANON : EDIT_LIMIT_USER, 3600);
          if (rl.limited) {
            return tooManyRequests(
              `Has alcanzado el límite de ediciones por hora. Inténtalo de nuevo en ${Math.ceil(rl.retryAfter / 60)} min.`,
              rl.retryAfter
            );
          }
        }

        const maxSize = identity.role === 'anon' ? MAX_SIZE_ANON : MAX_SIZE_REGISTERED;
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (declaredLength > maxSize + 64 * 1024) {
          return jsonResponse(
            { error: `El tamaño de la petición supera el límite permitido (${formatMB(maxSize)} MB).` },
            413
          );
        }

        let body: any;
        try {
          body = await request.json();
        } catch (_) {
          return jsonResponse({ error: 'El cuerpo de la petición no es un JSON válido.' }, 400);
        }

        const updates: { html?: string; title: string; description: string; sizeBytes: number } = {
          title: p.title,
          description: p.description,
          sizeBytes: p.size_bytes,
        };

        if (body?.title !== undefined) {
          const t = typeof body.title === 'string' ? body.title.trim() : '';
          if (t.length > MAX_TITLE_LENGTH) {
            return jsonResponse({ error: `El título no puede superar los ${MAX_TITLE_LENGTH} caracteres.` }, 400);
          }
          updates.title = t;
        }
        if (body?.description !== undefined) {
          if (typeof body.description !== 'string' || body.description.length > MAX_DESCRIPTION_LENGTH) {
            return jsonResponse({ error: `La descripción no puede superar los ${MAX_DESCRIPTION_LENGTH} caracteres.` }, 400);
          }
          updates.description = body.description;
        }
        if (body?.html !== undefined) {
          if (typeof body.html !== 'string' || body.html.trim().length === 0) {
            return jsonResponse({ error: 'El contenido HTML no puede estar vacío.' }, 400);
          }
          const sizeBytes = new TextEncoder().encode(body.html).length;
          if (sizeBytes > maxSize) {
            return jsonResponse(
              {
                error: `El tamaño del archivo (${formatMB(sizeBytes)} MB) supera el límite permitido (${formatMB(maxSize)} MB).${identity.role === 'anon' ? ' Inicia sesión para subir hasta 10 MB.' : ''}`,
              },
              413
            );
          }
          updates.html = body.html;
          updates.sizeBytes = sizeBytes;
        }

        if (updates.html !== undefined) {
          await supabaseUpload(env, slug, updates.html);
        }
        const nowIso = new Date().toISOString();
        await env.DB.prepare(
          'UPDATE pages SET title = ?, description = ?, size_bytes = ?, updated_at = ? WHERE slug = ?'
        )
          .bind(updates.title, updates.description, updates.sizeBytes, nowIso, slug)
          .run();

        return jsonResponse({
          success: true,
          page: mapPage({
            ...p,
            title: updates.title,
            description: updates.description,
            size_bytes: updates.sizeBytes,
            updated_at: nowIso,
          }),
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // DELETE /api/pages/:slug
    if (pageMatch && request.method === 'DELETE') {
      const slug = decodeURIComponent(pageMatch[1]);
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);

      if (!canManage(identity, p.user_id)) {
        return jsonResponse({ error: 'No tienes permiso para eliminar esta página.' }, 403);
      }

      try {
        await supabaseDelete(env, slug);
      } catch (err) {
        console.error(`DELETE ${slug}: no se pudo borrar el archivo de Storage:`, err);
      }
      await env.DB.prepare('DELETE FROM pages WHERE slug = ?').bind(slug).run();
      await deleteViewStats(env, [slug]);
      return jsonResponse({ success: true });
    }

    // POST /api/pages/:slug/unlock
    const unlockMatch = path.match(/^\/api\/pages\/([^/]+)\/unlock$/);
    if (unlockMatch && request.method === 'POST') {
      try {
        const slug = decodeURIComponent(unlockMatch[1]);
        const body: any = await request.json().catch(() => ({}));
        const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
        if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
        if (p.expires_at && new Date(p.expires_at) < new Date()) {
          return jsonResponse({ error: 'Esta página ha expirado.' }, 410);
        }
        if (p.has_password) {
          const attemptBucket = `unlock:${clientIp(request)}:${slug}`;
          const peek = await ratePeek(env, attemptBucket, UNLOCK_FAIL_LIMIT, UNLOCK_WINDOW_SEC);
          if (peek.limited) {
            return tooManyRequests(
              `Demasiados intentos fallidos. Inténtalo de nuevo en ${Math.ceil(peek.retryAfter / 60)} min.`,
              peek.retryAfter
            );
          }
          const supplied = typeof body.password === 'string' ? body.password : '';
          const check = supplied && supplied.length <= MAX_PASSWORD_LENGTH
            ? await verifyPassword(supplied, p.password_hash)
            : { ok: false, needsUpgrade: false };
          if (!check.ok) {
            await rateHit(env, attemptBucket, UNLOCK_FAIL_LIMIT, UNLOCK_WINDOW_SEC);
            return jsonResponse({ error: 'Contraseña incorrecta. Acceso denegado.' }, 401);
          }
          if (check.needsUpgrade) {
            // Migración transparente del hash antiguo al formato PBKDF2
            try {
              await env.DB.prepare('UPDATE pages SET password_hash = ? WHERE slug = ?')
                .bind(await hashPassword(supplied, env), slug)
                .run();
            } catch (err) {
              console.error('No se pudo actualizar el hash de la contraseña:', err);
            }
          }
        }
        const html = await supabaseDownload(env, slug);
        if (html === null) return jsonResponse({ error: 'Contenido no encontrado en Supabase Storage.' }, 404);
        await recordView(env, slug);
        return jsonResponse({ success: true, html });
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // PATCH /api/pages/:slug/extend
    const extendMatch = path.match(/^\/api\/pages\/([^/]+)\/extend$/);
    if (extendMatch && request.method === 'PATCH') {
      const slug = decodeURIComponent(extendMatch[1]);
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
      if (!canManage(identity, p.user_id)) {
        return jsonResponse({ error: 'No tienes permiso para modificar esta página.' }, 403);
      }
      const base = Math.max(Date.now(), new Date(p.expires_at).getTime());
      const newExpiry = new Date(base + 90 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();
      await env.DB.prepare('UPDATE pages SET expires_at = ?, updated_at = ? WHERE slug = ?')
        .bind(newExpiry, nowIso, slug)
        .run();
      return jsonResponse({ success: true, page: mapPage({ ...p, expires_at: newExpiry, updated_at: nowIso }) });
    }

    // PATCH /api/pages/:slug/password
    const pwdMatch = path.match(/^\/api\/pages\/([^/]+)\/password$/);
    if (pwdMatch && request.method === 'PATCH') {
      const slug = decodeURIComponent(pwdMatch[1]);
      const body: any = await request.json().catch(() => ({}));
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);
      if (!canManage(identity, p.user_id)) {
        return jsonResponse({ error: 'No tienes permiso para modificar esta página.' }, 403);
      }
      const has = Boolean(body.password && String(body.password).trim().length > 0);
      if (has && identity.role === 'anon') {
        return jsonResponse({ error: 'Proteger con contraseña requiere una cuenta gratuita.' }, 403);
      }
      if (has && String(body.password).length > MAX_PASSWORD_LENGTH) {
        return jsonResponse({ error: `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.` }, 400);
      }
      const hash = has ? await hashPassword(String(body.password).trim(), env) : null;
      const nowIso = new Date().toISOString();
      await env.DB.prepare('UPDATE pages SET has_password = ?, password_hash = ?, updated_at = ? WHERE slug = ?')
        .bind(has ? 1 : 0, hash, nowIso, slug)
        .run();
      return jsonResponse({ success: true, page: mapPage({ ...p, has_password: has ? 1 : 0, updated_at: nowIso }) });
    }

    // --- Collections ---
    if (path === '/api/collections' && request.method === 'GET') {
      const userRole = identity.role;
      const userId = identity.userId;
      let rows: any[] = [];
      if (userRole === 'admin') {
        rows = (await env.DB.prepare('SELECT * FROM collections ORDER BY created_at DESC').bind().all<any>()).results || [];
      } else if (userId) {
        rows =
          (await env.DB.prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY created_at DESC')
            .bind(userId)
            .all<any>()).results || [];
      }
      return jsonResponse({ collections: rows.map(mapCollection) });
    }

    if (path === '/api/collections' && request.method === 'POST') {
      try {
        const body: any = await request.json();
        const { title, description = '', customSlug, pageSlugs = [] } = body;
        if (!title || !String(title).trim()) {
          return jsonResponse({ error: 'El título de la colección es obligatorio.' }, 400);
        }
        if (identity.role !== 'admin') {
          const who = identity.userId ? `u:${identity.userId}` : `ip:${clientIp(request)}`;
          const rl = await rateHit(env, `collection:${who}`, COLLECTION_LIMIT, 3600);
          if (rl.limited) {
            return tooManyRequests(
              `Has alcanzado el límite de colecciones por hora. Inténtalo de nuevo en ${Math.ceil(rl.retryAfter / 60)} min.`,
              rl.retryAfter
            );
          }
        }
        const userId = identity.userId || `anon_${randomSlug(8)}`;
        const userEmail = identity.email || null;
        const slug =
          customSlug && String(customSlug).trim()
            ? String(customSlug).toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-')
            : `col-${Math.random().toString(36).substring(2, 8)}`;
        const existing = await env.DB.prepare('SELECT id FROM collections WHERE slug = ?').bind(slug).first();
        if (existing) return jsonResponse({ error: 'El slug de la colección ya está en uso.' }, 409);

        const nowIso = new Date().toISOString();
        const id = crypto.randomUUID();
        const slugs = Array.isArray(pageSlugs) ? pageSlugs : [];
        await env.DB.prepare(
          `INSERT INTO collections (id, slug, title, description, user_id, user_email, page_slugs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(id, slug, String(title).trim(), String(description).trim(), userId, userEmail, JSON.stringify(slugs), nowIso, nowIso)
          .run();
        return jsonResponse(
          {
            success: true,
            collection: { id, slug, title: String(title).trim(), description: String(description).trim(), userId, userEmail, pageSlugs: slugs, createdAt: nowIso, updatedAt: nowIso },
          },
          201
        );
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    const colMatch = path.match(/^\/api\/collections\/([^/]+)$/);
    if (colMatch && request.method === 'GET') {
      const slug = decodeURIComponent(colMatch[1]);
      const c = await env.DB.prepare('SELECT * FROM collections WHERE slug = ?').bind(slug).first<any>();
      if (!c) return jsonResponse({ error: 'Colección no encontrada' }, 404);
      const col = mapCollection(c);
      const pages: any[] = [];
      for (const ps of col.pageSlugs) {
        const row = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(ps).first<any>();
        if (row) pages.push(mapPage(row));
      }
      return jsonResponse({ collection: col, pages });
    }
    if (colMatch && request.method === 'DELETE') {
      const slug = decodeURIComponent(colMatch[1]);
      const c = await env.DB.prepare('SELECT id, user_id FROM collections WHERE slug = ?').bind(slug).first<any>();
      if (!c) return jsonResponse({ error: 'Colección no encontrada' }, 404);
      if (!canManage(identity, c.user_id)) {
        return jsonResponse({ error: 'No tienes permiso para eliminar esta colección.' }, 403);
      }
      await env.DB.prepare('DELETE FROM collections WHERE slug = ?').bind(slug).run();
      await env.DB.prepare('UPDATE pages SET collection_id = NULL WHERE collection_id = ? OR collection_id = ?')
        .bind(c.id, slug)
        .run();
      return jsonResponse({ success: true, message: 'Colección eliminada.' });
    }

    // --- Admin ---
    if (path === '/api/admin/stats' && request.method === 'GET') {
      if (identity.role !== 'admin') return jsonResponse({ error: 'Acceso no autorizado al panel de administración.' }, 403);
      const nowIso = new Date().toISOString();
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(views_count),0) AS views, COALESCE(SUM(size_bytes),0) AS size,
                SUM(CASE WHEN expires_at >= ? THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN has_password = 1 THEN 1 ELSE 0 END) AS pwd,
                SUM(CASE WHEN is_ephemeral = 1 THEN 1 ELSE 0 END) AS eph
         FROM pages`
      ).bind(nowIso).first<any>();
      const cols = await env.DB.prepare('SELECT COUNT(*) AS n FROM collections').bind().first<any>();
      const total = row?.total || 0;
      const active = row?.active || 0;
      return jsonResponse({
        totalPages: total,
        totalViews: row?.views || 0,
        totalSizeBytes: row?.size || 0,
        activePages: active,
        expiredPages: total - active,
        passwordProtectedPages: row?.pwd || 0,
        ephemeralPages: row?.eph || 0,
        totalCollections: cols?.n || 0,
        storageDirectory: 'supabase://' + (env.SUPABASE_STORAGE_BUCKET || 'html-pages'),
      });
    }

    if (path === '/api/admin/purge-expired' && request.method === 'POST') {
      if (identity.role !== 'admin') return jsonResponse({ error: 'Acceso denegado.' }, 403);
      try {
        const { purged, failed, pending } = await purgeExpired(env);
        const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM pages').bind().first<any>();
        return jsonResponse({
          success: true,
          purgedCount: purged,
          failedCount: failed,
          pendingExpired: pending,
          remainingPages: left?.n || 0,
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (path === '/api/templates' && request.method === 'GET') {
      return jsonResponse({ templates: TEMPLATES });
    }

    // Fallback: static assets
    if (env.ASSETS) {
      if (request.method === 'GET') {
        const shareMatch = path.match(/^\/(p|c)\/([^/]+)\/?$/);
        if (shareMatch) {
          const preview = await servePreview(request, env, shareMatch[1] as 'p' | 'c', decodeURIComponent(shareMatch[2]));
          if (preview) return preview;
        }
      }
      const assetRes = await env.ASSETS.fetch(request);
      // Rutas del cliente (/p/:slug, /c/:slug, /admin, /collections, /acerca-de...):
      // si no hay archivo estático, servir la SPA para que React resuelva la ruta.
      const lastSegment = path.split('/').pop() || '';
      const looksLikeFile = lastSegment.includes('.'); // /assets/x.js, /favicon.ico...: un 404 real, no una ruta de la SPA
      if (assetRes.status === 404 && request.method === 'GET' && !path.startsWith('/api/') && !looksLikeFile) {
        const indexReq = new Request(new URL('/index.html', url.origin).toString(), request);
        const spaRes = await env.ASSETS.fetch(indexReq);
        // Rutas de páginas/colecciones que no existen (o caducadas): que no se indexen
        if (/^\/(p|c)\//.test(path)) {
          const headers = new Headers(spaRes.headers);
          headers.set('X-Robots-Tag', 'noindex');
          return new Response(spaRes.body, { status: spaRes.status, headers });
        }
        return spaRes;
      }
      return assetRes;
    }

    return new Response('Crea URL Edge Engine Active', { status: 200 });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      await purgeRateLimits(env);
      await purgeOldViewStats(env);
      const { purged, failed, pending } = await purgeExpired(env);
      console.log(`Limpieza programada: ${purged} borradas, ${failed} con error, ${pending} caducadas pendientes.`);
    } catch (err) {
      console.error('Limpieza programada fallida:', err);
    }
  },
};

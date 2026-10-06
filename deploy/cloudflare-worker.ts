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
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + '_creaurl_salt');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

function isAdmin(request: Request): boolean {
  return (
    request.headers.get('x-user-role') === 'admin' ||
    request.headers.get('x-admin-key') === 'admin-secret-creaurl'
  );
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role, x-user-email, x-admin-key',
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
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role, x-user-email, x-admin-key',
        },
      });
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
        const pwd = url.searchParams.get('pwd');
        if (!pwd || (await hashPassword(pwd)) !== pageResult.password_hash) {
          return Response.redirect(`${url.origin}/p/${slug}?protected=1`, 302);
        }
      }

      const html = await supabaseDownload(env, slug);
      if (html === null) {
        return new Response('Contenido HTML no encontrado en Supabase Storage.', { status: 404 });
      }

      await env.DB.prepare(
        'UPDATE pages SET views_count = views_count + 1, last_viewed_at = ? WHERE slug = ?'
      )
        .bind(new Date().toISOString(), slug)
        .run();

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-modals allow-popups;',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // 2. API Routes
    if (path === '/api/pages' && request.method === 'GET') {
      const userRole = request.headers.get('x-user-role') || 'anon';
      const userId = request.headers.get('x-user-id');

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
        const body: any = await request.json();
        const { html, title, description = '', customSlug, password, isEphemeral = false, collectionId } = body;

        if (!html) {
          return jsonResponse({ error: 'El contenido HTML no puede estar vacío.' }, 400);
        }

        const userRole = request.headers.get('x-user-role') || 'anon';
        const userId =
          request.headers.get('x-user-id') || `anon_${Math.random().toString(36).substring(2, 8)}`;
        const userEmail = request.headers.get('x-user-email') || undefined;

        const slug =
          (customSlug &&
            String(customSlug)
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '')) ||
          Math.random().toString(36).substring(2, 10);

        const existing = await env.DB.prepare('SELECT id FROM pages WHERE slug = ?').bind(slug).first();
        if (existing) {
          return jsonResponse({ error: 'Ese slug ya está en uso.' }, 409);
        }

        const hasPassword = Boolean(password && String(password).trim().length > 0);
        const passwordHash = hasPassword ? await hashPassword(String(password).trim()) : null;

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
        const sizeBytes = new TextEncoder().encode(html).length;

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

      let html: string | undefined;
      if (!p.has_password) {
        html = (await supabaseDownload(env, slug)) || undefined;
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

    // DELETE /api/pages/:slug
    if (pageMatch && request.method === 'DELETE') {
      const slug = decodeURIComponent(pageMatch[1]);
      const p = await env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
      if (!p) return jsonResponse({ error: 'Página no encontrada' }, 404);

      try {
        await supabaseDelete(env, slug);
      } catch (_) {
        /* ignore storage errors on delete */
      }
      await env.DB.prepare('DELETE FROM pages WHERE slug = ?').bind(slug).run();
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
        if (p.has_password) {
          if (!body.password || (await hashPassword(body.password)) !== p.password_hash) {
            return jsonResponse({ error: 'Contraseña incorrecta. Acceso denegado.' }, 401);
          }
        }
        const html = await supabaseDownload(env, slug);
        if (html === null) return jsonResponse({ error: 'Contenido no encontrado en Supabase Storage.' }, 404);
        await env.DB.prepare('UPDATE pages SET views_count = views_count + 1, last_viewed_at = ? WHERE slug = ?')
          .bind(new Date().toISOString(), slug)
          .run();
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
      const has = Boolean(body.password && String(body.password).trim().length > 0);
      const hash = has ? await hashPassword(String(body.password).trim()) : null;
      const nowIso = new Date().toISOString();
      await env.DB.prepare('UPDATE pages SET has_password = ?, password_hash = ?, updated_at = ? WHERE slug = ?')
        .bind(has ? 1 : 0, hash, nowIso, slug)
        .run();
      return jsonResponse({ success: true, page: mapPage({ ...p, has_password: has ? 1 : 0, updated_at: nowIso }) });
    }

    // --- Collections ---
    if (path === '/api/collections' && request.method === 'GET') {
      const userRole = request.headers.get('x-user-role') || 'anon';
      const userId = request.headers.get('x-user-id');
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
        const userId = request.headers.get('x-user-id') || 'anon';
        const userEmail = request.headers.get('x-user-email') || null;
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
      const c = await env.DB.prepare('SELECT id FROM collections WHERE slug = ?').bind(slug).first<any>();
      if (!c) return jsonResponse({ error: 'Colección no encontrada' }, 404);
      await env.DB.prepare('DELETE FROM collections WHERE slug = ?').bind(slug).run();
      await env.DB.prepare('UPDATE pages SET collection_id = NULL WHERE collection_id = ? OR collection_id = ?')
        .bind(c.id, slug)
        .run();
      return jsonResponse({ success: true, message: 'Colección eliminada.' });
    }

    // --- Admin ---
    if (path === '/api/admin/stats' && request.method === 'GET') {
      if (!isAdmin(request)) return jsonResponse({ error: 'Acceso no autorizado al panel de administración.' }, 403);
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
      if (!isAdmin(request)) return jsonResponse({ error: 'Acceso denegado.' }, 403);
      const nowIso = new Date().toISOString();
      const expired = await env.DB.prepare('SELECT slug FROM pages WHERE expires_at < ?').bind(nowIso).all<any>();
      for (const e of expired.results || []) {
        try { await supabaseDelete(env, e.slug); } catch (_) {}
      }
      await env.DB.prepare('DELETE FROM pages WHERE expires_at < ?').bind(nowIso).run();
      const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM pages').bind().first<any>();
      return jsonResponse({ success: true, purgedCount: (expired.results || []).length, remainingPages: left?.n || 0 });
    }

    if (path === '/api/templates' && request.method === 'GET') {
      return jsonResponse({ templates: TEMPLATES });
    }

    // Fallback: static assets
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      // Rutas del cliente (/p/:slug, /c/:slug, /admin, /collections, /acerca-de...):
      // si no hay archivo estático, servir la SPA para que React resuelva la ruta.
      if (assetRes.status === 404 && request.method === 'GET' && !path.startsWith('/api/')) {
        const indexReq = new Request(new URL('/index.html', url.origin).toString(), request);
        return env.ASSETS.fetch(indexReq);
      }
      return assetRes;
    }

    return new Response('Crea URL Edge Engine Active', { status: 200 });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const now = new Date().toISOString();
    const expiredPages = await env.DB.prepare('SELECT slug FROM pages WHERE expires_at < ?')
      .bind(now)
      .all<any>();
    for (const page of expiredPages.results || []) {
      try {
        await supabaseDelete(env, page.slug);
      } catch (_) {
        /* ignore */
      }
    }
    await env.DB.prepare('DELETE FROM pages WHERE expires_at < ?').bind(now).run();
  },
};

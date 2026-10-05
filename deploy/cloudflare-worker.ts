/**
 * Cloudflare Full-Stack Worker / Pages Function for Crea URL
 * Frontend estático + API + D1 (metadatos) + Supabase Storage (HTML)
 */

export interface D1Database {
  prepare(query: string): {
    bind(...params: any[]): {
      first<T = any>(): Promise<T | null>;
      all<T = any>(): Promise<{ results: T[] }>;
      run(): Promise<any>;
    };
  };
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

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role, x-admin-key',
    },
  });
}

function supabaseObjectUrl(env: Env, path: string): string {
  const base = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const bucket = env.SUPABASE_STORAGE_BUCKET || 'html-pages';
  return `${base}/storage/v1/object/${bucket}/${path}`;
}

async function supabaseUpload(env: Env, slug: string, html: string): Promise<void> {
  const res = await fetch(supabaseObjectUrl(env, `${slug}.html`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role, x-admin-key',
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
        if (!pwd) {
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
        const { html, title, description = '', customSlug, isEphemeral = false, collectionId } = body;

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
          `INSERT INTO pages (id, slug, title, description, size_bytes, user_id, user_email, user_role, created_at, updated_at, expires_at, is_ephemeral, has_password, views_count, collection_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            0,
            0,
            collectionId || null
          )
          .run();

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

    // Fallback: static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
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

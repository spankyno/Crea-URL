/**
 * Cliente mínimo de Supabase Storage vía REST (sin SDK).
 * Usado en el servidor local (Express). El Worker de Cloudflare tiene su propia copia.
 */

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

function getConfig(): SupabaseStorageConfig {
  const url = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'html-pages';

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Configúralas en .env'
    );
  }

  return { url: url.replace(/\/$/, ''), serviceRoleKey, bucket };
}

function objectUrl(cfg: SupabaseStorageConfig, path: string): string {
  return `${cfg.url}/storage/v1/object/${cfg.bucket}/${path}`;
}

export async function uploadHtml(slug: string, html: string): Promise<void> {
  const cfg = getConfig();
  const path = `${slug}.html`;
  const res = await fetch(objectUrl(cfg, path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
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

export async function downloadHtml(slug: string): Promise<string | null> {
  const cfg = getConfig();
  const path = `${slug}.html`;
  const res = await fetch(objectUrl(cfg, path), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase download failed (${res.status}): ${text}`);
  }
  return res.text();
}

export async function deleteHtml(slug: string): Promise<void> {
  const cfg = getConfig();
  const path = `${slug}.html`;
  const res = await fetch(objectUrl(cfg, path), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
    },
  });
  // 404 is fine (already gone)
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase delete failed (${res.status}): ${text}`);
  }
}

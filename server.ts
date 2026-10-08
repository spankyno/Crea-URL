import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { uploadHtml, downloadHtml, deleteHtml } from './src/lib/supabaseStorage';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Storage directories
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORAGE_DIR = path.resolve(DATA_DIR, 'storage');
const PAGES_FILE = path.resolve(DATA_DIR, 'pages.json');
const COLLECTIONS_FILE = path.resolve(DATA_DIR, 'collections.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

export interface PageMetadata {
  id: string;
  slug: string;
  title: string;
  description: string;
  sizeBytes: number;
  userId: string;
  userEmail?: string;
  userRole: 'anon' | 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  isEphemeral: boolean;
  hasPassword: boolean;
  passwordHash?: string;
  viewsCount: number;
  lastViewedAt?: string;
  collectionId?: string;
}

export interface CollectionMetadata {
  id: string;
  slug: string;
  title: string;
  description: string;
  userId: string;
  userEmail?: string;
  pageSlugs: string[];
  createdAt: string;
  updatedAt: string;
}

// In-memory cache synced to disk
let pages: PageMetadata[] = [];
let collections: CollectionMetadata[] = [];

function loadData() {
  try {
    if (fs.existsSync(PAGES_FILE)) {
      const data = fs.readFileSync(PAGES_FILE, 'utf-8');
      pages = JSON.parse(data);
    } else {
      pages = [];
      fs.writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 2));
    }

    if (fs.existsSync(COLLECTIONS_FILE)) {
      const data = fs.readFileSync(COLLECTIONS_FILE, 'utf-8');
      collections = JSON.parse(data);
    } else {
      collections = [];
      fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
    }
  } catch (err) {
    console.error('Error loading data files:', err);
  }
}

function savePages() {
  try {
    fs.writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 2));
  } catch (err) {
    console.error('Error saving pages:', err);
  }
}

function saveCollections() {
  try {
    fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
  } catch (err) {
    console.error('Error saving collections:', err);
  }
}

// Load initial data
loadData();

// Hash helper
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_creaurl_salt').digest('hex');
}

function generateSlug(length = 6): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// Rate Limiter
interface RateLimitRecord {
  count: number;
  firstRequest: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PUBLISH_PER_HOUR_ANON = 30;
const MAX_PUBLISH_PER_HOUR_USER = 120;

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const isPublish = req.method === 'POST' && req.path === '/api/pages';

  if (!isPublish) {
    return next();
  }

  const role = (req.headers['x-user-role'] as string) || 'anon';
  const limit = role === 'admin' ? 1000 : role === 'user' ? MAX_PUBLISH_PER_HOUR_USER : MAX_PUBLISH_PER_HOUR_ANON;

  let record = rateLimitMap.get(clientIp);
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, firstRequest: now };
    rateLimitMap.set(clientIp, record);
    return next();
  }

  if (record.count >= limit) {
    res.status(429).json({
      error: 'Límite de publicaciones excedido. Por favor espera antes de publicar más páginas o inicia sesión para cuotas ampliadas.',
      retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - record.firstRequest)) / 1000),
    });
    return;
  }

  record.count++;
  next();
}

// Background Expired Pages Cleaner (Cron-like cleanup)
function purgeExpiredPages() {
  const now = new Date().toISOString();
  const toDelete = pages.filter((p) => p.expiresAt && p.expiresAt < now);
  if (toDelete.length > 0) {
    console.log(`[Janitor] Purging ${toDelete.length} expired page(s)...`);
    toDelete.forEach((p) => {
      deleteHtml(p.slug).catch((e) => {
        console.error(`Failed to delete expired file ${p.slug}.html from Supabase:`, e);
      });
    });
    pages = pages.filter((p) => !p.expiresAt || p.expiresAt >= now);
    savePages();
  }
}

// Run cleanup every 10 minutes
setInterval(purgeExpiredPages, 10 * 60 * 1000);

// Express middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(rateLimitMiddleware);

// --- API ROUTES ---

// 1. Direct raw HTML rendering endpoint: /raw/:slug
app.get('/raw/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const page = pages.find((p) => p.slug.toLowerCase() === slug.toLowerCase());

  if (!page) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="es">
        <head><meta charset="utf-8"><title>404 - Página no encontrada</title>
        <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#0b0f17;color:#94a3b8;}</style>
        </head>
        <body>
          <h1 style="color:#f1f5f9;">Página no encontrada</h1>
          <p>La URL solicitada no existe o ha expirado.</p>
          <p><a href="/" style="color:#10b981;text-decoration:none;">Crear una nueva página en Crea URL &rarr;</a></p>
        </body>
      </html>
    `);
    return;
  }

  // Check if expired
  if (page.expiresAt && page.expiresAt < new Date().toISOString()) {
    res.status(410).send(`
      <!DOCTYPE html>
      <html lang="es">
        <head><meta charset="utf-8"><title>410 - Página Expirada</title>
        <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#0b0f17;color:#94a3b8;}</style>
        </head>
        <body>
          <h1 style="color:#ef4444;">Esta página ha expirado</h1>
          <p>El periodo de alojamiento para esta página finalizó.</p>
          <p><a href="/" style="color:#10b981;text-decoration:none;">Publicar una nueva página &rarr;</a></p>
        </body>
      </html>
    `);
    return;
  }

  // If password protected, require password via query or header, or redirect to preview wrapper
  if (page.hasPassword) {
    const pwd = (req.query.pwd as string) || (req.headers['x-page-password'] as string);
    if (!pwd || hashPassword(pwd) !== page.passwordHash) {
      // Redirect to interactive preview page with password prompt
      res.redirect(`/p/${slug}?protected=1`);
      return;
    }
  }

  let htmlContent: string;
  try {
    const downloaded = await downloadHtml(page.slug);
    if (downloaded === null) {
      res.status(404).send('El contenido HTML no se encuentra en Supabase Storage.');
      return;
    }
    htmlContent = downloaded;
  } catch (e: any) {
    console.error('Supabase download error:', e);
    res.status(500).send('Error al obtener el contenido HTML.');
    return;
  }

  // Update analytics
  page.viewsCount = (page.viewsCount || 0) + 1;
  page.lastViewedAt = new Date().toISOString();

  // If ephemeral mode, delete immediately upon first view
  if (page.isEphemeral) {
    try {
      await deleteHtml(page.slug);
      pages = pages.filter((p) => p.slug !== page.slug);
    } catch (e) {
      console.error('Ephemeral delete failed:', e);
    }
  }

  savePages();

  // Deliver HTML with secure sandboxing and correct encoding
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Sandbox header preventing framing of sensitive parent pages while allowing scripts
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-modals allow-popups;");
  res.send(htmlContent);
});

// 2. GET /api/pages - List pages (optionally filtered by user)
app.get('/api/pages', (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = (req.headers['x-user-role'] as string) || 'anon';

  // Admin can list all pages, standard users list their own
  let result = pages;
  if (userRole !== 'admin') {
    if (userId) {
      result = pages.filter((p) => p.userId === userId);
    } else {
      result = [];
    }
  }

  // Return without secret password hashes
  const sanitized = result.map(({ passwordHash, ...rest }) => rest);
  res.json({ pages: sanitized });
});

// 3. POST /api/pages - Upload & publish page
app.post('/api/pages', async (req: Request, res: Response) => {
  try {
    const {
      html,
      title,
      description = '',
      customSlug,
      password,
      isEphemeral = false,
      collectionId,
    } = req.body;

    if (!html || typeof html !== 'string' || html.trim().length === 0) {
      res.status(400).json({ error: 'El contenido HTML no puede estar vacío.' });
      return;
    }

    const userRole = (req.headers['x-user-role'] as string) || 'anon';
    const userId = (req.headers['x-user-id'] as string) || `anon_${generateSlug(8)}`;
    const userEmail = req.headers['x-user-email'] as string;

    const sizeBytes = Buffer.byteLength(html, 'utf-8');
    const MAX_SIZE_ANON = 1 * 1024 * 1024; // 1MB
    const MAX_SIZE_REGISTERED = 10 * 1024 * 1024; // 10MB
    const maxSize = userRole === 'anon' ? MAX_SIZE_ANON : MAX_SIZE_REGISTERED;

    if (sizeBytes > maxSize) {
      res.status(413).json({
        error: `El tamaño del archivo (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) supera el límite permitido (${(maxSize / (1024 * 1024)).toFixed(0)} MB). Inicia sesión para subir hasta 10 MB.`,
      });
      return;
    }

    // Determine slug
    let slug = '';
    if (customSlug && typeof customSlug === 'string' && customSlug.trim()) {
      const cleanSlug = customSlug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]/g, '-');
      if (cleanSlug.length < 3 || cleanSlug.length > 40) {
        res.status(400).json({ error: 'El slug personalizado debe tener entre 3 y 40 caracteres alfanuméricos.' });
        return;
      }
      // Check collision
      if (pages.some((p) => p.slug.toLowerCase() === cleanSlug)) {
        res.status(409).json({ error: 'Este slug ya está en uso. Por favor elige otro.' });
        return;
      }
      slug = cleanSlug;
    } else {
      let attempts = 0;
      do {
        slug = generateSlug(6);
        attempts++;
      } while (pages.some((p) => p.slug === slug) && attempts < 10);
    }

    // Expiration date
    // Anon: 15 days, Registered: 90 days (3 months), Ephemeral: 1 hour
    const now = new Date();
    let expiresAt: Date;
    if (isEphemeral) {
      expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
    } else if (userRole === 'anon') {
      expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days
    } else {
      expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days
    }

    const hasPassword = Boolean(password && password.trim().length > 0);
    const passwordHash = hasPassword ? hashPassword(password.trim()) : undefined;

    // Save HTML to Supabase Storage
    await uploadHtml(slug, html);

    const newPage: PageMetadata = {
      id: crypto.randomUUID(),
      slug,
      title: title && title.trim() ? title.trim() : `Página ${slug}`,
      description: description.trim(),
      sizeBytes,
      userId,
      userEmail,
      userRole: userRole as 'anon' | 'user' | 'admin',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isEphemeral: Boolean(isEphemeral),
      hasPassword,
      passwordHash,
      viewsCount: 0,
      collectionId: collectionId || undefined,
    };

    pages.unshift(newPage);
    savePages();

    // If added to collection, update collection
    if (collectionId) {
      const col = collections.find((c) => c.id === collectionId || c.slug === collectionId);
      if (col && !col.pageSlugs.includes(slug)) {
        col.pageSlugs.push(slug);
        saveCollections();
      }
    }

    const { passwordHash: _, ...safePage } = newPage;
    res.status(201).json({
      success: true,
      page: safePage,
      publicUrl: `/p/${slug}`,
      rawUrl: `/raw/${slug}`,
    });
  } catch (err: any) {
    console.error('Error creating page:', err);
    res.status(500).json({ error: err.message || 'Error al procesar la publicación del archivo HTML.' });
  }
});

// 4. GET /api/pages/:slug - Get page metadata + verify password
app.get('/api/pages/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const page = pages.find((p) => p.slug.toLowerCase() === slug.toLowerCase());

  if (!page) {
    res.status(404).json({ error: 'Página no encontrada' });
    return;
  }

  const { passwordHash, ...safePage } = page;

  // Read HTML content if not password locked
  let htmlSnippet = '';
  if (!page.hasPassword) {
    try {
      htmlSnippet = (await downloadHtml(page.slug)) || '';
    } catch (e) {
      console.error('Failed to read HTML from Supabase:', e);
    }
  }

  res.json({
    page: safePage,
    hasPassword: page.hasPassword,
    html: htmlSnippet || undefined,
  });
});

// 5. POST /api/pages/:slug/unlock - Unlock password-protected page
app.post('/api/pages/:slug/unlock', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { password } = req.body;

  const page = pages.find((p) => p.slug.toLowerCase() === slug.toLowerCase());
  if (!page) {
    res.status(404).json({ error: 'Página no encontrada' });
    return;
  }

  if (!page.hasPassword) {
    try {
      const html = (await downloadHtml(page.slug)) || '';
      res.json({ success: true, html });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Error al leer el contenido' });
    }
    return;
  }

  if (!password || hashPassword(password) !== page.passwordHash) {
    res.status(401).json({ error: 'Contraseña incorrecta. Acceso denegado.' });
    return;
  }

  let html: string;
  try {
    const downloaded = await downloadHtml(page.slug);
    if (downloaded === null) {
      res.status(404).json({ error: 'Contenido no encontrado en Supabase Storage.' });
      return;
    }
    html = downloaded;
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Error al leer el contenido' });
    return;
  }

  page.viewsCount = (page.viewsCount || 0) + 1;
  page.lastViewedAt = new Date().toISOString();
  savePages();

  res.json({ success: true, html });
});

// 6. PATCH /api/pages/:slug/extend - Extend page expiration
app.patch('/api/pages/:slug/extend', (req: Request, res: Response) => {
  const { slug } = req.params;
  const page = pages.find((p) => p.slug.toLowerCase() === slug.toLowerCase());

  if (!page) {
    res.status(404).json({ error: 'Página no encontrada' });
    return;
  }

  // Extend by 90 days from now or from current expiration
  const currentExpiry = new Date(page.expiresAt).getTime();
  const baseTime = Math.max(Date.now(), currentExpiry);
  const newExpiry = new Date(baseTime + 90 * 24 * 60 * 60 * 1000);

  page.expiresAt = newExpiry.toISOString();
  page.updatedAt = new Date().toISOString();
  savePages();

  const { passwordHash, ...safePage } = page;
  res.json({ success: true, page: safePage });
});

// 7. PATCH /api/pages/:slug/password - Set or remove password
app.patch('/api/pages/:slug/password', (req: Request, res: Response) => {
  const { slug } = req.params;
  const { password } = req.body;
  const page = pages.find((p) => p.slug.toLowerCase() === slug.toLowerCase());

  if (!page) {
    res.status(404).json({ error: 'Página no encontrada' });
    return;
  }

  if (password && password.trim().length > 0) {
    page.hasPassword = true;
    page.passwordHash = hashPassword(password.trim());
  } else {
    page.hasPassword = false;
    delete page.passwordHash;
  }

  page.updatedAt = new Date().toISOString();
  savePages();

  const { passwordHash, ...safePage } = page;
  res.json({ success: true, page: safePage });
});

// 8. DELETE /api/pages/:slug - Delete page
app.delete('/api/pages/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const index = pages.findIndex((p) => p.slug.toLowerCase() === slug.toLowerCase());

  if (index === -1) {
    res.status(404).json({ error: 'Página no encontrada' });
    return;
  }

  const page = pages[index];
  try {
    await deleteHtml(page.slug);
  } catch (e) {
    console.error('Failed to delete from Supabase Storage:', e);
  }

  pages.splice(index, 1);
  savePages();

  // Remove from any collections
  collections.forEach((col) => {
    col.pageSlugs = col.pageSlugs.filter((s) => s.toLowerCase() !== slug.toLowerCase());
  });
  saveCollections();

  res.json({ success: true, message: 'Página eliminada correctamente.' });
});

// --- COLLECTIONS API ---

// 9. GET /api/collections
app.get('/api/collections', (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = (req.headers['x-user-role'] as string) || 'anon';

  let result = collections;
  if (userRole !== 'admin' && userId) {
    result = collections.filter((c) => c.userId === userId);
  }

  res.json({ collections: result });
});

// 10. POST /api/collections - Create collection
app.post('/api/collections', (req: Request, res: Response) => {
  const { title, description = '', customSlug, pageSlugs = [] } = req.body;

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'El título de la colección es obligatorio.' });
    return;
  }

  const userId = (req.headers['x-user-id'] as string) || 'anon';
  const userEmail = req.headers['x-user-email'] as string;

  let slug = '';
  if (customSlug && customSlug.trim()) {
    slug = customSlug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-');
    if (collections.some((c) => c.slug.toLowerCase() === slug)) {
      res.status(409).json({ error: 'El slug de la colección ya está en uso.' });
      return;
    }
  } else {
    slug = `col-${generateSlug(6)}`;
  }

  const newCol: CollectionMetadata = {
    id: crypto.randomUUID(),
    slug,
    title: title.trim(),
    description: description.trim(),
    userId,
    userEmail,
    pageSlugs: Array.isArray(pageSlugs) ? pageSlugs : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  collections.unshift(newCol);
  saveCollections();

  res.status(201).json({ success: true, collection: newCol });
});

// 11. GET /api/collections/:slug - Public collection view
app.get('/api/collections/:slug', (req: Request, res: Response) => {
  const { slug } = req.params;
  const col = collections.find((c) => c.slug.toLowerCase() === slug.toLowerCase());

  if (!col) {
    res.status(404).json({ error: 'Colección no encontrada' });
    return;
  }

  // Populate pages
  const populatedPages = col.pageSlugs
    .map((pageSlug) => pages.find((p) => p.slug.toLowerCase() === pageSlug.toLowerCase()))
    .filter(Boolean)
    .map((p) => {
      const { passwordHash, ...safe } = p!;
      return safe;
    });

  res.json({
    collection: col,
    pages: populatedPages,
  });
});

// 12. DELETE /api/collections/:slug
app.delete('/api/collections/:slug', (req: Request, res: Response) => {
  const { slug } = req.params;
  const index = collections.findIndex((c) => c.slug.toLowerCase() === slug.toLowerCase());

  if (index === -1) {
    res.status(404).json({ error: 'Colección no encontrada' });
    return;
  }

  collections.splice(index, 1);
  saveCollections();
  res.json({ success: true, message: 'Colección eliminada.' });
});

// --- ADMIN API ---

// 13. GET /api/admin/stats
app.get('/api/admin/stats', (req: Request, res: Response) => {
  const userRole = (req.headers['x-user-role'] as string) || 'anon';
  const adminKey = req.headers['x-admin-key'] as string;

  // Verify admin access
  if (userRole !== 'admin' && adminKey !== 'admin-secret-creaurl') {
    res.status(403).json({ error: 'Acceso no autorizado al panel de administración.' });
    return;
  }

  const now = new Date().toISOString();
  const totalPages = pages.length;
  const totalViews = pages.reduce((acc, p) => acc + (p.viewsCount || 0), 0);
  const totalSizeBytes = pages.reduce((acc, p) => acc + (p.sizeBytes || 0), 0);
  const activePages = pages.filter((p) => !p.expiresAt || p.expiresAt >= now).length;
  const expiredPages = totalPages - activePages;
  const passwordProtectedPages = pages.filter((p) => p.hasPassword).length;
  const ephemeralPages = pages.filter((p) => p.isEphemeral).length;

  res.json({
    totalPages,
    totalViews,
    totalSizeBytes,
    activePages,
    expiredPages,
    passwordProtectedPages,
    ephemeralPages,
    totalCollections: collections.length,
    storageDirectory: 'supabase://' + (process.env.SUPABASE_STORAGE_BUCKET || 'html-pages'),
  });
});

// 14. POST /api/admin/purge-expired
app.post('/api/admin/purge-expired', (req: Request, res: Response) => {
  const userRole = (req.headers['x-user-role'] as string) || 'anon';
  const adminKey = req.headers['x-admin-key'] as string;

  if (userRole !== 'admin' && adminKey !== 'admin-secret-creaurl') {
    res.status(403).json({ error: 'Acceso denegado.' });
    return;
  }

  const now = new Date().toISOString();
  const initialCount = pages.length;
  purgeExpiredPages();
  const purgedCount = initialCount - pages.length;

  res.json({ success: true, purgedCount, remainingPages: pages.length });
});

// 15. GET /api/templates - Return starter templates
app.get('/api/templates', (_req: Request, res: Response) => {
  res.json({
    templates: [
      {
        id: 'portfolio',
        name: 'Portfolio Minimalista',
        description: 'Página personal limpia con biografía, proyectos destacados y enlaces sociales.',
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mi Portfolio Digital</title>
  <style>
    :root { --bg: #090d16; --card: #131b2e; --text: #f8fafc; --muted: #94a3b8; --accent: #10b981; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 48px 24px; display: flex; justify-content: center; }
    .container { max-width: 680px; width: 100%; }
    .badge { display: inline-block; font-size: 12px; font-weight: 600; color: var(--accent); background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); padding: 4px 10px; border-radius: 999px; margin-bottom: 16px; }
    h1 { font-size: 36px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.02em; }
    p.lead { color: var(--muted); font-size: 17px; line-height: 1.6; margin-bottom: 32px; }
    h2 { font-size: 20px; font-weight: 600; margin: 32px 0 16px; }
    .card { background: var(--card); border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 12px; transition: transform 0.2s, border-color 0.2s; }
    .card:hover { transform: translateY(-2px); border-color: var(--accent); }
    .card h3 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .card p { font-size: 14px; color: var(--muted); line-height: 1.5; }
    .links { display: flex; gap: 12px; margin-top: 32px; }
    .btn { display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 8px; background: var(--accent); color: #052e16; font-weight: 600; font-size: 14px; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <span class="badge">Disponible para proyectos</span>
    <h1>Hola, soy Desarrollador Web</h1>
    <p class="lead">Construyo productos digitales modernos, rápidos y centrados en la experiencia del usuario con TypeScript y diseño de interfaces.</p>
    <h2>Proyectos Recientes</h2>
    <div class="card">
      <h3>🚀 Plataforma SaaS</h3>
      <p>Infraestructura cloud sin servidor con microservicios y sincronización en tiempo real.</p>
    </div>
    <div class="card">
      <h3>⚡ Editor Visual</h3>
      <p>Herramienta interactiva de diseño y exportación de código con soporte Markdown y HTML.</p>
    </div>
    <div class="links">
      <a href="mailto:hola@ejemplo.com" class="btn">Contactar conmigo</a>
    </div>
  </div>
</body>
</html>`
      },
      {
        id: 'landing',
        name: 'Landing Page de Producto',
        description: 'Estructura lista para lanzamiento con Hero, características y llamada a la acción.',
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lanza tu Producto al Instante</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; line-height: 1.6; }
    header { padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; }
    .logo { font-weight: 700; font-size: 18px; letter-spacing: -0.03em; color: #38bdf8; }
    .hero { text-align: center; padding: 80px 24px 60px; max-width: 800px; margin: 0 auto; }
    .hero h1 { font-size: 48px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; margin-bottom: 20px; }
    .hero p { font-size: 18px; color: #94a3b8; margin-bottom: 32px; }
    .cta-btn { background: #38bdf8; color: #082f49; font-weight: 600; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; display: inline-block; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; max-width: 900px; margin: 40px auto; padding: 0 24px; }
    .feature-box { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
    .feature-box h3 { font-size: 18px; margin-bottom: 8px; color: #e2e8f0; }
    .feature-box p { font-size: 14px; color: #94a3b8; }
  </style>
</head>
<body>
  <header>
    <div class="logo">⚡ FlashApp</div>
    <a href="#" class="cta-btn" style="padding: 8px 16px; font-size: 14px;">Comenzar</a>
  </header>
  <main class="hero">
    <h1>Crea, comparte y valida ideas en minutos</h1>
    <p>Publica páginas estáticas y prototipos web con URLs limpias sin preocuparte por servidores ni configuraciones complejas.</p>
    <a href="#" class="cta-btn">Probar gratis ahora &rarr;</a>
  </main>
  <section class="features">
    <div class="feature-box">
      <h3>🚀 Carga Inmediata</h3>
      <p>Servido a través de CDN global de baja latencia con compresión automática.</p>
    </div>
    <div class="feature-box">
      <h3>🔒 Sandbox Seguro</h3>
      <p>Tus páginas están aisladas para máxima protección y compatibilidad de scripts.</p>
    </div>
    <div class="feature-box">
      <h3>📱 100% Responsive</h3>
      <p>Se adapta a cualquier dispositivo móvil, tablet o monitor de escritorio.</p>
    </div>
  </section>
</body>
</html>`
      },
      {
        id: 'doc',
        name: 'Documentación Técnica',
        description: 'Plantilla tipo guía o changelog con código monoespaciado y tablas limpias.',
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentación de API</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #ffffff; color: #1e293b; margin: 0; padding: 40px 24px; display: flex; justify-content: center; }
    .doc { max-width: 720px; width: 100%; }
    h1 { font-size: 28px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
    h2 { font-size: 20px; margin-top: 32px; margin-bottom: 12px; }
    p { line-height: 1.6; color: #475569; margin-bottom: 16px; font-size: 15px; }
    pre { background: #0f172a; color: #38bdf8; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 13px; overflow-x: auto; margin-bottom: 20px; }
    code { font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #334155; }
  </style>
</head>
<body>
  <div class="doc">
    <h1>Guía de Inicio Rápido v1.0</h1>
    <p>Aprende a integrar el servicio mediante llamadas HTTP RESTful estándar.</p>
    <h2>1. Autenticación</h2>
    <p>Incluye tu clave en la cabecera <code>Authorization: Bearer TU_API_KEY</code>.</p>
    <pre>curl -X POST https://crea-url.kbo1.workers.dev/api/pages \\
  -H "Authorization: Bearer sk_live_12345" \\
  -H "Content-Type: application/json" \\
  -d '{"html": "&lt;h1&gt;Hola Mundo&lt;/h1&gt;", "title": "Mi Primera Web"}'</pre>
    <h2>2. Códigos de Estado</h2>
    <table>
      <thead>
        <tr><th>Código</th><th>Estado</th><th>Descripción</th></tr>
      </thead>
      <tbody>
        <tr><td>200</td><td>OK</td><td>Petición procesada con éxito</td></tr>
        <tr><td>401</td><td>Unauthorized</td><td>Falta la clave o es inválida</td></tr>
        <tr><td>413</td><td>Payload Too Large</td><td>El archivo HTML supera el límite</td></tr>
      </tbody>
    </table>
  </div>
</body>
</html>`
      }
    ]
  });
});

// Setup Vite or static files
async function startServer() {
  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Crea URL Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

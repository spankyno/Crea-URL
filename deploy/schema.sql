-- Cloudflare D1 / SQLite Database Schema for Crea URL
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  size_bytes INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_role TEXT NOT NULL DEFAULT 'anon',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_ephemeral INTEGER NOT NULL DEFAULT 0,
  has_password INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  collection_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages (slug);
CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages (user_id);
CREATE INDEX IF NOT EXISTS idx_pages_expires_at ON pages (expires_at);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  user_id TEXT NOT NULL,
  user_email TEXT,
  page_slugs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections (slug);
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections (user_id);

-- Límite de peticiones (el Worker también la crea automáticamente si no existe)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_end INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON rate_limits(window_end);

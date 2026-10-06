# Despliegue en Cloudflare como Proyecto ÚNICO (All-in-One)

Todo en un único proyecto: frontend + API + D1 (metadatos) + **Supabase Storage** (archivos HTML).

> 📘 **Guía Completa**: Consulta [`INSTRUCTIONS.md`](../INSTRUCTIONS.md) para el manual detallado de cuentas gratuitas (Supabase, Clerk y Cloudflare).

---

## 1. Solución al Error `POST 405 (Method Not Allowed)`

En `deploy/wrangler.toml` se incluye `run_worker_first = true` bajo `[assets]`. Esto fuerza a Cloudflare Workers a procesar primero la lógica del Worker (`cloudflare-worker.ts`) para todas las peticiones `POST`, `GET`, `PATCH`, `DELETE` en `/api/*` y `/raw/*`, solucionando el fallo 405.

---

## 2. Preparar Supabase (Almacenamiento)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. Storage → **New bucket** → nombre `html-pages` → márcalo como **Public**.
3. Settings → API → copia:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 3. Crear la Base de Datos D1 (Metadatos de páginas)

```bash
wrangler d1 create crea_url_db
wrangler d1 execute crea_url_db --file=deploy/schema.sql --remote
```

Guarda el `database_id` devuelto y ponlo en `deploy/wrangler.toml`.

---

## 4. Configurar secretos del Worker

```bash
wrangler secret put SUPABASE_URL --config deploy/wrangler.toml
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config deploy/wrangler.toml
```

---

## 5. Compilar y Desplegar

```bash
npm run build
wrangler deploy --config deploy/wrangler.toml
```

El Worker servirá:
- La interfaz web (React SPA)
- Las rutas de API (`/api/pages`, `/api/collections`, `/api/admin/*`)
- La entrega directa `/raw/:slug` desde Supabase Storage
- Limpieza automática de páginas expiradas (cron)

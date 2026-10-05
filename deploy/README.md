# Despliegue en Cloudflare como Proyecto ÚNICO (All-in-One)

Todo en un único proyecto: frontend + API + D1 (metadatos) + **Supabase Storage** (archivos HTML).

## 1. Preparar Supabase (almacenamiento)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Storage → **New bucket** → nombre `html-pages` → márcalo como **Public**.
3. Settings → API → copia:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Crear la Base de Datos D1 (metadatos)

```bash
wrangler d1 create crea_url_db
wrangler d1 execute crea_url_db --file=deploy/schema.sql --remote
```

Guarda el `database_id` y ponlo en `deploy/wrangler.toml`.

## 3. Configurar secrets del Worker

```bash
wrangler secret put SUPABASE_URL --config deploy/wrangler.toml
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config deploy/wrangler.toml
```

(Opcional) variable del bucket:

```bash
# ya viene por defecto como "html-pages" en [vars]
```

## 4. Desplegar (Opción B – recomendada)

```bash
npm run build
wrangler deploy --config deploy/wrangler.toml
```

El Worker servirá:

- La interfaz web
- Las rutas `/api/*`
- La entrega directa `/raw/:slug` desde Supabase Storage
- Limpieza de páginas expiradas (cron)

## Opción A: Cloudflare Pages + Functions

1. Conecta el repo a Pages (build: `npm run build`, output: `dist`).
2. En Settings → Bindings / Functions:
   - D1: binding `DB` → `crea_url_db`
3. Añade variables/secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET` = `html-pages`
4. Asegúrate de que existe `functions/[[route]].ts` (ya incluido).

## Notas

- Ya **no** se usa R2 ni Gemini.
- Los metadatos de páginas viven en D1; el HTML en Supabase Storage.

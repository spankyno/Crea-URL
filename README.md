# Crea URL – Alojamiento y publicación de páginas HTML estáticas

Sube, previsualiza y publica páginas HTML estáticas al instante con URLs limpias, sandbox seguro, colecciones, códigos QR y protección por contraseña.

## Requisitos

- Node.js 18+
- Cuenta gratuita en [Supabase](https://supabase.com) (almacenamiento de los HTML)

## Configuración local

1. Copia las variables de entorno:

```bash
cp .env.example .env
```

2. Rellena en `.env`:

- `SUPABASE_URL` – URL de tu proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` – clave `service_role` (Settings → API)
- `SUPABASE_STORAGE_BUCKET` – nombre del bucket (por defecto `html-pages`)

3. En el panel de Supabase:

- Storage → **New bucket** → nombre `html-pages`
- Marca el bucket como **Public** (o configura políticas de lectura pública)

4. Instala dependencias y arranca:

```bash
npm install
npm run dev
```

La app estará en `http://localhost:3000`.

## Despliegue en Cloudflare

Consulta la guía completa en [`deploy/README.md`](deploy/README.md).

Resumen rápido (Worker + assets + D1 + Supabase):

```bash
npm run build
wrangler deploy --config deploy/wrangler.toml
```

Configura como secrets/vars del Worker:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (opcional, default `html-pages`)

## Estructura

- `src/` – frontend React (Vite)
- `server.ts` – backend local (Express + Supabase Storage)
- `deploy/cloudflare-worker.ts` – backend en Cloudflare Workers
- `deploy/schema.sql` – esquema D1 (metadatos de páginas)
- `functions/` – adaptador Pages Functions (si usas Opción A)

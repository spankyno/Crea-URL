# Crea URL – Alojamiento y publicación de páginas HTML estáticas

Sube, previsualiza y publica páginas HTML estáticas al instante con URLs limpias, sandbox seguro, colecciones, códigos QR, protección por contraseña y sistema de usuarios (Anónimo, Registrado y Administrador).

> 📘 **Guía paso a paso**: Consulta [`INSTRUCTIONS.md`](INSTRUCTIONS.md) para las instrucciones detalladas de configuración de las cuentas gratuitas en **Supabase Storage**, **Clerk Auth** y despliegue en **Cloudflare Workers**.

---

## Sistema de Usuarios (Anónimo, Registrado, Administrador)

- **Anónimo (Invitado)**: Permite publicar HTML al instante sin registrarse. Límite de 1 MB y retención de 15 días.
- **Registrado (Pro Free)**: Autenticación mediante **Clerk Login** (Google, GitHub, Email). Límite ampliado a 10 MB, retención de 90 días (3 meses) y acceso al Dashboard de Colecciones.
- **Administrador (SuperAdmin)**: Consola global (`/admin`) para supervisar métricas, buscar páginas de todos los usuarios y purgar páginas expiradas.

---

## Configuración Local

1. Copia las variables de entorno:
```bash
cp .env.example .env
```

2. Rellena en `.env` tus credenciales de Supabase y Clerk (ver [`INSTRUCTIONS.md`](INSTRUCTIONS.md)):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=html-pages`
- `VITE_CLERK_PUBLISHABLE_KEY` (opcional en local; si no se incluye, funciona en modo simulación)

3. Instala dependencias y arranca:
```bash
npm install
npm run dev
```
La aplicación estará en `http://localhost:3000`.

---

## Despliegue en Cloudflare Workers

Consulta la guía completa de despliegue en [`deploy/README.md`](deploy/README.md).

Resumen rápido:
```bash
npm run build
wrangler deploy --config deploy/wrangler.toml
```

> ⚡ **Nota de Solución POST 405**: Se ha añadido `run_worker_first = true` en `deploy/wrangler.toml` para solucionar el error `405 Method Not Allowed` en `/api/pages` al publicar desde Cloudflare Workers.

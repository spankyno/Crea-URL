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


---

## Variables de entorno del Worker (producción)

Se configuran en **Cloudflare → Workers & Pages → crea-url → Settings → Variables and Secrets**
(la sección de ejecución, no la de *Build*). `wrangler.toml` incluye `keep_vars = true`, así que los
despliegues no las borran.

| Variable | Tipo | Obligatoria | Descripción |
|---|---|---|---|
| `SUPABASE_URL` | Secret | Sí | `https://xxxx.supabase.co` (sin `/storage/...` ni barra final) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Sí | Clave `service_role` (nunca la `anon`) |
| `CLERK_PUBLISHABLE_KEY` | Text | Sí | La misma `pk_test_...` / `pk_live_...` del frontend. De ella se deduce el emisor y las claves públicas para **verificar el token de sesión** |
| `ADMIN_USER_IDS` | Text | Para el panel admin | IDs de usuario de Clerk (`user_...`) separados por comas |
| `ADMIN_EMAILS` | Text | No | Correos admin (requiere añadir el claim `email` en *Clerk → Sessions → Customize session token*) |
| `CLERK_ISSUER` | Text | No | Solo si usas un dominio propio de Clerk y no quieres derivarlo de la clave |
| `PASSWORD_HASH_ITERATIONS` | Text | No | Iteraciones PBKDF2 (por defecto 50000; máx. 100000). Si ves el error 1102 en el plan gratuito, bájalo a 20000 |

**Comprobar la configuración** (con sesión iniciada, en la consola del navegador):

```js
fetch('/api/me',{headers:{Authorization:'Bearer '+await Clerk.session.getToken()}}).then(r=>r.json()).then(console.log)
```

Debe mostrar `authConfigured: true`, tu `userId` y `role` (`admin` si tu ID está en `ADMIN_USER_IDS`).

## Seguridad y límites

- **Identidad:** el Worker verifica la firma (RS256) del JWT de Clerk. Las cabeceras `x-user-role` / `x-admin-key` ya no se aceptan; `x-user-id` solo identifica a invitados (`anon_...`).
- **Propiedad:** solo el dueño (o un admin) puede editar, prorrogar, cambiar la contraseña o borrar una página o colección.
- **Contraseñas de página:** PBKDF2-SHA256 con sal aleatoria. Los hashes antiguos se migran solos al primer acceso correcto. La clave nunca viaja por la URL.
- **Límites de peticiones** (tabla `rate_limits` en D1, se crea sola): publicar 10/h (anónimo, por IP) y 60/h (con cuenta); editar 30/h y 120/h; colecciones 20/h; 10 contraseñas erróneas por IP y página cada 15 min.
- **Estadísticas:** cada visita (excepto robots y vistas previas de redes) suma al total y al detalle diario UTC de la tabla `page_views_daily` (se crea sola; se conserva 400 días y se borra al eliminar o caducar la página). Solo el dueño o un admin puede ver `GET /api/pages/:slug/stats`.
- **Tamaño y caducidad:** anónimo 1 MB / 15 días; registrado 10 MB / 90 días. Cron horario (`[triggers]` en `wrangler.toml`) que elimina páginas caducadas (archivo en Supabase y registro en D1).

> `server.ts` (servidor local de desarrollo) sigue confiando en cabeceras: no lo uses en producción.

---

## SEO, tema visual y seguimiento

- **Imagen para compartir:** `public/og-image.jpg`. La usan las etiquetas `og:image` / `twitter:image`, la página `/acerca-de` y las vistas previas de `/p/...` y `/c/...`. Formato: JPEG de 1200×630 px (≈145 kB, proporción 1,91:1 recomendada para tarjetas de redes sociales). Las medidas están declaradas en `index.html`, `public/acerca-de.html` y el Worker: si la cambias, actualízalas.
- **Dominio:** las URLs absolutas (canonical, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`) apuntan a `https://crea-url.kbo1.workers.dev`. Si cambias de dominio, sustitúyelo en `index.html`, `public/acerca-de.html`, `public/sitemap.xml` y `public/robots.txt`.
- **Indexación:** solo se indexan `/` y `/acerca-de`. Las páginas de usuarios (`/p/`, `/c/`, `/raw/`) y la API llevan `noindex` (meta robots o cabecera `X-Robots-Tag`).
- **Search Console:** la etiqueta `google-site-verification` está en `index.html`. Envía `https://crea-url.kbo1.workers.dev/sitemap.xml` desde Search Console.
- **Seguimiento:** el script de Aitor's Hub Dashboard está en `index.html` y `public/acerca-de.html`. No se inyecta en el contenido publicado por los usuarios.
- **Tema:** oscuro por defecto; la preferencia se guarda en `localStorage` (`creaurl_theme`) y la comparten la aplicación y `/acerca-de`. En `src/index.css` están los tokens (`bg-app`, `text-strong`...) y la inversión de paleta del modo claro.

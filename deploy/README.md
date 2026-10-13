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
| `ADMIN_USER_IDS` | Text | Para el panel admin | IDs de usuario de Clerk (`user_...`) separados por comas. **Es la única forma de ser administrador**: ni correos, ni metadatos, ni el claim `role` conceden el rol (`ADMIN_EMAILS` quedó obsoleta y solo genera un aviso en los logs) |
| `CLERK_ISSUER` | Text | No | Solo si usas un dominio propio de Clerk y no quieres derivarlo de la clave |
| `CSP_MODE` | Text | No | `report-only` (por defecto: informa sin bloquear), `enforce` (bloquea) u `off` |
| `ALLOWED_ORIGINS` | Text | No | Orígenes con acceso CORS a la API, separados por comas (el propio origen siempre se permite) |
| `CSP_EXTRA_SOURCES` | Text | No | Orígenes extra permitidos en `script-src` y `connect-src`, separados por espacios |
| `QUOTA_ANON_MB` / `QUOTA_REGISTERED_MB` | Text | No | Cuota total de almacenamiento por propietario (por defecto 5 y 100 MB) |
| `QUOTA_ANON_IP_DAILY_MB` | Text | No | Subida diaria máxima por conexión para anónimos (por defecto 25 MB) |
| `READ_LIMIT_PER_MIN` | Text | No | Lecturas públicas por IP y minuto (por defecto 120; `0` lo desactiva) |
| `ALLOW_LEGACY_ANON_IDS` | Text | No | `false` desactiva el reconocimiento de páginas anónimas antiguas (ver «Identidad anónima»). Por defecto está activo |
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

## Identidad anónima (SEC-01)

El identificador de un usuario anónimo (`x-user-id`) es un **secreto**, equivalente a una contraseña:

- La base de datos guarda solo su **hash** (`anonh_...`, SHA-256). El secreto no se almacena ni se devuelve nunca.
- La API pública no devuelve identificadores ni correos de propietarios; solo los administradores los ven (panel Admin).
- Los navegadores con un identificador antiguo (8 caracteres, que llegó a exponerse en la API pública) lo **renuevan solos** la primera vez que abren la aplicación: `POST /api/identity/rotate` traslada sus páginas y colecciones a un secreto nuevo de 24 caracteres.
- Mientras convivan filas antiguas (guardadas con el secreto en claro) el Worker las sigue reconociendo. Cuando haya pasado el tiempo máximo de vida de las páginas anónimas (15 días, o más si se prorrogaron), define `ALLOW_LEGACY_ANON_IDS=false` para cerrar esa compatibilidad: las páginas cuyo dueño no haya vuelto a abrir la aplicación dejarán de poder gestionarse (seguirán publicadas hasta caducar).

## Errores internos y diagnóstico (SEC-11)

- Cuando algo falla en el servidor, el cliente recibe solo «Error interno del servidor» y una **referencia** de 8 caracteres. El detalle real (por ejemplo, la respuesta de Supabase) se guarda únicamente en los logs del Worker, precedido por esa referencia: *Cloudflare → Workers & Pages → crea-url → Observability → Logs* (o `wrangler tail`). Busca la referencia que te indique el usuario.
- Para comprobar la configuración sin exponerla, `GET /api/me` devuelve `authConfigured` (Clerk) y `storageConfigured` (Supabase) como valores booleanos.

## Páginas con contraseña (SEC-05)

La API pública y las colecciones muestran las páginas con contraseña como «Página protegida», sin su título ni su descripción. Solo el dueño y el administrador los ven.

## Almacenamiento (SEC-02)

El bucket `html-pages` de Supabase **debe ser privado**: el Worker accede con la clave `service_role`. Si fuera público, cualquiera con el slug de una página podría descargar su HTML directamente, saltándose la contraseña y la caducidad.

## Límites, cuotas y contraseñas (SEC-06, SEC-07, SEC-09)

- **Contraseña de página:** mínimo 8 caracteres al crearla o cambiarla (las antiguas, más cortas, siguen funcionando).
- **Fuerza bruta en el desbloqueo** (solo cuentan los intentos fallidos): 10 por IP y página cada 15 min; 100 por página y hora sumando todas las IP; 60 por IP y 15 min en cualquier página (barrido). **Efecto secundario:** un atacante puede bloquear una página durante una hora enviando 100 intentos fallidos, y con ella a sus visitantes legítimos. Es el precio de frenar la fuerza bruta distribuida.
- **Visitas:** se cuenta una por IP y página cada hora (los robots no cuentan). Las peticiones repetidas no escriben en la base de datos.
- **Lecturas públicas** (`/api/pages/:slug` y `/raw/:slug`): 120 por IP y minuto. Lo bloqueado solo lee en D1, no escribe. Cambiar contraseña: 10 por hora; prorrogar o borrar: 60 por hora.
- **Cuotas:** 5 MB (anónimo) y 100 MB (registrado) en total por propietario, sumando todas sus páginas; el administrador está exento. Como el identificador anónimo lo elige el cliente, a los anónimos se les aplica además un presupuesto de subida diario por conexión (25 MB). Una cuenta nueva de Clerk empieza con su propia cuota: para frenar el alta masiva de cuentas activa la protección contra bots de Clerk.
- **Coste en D1:** una primera visita realiza unas 4 escrituras (límite de lectura, deduplicación y dos contadores); las repetidas, 1. Con el plan gratuito (100.000 escrituras al día) caben unas 25.000 visitas nuevas diarias. Si necesitas más, desactiva el límite de lecturas (`READ_LIMIT_PER_MIN=0`) y usa una regla de límite de peticiones de Cloudflare (WAF) en su lugar.

## Cabeceras de seguridad y CSP (SEC-08, SEC-14, SEC-18)

- **Siempre activas:** `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, `Cache-Control: no-store` en la API, y `frame-ancestors 'self'` + `X-Frame-Options` en las páginas de la aplicación (anti *clickjacking*). Las rutas `/p/...` y `/c/...` **sí se pueden incrustar** (función «insertar» del cuadro de publicación).
- **CORS:** ya no es `*`. Solo se responde al propio origen y a los de `ALLOWED_ORIGINS`.
- **CSP (política de contenido):** por defecto en modo **informe** (`Content-Security-Policy-Report-Only`): no bloquea nada, solo registra en los logs del Worker las cosas que bloquearía (`[CSP] ...`). Los `<script>` en línea de `index.html` y `/acerca-de` se autorizan por *hash*, calculado al servir cada página.
- **Cómo pasar a bloqueo, paso a paso:**
  1. Despliega y usa la aplicación como lo haría un usuario: inicia sesión con Clerk, publica, abre el panel, genera un QR, exporta un ZIP.
  2. Revisa *Observability → Logs* buscando `[CSP]`.
  3. Si aparece algo legítimo (p. ej. un dominio de Clerk), añádelo en `CSP_EXTRA_SOURCES`.
  4. Cuando no haya avisos, define `CSP_MODE=enforce`. Si algo fallara, vuelve a `report-only` u `off` sin tocar código.
- **Vista previa y páginas publicadas (SEC-18):** el HTML de los usuarios se muestra en `/preview-frame`, una página que el Worker sirve con `Content-Security-Policy: sandbox ...` (sin `allow-same-origin`), de modo que el contenido tiene un origen opaco y no puede leer la sesión de la aplicación. Se abre así tanto en el iframe como en «abrir en pestaña nueva» (antes usaba un `blob:` que heredaba el origen de la aplicación). **No uses `srcDoc` ni `blob:` para HTML de usuarios.**
- No se envía `Cross-Origin-Opener-Policy`: podría romper el inicio de sesión de Clerk en ventana emergente.

## Origen de la sesión y servidor local (SEC-15, SEC-13)

- **Origen del token (`azp`):** el Worker solo acepta tokens de Clerk emitidos para su propio origen y para los de `ALLOWED_ORIGINS`. Si otra aplicación tuya comparte la misma instancia de Clerk (por ejemplo Aitor Hub), sus tokens se rechazan aquí con un 401. El propio origen del Worker se acepta siempre (también si lo sirves desde un dominio propio). Si **otra aplicación en un origen distinto** debe llamar a esta API con sus sesiones de Clerk, añade ese origen a `ALLOWED_ORIGINS`; en los logs verás `[auth] azp no autorizado: ...` con el origen rechazado.
- **`server.ts` es solo para desarrollo local** (`npm run dev`): no verifica sesiones y confía en las cabeceras `x-user-role` / `x-user-id` que envía el cliente. Por eso escucha únicamente en `127.0.0.1` y se niega a arrancar con `NODE_ENV=production`. Se eliminó el script `npm start`. Producción es siempre `npm run deploy` (el Worker).
- Se eliminó la carpeta `functions/`, un resto del despliegue en Cloudflare Pages que ya no se usaba.

## Herramientas y despliegue: wrangler 4 (SEC-10)

- **Requisito: Node.js ≥ 22** (lo exige wrangler 4; está declarado en `engines` y en `.node-version`). Si compilas en local con una versión anterior, `npm run deploy` fallará con un mensaje de versión de Node.
- `wrangler` pasó de 3.114 a **4.149** (`npm audit`: de 7 avisos, 5 altos, a **0**). `express` y `dotenv` pasaron a `devDependencies` (solo los usa el servidor local).
- **Cambio de comportamiento en `wrangler.toml`:** se quitó `not_found_handling = "single-page-application"`. Con esa opción la plataforma devolvía `index.html` con código 200 para *cualquier* ruta inexistente, incluidos archivos como `/assets/viejo.js` o `/favicon.ico` (errores confusos tras un despliegue y «soft 404» para buscadores). Ahora decide el Worker: las rutas de la aplicación (`/p/...`, `/c/...`, `/collections`, `/admin`...) reciben `index.html`; un archivo que no existe da 404 real.
- **Probar el Worker en local, con el motor real y una D1 real:**
  ```bash
  npx wrangler d1 execute crea_url_db --local --file=deploy/schema.sql
  npm run build
  npx wrangler dev --test-scheduled      # variables en un archivo .dev.vars (no se sube al repositorio)
  ```
  `--test-scheduled` expone `/__scheduled?cron=0+*+*+*+*` para probar la limpieza horaria.
- **Tras desplegar, comprueba:** (1) en el registro de compilación aparece Node ≥ 22 y wrangler 4.149; (2) cargan un enlace directo a una página tuya (`/p/...`) y `/collections`; (3) `/assets/no-existe.js` da 404; (4) publicar y ver una página funcionan; (5) el *cron trigger* sigue listado en el Worker.
- **Si algo falla y necesitas volver atrás:** restaura `package.json`, `package-lock.json` y `wrangler.toml` de la versión anterior (y borra `.node-version`). Para recuperar solo el comportamiento anterior de las rutas, vuelve a añadir `not_found_handling = "single-page-application"` en `[assets]`.

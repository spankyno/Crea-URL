# Pruebas de extremo a extremo

Ejecutan el Worker **real** en `workerd` (el motor de Cloudflare) con una base de datos **D1 real** (SQLite local),
publicando, editando, desbloqueando, denunciando, borrando… tal y como lo haría un usuario. Supabase y Clerk se
simulan con un servidor local, así que **no hace falta ninguna cuenta ni secreto y no se toca producción**.

```bash
npm run test:e2e
```

Requisitos: Node.js ≥ 22 y las dependencias instaladas (`npm ci`). Tarda poco más de un minuto. Sale con código `0` si
todo pasa y `1` si algo falla (sirve en integración continua).

## Qué hace `run.mjs`

1. Compila el frontend (`npm run build`; omítelo con `E2E_SKIP_BUILD=1`).
2. Crea una base de datos local **aislada** en `.wrangler/e2e-state` con `deploy/schema.sql`.
3. Arranca `wrangler dev` con `tests/e2e/wrangler.e2e.toml` y variables de prueba en `tests/e2e/.dev.vars`.
   Como wrangler busca `.dev.vars` junto a su configuración, **el `.dev.vars` de tu proyecto (con secretos reales) se ignora**.
4. Ejecuta `suite.mjs` y, al terminar, cierra `wrangler dev` y sus procesos hijos.

Si falla el arranque, revisa `tests/e2e/wrangler.log`. Puertos: `E2E_PORT` (8787) y `E2E_MOCK_PORT` (8801).

## Qué cubre (≈90 comprobaciones)

- **Aplicación estática y cabeceras:** `/`, `/acerca-de`, `/privacidad`, `/preview-frame` (CSP `sandbox`), rutas de la SPA, 404 reales
  para archivos inexistentes, HSTS/CSP/`X-Frame-Options`, `noindex`.
- **Anónimos:** publicar, ver, `/raw`, listar, editar, prorrogar, borrar; el propietario se guarda con *hash*; nadie más puede gestionarlas.
- **Registrados (JWT de Clerk verificado):** firma alterada, `azp` de otra aplicación, contraseñas PBKDF2, desbloqueo, metadatos ocultos
  de páginas protegidas.
- **Colecciones, estadísticas y visitas** deduplicadas.
- **Límites reales** sobre SQLite: publicaciones, lecturas, intentos de contraseña, **cuotas de almacenamiento**.
- **Administración:** permisos, estadísticas, **limpieza programada** (`/__scheduled`).
- **Denuncias** (motivos, duplicados, límite, panel de administración, retención de 90 días).
- **Borrado de todos mis datos** (lotes de 40, otros usuarios intactos, también para invitados).
- **CORS y errores:** orígenes ajenos, URL mal codificada.

## Qué NO cubre

Supabase y Clerk reales, el comportamiento de la CSP con los scripts reales de Clerk (por eso la CSP está en modo informe por defecto),
ni la interfaz en un navegador. El rendimiento de PBKDF2 tampoco es representativo: `workerd` local no aplica el límite de CPU de Cloudflare.

## Añadir una prueba

En `suite.mjs`, usa `call(método, ruta, { id, token, body, ip })` y `T('descripción', condición)`. Para consultar la base de datos
directamente: `d1rows("SELECT …")`. Usa una IP distinta (`ip`) por cada bloque que dependa de límites por IP.
Comprueba siempre que la prueba **falla** si rompes a propósito lo que protege (por ejemplo, haz que `canManage` devuelva `true`).

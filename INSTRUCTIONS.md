# Guía de Configuración y Despliegue (Cuentas Gratuitas) – Crea URL

Esta guía detalla paso a paso cómo configurar los servicios gratuitos de **Supabase Storage** (almacenamiento de archivos HTML), **Clerk Auth** (sistema de usuarios) y el despliegue en **Cloudflare Workers** solucionando el error `405 Method Not Allowed`.

---

## 1. Configuración de Supabase Storage (Almacenamiento Gratuito)

Supabase ofrece un plan gratuito que incluye **1 GB de almacenamiento** y **2 GB de ancho de banda mensual**.

### Paso 1.1: Crear Proyecto en Supabase
1. Accede a [https://supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Haz clic en **New Project** y asigna un nombre (ej. `crea-url-storage`).
3. Elige la contraseña de la base de datos y selecciona la región más cercana.

### Paso 1.2: Crear el Bucket de Almacenamiento
1. En el panel lateral izquierdo, ve a **Storage**.
2. Haz clic en **New Bucket**.
3. Nombre del bucket: `html-pages`
4. Marca la casilla **Public Bucket** (para permitir el acceso público a las páginas descargadas).
5. Haz clic en **Save**.

### Paso 1.3: Obtener las Credenciales API
1. En el panel de Supabase, entra en **Project Settings** (icono de engranaje) → **API**.
2. Copia los siguientes valores:
   - **Project URL** → `SUPABASE_URL` (ej. `https://xxxxxx.supabase.co`)
   - **service_role key** (Secret) → `SUPABASE_SERVICE_ROLE_KEY` (ej. `eyJhbGci...`)

---

## 2. Configuración de Clerk Login (Autenticación Gratuita)

Clerk ofrece un plan **Free Forever** de hasta **10.000 usuarios activos mensuales (MAU)** con proveedores como Google, GitHub y Email/Contraseña.

### Paso 2.1: Crear Aplicación en Clerk
1. Accede a [https://clerk.com](https://clerk.com) e inicia sesión o regístrate.
2. Haz clic en **Add application**.
3. Nombre de la app: `Crea URL`
4. Selecciona los métodos de autenticación deseados (Google, GitHub, Email/Password).
5. Haz clic en **Create application**.

### Paso 2.2: Obtener la Clave Publicable
1. En el panel de Clerk, ve a **API Keys**.
2. Copia el valor de **Publishable key**: `VITE_CLERK_PUBLISHABLE_KEY` (ej. `pk_test_...`).

### Paso 2.3: Configurar el Rol de Administrador
Existen dos formas sencillas para otorgar rol `admin` a una cuenta:
- **Opción A (Variable de Entorno)**: Define `VITE_ADMIN_EMAIL=tuemail@ejemplo.com` en tu archivo `.env`. Cualquier usuario que inicie sesión en Clerk con este email obtendrá rol de Administrador automáticamente.
- **Opción B (Metadata en Clerk)**: En el panel de Clerk → **Users** → selecciona tu usuario → **Public metadata** → añade:
  ```json
  {
    "role": "admin"
  }
  ```

---

## 3. Niveles de Usuario y Permisos

| Característica / Límite | Anónimo (Invitado) | Registrado (Pro Free) | Administrador (Admin) |
| :--- | :--- | :--- | :--- |
| **Cuenta Requerida** | No | Sí (vía Clerk) | Sí (Email o Metadata) |
| **Tamaño Máximo / Archivo** | 1 MB | 10 MB | Ilimitado |
| **Tiempo de Retención** | 15 días | 90 días (3 meses) | Ilimitado (Prorrogable) |
| **Límite de Publicaciones** | 30 páginas / hora | 120 páginas / hora | Sin límite |
| **Dashboard y Colecciones** | No | Sí (`/dashboard`, `/collections`) | Sí (Acceso Total) |
| **Consola Admin Global** | No | No | Sí (`/admin`) |

---

## 4. Solución al Error `POST 405 (Method Not Allowed)` y Despliegue en Cloudflare Workers

### ¿Por qué ocurría el error 405?
Al usar Cloudflare Workers Assets (`[assets]`), Cloudflare interceptaba por defecto las peticiones de los archivos estáticos. Al recibir un método `POST` en `/api/pages`, el manejador de estáticos devolvía un error `405 Method Not Allowed` sin darle la oportunidad al código del Worker de procesar la petición.

### Solución Aplicada
En `deploy/wrangler.toml` se incluye:
```toml
[assets]
directory = "../dist"
binding = "ASSETS"
run_worker_first = true
```
Esto garantiza que la lógica del Worker maneje primero las rutas `/api/*` y `/raw/*`, dejando los archivos de la SPA como fallback.

### Paso a Paso para el Despliegue

1. **Instalar dependencias y compilar el frontend**:
   ```bash
   npm install
   npm run build
   ```

2. **Crear la Base de Datos Cloudflare D1 (Metadatos de páginas)**:
   ```bash
   wrangler d1 create crea_url_db
   ```
   *Copia el `database_id` devuelto y asegúrate de actualizarlo en `deploy/wrangler.toml`*.

3. **Ejecutar el esquema SQL en Cloudflare D1**:
   ```bash
   wrangler d1 execute crea_url_db --file=deploy/schema.sql --remote
   ```

4. **Configurar los Secretos de Supabase en Cloudflare Worker**:
   ```bash
   wrangler secret put SUPABASE_URL --config deploy/wrangler.toml
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config deploy/wrangler.toml
   ```

5. **Desplegar en Cloudflare Workers**:
   ```bash
   wrangler deploy --config deploy/wrangler.toml
   ```

---

## 5. Configuración Local (`.env`)

Copia el archivo `.env.example` a `.env` y asigna tus credenciales:

```env
# Servidor Local Express
PORT=3000
NODE_ENV=development

# Supabase Storage (Obligatorio para guardar HTML)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_clave_service_role_aqui
SUPABASE_STORAGE_BUCKET=html-pages

# Clerk Auth (Opcional en local; si no se especifica, funciona en modo simulación)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_ADMIN_EMAIL=tuemail@ejemplo.com
```

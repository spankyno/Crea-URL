// Plantillas iniciales (compartidas con el Worker de Cloudflare)
export const TEMPLATES: any[] = [
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
    ];

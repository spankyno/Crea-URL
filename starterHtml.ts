// Plantilla «Hola Mundo»: página inicial del editor y primera opción del listado de plantillas.
// El enlace «Aprender Más» apunta a la página «Acerca de» del propio sitio.
export const STARTER_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mi Nueva Página en Crea URL</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 40px;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(16,185,129,0.1);
      border: 1px solid rgba(16,185,129,0.25);
      padding: 4px 12px;
      border-radius: 999px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
    }
    p {
      color: var(--muted);
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      padding: 12px 24px;
      border-radius: 8px;
      background: var(--accent);
      color: #052e16;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .btn:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Alojamiento HTML Gratuito</span>
    <h1>¡Hola Mundo! Tu Página Web</h1>
    <p>Esta es tu página estática lista para ser publicada con URL limpia, código QR y sandbox seguro.</p>
    <a href="${typeof window !== 'undefined' ? window.location.origin : ''}/acerca-de" class="btn" target="_blank" rel="noopener">Aprender Más</a>
  </div>
</body>
</html>`;

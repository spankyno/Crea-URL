/**
 * Analítica propia de Crea URL: copia FIJA y revisada del script de seguimiento de Aitor's Analytics
 * (Aitor's Hub Dashboard).
 *
 *   Original : https://aitors-hub-dashboard.asanchezgu.workers.dev/tracker.js
 *   SHA-256 del original revisado: 12a8157259ff09eb12462fe7ae464f1831192753833b9b2ca857b596bc5060f6
 *   Revisado el 14 de octubre de 2026.
 *
 * QUÉ HACE (y solo esto): una petición POST a /api/v1/visit del dashboard con { app, url: location.pathname }.
 * No lee ni escribe cookies ni almacenamiento, no carga nada más y no tiene acceso a la sesión de nadie.
 *
 * POR QUÉ ESTÁ AQUÍ: se sirve desde este mismo origen para que su contenido NO pueda cambiar sin un despliegue
 * de este repositorio. Cargar el original desde el dashboard dejaría ejecutar en la aplicación código remoto
 * que podría cambiar en cualquier momento.
 *
 * MANTENIMIENTO: si cambias el original, revisa el cambio y trae aquí lo que corresponda a mano. Si se modifica
 * este archivo, hay que volver a revisarlo.
 */
(function () {
  // ÚNICA diferencia con el original: la API está fijada aquí (el original la deriva del origen desde el que se carga,
  // que ahora es esta aplicación y no el dashboard).
  var API_BASE = 'https://aitors-hub-dashboard.asanchezgu.workers.dev';

  var script = document.currentScript;
  if (!script) return; // navegador muy antiguo sin soporte; fallamos en silencio

  var apiKey = script.getAttribute('data-key');
  var appSlug = script.getAttribute('data-app');

  if (!apiKey || !appSlug) {
    console.warn('[aitor-analytics] Faltan los atributos data-app o data-key en el <script> de tracking.');
    return;
  }

  var apiUrl;
  try {
    apiUrl = new URL('/api/v1/visit', API_BASE).toString();
  } catch {
    return;
  }

  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      app: appSlug,
      url: window.location.pathname
    })
  }).catch(function () {
    // Fallo silencioso a propósito: el tracking nunca debe romper la web cliente.
  });
})();

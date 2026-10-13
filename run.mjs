#!/usr/bin/env node
/**
 * Pruebas de extremo a extremo del Worker, en el motor real de Cloudflare (workerd) y con una base de datos D1 real
 * (SQLite) local. Supabase y Clerk se simulan con un servidor local, así que no hace falta ninguna cuenta ni secreto
 * y no se toca nada de producción.
 *
 *   npm run test:e2e
 *
 * Variables opcionales: E2E_PORT (8787), E2E_MOCK_PORT (8801), E2E_SKIP_BUILD=1 (reutiliza dist/).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E2E = path.join(ROOT, 'tests', 'e2e');
const STATE = path.join(ROOT, '.wrangler', 'e2e-state');
const PORT = process.env.E2E_PORT || '8787';
const MOCK_PORT = process.env.E2E_MOCK_PORT || '8801';
const CONFIG = path.join('tests', 'e2e', 'wrangler.e2e.toml');
const isWin = process.platform === 'win32';
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`Se necesita Node.js 22 o superior (tienes ${process.versions.node}).`);
  process.exit(2);
}

function sh(cmd, opts = {}) {
  return spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit', env, ...opts });
}

// 1) Compilar el frontend (el Worker sirve dist/)
if (!process.env.E2E_SKIP_BUILD) {
  console.log('▶ Compilando la aplicación (npm run build)…');
  if (sh('npm run build', { stdio: 'ignore' }).status !== 0) {
    console.error('Falló la compilación.');
    process.exit(2);
  }
}

// 2) Estado limpio y variables de prueba (solo en tests/e2e/.dev.vars, que es nuestro)
fs.rmSync(STATE, { recursive: true, force: true });
fs.writeFileSync(
  path.join(E2E, '.dev.vars'),
  [
    `SUPABASE_URL=http://127.0.0.1:${MOCK_PORT}`,
    'SUPABASE_SERVICE_ROLE_KEY=clave-de-prueba',
    `CLERK_ISSUER=http://127.0.0.1:${MOCK_PORT}`,
    'ADMIN_USER_IDS=user_ADM',
    'CSP_MODE=report-only',
    '',
  ].join('\n')
);

// 3) Esquema en la D1 local
console.log('▶ Creando la base de datos local de pruebas…');
const schema = sh(`npx wrangler d1 execute crea_url_db --local --config ${CONFIG} --persist-to "${STATE}" --file=deploy/schema.sql`, { stdio: 'ignore' });
if (schema.status !== 0) {
  console.error('No se pudo aplicar deploy/schema.sql.');
  process.exit(2);
}

// 4) Arrancar wrangler dev (en su propio grupo de procesos para poder cerrarlo entero)
console.log(`▶ Arrancando el Worker en workerd (puerto ${PORT})…`);
const logFile = path.join(E2E, 'wrangler.log');
const log = fs.openSync(logFile, 'w');
const dev = spawn(
  `npx wrangler dev --config ${CONFIG} --port ${PORT} --ip 127.0.0.1 --persist-to "${STATE}" --test-scheduled`,
  { cwd: ROOT, shell: true, env, stdio: ['ignore', log, log], detached: !isWin }
);

function stopDev() {
  try {
    if (isWin) spawnSync(`taskkill /pid ${dev.pid} /t /f`, { shell: true, stdio: 'ignore' });
    else process.kill(-dev.pid, 'SIGKILL');
  } catch (_) {}
}
process.on('SIGINT', () => { stopDev(); process.exit(130); });
process.on('exit', stopDev);

async function waitReady() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/me`);
      if (r.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

if (!(await waitReady())) {
  console.error(`wrangler dev no arrancó. Revisa ${path.relative(ROOT, logFile)}.`);
  stopDev();
  process.exit(2);
}

// 5) Ejecutar la suite
console.log('▶ Ejecutando las pruebas…\n');
const result = spawnSync(process.execPath, [path.join(E2E, 'suite.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...env, E2E_BASE: `http://127.0.0.1:${PORT}`, E2E_MOCK_PORT: MOCK_PORT, E2E_STATE: STATE },
});
stopDev();
process.exit(result.status ?? 1);

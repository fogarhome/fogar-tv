'use strict';
// @ts-check
// Emparejar con el Fogar Gateway: la persona solo escribe el código; la tele dice qué es (tipo `screen`, lo que sabe
// reproducir) y propone su nombre. El canje es POST /pair y la clave llega una sola vez: no sale de aquí hacia el mando
// ni hacia el log. En el mismo equipo, el código lo puede sacar la propia tele con `fogar-gw pair` (que entra con el
// token de administración del gateway; ese token nunca pasa por Fogar TV), siempre a petición de un admin.
const { execFile } = require('node:child_process');

const CLIENT_TYPE = 'screen';
const OUTPUT_MODE = ['audio', 'text', 'status'];

/** «482 913» → «482913»; null si no son 6 cifras. @param {any} v */
const cleanCode = v => { const s = String(v ?? '').replace(/[\s-]/g, ''); return /^\d{6}$/.test(s) ? s : null; };

/**
 * @param {{ http: string, code: string, name: string, fetchImpl?: typeof fetch, timeoutMs?: number }} o
 * @returns {Promise<{ key: string, name: string, version: string } | { error: string }>}
 */
async function redeem({ http, code, name, fetchImpl = fetch, timeoutMs = 8000 }) {
  const c = cleanCode(code);
  if (!c) return { error: 'El código son 6 cifras' };
  let r;
  try {
    r = await fetchImpl(`${http}/pair`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ code: c, name: String(name || '').slice(0, 80) || null, client_type: CLIENT_TYPE, output_mode: OUTPUT_MODE }),
    });
  } catch { return { error: 'El gateway no responde' }; }
  if (r.status === 400) return { error: 'Código no válido o caducado' };
  if (r.status === 429) return { error: 'Demasiados intentos; espera un minuto' };
  if (r.status !== 201) return { error: 'El gateway no ha aceptado el emparejamiento' };
  let j;
  try { j = /** @type {any} */ (await r.json()); } catch { j = null; }
  if (!j || typeof j.client_key !== 'string' || !j.client_key) return { error: 'El gateway no ha devuelto la clave' };
  return { key: j.client_key, name: String(j.gateway?.name || '').slice(0, 80), version: String(j.gateway?.version || '').slice(0, 40) };
}

/**
 * El código, sacado en este equipo con `fogar-gw --json pair … --no-wait`. Sin admin que ponga la plantilla, la tele pide
 * su agente como el único permitido: el mismo que pide al abrir sesión (si no, el Gateway la rechazaría).
 * @param {{ name: string, agent: string, exec?: typeof execFile }} o @returns {Promise<{ code: string } | { error: string }>}
 */
function localCode({ name, agent, exec = execFile }) {
  const args = ['--json', 'pair', '--type', CLIENT_TYPE, '--name', String(name || 'tele').slice(0, 80),
    '--agent', agent, '--allowed-agent', agent, '--no-wait'];
  return new Promise(resolve => exec('fogar-gw', args, { timeout: 15000, maxBuffer: 1 << 20 }, (err, out) => {
    if (err) return resolve({ error: /** @type {any} */ (err).code === 'ENOENT' ? 'fogar-gw no está instalado en este equipo' : 'fogar-gw no ha podido sacar el código' });
    let j; try { j = JSON.parse(String(out)); } catch { j = null; }
    const code = cleanCode(j && j.code);
    resolve(code ? { code } : { error: 'fogar-gw no ha devuelto un código' });
  }));
}

module.exports = { CLIENT_TYPE, OUTPUT_MODE, cleanCode, redeem, localCode };

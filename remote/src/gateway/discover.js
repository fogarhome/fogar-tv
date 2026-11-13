'use strict';
// @ts-check
// Encontrar el Fogar Gateway: solo cuenta quien responde a /.well-known/fogar-gateway con service "fogar-gateway".
// Orden: la dirección escrita a mano (si la hay, es la única: si no responde, no se busca otra); si no, este equipo
// (127.0.0.1 y el puerto, sin barrer otros); si no, los equipos en línea de la tailnet, en paralelo y con un plazo corto.
const { execFile } = require('node:child_process');

const PORT = 8004;

/**
 * Lo que escribe una persona → las dos direcciones del gateway. Vale «green-house», «green-house:8004»,
 * «http://green-house:8004» o «ws://green-house:8004/ws/stream». null si no es una dirección.
 * @param {string} input @param {number} [port]
 * @returns {{ http: string, ws: string, host: string } | null}
 */
function endpoints(input, port = PORT) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = 'http://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) || !u.hostname) return null;
  const tls = u.protocol === 'https:' || u.protocol === 'wss:';
  const host = u.hostname.includes(':') ? `[${u.hostname}]` : u.hostname;
  const hp = `${host}:${u.port || port}`;
  return { http: `${tls ? 'https' : 'http'}://${hp}`, ws: `${tls ? 'wss' : 'ws'}://${hp}/ws/stream`, host: u.hostname };
}

/**
 * ¿Hay un Fogar ahí? @param {string} input @param {{ port?: number, timeoutMs?: number, fetchImpl?: typeof fetch }} [o]
 * @returns {Promise<{ http: string, ws: string, host: string, name: string, version: string } | null>}
 */
async function probe(input, { port = PORT, timeoutMs = 1500, fetchImpl = fetch } = {}) {
  const e = endpoints(input, port);
  if (!e) return null;
  try {
    const r = await fetchImpl(`${e.http}/.well-known/fogar-gateway`, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    if (!r.ok) return null;
    const body = /** @type {any} */ (await r.json());
    if (!body || body.service !== 'fogar-gateway') return null;
    return { ...e, name: String(body.name || e.host).slice(0, 80), version: String(body.version || '').slice(0, 40) };
  } catch { return null; }
}

/** Equipos en línea de `tailscale status --json` (sin este mismo), por su nombre de MagicDNS. @param {any} st @returns {string[]} */
function tailnetHosts(st) {
  const peers = st && st.Peer && typeof st.Peer === 'object' ? Object.values(st.Peer) : [];
  return peers.filter(p => p && p.Online).map(p => String(p.DNSName || p.HostName || '').replace(/\.$/, '')).filter(Boolean);
}

/** `tailscale status --json`, o null si no hay Tailscale. @returns {Promise<any>} */
function tailscaleStatus() {
  return new Promise(resolve => execFile('tailscale', ['status', '--json'], { timeout: 3000, maxBuffer: 4 << 20 }, (err, out) => {
    if (err) return resolve(null);
    try { resolve(JSON.parse(out)); } catch { resolve(null); }
  }));
}

/**
 * @param {{ manual?: string, port?: number, tailscale?: () => Promise<any>, probeImpl?: typeof probe }} [o]
 * @returns {Promise<{ found: Array<Awaited<ReturnType<typeof probe>> & { where: 'manual'|'local'|'tailnet' }>, manual: boolean }>}
 */
async function find({ manual = '', port = PORT, tailscale = tailscaleStatus, probeImpl = probe } = {}) {
  const tag = (/** @type {any} */ g, /** @type {'manual'|'local'|'tailnet'} */ where) => (g ? [{ ...g, where }] : []);
  if (manual) return { found: tag(await probeImpl(manual, { port }), 'manual'), manual: true };
  const local = await probeImpl('127.0.0.1', { port });
  if (local) return { found: tag(local, 'local'), manual: false };
  const hosts = tailnetHosts(await tailscale());
  const all = await Promise.all(hosts.map(h => probeImpl(h, { port })));
  return { found: all.flatMap(g => tag(g, 'tailnet')), manual: false };
}

module.exports = { PORT, endpoints, probe, tailnetHosts, find };

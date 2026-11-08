'use strict';
// @ts-check
// La conexión guardada con el J Gateway (gateway.json en TV_STATE_DIR, 0600): a qué gateway y con qué clave.
// `manual`: la dirección la escribió alguien; entonces es la única que se usa (no se busca otra).
const { createJsonStore } = require('../core/json-store');

/** @typedef {{ url: string, key: string, name: string, manual: boolean }} GatewayConf */

const str = (/** @type {any} */ v, max = 512) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isWs = (/** @type {string} */ u) => /^wss?:\/\/[^\s/]+/.test(u);

/** @param {any} raw @returns {GatewayConf} */
function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const url = str(r.url);
  return { url: isWs(url) ? url : '', key: str(r.key), name: str(r.name, 80), manual: r.manual === true };
}

/** @param {string} file */
function createGatewayStore(file) {
  const s = createJsonStore(file, { fallback: {}, sanitize });
  return {
    file,
    /** @returns {GatewayConf} */
    load: () => s.load(),
    /** @param {Partial<GatewayConf>} patch */
    save(patch) { const v = sanitize({ ...s.load(), ...patch }); s.save(v); return v; },
  };
}

module.exports = { createGatewayStore, sanitize };

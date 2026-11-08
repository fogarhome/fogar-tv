'use strict';
// @ts-check
// Conectar la tele con el J Gateway desde el mando (solo admin): {t:'gateway', op}
//   status  estado de la conexión (sin clave)          check   lo comprueba ahora
//   find    busca gateways (a mano → este equipo → tailnet)
//   pair    {host, code, typed}: empareja con el código que enseña `jota-gw pair` en el gateway
//   local   empareja con el gateway de este equipo sacando el código con `jota-gw` (el mando avisa antes)
//   forget  olvida la clave
// Nada de esto pasa solo: lo pide un admin desde el mando. La clave no sale nunca hacia el mando.
const discoverDefault = require('../gateway/discover');
const pairDefault = require('../gateway/pair');

/**
 * @param {{ link: ReturnType<typeof import('../gateway/link').createGatewayLink>, name: string, log: { info: Function },
 *   discover?: typeof discoverDefault, pair?: typeof pairDefault }} o
 */
function createGatewayFeature({ link, name, log, discover = discoverDefault, pair = pairDefault }) {
  /** @param {NonNullable<Awaited<ReturnType<typeof discoverDefault.probe>>>} g @param {string} code @param {boolean} manual */
  async function connect(g, code, manual) {
    const r = await pair.redeem({ http: g.http, code, name });
    if ('error' in r) return r;
    log.info(`gateway: emparejada con ${r.name || g.name}`);
    await link.use({ url: g.ws, key: r.key, name: r.name || g.name, manual });
    return link.info();
  }

  /** @param {any} m */
  async function run(m) {
    switch (m && m.op) {
      case 'status': return link.info();
      case 'check': await link.check(); return link.info();
      case 'find': {
        const r = await discover.find({ manual: link.manual() });
        return { manual: r.manual, found: r.found.map(g => ({ host: g.host, name: g.name, version: g.version, pairing: g.pairing, where: g.where })) };
      }
      case 'pair': {
        const typed = m.typed === true, host = String(m.host || '').trim().slice(0, 255) || link.manual();
        if (!host) return { error: 'Falta la dirección del gateway' };
        if (!pair.cleanCode(m.code)) return { error: 'El código son 6 cifras' };
        const g = await discover.probe(host);
        if (!g) return { error: `No encuentro Jota en ${discover.endpoints(host)?.host || host}` };
        return connect(g, m.code, typed || !!link.manual());
      }
      case 'local': {
        const g = await discover.probe('127.0.0.1');
        if (!g) return { error: 'No hay un gateway en este equipo' };
        const c = await pair.localCode({ name });
        if ('error' in c) return c;
        return connect(g, c.code, false);
      }
      case 'forget': link.forget(); return link.info();
      default: return { error: 'operación desconocida' };
    }
  }

  return {
    /** @type {import('../transport/commands').Command[]} */
    commands: [{ t: 'gateway', perm: 'admin', quiet: true, run }],
  };
}

module.exports = { createGatewayFeature };

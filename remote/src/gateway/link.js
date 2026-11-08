'use strict';
// @ts-check
// La conexión con el J Gateway, en un solo sitio: a qué gateway, con qué clave y si funciona. Para talk.js es lo mismo que
// el cliente (ensure, send, audio, end, cancel, on, isReady, close); por debajo cambia de cliente al cambiar la clave
// (use/forget) sin reiniciar el servidor, y los que escuchan siguen enganchados.
// Estados: checking (aún sin comprobar), unpaired (sin clave), ok, unreachable (no responde; la clave se conserva) y
// revoked (el Gateway rechazó la clave: se borra la guardada). Comprobar no cambia nada; emparejar u olvidar, solo a petición.
const { createGatewayClient } = require('./client');

/** @typedef {'checking'|'unpaired'|'ok'|'unreachable'|'revoked'} LinkStatus */

/**
 * @param {{ store: ReturnType<typeof import('./store').createGatewayStore>, envUrl?: string, envKey?: string, agent: string,
 *   log: { info: Function, warn: Function }, makeClient?: typeof createGatewayClient, onChange?: (s: { status: LinkStatus, name: string }) => void }} o
 *   envUrl: TV_GATEWAY_URL (dirección escrita a mano en screen.env: manda sobre la guardada).
 *   envKey: TV_GATEWAY_KEY. shortcut: solo hasta que la tele se empareje con el gateway nuevo; después se quita.
 */
function createGatewayLink({ store, envUrl = '', envKey = '', agent, log, makeClient = createGatewayClient, onChange = () => {} }) {
  /** @type {ReturnType<typeof createGatewayClient> | null} */ let client = null;
  /** @type {LinkStatus} */ let status = 'checking';
  let key = '', name = '', fromStore = false, rejected = false;
  const subs = new Set();

  /** @param {LinkStatus} s */
  function set(s) {
    if (s === status) return;
    status = s;
    log.info(`gateway: estado ${s}`);
    try { onChange({ status, name }); } catch (e) { log.warn('gateway: onChange con error', e); }
  }

  /** Lo guardado (o screen.env) → cliente nuevo; el viejo se cierra. */
  function rebuild() {
    if (client) client.close();
    client = null; rejected = false;
    const c = store.load();
    const url = envUrl || c.url;
    fromStore = !!c.key;
    key = c.key || envKey;
    name = c.name;
    if (!url || !key) return set('unpaired');
    const cl = makeClient({ url, key, agent, log });
    cl.on(ev => {
      if (cl !== client) return;
      if (ev.type === 'rejected') onRejected();
      else if (ev.type === 'down') { set('unreachable'); check(); }
      for (const fn of [...subs]) { try { fn(ev); } catch (e) { log.warn('gateway: oyente con error', e); } }
    });
    client = cl;
    set('checking');
  }

  function onRejected() {
    rejected = true;
    log.warn('gateway: el Gateway rechazó la clave');
    if (fromStore) store.save({ key: '' });                // ya no vale: se borra (la de screen.env no se puede)
    set('revoked');
  }

  async function ensure() {
    const cl = client;
    if (!cl || rejected) return false;
    let ok = false;
    try { ok = await cl.ensure(); } catch (e) { log.warn('gateway: ensure con error', e); }
    if (cl !== client) return ok;
    if (ok) set('ok');
    else if (!rejected) set('unreachable');
    if (rejected) { client = null; cl.close(); }           // sin clave que valga no se vuelve a intentar
    return ok;
  }

  /** Comprueba que la conexión funciona (abre la sesión si hace falta). */
  async function check() { if (!client) return status; await ensure(); return status; }

  rebuild();

  return {
    ensure,
    check,
    /** @param {Buffer} buf */ audio(buf) { if (client) client.audio(buf); },
    end() { if (client) client.end(); },
    cancel() { if (client) client.cancel(); },
    /** @param {string} text */ send(text) { if (client) client.send(text); },
    /** @param {(ev: any) => void} fn */ on(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    isReady: () => !!client && client.isReady(),
    close() { if (client) client.close(); },
    /** Emparejada: guarda la conexión nueva y cambia de cliente. @param {{ url: string, key: string, name?: string, manual?: boolean }} c */
    use(c) { store.save({ url: c.url, key: c.key, name: c.name || '', manual: !!c.manual }); rebuild(); return check(); },
    /** Olvida la clave (la dirección escrita a mano se conserva). */
    forget() { store.save({ key: '', name: '' }); rebuild(); },
    /** Lo que puede ver el mando: nunca la clave ni la dirección. */
    status: () => ({ status, name }),
    /** La clave vigente, para que el log la tache. */
    key: () => key,
  };
}

module.exports = { createGatewayLink };

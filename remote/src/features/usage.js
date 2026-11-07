'use strict';
// @ts-check
// Registro de uso local: qué estuvo en pantalla (Netflix, web, Spotify). Solo { src, title, url, at }, 90 días,
// y no sale de la máquina. Lo lee A3 («Recientes») con recents(); quitar un reciente no borra nada: marca `gone`.

/** Se puede volver a abrir: Netflix por su /watch/<id>, Spotify por el uri de su lista o álbum, la web por su url. */
const OPENABLE = {
  netflix: (/** @type {string} */ u) => /^https:\/\/www\.netflix\.com\/watch\/\d{4,12}$/.test(u),
  spotify: (/** @type {string} */ u) => /^spotify:(album|playlist|artist|show|user:[\w.-]+:collection)(:[A-Za-z0-9]{22})?$/.test(u),
  web: (/** @type {string} */ u) => /^https?:\/\//.test(u),
};
/** Una pieza: Netflix por serie (todos sus capítulos son la misma), lo demás por url. */
const keyOf = (/** @type {{ src: string, title: string, url: string }} */ e) =>
  e.src + ':' + (e.src === 'netflix' && e.title ? e.title.toLowerCase() : e.url);

/**
 * @param {{ store: { load: () => any, save: (v: any) => void }, now?: () => number, enabled: () => boolean, keepDays?: number }} deps
 */
function createUsage({ store, now = Date.now, enabled, keepDays = 90 }) {
  /** @type {{ src: string, title: string, url: string, at: number }[] | null} */
  let items = null; // newest first; se lee una vez
  const load = () => items || (items = (() => { const r = store.load(); return Array.isArray(r) ? r.filter(x => x && typeof x.at === 'number') : []; })());

  return {
    /** @param {{ src: 'netflix' | 'web' | 'spotify', title: string, url?: string }} e */
    add(e) {
      if (!enabled()) return;
      const list = load(), at = now();
      const title = String(e.title || '').slice(0, 200), url = String(e.url || '').slice(0, 200);
      const top = list[0];
      // misma seguida: solo la hora (en la web basta la url: el título puede llegar tarde y se corrige)
      if (top && top.src === e.src && top.url === url && (e.src === 'web' || top.title === title)) { top.at = at; top.title = title; delete /** @type {any} */ (top).gone; } // usada otra vez: vuelve a Recientes
      else list.unshift({ src: e.src, title, url, at });
      items = list.filter(x => at - x.at <= keepDays * 864e5);
      store.save(items);
    },
    list: () => load().slice(),
    /**
     * Recientes: una entrada por pieza, la más nueva primero, solo lo que se puede abrir, de los últimos `days` días.
     * @param {{ max?: number, days?: number }} [o]
     * @returns {{ key: string, src: string, title: string, url: string, at: number }[]}
     */
    recents({ max = 6, days = 7 } = {}) {
      const t = now(), seen = new Set(), out = [];
      for (const e of load()) {
        if (t - e.at > days * 864e5) break;               // newest first: lo demás es más viejo
        const key = keyOf(e);
        if (seen.has(key)) continue;
        seen.add(key);                                    // una pieza quitada no sale aunque tenga entradas más viejas
        if (/** @type {any} */ (e).gone || !OPENABLE[e.src] || !OPENABLE[e.src](e.url)) continue;
        if (e.src === 'netflix' && !e.title) continue;   // sin título no se sabe qué serie es (saldría «netflix.com» suelto): ante la duda, nada
        out.push({ key, src: e.src, title: e.title, url: e.url, at: e.at });
        if (out.length >= max) break;
      }
      return out;
    },
    /** Quita una pieza de Recientes (marca sus entradas; si se vuelve a usar, sale otra vez). @param {string} key */
    forget(key) {
      let n = 0;
      for (const e of load()) if (keyOf(e) === key && !(/** @type {any} */ (e).gone)) { /** @type {any} */ (e).gone = true; n++; }
      if (n) store.save(load());
      return n;
    },
  };
}

module.exports = createUsage;

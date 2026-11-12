// Conexión de la tele con Fogar (el gateway), solo para admin: el aviso de arriba cuando no está conectada (no bloquea, se
// cierra con ✕ y no vuelve hasta que cambie el estado), la hoja «Conectar con Fogar» (buscar → elegir → código o «Hazlo tú»
// en el mismo equipo → resultado) y la fila de Ajustes › Fogar en la tele. El estado llega solo con el de la tele (`gw`);
// la clave nunca llega al mando.
import { $, el } from '../core/dom.js';
import { state, on } from '../core/store.js';
import { rpc } from '../core/api.js';
import { buzz } from '../ui/haptics.js';
import { openSheet, closeSheet, isOpen } from '../ui/sheets.js';

const NOTE = { unpaired: 'Fogar no está conectado', unreachable: 'Fogar no responde', refused: 'El gateway no deja usar el agente de la tele', revoked: 'Hay que volver a emparejar Fogar' };
const ST = { checking: 'Comprobando…', unpaired: 'Sin emparejar', ok: 'Conectada', unreachable: 'No responde', refused: 'El gateway no permite su agente', revoked: 'La clave ya no vale' };
const WHERE = { local: 'este equipo', tailnet: 'tailnet', manual: 'dirección escrita a mano' };
/** @type {{ status: string, name: string } | null} */ let gw = null;
let dismissed = '';                                      // estado para el que se cerró el aviso
/** @type {{ host: string, typed: boolean } | null} */ let target = null;
const isAdmin = () => !!state.me && state.me.role === 'admin';

/** Resumen para la portada de Ajustes. */
export const gwSum = () => (!gw ? '' : gw.status === 'ok' && gw.name ? 'Conectada a ' + gw.name : ST[gw.status] || '');

function paintNote() {
  const show = isAdmin() && !!gw && !!NOTE[gw.status] && dismissed !== gw.status && !isOpen('gwS');
  $('#gwN').hidden = !show;
  if (show) $('#gwNT').textContent = NOTE[gw.status];
}
/** @param {{ status: string, name: string, host?: string, manual?: boolean }} i */
function paintRow(i) {
  const st = i.status === 'ok' && i.name ? `Conectada a ${i.name}` : i.status === 'unreachable' && i.manual && i.host ? `${i.host} no responde` : ST[i.status] || '—';
  $('#gwSt').textContent = st;
  $('#gwOpen').textContent = i.status === 'ok' ? 'Cambiar' : 'Conectar';
  $('#gwForgetRow').hidden = i.status === 'unpaired';
}
/** Ajustes › Fogar en la tele: lo comprueba ahora (no se queda con un «no responde» viejo) y pinta la fila (también el equipo). */
export async function gwLoad() { const r = await rpc({ t: 'gateway', op: 'check' }); if (r && !r.error) paintRow(r); }

/** @param {string} s @param {string} [msg] @param {boolean} [err] */
function pane(s, msg = '', err = false) {
  for (const p of $('#gwS').querySelectorAll('.gwP')) /** @type {HTMLElement} */ (p).hidden = /** @type {HTMLElement} */ (p).dataset.s !== s;
  const m = $('#gwM'); m.textContent = msg; m.classList.toggle('err', err);
  if (s === 'code') { const c = /** @type {HTMLInputElement} */ ($('#gwCode')); c.value = ''; c.focus(); }
}
/** @param {{ host: string, name: string, where: string }} g */
function choose(g) {
  target = { host: g.host, typed: false };
  if (g.where === 'local') pane('local', `Fogar en ${g.name} (este equipo)`);
  else pane('code', `Fogar en ${g.name}`);
}
async function find() {
  pane('busy', 'Buscando Fogar…');
  const [r, i] = await Promise.all([rpc({ t: 'gateway', op: 'find' }), rpc({ t: 'gateway', op: 'status' })]);
  if (!r || r.error) return pane('list', (r && r.error) || 'No he podido buscar', true);
  const found = /** @type {any[]} */ (r.found);
  if (found.length === 1 && !r.manual) return choose(found[0]);
  if (r.manual && found.length) return choose(found[0]);
  const L = $('#gwL'); L.textContent = '';
  for (const g of found) {
    const b = el('button', 'nv'); b.type = 'button';
    const t = el('span', 'nvT', `Fogar en ${g.name}`); t.append(el('small', '', WHERE[g.where] || g.where));
    b.append(t); b.addEventListener('click', () => { buzz(7); choose(g); });
    L.append(b);
  }
  pane('list', found.length ? 'Elige a cuál conectar la tele' : r.manual
    ? `El gateway de ${(i && i.host) || 'la dirección escrita a mano'} no responde. Escribe otra dirección o vuelve a intentarlo más tarde.`
    : 'No encuentro Fogar en este equipo ni en la tailnet. Escribe su dirección.', found.length === 0 && r.manual);
}
/** @param {any} r @param {string} back el paso al que se vuelve si falla */
function result(r, back) {
  if (!r || r.error) { buzz(30); return pane(back, (r && r.error) || 'No he podido emparejar', true); }
  buzz(12); paintRow(r);
  pane('done', r.status === 'ok' ? `Conectada a Fogar en ${r.name}` : `Emparejada, pero ${(ST[r.status] || '').toLowerCase()}`, r.status !== 'ok');
}
async function pairCode() {
  const code = /** @type {HTMLInputElement} */ ($('#gwCode')).value.replace(/\D/g, '');
  if (code.length !== 6 || !target) return;
  pane('busy', 'Emparejando…');
  result(await rpc({ t: 'gateway', op: 'pair', host: target.host, code, typed: target.typed }), 'code');
}
export function openGw() { dismissed = ''; openSheet('gwS'); }

export const gateway = {
  name: 'gateway',
  sheets: { gwS: { open: () => { paintNote(); find(); }, close: () => { target = null; paintNote(); }, keepEscInside: false } },
  init() {
    on('state', s => {
      const prev = gw && gw.status;
      gw = s && s.gw ? s.gw : null;
      if (gw && gw.status === 'ok') dismissed = '';
      if ((gw && gw.status) !== prev) paintNote();
    });
    on('me', paintNote);
    $('#gwNGo').addEventListener('click', () => { buzz(7); openGw(); });
    $('#gwNX').addEventListener('click', () => { buzz(7); dismissed = gw ? gw.status : ''; paintNote(); });
    $('#gwOpen').addEventListener('click', () => { buzz(7); openGw(); });
    $('#gwForget').addEventListener('click', async e => {
      const b = /** @type {HTMLElement} */ (e.currentTarget);
      buzz(7);
      if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = '¿Seguro?'; setTimeout(() => { b.classList.remove('sure'); b.textContent = 'Olvidar'; }, 3000); return; }
      b.classList.remove('sure'); b.textContent = 'Olvidar';
      const r = await rpc({ t: 'gateway', op: 'forget' }); if (r && !r.error) paintRow(r);
    });
    const host = /** @type {HTMLInputElement} */ ($('#gwHost'));
    const useHost = () => { const h = host.value.trim(); if (!h) return; buzz(7); target = { host: h, typed: true }; pane('code', `Fogar en ${h}`); };
    $('#gwHostGo').addEventListener('click', useHost);
    host.addEventListener('keydown', e => { if (e.key === 'Enter') useHost(); });
    $('#gwLocal').addEventListener('click', async () => { buzz(7); pane('busy', 'Sacando el código con fogar-gw…'); result(await rpc({ t: 'gateway', op: 'local' }), 'local'); });
    $('#gwByCode').addEventListener('click', () => { buzz(7); pane('code', 'En este equipo'); });
    const code = /** @type {HTMLInputElement} */ ($('#gwCode'));
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); if (code.value.length === 6) pairCode(); });
    $('#gwPair').addEventListener('click', () => { buzz(7); pairCode(); });
    $('#gwDone').addEventListener('click', () => { buzz(7); closeSheet(); });
  },
};

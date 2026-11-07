// Recientes en el móvil (TVC Plan - Reposo contextual A3): la lista de lo último que hubo en la tele, sin enseñarla en la
// tele. Tocar una fila la pone; la × la quita de Recientes (no borra el registro). La misma lista sale en la tele con «arriba».
import { $, el } from '../core/dom.js';
import { rpc } from '../core/api.js';
import { buzz } from '../ui/haptics.js';
import { pill } from '../ui/pill.js';
import { openSheet, closeSheet } from '../ui/sheets.js';

const SRC = { netflix: ['Netflix', 'l-netflix'], spotify: ['Spotify', 'l-spotify'], web: ['Web', 'i-globe'] };
/** «hace 40 min» / «hace 2 h» / «hace 3 días»; at es la hora del servidor (la del móvil vale: es un orden de minutos) */
export function agoLabel(at, now) {
  const m = Math.floor((now - at) / 60e3);
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} días`;
}
function msg(t) { const box = $('#rcList'); box.textContent = ''; box.appendChild(el('div', 'spEmpty', t)); }
function paint(items) {
  if (!items.length) return msg('Nada reciente. Lo que veas o escuches en la tele saldrá aquí.');
  const box = $('#rcList'); box.textContent = '';
  for (const it of items) {
    const s = SRC[it.src] || SRC.web, row = el('div', 'spIt rcIt');
    const ic = el('div', 'im'); ic.innerHTML = `<svg aria-hidden="true"><use href="#${s[1]}"/></svg>`;
    const tx = el('button', 'tx'); tx.type = 'button';
    tx.append(el('div', 'a', it.title), el('div', 'b', [s[0], it.sub, agoLabel(it.at, Date.now())].filter(Boolean).join(' · ')));
    tx.setAttribute('aria-label', 'Poner ' + it.title + ' en la tele');
    tx.addEventListener('click', () => {
      buzz(10); closeSheet();
      rpc({ t: 'idle', op: 'recent', key: it.key }).then(r => pill(r && r.error ? r.error : 'Poniendo ' + it.title));
    });
    const x = el('button', 'spMini rcX'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar ' + it.title + ' de Recientes');
    x.innerHTML = '<svg aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    x.addEventListener('click', () => {
      buzz(8); row.classList.add('rcGone');
      rpc({ t: 'idle', op: 'forget', key: it.key }).then(r => { if (r && r.error) { pill(r.error); row.classList.remove('rcGone'); } else paint(r.items || []); });
    });
    row.append(ic, tx, x); box.appendChild(row);
  }
}
async function load() {
  msg('Cargando…');
  const r = await rpc({ t: 'idle', op: 'recents' });
  if (r && r.error) msg(r.error); else paint((r && r.items) || []);
}

export const recents = {
  name: 'recents',
  sheets: { rcS: { open: load } },
  clicks: { rc: () => openSheet('rcS') },
};

'use strict';
// Tope de luz por luminancia (TVC Decisión - Reloj, acento y tokens de la tele): detrás de cualquier texto, el fondo vivo
// y la luz prestada no pasan de una luminancia relativa de 0,05 sobre la base noche. Se prueba el peor punto: los centros
// de todas las luces superpuestos, mezclados en sRGB como el navegador, recorriendo tonos y saturaciones de carátula.
// - Reposo (remote/public/idle-app.js): los valores y su tone() entre // @luz:inicio y // @luz:fin.
// - Mando (remote/public/mando/features/ambient.js): tone() con LIMITS en oscuro, con las opacidades de mando.css.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PUB = path.join(__dirname, '..', '..', 'remote', 'public');
const TOPE = 0.05;
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgb = s => (s[0] === '#' ? hex(s) : s.match(/[\d.]+/g).slice(0, 3).map(Number));
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// carátulas: todos los tonos, de gris a saturado y de oscuro a casi blanco (amarilla, crema y cian incluidas)
const COVERS = [];
for (let h = 0; h < 360; h += 10) for (const s of [0, 0.3, 0.6, 1]) for (const l of [0.2, 0.5, 0.8, 0.95]) COVERS.push([h, s, l]);
/** el peor compuesto: base, capas fijas [color, alfa] y dos luces (cada una con su color y su alfa) */
function worst(base, fixed, lights) {
  let w = 0;
  for (const A of lights.a) for (const B of lights.b) {
    let c = rgb(base);
    for (const [col, a] of fixed) c = mix(c, rgb(col), a);
    c = mix(mix(c, rgb(A), lights.aa), rgb(B), lights.ab);
    w = Math.max(w, lum(c));
  }
  return w;
}

test('reposo: las luces de la carátula y la base de Fogar no pasan de 0,05 en el peor punto', () => {
  const src = fs.readFileSync(path.join(PUB, 'idle-app.js'), 'utf8');
  const m = src.match(/\/\/ @luz:inicio\n([\s\S]*?)\/\/ @luz:fin/);
  assert.ok(m, 'idle-app.js debe tener su luz entre // @luz:inicio y // @luz:fin');
  const { LUZ, tone } = new Function(m[1] + '\nreturn { LUZ, tone };')();
  const some = COVERS.filter((_, i) => i % 7 === 0).map(c => tone(c));
  const all = COVERS.map(c => tone(c));
  const fixed = [[LUZ.humo, LUZ.aHumo], [LUZ.niebla, LUZ.aNiebla]];
  const y = worst(LUZ.base, fixed, { a: all, b: some, aa: LUZ.a, ab: LUZ.a });
  assert.ok(y <= TOPE, `con carátula: ${y.toFixed(4)}`);
  const y0 = worst(LUZ.base, fixed, { a: [LUZ.sin[0]], b: [LUZ.sin[1]], aa: LUZ.aSin, ab: LUZ.aSin });
  assert.ok(y0 <= TOPE, `sin música: ${y0.toFixed(4)}`);
});

test('mando: tone() en oscuro deja las luces por debajo de 0,05 en el peor punto de cada sitio donde se pintan', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mando-luz-'));
  try {
    fs.cpSync(path.join(PUB, 'mando'), path.join(tmp, 'mando'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
    const { tone, LIMITS } = await import(pathToFileURL(path.join(tmp, 'mando', 'features', 'ambient.js')).href);
    const t = lim => COVERS.map(c => tone(c, lim));
    const m = t(LIMITS.mando.oscuro), s = t(LIMITS.sp.oscuro);
    // mando.css: luces al 24 % sobre --bg con el relleno del trackpad (--pad2, su parte más clara) encima; la miniatura de la tele, al 45 y 35 % sobre --tv;
    // ahora suena, al 40 % sobre --sp-bg
    const cases = {
      trackpad: Math.max(...m.map(A => lum(mix(mix(mix(rgb('#0b1012'), rgb(A), 0.24), rgb(A), 0.24), rgb('#ece6dc'), 0.06)))),   // --pad2: arriba, 6 % de hueso
      miniatura: worst('#070b0c', [], { a: m, b: m.filter((_, i) => i % 5 === 0), aa: 0.45, ab: 0.35 }),
      ahoraSuena: worst('#070b0c', [], { a: s, b: s.filter((_, i) => i % 5 === 0), aa: 0.4, ab: 0.4 }),
    };
    for (const [k, y] of Object.entries(cases)) assert.ok(y <= TOPE, `${k}: ${y.toFixed(4)}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

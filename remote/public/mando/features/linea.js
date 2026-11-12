// La línea viva en la voz del mando, en lugar del orbe: el botón #agOrb sigue igual (ids, aria y escuchas) y dentro pinta
// la línea de Fogar (shared/linea-viva.js, cargado antes de app.js). Reposo: la palabra; grabando: la escucha, con el
// nivel de tu voz; esperando: piensa; respuesta: la palabra otra vez. Con reducir movimiento, la forma quieta de cada
// estado. El bucle solo corre mientras se ve y algo se mueve.
const LV = /** @type {any} */ (globalThis).FogarLineaViva;
const STATE = { idle: 'rest', rec: 'listen', wait: 'think', done: 'rest' };
// colores de arriba abajo por estado (variables de tokens-mando.css): hueso o tinta en reposo, contra al escuchar y pensar
const STOPS = { rest: ['--text', '--text', '--text'], listen: ['--contra', '--contra', '--contra'], think: ['--contra', '--contra', '--contra'] };
const PX = 4.4;                                         // grosor del trazo en unidades del lienzo de la línea (1000 de ancho)

/** @type {any} */ let eng = null;
/** @type {HTMLCanvasElement | null} */ let cv = null;
let raf = 0, st = 'rest';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function draw() {
  const c = cv && cv.getContext('2d');
  if (!c || !eng) return;
  const dpr = Math.max(1, devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const k = w / LV.W, cs = getComputedStyle(cv);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.setTransform(k, 0, 0, k, 0, (h - LV.H * k) / 2);
  eng.draw(c, PX, (STOPS[st] || STOPS.rest).map(v => cs.getPropertyValue(v).trim() || '#ece6dc'));
}
function frame(now) {
  raf = 0;
  if (!eng || !cv || !cv.isConnected || !cv.offsetParent) return;   // la hoja cerrada no pinta ni gasta
  eng.advance(now / 1000);
  draw();
  if (!eng.settled()) raf = requestAnimationFrame(frame);
}
function wake() {
  if (!eng) return;
  if (reduce()) { eng.still(st); draw(); return; }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** Monta la línea dentro del botón (una vez). Sin el motor (no cargó), el botón se queda sin dibujo y funciona igual. */
export function lineInit() {
  const b = document.getElementById('agOrb');
  if (!b || !LV || cv) return;
  cv = document.createElement('canvas');
  cv.className = 'vzLine';
  cv.setAttribute('aria-hidden', 'true');
  b.appendChild(cv);
  try { eng = LV.make(); eng.go('rest', performance.now() / 1000); } catch { eng = null; return; }
  // la hoja se abre después: al verse, pinta (el bucle se para con la hoja cerrada)
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => wake()).observe(cv);
  wake();
}
/** Estado de la vista de voz ('idle', 'rec', 'wait' o 'done'). @param {string} s */
export function lineStage(s) {
  st = STATE[s] || 'rest';
  if (eng) eng.go(st, performance.now() / 1000);
  wake();
}
/** Nivel de tu voz (0–1) mientras grabas. @param {number} x */
export function lineLevel(x) {
  if (!eng) return;
  eng.level(x);
  wake();
}

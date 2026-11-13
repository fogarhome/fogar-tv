// La línea viva del mando (shared/linea-viva.js, cargado antes de app.js), con un solo motor y dos lienzos:
// - en la hoja de voz, dentro del botón #agOrb (mismos ids, aria y escuchas que el orbe);
// - en la cabecera de Fogar (A3), #fLine: en reposo, la palabra con la brasa en la «r»; si se habla con el micro del
//   pulgar, la misma cabecera escucha y piensa sin cambiar de alto. Con la hoja abierta, la cabecera no se pinta.
// Reposo: la palabra; grabando: la escucha, con el nivel de tu voz; esperando: piensa; respuesta: la palabra otra vez.
// Con reducir movimiento, la forma quieta de cada estado. El bucle solo corre mientras algo se mueve.
const LV = /** @type {any} */ (globalThis).FogarLineaViva;
const STATE = { idle: 'rest', rec: 'listen', wait: 'think', done: 'rest' };
// colores de arriba abajo por estado (variables de tokens-mando.css): hueso o tinta en reposo, contra al escuchar y pensar
const STOPS = { rest: ['--text', '--text', '--text'], listen: ['--contra', '--contra', '--contra'], think: ['--contra', '--contra', '--contra'] };
const PX = 4.4;                                         // grosor del trazo en unidades del lienzo de la línea (1000 de ancho)
const HEAD_PX = PX * 168 / 118;                         // la cabecera es más estrecha (118 px): el mismo grosor en pantalla
// la brasa del A3 sobre la palabra, en horizontal: solo en la «r» (fracciones del ancho del lienzo)
const EMBER = [[0.7, 0], [0.79, 1], [0.85, 2], [0.94, 0]];   // 0: nada, 1: brasa, 2: chispa

/** @type {any} */ let eng = null;
/** @type {HTMLCanvasElement | null} */ let cv = null;
/** @type {HTMLCanvasElement | null} */ let hd = null;
let raf = 0, st = 'rest';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sheetOpen = () => { const s = document.getElementById('agS'); return !!s && s.classList.contains('on'); };

/** @param {HTMLCanvasElement} el @param {number} px @param {boolean} ember */
function paint(el, px, ember) {
  const c = el.getContext('2d');
  if (!c) return;
  const dpr = Math.max(1, devicePixelRatio || 1), w = Math.round(el.clientWidth * dpr), h = Math.round(el.clientHeight * dpr);
  if (!w || !h) return;
  if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
  const k = w / LV.W, cs = getComputedStyle(el);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.setTransform(k, 0, 0, k, 0, (h - LV.H * k) / 2);
  eng.draw(c, px, (STOPS[st] || STOPS.rest).map(v => cs.getPropertyValue(v).trim() || '#ece6dc'));
  if (!ember || st !== 'rest') return;
  // la brasa tiñe solo el trazo ya pintado (source-atop): el motor compartido no cambia
  const b = cs.getPropertyValue('--brasa').trim(), y = cs.getPropertyValue('--chispa').trim();
  if (!/^#[0-9a-f]{6}$/i.test(b) || !/^#[0-9a-f]{6}$/i.test(y)) return;
  const g = c.createLinearGradient(0, 0, w, 0);
  for (const [at, k] of EMBER) g.addColorStop(at, k === 2 ? y : k ? b : b + '00');
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
}
function draw() {
  if (!eng) return;
  if (cv && sheetOpen()) paint(cv, PX, false);
  if (hd && hd.isConnected && !sheetOpen()) paint(hd, HEAD_PX, true);
}
function frame(now) {
  raf = 0;
  if (!eng) return;
  eng.advance(now / 1000);
  draw();
  if (!eng.settled()) raf = requestAnimationFrame(frame);
}
/** Repinta (y anima si hace falta); también al abrir o cerrar la hoja, que cambia qué lienzo se ve. */
export function lineWake() {
  if (!eng) return;
  if (reduce()) { eng.still(st); draw(); return; }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** Monta las dos líneas (una vez). Sin el motor (no cargó), los botones se quedan sin dibujo y funcionan igual. */
export function lineInit() {
  const b = document.getElementById('agOrb');
  hd = /** @type {HTMLCanvasElement | null} */ (document.getElementById('fLine'));
  if (!b || !LV || cv) return;
  cv = document.createElement('canvas');
  cv.className = 'vzLine';
  cv.setAttribute('aria-hidden', 'true');
  b.appendChild(cv);
  try { eng = LV.make(); eng.go('rest', performance.now() / 1000); } catch { eng = null; return; }
  // la hoja se abre después y la cabecera cambia de tamaño con la pantalla: al cambiar, se repinta
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => lineWake()); ro.observe(cv); if (hd) ro.observe(hd); }
  document.fonts.ready.then(lineWake);
  lineWake();
}
/** Estado de la vista de voz ('idle', 'rec', 'wait' o 'done'). @param {string} s */
export function lineStage(s) {
  st = STATE[s] || 'rest';
  if (eng) eng.go(st, performance.now() / 1000);
  lineWake();
}
/** Nivel de tu voz (0–1) mientras grabas. @param {number} x */
export function lineLevel(x) {
  if (!eng) return;
  eng.level(x);
  lineWake();
}

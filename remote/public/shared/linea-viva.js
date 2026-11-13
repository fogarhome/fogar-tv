// La línea viva de Fogar: el trazo que escribe «Fogar» y se convierte en lo que hace el agente (escucha, piensa,
// herramienta, habla). Motor de fogar-brand/linea-viva, tal como lo usa el A3 «Rincón vivo» del lienzo de la tele, sin DOM:
// cada capa pone su canvas y su bucle. Lo usan la capa del agente de la tele (src/tv/tokens.js lo pone delante de
// tv-agent.js) y la voz del mando (index.html lo carga antes de app.js).
// Cambios frente a fogar-brand (se suben allí):
// - el barrido de un estado a otro empieza siempre por la F (en fogar-brand, al azar), para que nazca del logo;
// - la escucha sigue el nivel real de la voz (level(), ~10 Hz) con las mismas envolventes; el habla sigue con sílabas
//   sintéticas;
// - sin la ola del reposo ni el recogerse en la F (son del reposo, fase 3), así que en reposo la línea se queda quieta y
//   quien la pinta puede parar su bucle (settled()).
// Coordenadas: un lienzo de 1000 × 420 (la palabra ocupa unos 800 × 372 en el centro). Solo createElementNS (Trusted Types).
(function () {
  if (globalThis.FogarLineaViva) return;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 420, N = 600, STROKE = 4.4, TIP = 0.8;
  const SL = Math.tan(7 * Math.PI / 180);
  const nx = c => x => +(c + (x - c) * 0.92).toFixed(2);
  const g = nx(272.5), a = nx(349);
  const GA = `C ${g(254)} 206 ${g(262)} 197 272 197 C ${g(283)} 197 ${g(291)} 200 ${g(291)} 211 C ${g(291)} 218 ${g(291)} 225 ${g(291)} 232`;
  const AA = `C ${a(330)} 206 ${a(338)} 197 350 197 C ${a(361)} 197 ${a(368)} 200 ${a(368)} 211 C ${a(368)} 218 ${a(368)} 225 ${a(368)} 232`;
  const OT = 'C 177 206 185 197 197 197';
  const K_F = 53 / 122, FTX = x => K_F * x + 165 - 618 * K_F, FTY = y => K_F * y + 250 - 470 * K_F;
  const F_MAIN = 'M 105 268 C 80 250 62 225 66 195 C 72 150 120 122 200 120 C 290 118 400 160 480 175 C 560 190 640 192 680 160 C 700 140 690 108 650 104 C 590 98 540 140 525 190 C 512 235 516 300 510 350 C 500 430 440 472 345 474 C 260 475 190 430 168 368';
  const F_BAR = 'M 372 299 C 450 292 540 288 618 291';
  const OGAR = [['link', null],
    ['oBody', 'C 209 197 217 207 217 222 C 217 238 208 250 196 250 C 184 250 177 240 177 222'], ['oTop2', OT],
    ['og', `C 205 197 210 200 214 204 C 222 213 236 240 246 240 C ${g(251)} 240 ${g(254)} 233 ${g(254)} 222`],
    ['gTop1', GA], ['gBody', `C ${g(291)} 243 ${g(283)} 250 272 250 C ${g(262)} 250 ${g(254)} 240 ${g(254)} 222`], ['gTop2', GA],
    ['gDesc', `C ${g(291)} 270 ${g(291)} 320 289 342 C 288 356 284 366 276 366 C 266 366 262 356 263 344 C 265 318 282 282 302 262 C 318 248 ${a(330)} 240 ${a(330)} 224`],
    ['aTop1', AA], ['aBody', `C ${a(368)} 243 ${a(359)} 250 348 250 C ${a(338)} 250 ${a(330)} 240 ${a(330)} 224`], ['aTop2', AA],
    ['r', `C ${a(368)} 242 369 250 376 251 C 382 252 386 246 389 240 C 394 230 400 206 404 184 C 413 166 411 146 397 146 C 383 146 382 163 388 177 C 393 192 404 198 418 198 C 428 198 434 202 434 212 C 434 228 432 238 436 245`],
    ['tail', 'C 441 253 455 254 466 245 C 475 237 484 218 491 200'],
  ];
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const smooth = b => b * b * b * (b * (b * 6 - 15) + 10);
  const ss = b => b * b * (3 - 2 * b);
  const hann = s => Math.sin(Math.PI * s) ** 2;
  const slant = ([x, y]) => [x + SL * (250 - y), y];
  function sampleD(d, tf) {
    const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d);
    const L = p.getTotalLength(), n = Math.max(2, Math.ceil(L * (tf ? K_F : 1) / 0.5)), out = [];
    for (let i = 0; i <= n; i++) { const q = p.getPointAtLength(L * i / n); out.push(tf ? [FTX(q.x), FTY(q.y)] : [q.x, q.y]); }
    return out;
  }
  // la palabra en N puntos: la F de arriba abajo, vuelve por su tinta al travesaño, lo recorre y sale hacia la o
  function build() {
    const main = sampleD(F_MAIN, true), bar = sampleD(F_BAR, true);
    let best = [1e9, 0, 0];
    for (let k = 0; k < main.length; k++) {
      const [x, y] = main[k]; if (y < FTY(250) || y > FTY(340) || x < FTX(480)) continue;
      for (let j = 0; j < bar.length; j++) { const d = Math.hypot(bar[j][0] - x, bar[j][1] - y); if (d < best[0]) best = [d, k, j]; }
    }
    const [, kc, jc] = best;
    const pieces = [['Fmain', main], ['Fback', main.slice(kc).reverse()], ['barL', bar.slice(0, jc + 1).reverse()], ['bar', bar]];
    const YC = FTY(291); let last = [165 - SL * (250 - YC), YC];
    for (const [k, seg] of OGAR) {
      const pts = sampleD(seg === null ? `M ${last[0]} ${last[1]} C 174 ${YC} 186 197 197 197` : `M ${last[0]} ${last[1]} ${seg}`, false);
      last = pts[pts.length - 1]; pieces.push([k, pts.map(slant)]);
    }
    const all = [], cum = [0], mark = {};
    for (const [k, pts] of pieces) {
      mark[k] = [cum[cum.length - 1]];
      pts.forEach((q, i) => { if (all.length && i === 0) return; if (all.length) cum.push(cum[cum.length - 1] + Math.hypot(q[0] - all[all.length - 1][0], q[1] - all[all.length - 1][1])); all.push(q); });
      mark[k].push(cum[cum.length - 1]);
    }
    const L = cum[cum.length - 1], out = []; let j = 0;
    for (let i = 0; i < N; i++) {
      const d = L * i / (N - 1); while (j < all.length - 2 && cum[j + 1] < d) j++;
      const f = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      out.push([all[j][0] + (all[j + 1][0] - all[j][0]) * f, all[j][1] + (all[j + 1][1] - all[j][1]) * f]);
    }
    const idx = {}; for (const k in mark) idx[k] = mark[k].map(v => Math.round(v / L * (N - 1)));
    return { pts: out, idx };
  }
  const box = pts => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
  // la palabra se calcula una vez por página, al primer uso (getPointAtLength necesita el DOM)
  let G = null;
  function geometry() {
    if (G) return G;
    const B = build(), bb = box(B.pts), SC = Math.min(800 / (bb[2] - bb[0]), 372 / (bb[3] - bb[1])), CX = 500, CY = 214;
    const fit = ([x, y]) => [CX + (x - (bb[0] + bb[2]) / 2) * SC, CY + (y - (bb[1] + bb[3]) / 2) * SC];
    const WORD = B.pts.map(fit), WB = box(WORD), TS = B.idx.tail[0];
    const TRAMP = WORD.map((p, i) => { const s = i / (N - 1); return ss(clamp(s / 0.08)) * ss(clamp((1 - s) / 0.08)); });
    const TX = (() => { const c = [0]; for (let i = 1; i < N; i++) c.push(c[i - 1] + (TRAMP[i] + TRAMP[i - 1]) / 2); return c.map(v => v / c[N - 1]); })();
    G = { WORD, BASE: fit([0, 250])[1], LX0: WB[0], LX1: WB[2], CX, CY, TS, TRAMP, TX,
      TAILW: WORD.map((p, i) => smooth(clamp((i - TS) / (N - 1 - TS)))),
      DAMP: WORD.map((p, i) => 25.3 - (25.3 - 16) * smooth(clamp((i - TS) / (0.03 * (N - 1))))) };
    return G;
  }
  const syll = t => (Math.sin(t * 0.75) > -0.45 ? 1 : 0.15) * Math.pow(Math.max(0, Math.sin(t * Math.PI * 3.4)), 2);
  const env = (v, r, dt) => v + (r - v) * (1 - Math.exp(-dt / (r > v ? 0.04 : 0.25)));   // ataque 40 ms, caída 250 ms
  const STATES = ['line', 'rest', 'listen', 'think', 'tool', 'speak'];

  // un motor por línea en pantalla
  function make() {
    const { WORD, BASE, LX0, LX1, CX, CY, TS, TRAMP, TX, TAILW, DAMP } = geometry();
    const mk = () => WORD.map(() => [0, 0]);
    const P = mk(), V = mk(), TN = mk(), TOLD = mk(), TNEW = mk(), SNAP = mk(), GS = mk(), GW = mk(), GA1 = mk(), GA2 = mk();
    const EB = new Float32Array(N), CSX = new Float64Array(N + 200);
    let VS = 0, SS = 0, lvIn = 0, cur = 'line', prev = 'line', tChange = -10, FAST = 1, whipT0 = -99, acc = 0, tNow = 0;
    for (let i = 0; i < N; i++) { P[i][0] = LX0 + (LX1 - LX0) * i / (N - 1); P[i][1] = BASE; }
    function shape(st, t, out, still) {
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1); let x, y;
        if (st === 'line') { x = LX0 + (LX1 - LX0) * s; y = BASE; }
        else if (st === 'rest') { x = WORD[i][0]; y = WORD[i][1]; }
        else if (st === 'listen') {
          const e = still ? 0.45 : VS; x = 40 + 920 * s; const amp = (14 + 70 * e) * hann(s);
          y = CY + amp * (0.62 * Math.sin(s * Math.PI * 9 - t * 7) + 0.28 * Math.sin(s * Math.PI * 21 + t * 5) + 0.1 * Math.sin(s * Math.PI * 43 - t * 11));
        } else if (st === 'think') {
          const u = s * Math.PI * 2; x = CX + 230 * Math.sin(u * 2 + t * 0.55) + 70 * Math.sin(u * 5 - t * 0.9) + 220 * (s - 0.5);
          y = CY + 120 * Math.sin(u * 3 + t * 0.7 + 1) + 30 * Math.cos(u * 7 + t * 1.1);
        } else if (st === 'tool') { const ph = s * Math.PI * 2 * 11 - t * Math.PI * 2, r = 38 * TRAMP[i]; x = 70 + 860 * TX[i] + r * Math.cos(ph); y = CY + r * Math.sin(ph); }
        else {
          // shortcut: el habla late con sílabas sintéticas; cuando la tele tenga el nivel de su voz, pasarlo por SS como la escucha
          const e = still ? syll(t) : SS, base = CY + 130;
          if (s < 0.3) { x = 150 + 230 * (s / 0.3); y = base; }
          else if (s > 0.7) { x = 620 + 230 * ((s - 0.7) / 0.3); y = base; }
          else {
            const u = (s - 0.3) / 0.4, j = Math.min(4, Math.floor(u * 5)), f = u * 5 - j;
            const HJ = [0.3, 0.62, 1.4, 0.66, 0.34][j] * (0.8 + 0.2 * Math.sin(t * 6.3 + j * 2.1));
            const body = (45 + 55 * e) * Math.pow(Math.sin(Math.PI * u), 0.8), tip = Math.pow(1 - Math.abs(f * 2 - 1), 0.6);
            y = base - body - (70 + 150 * e) * HJ * tip; const lift = (base - y) / 260; x = 380 + 240 * u + Math.sin(t * 3.3 + (base - y) * 0.022) * 22 * lift * lift;
          }
        }
        out[i][0] = x; out[i][1] = y;
      }
    }
    // alisado gaussiano a lo largo del arco (tres medias móviles, extremos reflejados)
    function gauss(src, out, sig) {
      const r = Math.max(1, Math.round(Math.sqrt(sig * sig + 1)));
      for (let k = 0; k < 2; k++) {
        let A = src, B = GA1;
        for (let pass = 0; pass < 3; pass++) {
          const L = N + 2 * r; let s = 0;
          for (let j = 0; j < L; j++) { const i = j - r, v = i < 0 ? 2 * A[0][k] - A[Math.min(N - 1, -i)][k] : i >= N ? 2 * A[N - 1][k] - A[Math.max(0, 2 * N - 2 - i)][k] : A[i][k]; s += v; CSX[j + 1] = s; }
          for (let i = 0; i < N; i++) B[i][k] = (CSX[i + 2 * r + 1] - CSX[i]) / (2 * r + 1);
          A = B; B = B === GA1 ? GA2 : GA1;
        }
        for (let i = 0; i < N; i++) out[i][k] = A[i][k];
      }
      return out;
    }
    // un frente ancho lleva la forma vieja a la nueva, siempre desde la F, con una onda larga encima
    function target(t, out) {
      const since = (t - tChange) / FAST;
      shape(cur, t, TNEW);
      if (prev === 'snap') for (let i = 0; i < N; i++) { TOLD[i][0] = SNAP[i][0]; TOLD[i][1] = SNAP[i][1]; } else shape(prev, t, TOLD);
      if (since >= 2) {
        for (let i = 0; i < N; i++) { out[i][0] = TNEW[i][0]; out[i][1] = TNEW[i][1]; }
        if (cur === 'rest') { const tw = t - whipT0; if (tw >= 0 && tw < 0.3) for (let i = TS; i < N; i++) out[i][1] -= 9 * Math.sin(Math.PI * tw / 0.3) * TAILW[i]; }
        return;
      }
      for (let i = 0; i < N; i++) {
        const e = smooth(clamp((since - 0.9 * i / (N - 1)) / 1.1)); EB[i] = e;
        out[i][0] = TOLD[i][0] + (TNEW[i][0] - TOLD[i][0]) * e; out[i][1] = TOLD[i][1] + (TNEW[i][1] - TOLD[i][1]) * e;
      }
      gauss(out, GW, 8); const A = cur === 'rest' ? 10 : 16;
      for (let i = 0; i < N; i++) { const w = 4 * EB[i] * (1 - EB[i]); GS[i][0] = out[i][0] + (GW[i][0] - out[i][0]) * w; GS[i][1] = out[i][1] + (GW[i][1] - out[i][1]) * w; }
      for (let i = 0; i < N; i++) {
        const p = GS[Math.max(0, i - 3)], q = GS[Math.min(N - 1, i + 3)], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
        const d = 4 * EB[i] * (1 - EB[i]) * A * Math.sin(Math.PI * 2 * 2.2 * (i / (N - 1)) - since * 5.5);
        out[i][0] = GS[i][0] - dy / l * d; out[i][1] = GS[i][1] + dx / l * d;
      }
    }
    let moving = true;
    function step(t, dt) {
      VS = env(VS, lvIn, dt); SS = env(SS, syll(t), dt);
      target(t, TN);
      const soft = cur === 'rest'; let mv = 0;
      for (let i = 0; i < N; i++) {
        const c = soft ? DAMP[i] : 25.3;
        V[i][0] += (160 * (TN[i][0] - P[i][0]) - c * V[i][0]) * dt; V[i][1] += (160 * (TN[i][1] - P[i][1]) - c * V[i][1]) * dt;
      }
      for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N - 1; i++) {
        V[i][0] = 0.5 * V[i][0] + 0.25 * (V[i - 1][0] + V[i + 1][0]); V[i][1] = 0.5 * V[i][1] + 0.25 * (V[i - 1][1] + V[i + 1][1]);
      }
      for (let i = 0; i < N; i++) { P[i][0] += V[i][0] * dt; P[i][1] += V[i][1] * dt; mv = Math.max(mv, Math.abs(V[i][0]) + Math.abs(V[i][1]), Math.abs(TN[i][0] - P[i][0]) + Math.abs(TN[i][1] - P[i][1])); }
      moving = mv > 1.5;   // 1,5 del lienzo de 1000 es ~0,5 px en la tele: menos no se ve y el arrastre final tarda segundos
    }
    return {
      W, H, N,
      get state() { return cur; },
      /** Lo vivo de la voz (0–1): la escucha con tu nivel, el habla con sus sílabas; si no, 0,35 (el foco lo usa). */
      get env() { return cur === 'listen' ? VS : cur === 'speak' ? SS : 0.35; },
      /** Cambia de estado (line, rest, listen, think, tool, speak). Interrumpido, parte de donde está, sin tirón. */
      go(to, t) {
        if (to === cur || !STATES.includes(to)) return;
        if (t - tChange < 2 * FAST) { for (let i = 0; i < N; i++) { SNAP[i][0] = P[i][0]; SNAP[i][1] = P[i][1]; } prev = 'snap'; } else prev = cur;
        FAST = to === 'listen' ? 0.5 : 0.65;   // escuchar responde ya
        cur = to; tChange = t; moving = true;
        if (to === 'rest') whipT0 = t + 2 * FAST;   // al acabar de escribirse, el latigazo de la cola
      },
      /** Nivel de la voz (0–1) mientras escucha: sube en 40 ms y baja en 250. */
      level(x) { lvIn = clamp(Number(x) || 0); },
      /** Avanza hasta `t` (s) con pasos fijos de 1/120 s (como mucho 0,25 s de golpe). */
      advance(t) {
        if (!tNow) tNow = t;
        acc += Math.min(0.25, Math.max(0, t - tNow)); tNow = t;
        const t0 = t - acc; let k = 0;
        while (acc >= 1 / 120) { step(t0 + k / 120, 1 / 120); acc -= 1 / 120; k++; }
      },
      /** Forma quieta de un estado, sin muelles (reducir movimiento). */
      still(st) { shape(STATES.includes(st) ? st : 'rest', 1.3, P, true); for (let i = 0; i < N; i++) V[i][0] = V[i][1] = 0; cur = st; prev = st; tChange = -10; moving = false; },
      /** Quieta: en una forma que no se mueve (la palabra o la recta), ya llegada (quien la pinta puede parar su bucle). */
      settled() { return !moving && (cur === 'rest' || cur === 'line') && tNow - tChange > 2 * FAST + 0.4; },
      /** Pinta la línea en el contexto `c` (ya con su transformación): `w` grosor en las unidades del lienzo (1000 × 420),
       *  `stops` tres colores CSS de arriba abajo. */
      draw(c, w, stops) {
        const gr = c.createLinearGradient(0, 0, 0, 344); gr.addColorStop(0, stops[0]); gr.addColorStop(0.55, stops[1]); gr.addColorStop(1, stops[2]);
        c.fillStyle = c.strokeStyle = gr; drawLine(c, P, w);
      },
    };
  }
  // una pasada de trazo y cintas de grosor variable en los remates (entrada de la F y cola afilada)
  function strokeRange(c, pts, A, B) {
    c.beginPath(); c.moveTo(pts[A][0], pts[A][1]);
    for (let i = A + 1; i < B; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    c.lineTo(pts[B][0], pts[B][1]); c.stroke();
  }
  function ribbon(c, pts, A, B, wf) {
    const n = pts.length, L = [], R = []; let nx0 = 0, ny0 = -1;
    for (let i = A; i <= B; i++) {
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      if (l > 1e-6) { nx0 = -dy / l; ny0 = dx / l; } const h = wf(i) / 2; L.push([pts[i][0] + nx0 * h, pts[i][1] + ny0 * h]); R.push([pts[i][0] - nx0 * h, pts[i][1] - ny0 * h]);
    }
    const E = [...L, ...R.reverse()];
    c.beginPath(); c.moveTo(E[0][0], E[0][1]);
    for (let k = 1; k < E.length - 1; k++) { if (k === L.length - 1 || k === L.length) { c.lineTo(E[k][0], E[k][1]); continue; } c.quadraticCurveTo(E[k][0], E[k][1], (E[k][0] + E[k + 1][0]) / 2, (E[k][1] + E[k + 1][1]) / 2); }
    c.lineTo(E[E.length - 1][0], E[E.length - 1][1]); c.closePath(); c.fill('nonzero');
    for (const i of [A, B]) { c.beginPath(); c.arc(pts[i][0], pts[i][1], wf(i) / 2, 0, 7); c.fill(); }
  }
  function drawLine(c, pts, w) {
    const n = pts.length, tin = Math.round(N * 0.02), tout = Math.round(N * 0.05), tip = TIP / STROKE;
    const wf = i => w * (i < tin ? tip + (1 - tip) * smooth(i / tin) : i > n - 1 - tout ? 0.14 + 0.86 * smooth((n - 1 - i) / tout) : 1);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = w; strokeRange(c, pts, tin, n - 1 - tout);
    ribbon(c, pts, 0, tin, wf); ribbon(c, pts, n - 1 - tout, n - 1, wf);
  }
  globalThis.FogarLineaViva = { make, W, H, STATES };
})();

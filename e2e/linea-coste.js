// Coste por fotograma de la línea viva en la capa del agente (remote/public/tv-agent.js con shared/linea-viva.js delante,
// como la inyecta el servidor): abre la capa en cada estado sobre el reposo, a 1280×720 con escala 1,5 (la del kiosco), y
// apunta lo que tarda el motor (step) y el dibujo (draw) por fotograma según TVAgent._debug().cost, y el intervalo medio
// entre fotogramas. Con --cpu N frena la CPU N veces (CDP Emulation.setCPUThrottlingRate) para acercarse al kiosco; la
// medida buena es la del kiosco de green-house (TVC-35).
// Uso: cd e2e && node linea-coste.js [--cpu 4]   (CHROME=/ruta para otro navegador)
/* global window, requestAnimationFrame, performance */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'remote', 'public');
const { agentSource } = require(path.join(ROOT, 'remote', 'src', 'tv', 'tokens.js'));
const cpu = Number(process.argv[process.argv.indexOf('--cpu') + 1]) || 1;
const SOURCE = agentSource(PUB);

const srv = http.createServer((q, r) => {
  const f = path.join(PUB, q.url.split('?')[0]);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  r.end(fs.readFileSync(f));
}).listen(0);

const turn = { id: 1, you: 'Pon algo tranquilo de jazz en el salón', youFinal: true, fogar: 'Ahí va. Jazz tranquilo en el salón, empezando por Miles Davis.', tools: [], error: false, hint: '' };
const STATES = [
  ['escucha', { state: 'listen', turns: [{ ...turn, fogar: '', youFinal: false }] }],
  ['piensa', { state: 'think', turns: [{ ...turn, fogar: '' }] }],
  ['herramienta', { state: 'think', turns: [{ ...turn, fogar: '', tools: [{ id: 'a', kind: 'music', title: 'Reproducir en el Salón', detail: '', status: 'run' }] }] }],
  ['habla', { state: 'talk', live: true }],
];

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`http://127.0.0.1:${srv.address().port}/idle.html`);
  await page.evaluate(SOURCE);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const rows = [];
  for (const [name, o] of STATES) {
    await page.evaluate(o => window.TVAgent.render({ form: 'panel', ctx: 'idle', state: 'talk', live: false, night: false, calm: false, glass: 'A', colors: null, icons: {}, turns: [], ...o }), { turns: [turn], ...o });
    await page.waitForTimeout(2500);   // nace, cambia de forma y se asienta en el estado
    const r = await page.evaluate(() => new Promise(done => {
      const t0 = performance.now(), c0 = window.TVAgent._debug().cost.frames; let n = 0;
      const f = () => { if (++n < 120) return requestAnimationFrame(f); const d = window.TVAgent._debug(); done({ frameMs: (performance.now() - t0) / n, ...d.cost, drawn: d.cost.frames - c0, line: d.line }); };
      requestAnimationFrame(f);
    }));
    rows.push({ estado: name, ...r });
  }
  console.log(`CPU ×${cpu}, 1280×720 a escala 1,5`);
  for (const r of rows) console.log(`${r.estado.padEnd(12)} línea ${r.line.padEnd(7)} motor ${r.step.toFixed(2)} ms · dibujo ${r.draw.toFixed(2)} ms · fotograma ${r.frameMs.toFixed(1)} ms (${r.drawn} pintados de 120)`);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });

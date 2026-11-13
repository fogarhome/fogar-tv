'use strict';
// En la tele ningún texto baja de 30 px a 1080p, tampoco en mayúsculas espaciadas (decidido por Sito el 2026-11-13). Las
// medidas de la tele van en --u (1 px de la tele de 1920×1080) o en --s (--u por el ajuste de su celda, que fit() no deja
// bajar del mínimo: lo mide e2e/reposo-solapes.js). Aquí se leen las fuentes y se comprueba cada tamaño de letra escrito.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MIN = 30;
const ROOT = path.join(__dirname, '..', '..', 'remote');
const FILES = ['public/shared/tokens-tv.css', 'public/stage.css', 'public/idle.css', 'public/tpl-tasks.html', 'public/tpl-slides.html',
  'public/tpl-reminder.html', 'public/tv-island.js', 'public/tv-agent.js', 'src/tv/devices.js'];
// tamaño en una declaración font-size o font: `calc(N * var(--u|--s))` o `${u(N)}`
const SIZE = /(?:font-size:|font:[^;{}`]*?)\s*(?:calc\((\d+(?:\.\d+)?) \* var\(--[us]\)\)|\$\{u\((\d+(?:\.\d+)?)\)\}|calc\(var\((--tv-[\w-]+)\) \* var\(--[us]\)\))/g;

test('la escala de la tele no baja de 30', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/shared/tokens-tv.css'), 'utf8');
  for (const t of ['reloj', 'cifra', 'titular', 'destacado', 'texto', 'secundario', 'metadato']) {
    const m = css.match(new RegExp(`--tv-${t}:(\\d+)`));
    assert.ok(m, `falta --tv-${t}`);
    assert.ok(+m[1] >= MIN, `--tv-${t} es ${m[1]}`);
  }
});

test('ningún tamaño de letra de la tele baja de 30', () => {
  const bad = [];
  let n = 0;
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(SIZE)) {
      n++;
      const v = m[1] || m[2];
      if (v && +v < MIN) bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.ok(n > 50, `solo se han encontrado ${n} tamaños: ¿ha cambiado la forma de escribirlos?`);
  assert.deepEqual(bad, []);
});

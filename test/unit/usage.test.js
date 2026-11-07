'use strict';
// Registro de uso local (remote/src/features/usage.js): lo que estuvo en pantalla, 90 días, sin salir de la máquina.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const createUsage = require(path.join(__dirname, '..', '..', 'remote', 'src', 'features', 'usage'));

test('usage: apunta, junta la repetición seguida, poda a 90 días y respeta el interruptor', () => {
  let T = 100 * 864e5, on = true, saved = [];
  const u = createUsage({ store: { load: () => [], save: v => { saved = v; } }, now: () => T, enabled: () => on });
  u.add({ src: 'web', title: 'example.com', url: 'https://example.com/' });
  T += 60e3; u.add({ src: 'web', title: 'example.com', url: 'https://example.com/' });
  assert.equal(u.list().length, 1, 'la misma seguida: solo se actualiza la hora');
  assert.equal(u.list()[0].at, T);
  u.add({ src: 'netflix', title: 'Dark', url: 'https://www.netflix.com/watch/22' });
  assert.deepEqual(u.list().map(e => e.src), ['netflix', 'web']);
  T += 91 * 864e5; u.add({ src: 'spotify', title: 'Jazz' });
  assert.deepEqual(u.list().map(e => e.src), ['spotify'], 'lo de hace más de 90 días, fuera');
  on = false; u.add({ src: 'web', title: 'x' });
  assert.equal(u.list().length, 1, 'apagado: no apunta');
  assert.equal(saved.length, 1);
});

test('usage: recorta título y url a 200 y guarda solo src, title, url, at', () => {
  let saved = [];
  const u = createUsage({ store: { load: () => [], save: v => { saved = v; } }, now: () => 5, enabled: () => true });
  u.add({ src: 'web', title: 'x'.repeat(300), url: 'https://a/' + 'y'.repeat(300), extra: 1 });
  assert.equal(saved[0].title.length, 200);
  assert.equal(saved[0].url.length, 200);
  assert.deepEqual(Object.keys(saved[0]).sort(), ['at', 'src', 'title', 'url']);
});

test('usage: en la web la misma url seguida es la misma entrada y se queda el título nuevo', () => {
  let T = 1;
  const u = createUsage({ store: { load: () => [], save() {} }, now: () => T, enabled: () => true });
  u.add({ src: 'web', title: 'example.com', url: 'https://example.com/a' });
  T = 2; u.add({ src: 'web', title: 'Ejemplo A', url: 'https://example.com/a' });
  assert.deepEqual(u.list(), [{ src: 'web', title: 'Ejemplo A', url: 'https://example.com/a', at: 2 }]);
});

test('usage: una entrada rota en usage.json (null, sin at) se descarta y no rompe add', () => {
  let saved = [];
  const u = createUsage({ store: { load: () => [null, { src: 'web' }, { src: 'web', title: 'a', url: 'u', at: 5 }], save: v => { saved = v; } }, now: () => 10, enabled: () => true });
  u.add({ src: 'spotify', title: 'Jazz' });
  assert.deepEqual(saved.map(e => e.src), ['spotify', 'web']);
});

test('usage: recents junta cada pieza, deja fuera lo que no se abre y lo viejo, y forget no borra', () => {
  let T = 10 * 864e5, saved = [];
  const u = createUsage({ store: { load: () => [], save: v => { saved = v; } }, now: () => T, enabled: () => true });
  const add = (e, dt = 60e3) => { T += dt; u.add(e); };
  add({ src: 'web', title: 'Vieja', url: 'https://old.example/' });
  add({ src: 'spotify', title: 'Sin uri' }, 8 * 864e5);              // apunte antiguo: sin uri, no se puede abrir
  add({ src: 'netflix', title: 'Fantasmas', url: 'https://www.netflix.com/watch/81939626' });
  add({ src: 'spotify', title: 'CHROMAKOPIA', url: 'spotify:album:0U28P0QVB1QRxpqp5IHOlH' });
  add({ src: 'netflix', title: 'Fantasmas', url: 'https://www.netflix.com/watch/81939634' });
  add({ src: 'web', title: 'Ejemplo', url: 'https://example.com/' });
  const r = u.recents();
  assert.deepEqual(r.map(x => x.title), ['Ejemplo', 'Fantasmas', 'CHROMAKOPIA'], 'una por pieza, sin lo de hace más de 7 días ni lo que no se abre');
  assert.equal(r[1].url, 'https://www.netflix.com/watch/81939634', 'Netflix: el capítulo más reciente');
  assert.equal(u.recents({ max: 2 }).length, 2);
  assert.equal(u.forget(r[1].key), 2, 'marca todas las entradas de la serie');
  assert.deepEqual(u.recents().map(x => x.title), ['Ejemplo', 'CHROMAKOPIA']);
  assert.equal(u.list().length, 6, 'el registro sigue entero');
  assert.ok(saved.some(e => e.gone));
  add({ src: 'netflix', title: 'Fantasmas', url: 'https://www.netflix.com/watch/81939640' });
  assert.equal(u.recents()[0].title, 'Fantasmas', 'usada otra vez: vuelve');
  add({ src: 'web', title: 'Ejemplo', url: 'https://example.com/' }, 0);
  u.forget(u.recents()[0].key); add({ src: 'web', title: 'Ejemplo', url: 'https://example.com/' });
  assert.equal(u.recents()[0].title, 'Ejemplo', 'la misma seguida también la devuelve');
});

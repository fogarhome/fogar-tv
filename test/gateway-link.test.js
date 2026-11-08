'use strict';
// La conexión con el J Gateway (remote/src/gateway/link.js y store.js) con un cliente falso: estados, clave rechazada,
// cambio de clave sin perder a los que escuchan y gateway.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGatewayLink } = require(path.join(__dirname, '..', 'remote', 'src', 'gateway', 'link'));
const { createGatewayStore } = require(path.join(__dirname, '..', 'remote', 'src', 'gateway', 'store'));

const nolog = { info() {}, warn() {} };
const tmpStore = () => createGatewayStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gwlink-')), 'gateway.json'));

/** Cliente falso: `next` decide qué hace el próximo ensure ('ok' | 'fail' | 'reject'). */
function fakes() {
  const made = [];
  const make = (/** @type {any} */ o) => {
    const subs = new Set();
    const c = { o, next: 'ok', ready: false, closed: false, sent: [],
      emit: ev => { for (const fn of subs) fn(ev); },
      on: fn => { subs.add(fn); return () => subs.delete(fn); },
      async ensure() { if (c.next === 'reject') { c.emit({ type: 'rejected' }); return false; } c.ready = c.next === 'ok'; return c.ready; },
      isReady: () => c.ready, close() { c.closed = true; c.ready = false; },
      send(t) { c.sent.push(t); }, audio() {}, end() {}, cancel() {} };
    made.push(c);
    return c;
  };
  return { made, make };
}

test('store: sanea gateway.json, guarda con 0600 y mezcla los cambios', () => {
  const s = tmpStore();
  assert.deepEqual(s.load(), { url: '', key: '', name: '', manual: false });
  s.save({ url: 'ws://gw:8004/ws/stream', key: 'k1', name: 'green-house' });
  assert.equal(fs.statSync(s.file).mode & 0o777, 0o600);
  assert.deepEqual(s.save({ key: '' }), { url: 'ws://gw:8004/ws/stream', key: '', name: 'green-house', manual: false });
  fs.writeFileSync(s.file, JSON.stringify({ url: 'http://no-ws', key: 3, manual: 'yes' }));
  assert.deepEqual(s.load(), { url: '', key: '', name: '', manual: false });
});

test('sin dirección o sin clave: unpaired, y todo se comporta como un gateway caído', async () => {
  const f = fakes();
  const l = createGatewayLink({ store: tmpStore(), envUrl: 'ws://gw/ws/stream', agent: 'a', log: nolog, makeClient: f.make });
  assert.equal(l.status().status, 'unpaired');
  assert.equal(f.made.length, 0);
  assert.equal(await l.ensure(), false);
  l.send('hola');
  assert.equal(l.isReady(), false);
});

test('screen.env manda sobre lo guardado; check pasa a ok y avisa del cambio', async () => {
  const s = tmpStore(); s.save({ url: 'ws://guardada/ws/stream', key: 'k1', name: 'gh' });
  const f = fakes(), seen = [];
  const l = createGatewayLink({ store: s, envUrl: 'ws://amano/ws/stream', agent: 'a', log: nolog, makeClient: f.make, onChange: x => seen.push(x.status) });
  assert.equal(f.made[0].o.url, 'ws://amano/ws/stream');
  assert.equal(f.made[0].o.key, 'k1');
  assert.equal(await l.check(), 'ok');
  assert.deepEqual(l.status(), { status: 'ok', name: 'gh' });
  assert.deepEqual(seen, ['ok']);
});

test('gateway que no responde: unreachable y la clave se conserva', async () => {
  const s = tmpStore(); s.save({ url: 'ws://gw/ws/stream', key: 'k1' });
  const f = fakes();
  const l = createGatewayLink({ store: s, agent: 'a', log: nolog, makeClient: f.make });
  f.made[0].next = 'fail';
  assert.equal(await l.ensure(), false);
  assert.equal(l.status().status, 'unreachable');
  assert.equal(s.load().key, 'k1');
  f.made[0].next = 'ok';
  assert.equal(await l.ensure(), true, 'la próxima vez vuelve a probar');
  assert.equal(l.status().status, 'ok');
});

test('clave rechazada: revoked, se borra la guardada y no se vuelve a intentar', async () => {
  const s = tmpStore(); s.save({ url: 'ws://gw/ws/stream', key: 'k1', name: 'gh' });
  const f = fakes();
  const l = createGatewayLink({ store: s, agent: 'a', log: nolog, makeClient: f.make });
  f.made[0].next = 'reject';
  assert.equal(await l.ensure(), false);
  assert.equal(l.status().status, 'revoked');
  assert.equal(s.load().key, '');
  assert.equal(s.load().url, 'ws://gw/ws/stream', 'la dirección se conserva');
  assert.equal(f.made[0].closed, true);
  assert.equal(await l.ensure(), false);
});

test('la clave de screen.env rechazada no se puede borrar, pero queda revoked', async () => {
  const s = tmpStore();
  const f = fakes();
  const l = createGatewayLink({ store: s, envUrl: 'ws://gw/ws/stream', envKey: 'vieja', agent: 'a', log: nolog, makeClient: f.make });
  f.made[0].next = 'reject';
  await l.ensure();
  assert.equal(l.status().status, 'revoked');
  assert.equal(fs.existsSync(s.file), false, 'no se escribe nada');
});

test('use(): cliente nuevo con la clave nueva, el viejo se cierra y los oyentes siguen enganchados', async () => {
  const s = tmpStore();
  const f = fakes(), got = [];
  const l = createGatewayLink({ store: s, agent: 'a', log: nolog, makeClient: f.make });
  l.on(ev => got.push(ev.type));
  assert.equal(await l.use({ url: 'ws://gw/ws/stream', key: 'k2', name: 'gh' }), 'ok');
  assert.equal(l.key(), 'k2');
  assert.deepEqual(s.load(), { url: 'ws://gw/ws/stream', key: 'k2', name: 'gh', manual: false });
  const first = f.made[0];
  first.emit({ type: 'token' });
  await l.use({ url: 'ws://otro/ws/stream', key: 'k3' });
  assert.equal(first.closed, true);
  first.emit({ type: 'token' });                           // el viejo ya no llega
  f.made[1].emit({ type: 'final' });
  assert.deepEqual(got, ['token', 'final']);
  l.send('hola');
  assert.deepEqual(f.made[1].sent, ['hola']);
});

test('forget(): borra la clave, conserva la dirección escrita a mano y pasa a unpaired', async () => {
  const s = tmpStore(); s.save({ url: 'ws://gw/ws/stream', key: 'k1', name: 'gh', manual: true });
  const f = fakes();
  const l = createGatewayLink({ store: s, agent: 'a', log: nolog, makeClient: f.make });
  l.forget();
  assert.equal(l.status().status, 'unpaired');
  assert.equal(f.made[0].closed, true);
  assert.deepEqual(s.load(), { url: 'ws://gw/ws/stream', key: '', name: '', manual: true });
});

test('una caída tras estar listo: unreachable y se vuelve a comprobar una vez', async () => {
  const s = tmpStore(); s.save({ url: 'ws://gw/ws/stream', key: 'k1' });
  const f = fakes();
  const l = createGatewayLink({ store: s, agent: 'a', log: nolog, makeClient: f.make });
  await l.check();
  f.made[0].next = 'fail';
  f.made[0].emit({ type: 'down' });
  await new Promise(r => setImmediate(r));
  assert.equal(l.status().status, 'unreachable');
});

'use strict';
// Encontrar el Fogar Gateway y emparejarse (remote/src/gateway/discover.js y pair.js) y las órdenes del mando
// (remote/src/features/gateway.js), contra un gateway falso por HTTP.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const R = p => require(path.join(__dirname, '..', 'remote', 'src', p));
const discover = R('gateway/discover');
const pair = R('gateway/pair');
const { createGatewayFeature } = R('features/gateway');
const { createGatewayLink } = R('gateway/link');
const { createGatewayStore } = R('gateway/store');

const nolog = { info() {}, warn() {} };

/** Gateway falso: well-known y POST /pair con el código 123456. */
async function fakeGw({ service = 'fogar-gateway', code = '123456', status } = {}) {
  const got = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (req.method === 'GET' && req.url === '/.well-known/fogar-gateway') return send(200, { service, version: '1.29.0', name: 'green-house', pairing: true });
      if (req.method === 'POST' && req.url === '/pair') {
        const j = JSON.parse(body); got.push(j);
        if (status) return send(status, {});
        if (j.code !== code) return send(400, { detail: 'invalid or expired code' });
        return send(201, { client_id: 'c1', name: j.name, client_key: 'clave-secreta', gateway: { name: 'green-house', version: '1.29.0' } });
      }
      send(404, {});
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  return { got, port, host: `127.0.0.1:${port}`, stop: () => new Promise(r => srv.close(r)) };
}

test('endpoints: lo que escribe una persona → http y ws con el puerto 8004 por defecto', () => {
  assert.deepEqual(discover.endpoints('green-house'), { http: 'http://green-house:8004', ws: 'ws://green-house:8004/ws/stream', host: 'green-house' });
  assert.equal(discover.endpoints('green-house:9000').ws, 'ws://green-house:9000/ws/stream');
  assert.equal(discover.endpoints('ws://gh:8004/ws/stream').http, 'http://gh:8004');
  assert.equal(discover.endpoints('https://fogar.example').ws, 'wss://fogar.example:8004/ws/stream');
  assert.equal(discover.endpoints(''), null);
  assert.equal(discover.endpoints('ftp://x'), null);
});

test('probe: solo cuenta un Fogar de verdad', async () => {
  const ok = await fakeGw(), other = await fakeGw({ service: 'otro' });
  try {
    const g = await discover.probe(ok.host);
    assert.equal(g.name, 'green-house');
    assert.equal(g.version, '1.29.0');
    assert.equal(g.ws, `ws://${ok.host}/ws/stream`);
    assert.equal(await discover.probe(other.host), null);
    assert.equal(await discover.probe('127.0.0.1:1'), null);
  } finally { await ok.stop(); await other.stop(); }
});

test('tailnetHosts: equipos en línea por su nombre de MagicDNS', () => {
  const st = { Self: { DNSName: 'yo.ts.net.' }, Peer: {
    a: { DNSName: 'green-house.ts.net.', Online: true }, b: { DNSName: 'mac.ts.net.', Online: false }, c: { HostName: 'pi', Online: true } } };
  assert.deepEqual(discover.tailnetHosts(st), ['green-house.ts.net', 'pi']);
  assert.deepEqual(discover.tailnetHosts(null), []);
});

test('find: una dirección a mano es la única (aunque no responda); si no, este equipo y, si no, la tailnet', async () => {
  const asked = [];
  const probeImpl = async h => { asked.push(h); return h === 'pi' || h === 'gh' || h === '127.0.0.1' && local ? { host: h, name: h } : null; };
  let local = true;
  const tailscale = async () => ({ Peer: { a: { HostName: 'pi', Online: true }, b: { HostName: 'gh', Online: true }, c: { HostName: 'x', Online: true } } });

  let r = await discover.find({ manual: 'ws://amano:8004/ws/stream', probeImpl, tailscale });
  assert.deepEqual(r, { manual: true, found: [] });
  assert.deepEqual(asked, ['ws://amano:8004/ws/stream'], 'no se busca otro');

  asked.length = 0;
  r = await discover.find({ probeImpl, tailscale });
  assert.deepEqual(r.found.map(g => [g.host, g.where]), [['127.0.0.1', 'local']]);
  assert.deepEqual(asked, ['127.0.0.1'], 'con uno en este equipo no se mira la tailnet');

  local = false; asked.length = 0;
  r = await discover.find({ probeImpl, tailscale });
  assert.deepEqual(r.found.map(g => [g.host, g.where]), [['pi', 'tailnet'], ['gh', 'tailnet']]);
});

test('redeem: manda tipo screen y lo que sabe reproducir; errores claros y genéricos', async () => {
  const g = await fakeGw();
  const base = `http://${g.host}`;
  try {
    assert.deepEqual(await pair.redeem({ http: base, code: '12 34 56', name: 'Salón' }), { key: 'clave-secreta', name: 'green-house', version: '1.29.0' });
    assert.deepEqual(g.got[0], { code: '123456', name: 'Salón', client_type: 'screen', output_mode: ['audio', 'text', 'status'] });
    assert.deepEqual(await pair.redeem({ http: base, code: '999999', name: 'x' }), { error: 'Código no válido o caducado' });
    assert.deepEqual(await pair.redeem({ http: base, code: '12', name: 'x' }), { error: 'El código son 6 cifras' });
    assert.equal(g.got.length, 2, 'un código mal formado no llega al gateway');
    assert.deepEqual(await pair.redeem({ http: 'http://127.0.0.1:1', code: '123456', name: 'x' }), { error: 'El gateway no responde' });
  } finally { await g.stop(); }
  const busy = await fakeGw({ status: 429 });
  try { assert.match((await pair.redeem({ http: `http://${busy.host}`, code: '123456', name: 'x' })).error, /espera/); } finally { await busy.stop(); }
});

test('localCode: `fogar-gw --json pair --type screen --name … --no-wait`', async () => {
  let args = null;
  const exec = (cmd, a, o, cb) => { args = [cmd, ...a]; cb(null, JSON.stringify({ id: 'p1', code: '482913', expires_at: 'x' })); };
  assert.deepEqual(await pair.localCode({ name: 'Salón', agent: 'j-assistant', exec }), { code: '482913' });
  assert.deepEqual(args, ['fogar-gw', '--json', 'pair', '--type', 'screen', '--name', 'Salón', '--agent', 'j-assistant', '--allowed-agent', 'j-assistant', '--no-wait']);
  const missing = (c, a, o, cb) => cb(Object.assign(new Error('x'), { code: 'ENOENT' }), '');
  assert.deepEqual(await pair.localCode({ name: 'x', agent: 'a', exec: missing }), { error: 'fogar-gw no está instalado en este equipo' });
  const junk = (c, a, o, cb) => cb(null, 'no json');
  assert.ok('error' in await pair.localCode({ name: 'x', agent: 'a', exec: junk }));
});

/** Conexión con un cliente falso que siempre conecta. */
function mkLink() {
  const store = createGatewayStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gwpair-')), 'gateway.json'));
  const made = [];
  const makeClient = o => { const c = { o, ensure: async () => true, on: () => () => {}, isReady: () => true, close() {} }; made.push(c); return c; };
  return { store, made, link: createGatewayLink({ store, agent: 'a', log: nolog, makeClient }) };
}

test('orden pair: comprueba que es un Fogar, canjea, guarda y conecta; la clave no vuelve al mando', async () => {
  const g = await fakeGw();
  const { store, made, link } = mkLink();
  const f = createGatewayFeature({ link, name: 'Salón', agent: 'j-assistant', log: nolog });
  const run = m => f.commands[0].run({ t: 'gateway', ...m });
  try {
    assert.equal(f.commands[0].perm, 'admin');
    assert.equal((await run({ op: 'status' })).status, 'unpaired');
    assert.deepEqual(await run({ op: 'pair', host: g.host, code: '000000' }), { error: 'Código no válido o caducado' });
    const r = await run({ op: 'pair', host: g.host, code: '123456' });
    assert.deepEqual(r, { status: 'ok', name: 'green-house', host: '127.0.0.1', manual: false });
    assert.ok(!JSON.stringify(r).includes('clave-secreta'));
    assert.deepEqual(store.load(), { url: `ws://${g.host}/ws/stream`, key: 'clave-secreta', name: 'green-house', manual: false });
    assert.equal(made.at(-1).o.key, 'clave-secreta');
    assert.equal((await run({ op: 'pair', host: g.host, code: '123456', typed: true })).manual, true, 'escrita a mano: manual');
    assert.match((await run({ op: 'pair', host: '127.0.0.1:1', code: '123456' })).error, /No encuentro Fogar/);
    assert.deepEqual(await run({ op: 'forget' }), { status: 'unpaired', name: '', host: '127.0.0.1', manual: true });
  } finally { await g.stop(); }
});

test('orden local: sin gateway en este equipo no ejecuta fogar-gw', async () => {
  const { link } = mkLink();
  let ran = false;
  const f = createGatewayFeature({ link, name: 'Salón', agent: 'j-assistant', log: nolog,
    discover: { ...discover, probe: async () => null }, pair: { ...pair, localCode: async () => { ran = true; return { code: '123456' }; } } });
  assert.deepEqual(await f.commands[0].run({ t: 'gateway', op: 'local' }), { error: 'No hay un gateway en este equipo' });
  assert.equal(ran, false);
});

test('orden local: saca el código con fogar-gw y lo canjea por la misma ruta', async () => {
  const g = await fakeGw();
  const { store, link } = mkLink();
  const f = createGatewayFeature({ link, name: 'Salón', agent: 'j-assistant', log: nolog,
    discover: { ...discover, probe: h => discover.probe(h === '127.0.0.1' ? g.host : h) }, pair: { ...pair, localCode: async () => ({ code: '123456' }) } });
  try {
    assert.equal((await f.commands[0].run({ t: 'gateway', op: 'local' })).status, 'ok');
    assert.equal(store.load().key, 'clave-secreta');
    assert.equal(g.got[0].client_type, 'screen');
  } finally { await g.stop(); }
});

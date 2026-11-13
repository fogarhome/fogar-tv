'use strict';
// Fogar Gateway falso para pruebas y capturas: GET /.well-known/fogar-gateway, POST /pair (código `code`, devuelve una clave
// que empieza por `keyPrefix`) y el WebSocket /ws/stream (ready si la clave empieza por `keyPrefix`; si no, 1008 como el
// de verdad). Lo que llega a /pair queda en `pairs`.
const http = require('node:http');
const path = require('node:path');
const { WebSocketServer } = require(path.join(__dirname, '..', '..', 'remote', 'node_modules', 'ws'));

/** @param {{ name?: string, code?: string, keyPrefix?: string }} [o] */
async function startFakeGateway({ name = 'green-house', code = '123456', keyPrefix = 'e2e-gw-key' } = {}) {
  const pairs = [];
  let n = 0;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (req.method === 'GET' && req.url === '/.well-known/fogar-gateway') return send(200, { service: 'fogar-gateway', version: '2.0.0', name, instance_id: 'test' });
      if (req.method === 'POST' && req.url === '/pair') {
        let j = {}; try { j = JSON.parse(body); } catch {}
        pairs.push(j);
        if (j.code !== code) return send(400, { detail: 'invalid or expired code' });
        return send(201, { client_id: 'c' + (++n), name: body.name, client_key: `${keyPrefix}-${n}`, gateway: { name, version: '2.0.0' } });
      }
      send(404, {});
    });
  });
  const wss = new WebSocketServer({ server: srv, path: '/ws/stream' });
  wss.on('connection', ws => ws.once('message', d => {
    let h = {}; try { h = JSON.parse(d.toString()); } catch {}
    if (typeof h.client_key !== 'string' || !h.client_key.startsWith(keyPrefix)) return ws.close(1008, 'Clave de cliente invalida o inactiva.');
    ws.send(JSON.stringify({ type: 'ready', session_id: 's', agent: h.agent || 'main' }));
  }));
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = /** @type {any} */ (srv.address()).port;
  return {
    port, host: `127.0.0.1:${port}`, url: `ws://127.0.0.1:${port}/ws/stream`, pairs, key: `${keyPrefix}-0`,
    stop: () => { for (const c of wss.clients) c.terminate(); return new Promise(r => srv.close(r)); },
  };
}

module.exports = { startFakeGateway };

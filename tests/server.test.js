// Integration tests for the optional self-hosted server: pairing, relay and media.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

const open = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  ws.once('open', () => resolve(ws)); ws.once('error', reject);
});
const next = (ws, type) => new Promise((resolve) => {
  ws.on('message', function onMsg(raw) {
    const m = JSON.parse(raw);
    if (m.t === type) { ws.off('message', onMsg); resolve(m); }
  });
});

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/info`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => server && server.kill());

test('serves the app pages', async () => {
  for (const p of ['/', '/tv', '/phone', '/demo']) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
    assert.match(await r.text(), /PocketDesk/);
  }
  const info = await (await fetch(`${BASE}/api/info`)).json();
  assert.equal(info.app, 'pocketdesk');
});

test('pairs a phone with a TV and relays input both ways', async () => {
  const tv = await open();
  const hosted = next(tv, 'hosted');
  tv.send(JSON.stringify({ t: 'host' }));
  const { code } = await hosted;
  assert.match(code, /^\d{6}$/);

  const phone = await open();
  const joined = next(phone, 'joined');
  const peer = next(tv, 'peer');
  phone.send(JSON.stringify({ t: 'join', code, device: { name: 'Test phone' } }));
  const j = await joined;
  assert.equal(j.code, code);
  assert.equal((await peer).device.name, 'Test phone');

  const move = next(tv, 'move');
  phone.send(JSON.stringify({ t: 'move', dx: 3, dy: -2 }));
  assert.deepEqual(await move, { t: 'move', dx: 3, dy: -2 });

  const info = next(phone, 'tv-info');
  tv.send(JSON.stringify({ t: 'tv-info', name: 'Den TV' }));
  assert.equal((await info).name, 'Den TV');

  // media upload is authorised by the phone's token and supports Range requests
  const body = Buffer.from('0123456789');
  const denied = await fetch(`${BASE}/api/upload/${code}`, { method: 'POST', body });
  assert.equal(denied.status, 403);
  const up = await fetch(`${BASE}/api/upload/${code}`, { method: 'POST', body, headers: { 'X-Token': j.token, 'Content-Type': 'text/plain' } });
  const { url } = await up.json();
  const part = await fetch(BASE + url, { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), '2345');

  const left = next(tv, 'peer-left');
  phone.close();
  await left;
  tv.close();
});

test('rejects an unknown pairing code', async () => {
  const phone = await open();
  const err = next(phone, 'error');
  phone.send(JSON.stringify({ t: 'join', code: '000000' }));
  assert.match((await err).msg, /No TV/);
  phone.close();
});

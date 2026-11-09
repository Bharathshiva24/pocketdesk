// PocketDesk self-hosted server (optional).
//
// The static site in /public works on its own (phone ⇄ TV over WebRTC). This
// server is for LAN / offline setups: it serves /public, pairs devices by a
// 6-digit code, relays input over WebSocket and hosts media the phone casts to
// the TV (with HTTP Range support so videos can seek).
const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const MEDIA_LIMIT = 1024 * 1024 * 1024; // 1 GB kept in memory per session
const SESSION_TTL = 10 * 60 * 1000;     // keep a session 10 min after the TV leaves

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

/** code -> { tv, phone, media: Map<id,{type,name,buf}>, mediaBytes, expires } */
const sessions = new Map();

function newCode() {
  let code;
  do { code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); } while (sessions.has(code));
  return code;
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
    }
  }
  return out;
}

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.get('/api/info', (req, res) => res.json({ app: 'pocketdesk', urls: lanUrls(), port: PORT }));

app.post('/api/upload/:code', express.raw({ type: () => true, limit: '500mb' }), (req, res) => {
  const s = sessions.get(req.params.code);
  if (!s || req.get('x-token') !== s.phoneToken) return res.status(403).json({ error: 'Not paired' });
  const id = crypto.randomUUID();
  const item = { type: req.get('content-type') || 'application/octet-stream',
    name: decodeURIComponent(req.get('x-file-name') || 'file'), buf: req.body };
  s.media.set(id, item);
  s.mediaBytes += item.buf.length;
  // Evict oldest items when over budget.
  for (const [oldId, old] of s.media) {
    if (s.mediaBytes <= MEDIA_LIMIT || oldId === id) break;
    s.media.delete(oldId); s.mediaBytes -= old.buf.length;
  }
  res.json({ url: `/api/media/${req.params.code}/${id}` });
});

app.get('/api/media/:code/:id', (req, res) => {
  const item = sessions.get(req.params.code)?.media.get(req.params.id);
  if (!item) return res.status(404).end();
  const total = item.buf.length;
  res.set({ 'Content-Type': item.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!m) return res.set('Content-Length', total).end(item.buf);
  let start = m[1] === '' ? total - Number(m[2]) : Number(m[1]);
  let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : total - 1;
  if (start >= total || start < 0 || end < start) return res.status(416).set('Content-Range', `bytes */${total}`).end();
  end = Math.min(end, total - 1);
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 })
    .end(item.buf.subarray(start, end + 1));
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'host') {
      // TV registers (or resumes) a session.
      let code = msg.resume && sessions.has(msg.resume) ? msg.resume : newCode();
      let s = sessions.get(code);
      if (!s) { s = { media: new Map(), mediaBytes: 0 }; sessions.set(code, s); }
      if (s.tv && s.tv !== ws) s.tv.close(4000, 'Replaced');
      s.tv = ws; s.expires = null;
      ws.role = 'tv'; ws.code = code;
      send(ws, { t: 'hosted', code });
      if (s.phone) send(ws, { t: 'peer', device: s.phone.device });
      return;
    }

    if (msg.t === 'join') {
      const code = String(msg.code || '').replace(/\D/g, '');
      const s = sessions.get(code);
      if (!s || !s.tv) return send(ws, { t: 'error', msg: 'No TV found with that code' });
      if (s.phone && s.phone !== ws) { send(s.phone, { t: 'kicked' }); s.phone.close(4001, 'Replaced'); }
      s.phone = ws; s.phoneToken = crypto.randomUUID();
      ws.role = 'phone'; ws.code = code; ws.device = msg.device || {};
      send(ws, { t: 'joined', code, token: s.phoneToken });
      send(s.tv, { t: 'peer', device: ws.device });
      return;
    }

    // Everything else is relayed to the paired peer.
    const s = sessions.get(ws.code);
    if (!s) return;
    if (ws.role === 'phone' && s.phone === ws) send(s.tv, msg);
    else if (ws.role === 'tv' && s.tv === ws) {
      if (msg.t === 'kick' && s.phone) { send(s.phone, { t: 'kicked' }); s.phone.close(4001, 'Disconnected by TV'); return; }
      send(s.phone, msg);
    }
  });

  ws.on('close', () => {
    const s = sessions.get(ws.code);
    if (!s) return;
    if (ws.role === 'phone' && s.phone === ws) { s.phone = null; send(s.tv, { t: 'peer-left' }); }
    if (ws.role === 'tv' && s.tv === ws) { s.tv = null; s.expires = Date.now() + SESSION_TTL; send(s.phone, { t: 'tv-left' }); }
  });
});

// Keepalive + expire abandoned sessions.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
  for (const [code, s] of sessions) {
    if (s.expires && s.expires < Date.now()) {
      send(s.phone, { t: 'tv-left' });
      sessions.delete(code);
    }
  }
}, 20000);

server.listen(PORT, () => {
  console.log('\n  PocketDesk is running.\n');
  console.log(`  On the TV, open:     ${lanUrls()[0] || `http://localhost:${PORT}`}/tv`);
  console.log(`  On the phone, open:  ${lanUrls()[0] || `http://localhost:${PORT}`}/phone`);
  console.log('  (or just scan the QR code shown on the TV)\n');
});

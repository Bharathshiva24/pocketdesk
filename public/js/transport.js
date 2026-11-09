// Transports carry PocketDesk messages between the TV desktop and the phone.
//
//   WSTransport   – talks to the optional Node server (LAN / self-hosted).
//   PeerTransport – serverless: phone ⇄ TV over WebRTC (PeerJS for signalling).
//                   This is what the static Vercel deployment uses.
//   NativeTransport – inside the PocketDesk Android/iOS app: the phone drives
//                   a TV or monitor plugged in over HDMI / USB-C. Fully offline;
//                   the native shell relays messages between its two WebViews.
//   LocalBus      – two in-page endpoints, used by the side-by-side demo.
//
// All three expose the same tiny API: connect(), send(msg), onMessage(fn),
// onStatus(fn), close(), upload(file, onProgress) → url.
(function (global) {
  'use strict';

  class Emitter {
    constructor() { this._msg = new Set(); this._status = new Set(); this.status = 'idle'; }
    onMessage(fn) { this._msg.add(fn); return () => this._msg.delete(fn); }
    onStatus(fn) { this._status.add(fn); fn(this.status); return () => this._status.delete(fn); }
    _emit(msg) { for (const fn of this._msg) { try { fn(msg); } catch (e) { console.error(e); } } }
    _setStatus(s) { if (this.status === s) return; this.status = s; for (const fn of this._status) fn(s); }
  }

  const randomCode = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  const MOTION = new Set(['move', 'scroll']);

  // ------------------------------------------------------------------ WebSocket
  class WSTransport extends Emitter {
    constructor(url) {
      super();
      this.kind = 'server';
      this.url = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      this.queue = []; this.retry = 0; this.closed = false;
      this.code = null; this.token = null;
    }
    connect() {
      this.closed = false;
      this._setStatus('connecting');
      const ws = this.ws = new WebSocket(this.url);
      ws.onopen = () => {
        this.retry = 0; this._setStatus('open');
        const q = this.queue; this.queue = [];
        q.forEach((m) => this.send(m));
      };
      ws.onmessage = (e) => { try { this._emit(JSON.parse(e.data)); } catch { /* ignore */ } };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this._setStatus('closed');
        if (this.closed) return;
        const delay = Math.min(8000, 500 * 2 ** this.retry++);
        setTimeout(() => !this.closed && this.connect(), delay);
      };
      ws.onerror = () => ws.close();
    }
    send(msg) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
      else if (!MOTION.has(msg.t)) this.queue.push(msg);
    }
    close() { this.closed = true; if (this.ws) this.ws.close(); }
    upload(file, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/upload/${this.code}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name || 'file'));
        xhr.setRequestHeader('X-Token', this.token || '');
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status === 200 ? resolve(JSON.parse(xhr.responseText).url) : reject(new Error('Upload failed')));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });
    }
  }

  // ------------------------------------------------------------------ WebRTC (PeerJS)
  const PREFIX = 'pocketdesk-v1-';
  const NET_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected']);
  const CHUNK = 64 * 1024;

  class PeerTransport extends Emitter {
    constructor(role) {
      super();
      this.kind = 'p2p';
      this.role = role; // 'tv' | 'phone'
      this.code = null; this.wantCode = null;
      this.conn = null; this.files = new Map();
      this.closed = false; this.retry = 0;
    }
    connect() {
      this.closed = false;
      if (typeof global.Peer !== 'function') { this._setStatus('closed'); console.error('PeerJS not loaded'); return; }
      if (this.peer && !this.peer.destroyed) { if (this.peer.disconnected) this.peer.reconnect(); return; }
      this._setStatus('connecting');
      if (this.role === 'tv') this._host(this.wantCode || randomCode());
      else this._guest();
    }
    _retryLater(fn) {
      if (this.closed) return;
      const delay = Math.min(10000, 800 * 2 ** this.retry++);
      setTimeout(() => !this.closed && fn(), delay);
    }

    // --- TV side: register a peer id derived from the pairing code
    _host(code) {
      const peer = this.peer = new global.Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => {
        this.retry = 0; this.code = code; this._setStatus('open');
        this._emit({ t: 'hosted', code });
      });
      peer.on('connection', (conn) => this._accept(conn));
      peer.on('disconnected', () => { this._setStatus('closed'); if (!peer.destroyed) this._retryLater(() => peer.reconnect()); });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') { peer.destroy(); this._host(randomCode()); return; }
        if (NET_ERRORS.has(err.type)) {
          this._setStatus('closed');
          this._retryLater(() => { if (peer.destroyed) this._host(code); else peer.reconnect(); });
        }
      });
    }
    _accept(conn) {
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object') return;
        if (d.t === 'join') {
          if (this.conn && this.conn !== conn) { try { this.conn.send({ t: 'kicked' }); } catch { /* gone */ } const old = this.conn; setTimeout(() => old.close(), 200); }
          this.conn = conn;
          conn.send({ t: 'joined', code: this.code, token: '' });
          this._emit({ t: 'peer', device: d.device || {} });
          return;
        }
        if (conn !== this.conn) return;
        if (d.t === 'file-start') { this.files.set(d.id, { meta: d, parts: [] }); return; }
        if (d.t === 'file-chunk') { const f = this.files.get(d.id); if (f) f.parts.push(new Uint8Array(d.data)); return; }
        if (d.t === 'file-end') {
          const f = this.files.get(d.id); if (!f) return;
          const url = URL.createObjectURL(new Blob(f.parts, { type: f.meta.type || 'application/octet-stream' }));
          this.files.set(d.id, { url });
          return;
        }
        if (d.t === 'cast' && d.item && typeof d.item.url === 'string' && d.item.url.startsWith('p2p:')) {
          const f = this.files.get(d.item.url.slice(4)); if (!f || !f.url) return;
          d.item.url = f.url;
        }
        this._emit(d);
      });
      const gone = () => { if (this.conn === conn) { this.conn = null; this._emit({ t: 'peer-left' }); } };
      conn.on('close', gone); conn.on('error', gone);
    }

    // --- Phone side: anonymous peer that dials the TV
    _guest() {
      const peer = this.peer = new global.Peer({ debug: 0 });
      peer.on('open', () => { this.retry = 0; this._setStatus('open'); if (this.pendingJoin) this._join(this.pendingJoin); });
      peer.on('disconnected', () => { if (!peer.destroyed) this._retryLater(() => peer.reconnect()); });
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          if (this.rejoining) { this._retryLater(() => this._join(this.joinMsg)); return; }
          this._emit({ t: 'error', msg: 'No TV found with that code. Check the code shown on your TV.' });
          return;
        }
        if (NET_ERRORS.has(err.type)) { this._setStatus('closed'); this._retryLater(() => { if (peer.destroyed) this._guest(); else peer.reconnect(); }); }
      });
    }
    _join(msg) {
      this.joinMsg = msg; this.code = msg.code;
      if (!this.peer || !this.peer.open) { this.pendingJoin = msg; return; }
      this.pendingJoin = null;
      if (this.conn) { const old = this.conn; this.conn = null; old.close(); }
      const conn = this.conn = this.peer.connect(PREFIX + msg.code, { reliable: true });
      const timer = setTimeout(() => {
        if (!conn.open && this.conn === conn && !this.rejoining) this._emit({ t: 'error', msg: 'Could not reach the TV. Make sure it is showing this code.' });
      }, 15000);
      conn.on('open', () => { clearTimeout(timer); this.rejoining = false; this.retry = 0; conn.send(msg); });
      conn.on('data', (d) => this._emit(d));
      conn.on('close', () => {
        if (this.conn !== conn) return;
        this.conn = null; this._emit({ t: 'tv-left' });
        if (!this.closed && this.joinMsg) { this.rejoining = true; this._retryLater(() => this._join(this.joinMsg)); }
      });
    }

    send(msg) {
      if (msg.t === 'host') { if (this.code) this._emit({ t: 'hosted', code: this.code }); return; }
      if (msg.t === 'join') { this.rejoining = false; this._join(msg); return; }
      const c = this.conn;
      if (msg.t === 'kick' && c) { try { c.send({ t: 'kicked' }); } catch { /* gone */ } setTimeout(() => c.close(), 200); return; }
      if (c && c.open) { try { c.send(msg); } catch (e) { console.warn(e); } }
    }
    close() {
      this.closed = true; this.joinMsg = null; this.rejoining = false;
      if (this.conn) { const c = this.conn; this.conn = null; c.close(); }
    }
    async upload(file, onProgress) {
      const conn = this.conn;
      if (!conn || !conn.open) throw new Error('Not connected');
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      conn.send({ t: 'file-start', id, name: file.name, type: file.type, size: file.size });
      for (let off = 0; off < file.size; off += CHUNK) {
        const data = await file.slice(off, off + CHUNK).arrayBuffer();
        const dc = conn.dataChannel;
        while (dc && dc.bufferedAmount > 2 * 1024 * 1024) await new Promise((r) => setTimeout(r, 25));
        conn.send({ t: 'file-chunk', id, data });
        if (onProgress) onProgress(Math.min(1, (off + CHUNK) / file.size));
      }
      conn.send({ t: 'file-end', id });
      return 'p2p:' + id;
    }
  }

  // ------------------------------------------------------------------ Native shell (wired display)
  const hasNative = () => !!(global.PocketDeskNative || (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.pocketdesk));
  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  class NativeTransport extends Emitter {
    constructor(role) {
      super();
      this.kind = 'native'; this.role = role;
      // The native shell calls PocketDeskBridge.receive(json) to deliver messages.
      global.PocketDeskBridge = { receive: (json) => { try { this._emit(typeof json === 'string' ? JSON.parse(json) : json); } catch (e) { console.error(e); } } };
    }
    _post(type, payload = {}) {
      const body = JSON.stringify({ type, role: this.role, ...payload });
      if (global.PocketDeskNative) global.PocketDeskNative.post(body);
      else global.webkit.messageHandlers.pocketdesk.postMessage(body);
    }
    connect() { this._setStatus('open'); this._post('ready'); }
    send(msg) { this._post('msg', { msg }); }
    close() {}
    /** Streams the file to the app's local media folder; the TV page loads it from there. */
    async upload(file, onProgress) {
      const ext = ((file.name || '').match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
      const name = Math.random().toString(36).slice(2) + Date.now().toString(36) + ext;
      const CH = 384 * 1024;
      this._post('file-start', { name });
      for (let off = 0; off < file.size; off += CH) {
        this._post('file-chunk', { name, data: await toBase64(file.slice(off, off + CH)) });
        if (onProgress) onProgress(Math.min(1, (off + CH) / file.size));
      }
      this._post('file-end', { name });
      return 'media/' + name;
    }
  }

  // ------------------------------------------------------------------ In-page (demo)
  class LocalEnd extends Emitter {
    constructor() { super(); this.peer = null; this.kind = 'local'; }
    connect() { this._setStatus('open'); }
    send(msg) { const p = this.peer; const copy = JSON.parse(JSON.stringify(msg)); setTimeout(() => p._emit(copy), 0); }
    close() {}
    upload(file, onProgress) { if (onProgress) onProgress(1); return Promise.resolve(URL.createObjectURL(file)); }
  }
  const LocalBus = { pair() { const a = new LocalEnd(), b = new LocalEnd(); a.peer = b; b.peer = a; return [a, b]; } };

  /**
   * Pick the right transport: the Node server when it is present (self-hosted),
   * otherwise serverless WebRTC. Override with ?mode=server or ?mode=p2p.
   */
  async function createTransport(role) {
    if (hasNative()) return new NativeTransport(role);
    const mode = new URLSearchParams(location.search).get('mode');
    if (mode === 'p2p') return new PeerTransport(role);
    if (mode === 'server') return new WSTransport();
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (r.ok && (await r.json()).app === 'pocketdesk') return new WSTransport();
    } catch { /* static hosting */ }
    return new PeerTransport(role);
  }

  global.PocketDeskTransport = { WSTransport, PeerTransport, NativeTransport, LocalBus, createTransport, hasNative };
})(window);

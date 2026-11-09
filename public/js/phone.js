// PocketDesk phone — touchpad, keyboard, app launcher, casting and media remote.
// Runs in any mobile browser (Android Chrome, iOS Safari); no install needed.
(function (global) {
  'use strict';
  const I = global.PocketDeskIcons;
  const CATALOG = global.PocketDeskApps;
  const SENTINEL = '​'; // keeps Backspace firing input events on an empty field

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  const ic = (n) => h('span', { class: 'ic', html: I[n] || '' });
  const badge = (status, label) => h('span', { class: `badge badge-${status}` }, h('span', { class: 'badge-dot' }), label);
  const btn = (variant, label, onclick, icon, extra = '') => h('button', { class: `btn btn-${variant} ${extra}`, onclick, type: 'button' }, icon ? ic(icon) : null, label ? h('span', {}, label) : null);
  const buzz = (ms = 8) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ } };
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtSize = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pocketdesk.phone.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem('pocketdesk.phone.' + k); else localStorage.setItem('pocketdesk.phone.' + k, JSON.stringify(v)); } catch { /* unavailable */ } },
  };

  function deviceInfo() {
    const ua = navigator.userAgent;
    let name = 'Phone', os = '';
    if (/iPhone/.test(ua)) { name = 'iPhone'; os = 'iOS'; }
    else if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) { name = 'iPad'; os = 'iPadOS'; }
    else if (/Android/.test(ua)) {
      os = 'Android';
      const m = /Android [\d.]+; ([^;)]+)/.exec(ua);
      name = m && !/^(K|wv)$/.test(m[1].trim()) ? m[1].replace(/Build.*$/, '').trim() : 'Android phone';
    }
    const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Browser';
    return { name, os: [os, browser].filter(Boolean).join(' · ') };
  }

  const TABS = [
    ['pad', 'Trackpad', 'touchpad', 'Trackpad', null],
    ['kbd', 'Keyboard', 'keyboard', 'Keyboard', 'Text appears in the focused field on your TV.'],
    ['apps', 'Apps', 'grid', 'Apps', 'Open anything on the TV.'],
    ['cast', 'Cast', 'cast', 'Cast', 'Send photos, videos and music to the TV.'],
    ['media', 'Media', 'music', 'Now Playing', null],
  ];

  class PhoneRemote {
    constructor(mount, transport, opts = {}) {
      this.mount = mount; this.tr = transport; this.local = !!opts.local;
      this.code = null; this.paired = false; this.tab = 'pad'; this.tvName = 'Your TV';
      this.device = deviceInfo(); this.localMedia = new Map(); this.state = {};
      mount.classList.add('pd-phone');
      this.buildPair(); this.buildMain();
      this.bindTransport(); this.trackBattery();
      setInterval(() => { if (this.paired && this.tr.status === 'open') this.send({ t: 'ping', ts: performance.now() }); }, 5000);
    }
    send(m) { this.tr.send(m); }

    // ============================================================ pairing
    buildPair() {
      this.codeInput = h('input', { class: 'otp-input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', 'aria-label': 'Pairing code', enterkeyhint: 'go' });
      this.otpSlots = Array.from({ length: 6 }, () => h('span', { class: 'otp-slot' }));
      const otp = h('label', { class: 'otp' }, h('span', { class: 'otp-g' }, this.otpSlots.slice(0, 3)), h('span', { class: 'otp-dash' }), h('span', { class: 'otp-g' }, this.otpSlots.slice(3)), this.codeInput);
      this.pairErr = h('div', { class: 'field-err' });
      this.pairBtn = btn('brand', 'Connect', () => this.join(this.codeInput.value), null, 'btn-lg btn-block');
      this.recentEl = h('div', {});
      const syncOtp = () => {
        const v = this.codeInput.value;
        this.otpSlots.forEach((s, i) => { s.textContent = v[i] || ''; s.classList.toggle('active', document.activeElement === this.codeInput && i === Math.min(v.length, 5)); });
      };
      this.codeInput.addEventListener('input', () => {
        this.codeInput.value = this.codeInput.value.replace(/\D/g, '').slice(0, 6);
        this.pairErr.textContent = ''; syncOtp();
        if (this.codeInput.value.length === 6) this.join(this.codeInput.value);
      });
      this.codeInput.addEventListener('focus', syncOtp); this.codeInput.addEventListener('blur', syncOtp);
      this.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(this.codeInput.value); });
      this.syncOtp = syncOtp;
      this.pairEl = h('div', { class: 'screen pp scroll' },
        h('span', { class: 'logo xl brand-mark', html: I.logo }),
        h('div', {}, h('h1', { class: 'title-xl' }, 'Connect to your TV'), h('p', { class: 'muted lead' }, 'Open PocketDesk on your TV, then pick it below or enter the 6‑digit code.')),
        this.recentEl,
        h('div', { class: 'field' }, h('span', { class: 'field-l' }, 'Pairing code'), otp, this.pairErr, h('span', { class: 'field-h' }, 'Shown on the TV’s pairing screen.')),
        this.pairBtn,
        btn('outline', 'Scan QR code', () => this.scanQr(), 'scan', 'btn-lg btn-block'),
        h('p', { class: 'muted small center' }, 'Your phone and TV only need an internet connection. Same Wi‑Fi gives the lowest latency.'));
      this.mount.append(this.pairEl);
      this.renderRecent();
    }
    renderRecent() {
      const recent = store.get('recent', []);
      this.recentEl.innerHTML = '';
      if (!recent.length) return;
      this.recentEl.append(h('div', { class: 'card list-card' }, h('div', { class: 'card-label' }, 'Recent TVs'),
        recent.slice(0, 3).map((r) => h('button', { class: 'row', onclick: () => { this.codeInput.value = r.code; this.syncOtp(); this.join(r.code); } },
          h('span', { class: 'icon-box brand' }, ic('tv')),
          h('span', { class: 'list-main' }, h('span', { class: 'list-t' }, r.name || 'TV'), h('span', { class: 'list-s' }, `Code ${r.code.slice(0, 3)} ${r.code.slice(3)}`)),
          badge('neutral', 'Recent')))));
    }
    join(code) {
      code = String(code || '').replace(/\D/g, '');
      if (code.length !== 6) { this.pairErr.textContent = 'Enter all 6 digits.'; return; }
      this.code = code; this.pairBtn.disabled = true; this.pairBtn.lastChild.textContent = 'Connecting…';
      this.codeInput.blur();
      if (this.tr.status === 'open' || this.tr.kind === 'p2p') this.send({ t: 'join', code, device: this.device });
      if (this.tr.status !== 'open') this.tr.connect();
    }
    showPair(err) {
      this.paired = false;
      this.pairEl.hidden = false; this.mainEl.hidden = true;
      this.pairBtn.disabled = false; this.pairBtn.lastChild.textContent = 'Connect';
      this.pairErr.textContent = err || '';
      this.renderRecent();
    }
    async scanQr() {
      if (!('BarcodeDetector' in global) || !navigator.mediaDevices?.getUserMedia) {
        this.pairErr.textContent = 'Open your camera app and point it at the QR code on the TV — it opens this page already paired.';
        return;
      }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch { this.pairErr.textContent = 'Camera permission was denied.'; return; }
      const video = h('video', { autoplay: true, playsinline: true, muted: true });
      video.srcObject = stream;
      const stop = () => { stream.getTracks().forEach((t) => t.stop()); sheet.remove(); };
      const sheet = h('div', { class: 'scanner' }, video, h('div', { class: 'scan-frame' }), btn('outline', 'Cancel', stop, 'x', 'scan-cancel'));
      this.mount.append(sheet);
      const det = new global.BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!sheet.isConnected) return;
        try {
          const codes = await det.detect(video);
          const raw = codes[0]?.rawValue;
          const m = raw && /[?&]code=(\d{6})/.exec(raw);
          if (m) { buzz(30); stop(); this.codeInput.value = m[1]; this.syncOtp(); this.join(m[1]); return; }
        } catch { /* frame not ready */ }
        requestAnimationFrame(loop);
      };
      video.addEventListener('playing', loop, { once: true });
    }

    // ============================================================ main shell
    buildMain() {
      this.tvNameEl = h('span', { class: 'list-t' }, this.tvName);
      this.tvSubEl = h('span', { class: 'list-s' }, 'Connecting…');
      this.titleEl = h('h1', { class: 'title' });
      this.titleBadge = h('span', {});
      this.descEl = h('p', { class: 'muted' });
      this.views = {}; this.tabBtns = {};
      const header = h('header', { class: 'head' },
        h('button', { class: 'device-select', onclick: () => this.disconnect(true), type: 'button', 'aria-label': 'Switch TV' },
          h('span', { class: 'logo sm' }, ic('tv')), h('span', { class: 'list-main' }, this.tvNameEl, this.tvSubEl), ic('chevronsUpDown')),
        this.local ? null : btn('outline', null, () => this.disconnect(), 'power', 'btn-icon'));
      const nav = h('nav', { class: 'bottom-nav' }, TABS.map(([id, label, icon]) => (this.tabBtns[id] = h('button', { class: 'bn-item', onclick: () => this.show(id), type: 'button' }, ic(icon), h('span', {}, label), h('span', { class: 'bn-ind' })))));
      this.viewWrap = h('main', { class: 'views' });
      this.mainEl = h('div', { class: 'screen pm' }, h('div', { class: 'pm-top' }, header, h('div', { class: 'title-row' }, this.titleEl, this.titleBadge), this.descEl), this.viewWrap, nav);
      this.mainEl.hidden = true;
      this.mount.append(this.mainEl);
      this.views.pad = this.buildPad(); this.views.kbd = this.buildKbd(); this.views.apps = this.buildApps(); this.views.cast = this.buildCast(); this.views.media = this.buildMedia();
      Object.values(this.views).forEach((v) => this.viewWrap.append(v));
      this.show('pad');
    }
    show(id) {
      this.tab = id;
      const t = TABS.find((x) => x[0] === id);
      this.titleEl.textContent = t[3]; this.descEl.textContent = t[4] || ''; this.descEl.hidden = !t[4];
      this.titleBadge.replaceChildren(id === 'pad' ? badge('active', 'Live') : []);
      for (const [k, v] of Object.entries(this.views)) v.hidden = k !== id;
      for (const [k, b] of Object.entries(this.tabBtns)) b.classList.toggle('on', k === id);
      if (id === 'kbd') setTimeout(() => this.kbdField.focus(), 60);
      else if (document.activeElement === this.kbdField) this.kbdField.blur();
    }

    // ---------- trackpad
    buildPad() {
      const touch = h('span', { class: 'touch' });
      const pad = h('div', { class: 'pad card' }, touch,
        h('div', { class: 'gestures' }, [['Tap', 'Click'], ['Two-finger tap', 'Right-click'], ['Two-finger drag', 'Scroll'], ['Hold, then move', 'Drag']].map(([a, b]) => h('div', {}, h('kbd', {}, a), h('span', {}, b)))));
      const strip = h('div', { class: 'strip card', 'aria-label': 'Scroll' }, h('i', {}), h('i', {}), h('i', {}));
      let acc = { dx: 0, dy: 0, sy: 0 }, raf = 0;
      const flush = () => {
        raf = 0;
        if (acc.dx || acc.dy) this.send({ t: 'move', dx: Math.round(acc.dx * 10) / 10, dy: Math.round(acc.dy * 10) / 10 });
        if (acc.sy) this.send({ t: 'scroll', dy: Math.round(acc.sy) });
        acc = { dx: 0, dy: 0, sy: 0 };
      };
      const queue = () => { if (!raf) raf = requestAnimationFrame(flush); };
      const pts = new Map(); let g = null;
      const showTouch = (e) => { const r = pad.getBoundingClientRect(); touch.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`; };
      pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
        pad.classList.add('touching'); showTouch(e);
        if (pts.size === 1) {
          g = { start: performance.now(), multi: false, moved: false, dragging: false };
          g.holdT = setTimeout(() => { if (g && !g.moved && !g.multi) { g.dragging = true; buzz(20); pad.classList.add('dragging'); this.send({ t: 'down', button: 0 }); } }, 380);
        } else if (g) { g.multi = true; clearTimeout(g.holdT); }
      });
      pad.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId); if (!p || !g) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY; showTouch(e);
        if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) { g.moved = true; if (!g.dragging) clearTimeout(g.holdT); }
        if (g.multi) acc.sy += (-dy * 2.4) / pts.size;
        else { const f = 1 + Math.min(Math.hypot(dx, dy), 40) / 10; acc.dx += dx * f; acc.dy += dy * f; }
        queue();
      });
      const end = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size || !g) return;
        pad.classList.remove('touching', 'dragging'); clearTimeout(g.holdT);
        const dur = performance.now() - g.start;
        if (g.dragging) this.send({ t: 'up', button: 0 });
        else if (g.multi && !g.moved && dur < 350) { buzz(12); this.send({ t: 'click', button: 2 }); }
        else if (!g.multi && !g.moved && dur < 300 && e.type === 'pointerup') { buzz(6); this.send({ t: 'click', button: 0 }); }
        g = null;
      };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      pad.addEventListener('contextmenu', (e) => e.preventDefault());
      let sp = null;
      strip.addEventListener('pointerdown', (e) => { e.preventDefault(); try { strip.setPointerCapture(e.pointerId); } catch { /* synthetic */ } sp = e.clientY; strip.classList.add('on'); });
      strip.addEventListener('pointermove', (e) => { if (sp == null) return; acc.sy += -(e.clientY - sp) * 3; sp = e.clientY; queue(); });
      const sEnd = () => { sp = null; strip.classList.remove('on'); };
      strip.addEventListener('pointerup', sEnd); strip.addEventListener('pointercancel', sEnd);
      const left = btn('outline', 'Left click', null, null, 'btn-lg');
      left.addEventListener('pointerdown', (e) => { e.preventDefault(); buzz(6); left.classList.add('on'); this.send({ t: 'down', button: 0 }); });
      const lUp = () => { if (left.classList.contains('on')) { left.classList.remove('on'); this.send({ t: 'up', button: 0 }); } };
      left.addEventListener('pointerup', lUp); left.addEventListener('pointerleave', lUp); left.addEventListener('pointercancel', lUp);
      const right = btn('outline', 'Right click', () => { buzz(10); this.send({ t: 'click', button: 2 }); }, null, 'btn-lg');
      return h('section', { class: 'view v-pad' }, h('div', { class: 'pad-row' }, pad, strip), h('div', { class: 'grid-2' }, left, right));
    }

    // ---------- keyboard
    buildKbd() {
      this.kbdTarget = h('span', {}, badge('neutral', 'Click a text field on the TV'));
      const f = this.kbdField = h('textarea', { class: 'textarea', rows: '4', autocapitalize: 'sentences', autocomplete: 'off', spellcheck: 'true', placeholder: 'Type here — it appears on the TV', enterkeyhint: 'enter' });
      let prev = SENTINEL; f.value = SENTINEL;
      const reset = () => { f.value = SENTINEL; prev = SENTINEL; };
      f.addEventListener('input', () => {
        const cur = f.value;
        let i = 0; while (i < prev.length && i < cur.length && prev[i] === cur[i]) i++;
        const del = prev.length - i, ins = cur.slice(i).replace(SENTINEL, '');
        for (let k = 0; k < del; k++) this.send({ t: 'key', key: 'Backspace' });
        if (ins) { const parts = ins.split('\n'); parts.forEach((p, idx) => { if (p) this.send({ t: 'text', text: p }); if (idx < parts.length - 1) this.send({ t: 'key', key: 'Enter' }); }); }
        prev = cur;
        if (!cur.startsWith(SENTINEL) || cur.length > 160 || ins.includes('\n')) reset();
      });
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.send({ t: 'key', key: 'Enter' }); reset(); }
        else if (e.key === 'Tab') { e.preventDefault(); this.send({ t: 'key', key: 'Tab' }); }
        else if (e.key === 'Escape') this.send({ t: 'key', key: 'Escape' });
        else if (e.key.startsWith('Arrow') && f.value === SENTINEL) { e.preventDefault(); this.send({ t: 'key', key: e.key }); }
      });
      const key = (label, k, cls = 'btn-outline', icon) => { const b = h('button', { class: `btn ${cls} btn-lg`, type: 'button', onpointerdown: (e) => e.preventDefault(), onclick: () => { buzz(5); this.send({ t: 'key', key: k }); } }, icon ? ic(icon) : null, label ? h('span', {}, label) : null); return b; };
      return h('section', { class: 'view v-kbd' },
        h('div', { class: 'inline' }, h('span', { class: 'muted small' }, 'Typing into'), this.kbdTarget),
        f,
        h('div', { class: 'grid-3' }, key('Esc', 'Escape'), key('Tab', 'Tab'), key('←', 'ArrowLeft'), key('↑', 'ArrowUp'), key('↓', 'ArrowDown'), key('→', 'ArrowRight')),
        h('div', { class: 'grid-2' }, key('Delete', 'Backspace', 'btn-outline', 'del'), key('Return', 'Enter', 'btn-primary', 'enter')),
        h('p', { class: 'muted small' }, 'Your phone’s keyboard, autocorrect included.'));
    }

    // ---------- apps
    buildApps() {
      const ids = ['gallery', 'player', 'music', 'notes', 'web', 'calc', 'settings', 'launcher'];
      const acts = [['tile', 'tile', 'Tile windows', 'Arrange everything side by side'], ['desktop', 'monitor', 'Show desktop', 'Minimise all windows'], ['switch', 'appWindow', 'Switch window', 'Bring the next window forward'], ['center', 'crosshair', 'Find pointer', 'Centre the cursor on screen']];
      return h('section', { class: 'view v-apps' },
        h('div', { class: 'app-grid' }, ids.map((id) => h('button', { class: 'app-tile', type: 'button', onclick: () => { buzz(); this.send({ t: 'open', app: id }); } }, h('span', { class: 'tile' }, ic(CATALOG[id].icon)), h('span', {}, CATALOG[id].name)))),
        h('div', { class: 'card list-card' }, h('div', { class: 'card-label' }, 'Desktop'),
          acts.map(([a, icon, t, d]) => h('button', { class: 'row', type: 'button', onclick: () => { buzz(); this.send({ t: 'action', action: a }); } },
            h('span', { class: 'icon-box' }, ic(icon)), h('span', { class: 'list-main' }, h('span', { class: 'list-t' }, t), h('span', { class: 'list-s' }, d)), ic('chevronRight')))));
    }

    // ---------- cast
    buildCast() {
      const picker = h('input', { type: 'file', accept: 'image/*,video/*,audio/*', multiple: true, class: 'file-input' });
      picker.addEventListener('change', () => { const files = [...picker.files]; picker.value = ''; this.castFiles(files); });
      this.castList = h('div', {});
      this.castCard = h('div', { class: 'card list-card', hidden: true }, h('div', { class: 'card-label' }, 'Recent'), this.castList);
      const link = h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'Paste a link to open on TV', autocapitalize: 'off', enterkeyhint: 'go' });
      const openLink = () => { const u = link.value.trim(); if (!u) return; buzz(); this.send({ t: 'open', app: 'web', payload: { url: u } }); link.value = ''; link.blur(); };
      link.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); openLink(); } });
      return h('section', { class: 'view v-cast' },
        h('label', { class: 'dropzone' }, picker, h('span', { class: 'logo' }, ic('upload')), h('b', {}, 'Choose photos, videos or music'), h('span', { class: 'muted small' }, 'They open on the TV straight away'), h('span', { class: 'btn btn-brand btn-sm' }, 'Browse library')),
        this.castCard,
        h('div', { class: 'link-row' }, h('div', { class: 'input-wrap' }, ic('link'), link), btn('primary', 'Open', openLink, null, 'btn-lg')));
    }
    async castFiles(files) {
      this.castCard.hidden = false;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const kind = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
        const preview = URL.createObjectURL(file);
        this.localMedia.set(file.name, { url: preview, kind });
        const fill = h('span', { class: 'progress-fill' });
        const meta = h('span', { class: 'list-s' }, `Sending · 0%`);
        const st = h('span', {}, badge('info', 'Sending'));
        const thumb = kind === 'image' ? h('img', { class: 'thumb', src: preview, alt: '' }) : h('span', { class: 'thumb icon-box' }, ic(kind === 'video' ? 'tv' : 'music'));
        const row = h('div', { class: 'row' }, thumb, h('span', { class: 'list-main' }, h('span', { class: 'list-t' }, file.name || 'file'), h('span', { class: 'progress' }, fill), meta), st);
        this.castList.prepend(row);
        try {
          const url = await this.tr.upload(file, (p) => { fill.style.width = `${Math.round(p * 100)}%`; meta.textContent = `Sending · ${Math.round(p * 100)}%`; });
          row.querySelector('.progress').remove(); meta.textContent = fmtSize(file.size);
          st.replaceChildren(badge('active', 'On TV'));
          this.send({ t: 'cast', item: { url, kind, name: file.name, autoplay: i === files.length - 1 } });
        } catch { st.replaceChildren(badge('error', 'Failed')); meta.textContent = 'Could not send — try again'; }
      }
      while (this.castList.children.length > 5) this.castList.lastChild.remove();
    }

    // ---------- media
    buildMedia() {
      this.mArt = h('div', { class: 'art' });
      this.mBadge = h('span', { class: 'art-badge' });
      this.mTitle = h('div', { class: 'title-sm' }, 'Nothing playing');
      this.mSub = h('div', { class: 'muted small' }, 'Cast a photo, video or song to start.');
      this.mFill = h('span', { class: 'slider-fill' }); this.mThumb = h('span', { class: 'slider-thumb' });
      const seek = h('div', { class: 'slider', onclick: (e) => { const r = seek.getBoundingClientRect(); const v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); this.media('seekTo', v); } }, h('span', { class: 'slider-track' }, this.mFill), this.mThumb);
      this.mCur = h('span', {}, '0:00'); this.mRem = h('span', {}, '0:00');
      this.mPlay = h('button', { class: 'play-btn', type: 'button', onclick: () => this.media('toggle'), html: I.playFill, 'aria-label': 'Play or pause' });
      const ghost = (icon, a, v, label) => h('button', { class: 'btn btn-ghost btn-icon btn-lg', type: 'button', onclick: () => this.media(a, v), 'aria-label': label }, ic(icon));
      const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '1', class: 'range', 'aria-label': 'Volume' });
      vol.addEventListener('input', () => this.send({ t: 'media', action: 'volume', value: +vol.value }));
      this.mVol = vol;
      return h('section', { class: 'view v-media' },
        h('div', { class: 'card player' }, h('div', { class: 'art-wrap' }, this.mArt, this.mBadge), h('div', {}, this.mTitle, this.mSub),
          (this.mSeek = h('div', {}, seek, h('div', { class: 'times' }, this.mCur, this.mRem))),
          h('div', { class: 'controls' }, ghost('skipBack', 'prev', null, 'Previous'), ghost('rotateCcw', 'seek', -10, 'Back 10 seconds'), this.mPlay, ghost('rotateCw', 'seek', 10, 'Forward 10 seconds'), ghost('skipForward', 'next', null, 'Next'))),
        h('div', { class: 'card vol' }, ic('volume1'), vol, ic('volume2')),
        h('div', { class: 'grid-2' }, btn('outline', 'Full screen', () => this.media('fullscreen'), 'monitor', 'btn-lg'), btn('outline', 'Open Photos', () => this.send({ t: 'open', app: 'gallery' }), 'image', 'btn-lg')));
    }
    media(action, value) { buzz(); this.send({ t: 'media', action, value }); }
    renderMedia(s) {
      this.state = s;
      const kindLabel = { video: 'Video', image: 'Photo', audio: 'Song' }[s.kind];
      this.mTitle.textContent = s.title || 'Nothing playing';
      this.mSub.textContent = kindLabel ? `${kindLabel} · ${s.index + 1} of ${s.count}` : 'Cast a photo, video or song to start.';
      this.mPlay.innerHTML = s.playing ? I.pauseFill : I.playFill;
      const pct = s.duration ? (s.current / s.duration) * 100 : 0;
      this.mFill.style.width = `${pct}%`; this.mThumb.style.left = `${pct}%`;
      this.mCur.textContent = fmtTime(s.current); this.mRem.textContent = s.duration ? `-${fmtTime(s.duration - s.current)}` : '0:00';
      this.mSeek.hidden = s.kind === 'image' || !s.kind;
      this.mBadge.replaceChildren(s.kind ? badge('info', s.kind === 'image' ? `Showing on ${this.tvName}` : `${s.playing ? 'Playing' : 'Paused'} on ${this.tvName}`) : []);
      if (s.volume != null && document.activeElement !== this.mVol) this.mVol.value = s.volume;
      if (this.artKey !== s.title) {
        this.artKey = s.title;
        const lm = this.localMedia.get(s.title);
        this.mArt.replaceChildren(lm && lm.kind === 'image' ? h('img', { src: lm.url, alt: '' })
          : lm && lm.kind === 'video' ? h('video', { src: lm.url + '#t=1', muted: true, playsinline: true, preload: 'metadata' })
            : h('span', { class: 'art-ph' }, ic(s.kind === 'audio' ? 'music' : s.kind === 'video' ? 'tv' : 'image')));
      }
    }

    // ============================================================ transport
    bindTransport() {
      this.tr.onMessage((m) => this.handle(m));
      if (this.local) {
        this.tr.connect();
        this.paired = true; this.pairEl.hidden = true; this.mainEl.hidden = false;
        this.native = this.tr.kind === 'native';
        this.setConn(this.native ? 'Wired · HDMI / USB-C' : 'Demo link', true);
        if (this.native) { this.tvName = 'External display'; this.tvNameEl.textContent = this.tvName; this.buildDisplayHint(); }
        this.send({ t: 'peer', device: this.device });
        this.renderMedia({});
        return;
      }
      this.tr.onStatus((s) => {
        if (s === 'open' && this.code) this.send({ t: 'join', code: this.code, device: this.device });
        if (this.paired) this.setConn(s === 'open' ? 'Connected' : 'Reconnecting…', s === 'open');
      });
      const q = new URLSearchParams(location.search).get('code');
      const saved = store.get('code', null);
      const code = (q || saved || '').replace(/\D/g, '');
      if (code.length === 6) { this.codeInput.value = code; this.syncOtp(); this.code = code; this.pairBtn.disabled = true; this.pairBtn.lastChild.textContent = 'Connecting…'; }
      this.tr.connect();
      if (this.code && this.tr.kind === 'p2p') this.send({ t: 'join', code: this.code, device: this.device });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { this.wake(); if (this.tr.status !== 'open') this.tr.connect(); } });
    }
    setConn(text, ok) {
      this.tvSubEl.textContent = ok && this.rtt ? `${text} · ${this.rtt} ms` : text;
      this.mainEl.classList.toggle('offline', !ok);
    }
    handle(m) {
      switch (m.t) {
        case 'joined': {
          this.paired = true; this.tr.code = m.code; this.tr.token = m.token; store.set('code', m.code);
          this.pairEl.hidden = true; this.mainEl.hidden = false;
          this.setConn('Connected', true); this.wake(); buzz(30);
          if (this.battery != null) this.send({ t: 'device', device: { battery: this.battery, charging: this.charging } });
          this.renderMedia(this.state);
          break;
        }
        case 'tv-info': {
          this.tvName = m.name || 'Your TV'; this.tvNameEl.textContent = this.tvName;
          const recent = store.get('recent', []).filter((r) => r.code !== this.code);
          if (this.code) store.set('recent', [{ code: this.code, name: this.tvName, ts: Date.now() }, ...recent].slice(0, 3));
          break;
        }
        case 'ping': this.send({ t: 'pong', ts: m.ts }); break;
        case 'tv-ready': // the external display just came up: introduce ourselves again
          this.send({ t: 'peer', device: this.device });
          if (this.battery != null) this.send({ t: 'device', device: { battery: this.battery, charging: this.charging } });
          break;
        case 'display': // from the native shell: is a TV / monitor plugged in?
          if (this.displayHint) this.displayHint.hidden = !!m.connected;
          if (m.connected && m.name) { this.tvName = m.name; this.tvNameEl.textContent = m.name; }
          this.setConn(m.connected ? 'Wired · HDMI / USB-C' : 'No display connected', !!m.connected);
          break;
        case 'pong': this.rtt = Math.max(1, Math.round(performance.now() - m.ts)); this.setConn('Connected', true); break;
        case 'error': store.set('code', null); this.code = null; this.showPair(m.msg); break;
        case 'kicked': store.set('code', null); this.code = null; this.showPair('The TV disconnected this phone.'); break;
        case 'tv-left': this.setConn('TV offline — reconnecting…', false); break;
        case 'peer': if (this.paired) this.setConn('Connected', true); break;
        case 'media-state':
          this.renderMedia(m);
          if (m.kind === 'video' && this.lastKind !== 'video') this.show('media');
          this.lastKind = m.kind; break;
        case 'kbd-hint': this.kbdTarget.replaceChildren(badge('info', m.field)); break;
        default: break;
      }
    }
    // Wired mode (native app): guidance shown until a TV or monitor is plugged in.
    buildDisplayHint() {
      const step = (n, title, text) => h('div', { class: 'row' }, h('span', { class: 'step-n' }, String(n)), h('span', { class: 'list-main wrap' }, h('span', { class: 'list-t' }, title), h('span', { class: 'list-s' }, text)));
      this.displayHint = h('div', { class: 'screen display-hint scroll' },
        h('div', { class: 'dh-art' }, h('span', { class: 'dh-tv' }, ic('monitor')), h('span', { class: 'dh-cable' }), h('span', { class: 'dh-phone' }, ic('phone'))),
        h('div', {}, h('h1', { class: 'title-xl' }, 'Connect a TV or monitor'), h('p', { class: 'muted lead' }, 'Any screen with an HDMI input works — it doesn’t need to be a smart TV or have internet.')),
        h('div', { class: 'card list-card' },
          step(1, 'Plug in your phone', 'Use a USB‑C to HDMI cable or adapter (Lightning Digital AV Adapter on older iPhones).'),
          step(2, 'Pick the HDMI input', 'Press Input or Source on the TV remote and choose the port you used.'),
          step(3, 'Drive the desktop', 'PocketDesk appears on the big screen. This phone becomes the trackpad and keyboard.')),
        h('p', { class: 'muted small center' }, 'Wireless displays (Miracast / AirPlay) work too where your phone supports them.'));
      this.displayHint.hidden = true;
      this.mount.append(this.displayHint);
    }

    disconnect(switching) {
      store.set('code', null); this.code = null;
      this.tr.close(); this.showPair(switching ? '' : 'Disconnected.');
      setTimeout(() => this.tr.connect(), 150);
    }
    async wake() { try { if (navigator.wakeLock && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch { /* not allowed */ } }
    async trackBattery() {
      try {
        if (!navigator.getBattery) return;
        const b = await navigator.getBattery();
        const upd = () => { this.battery = Math.round(b.level * 100); this.charging = b.charging; if (this.paired) this.send({ t: 'device', device: { battery: this.battery, charging: this.charging } }); };
        b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); upd();
      } catch { /* unsupported */ }
    }
  }

  global.PocketDeskPhone = { PhoneRemote };
})(window);

// PocketDesk TV — a desktop for the big screen, driven from your phone.
// Rendered on a fixed 1920×1080 canvas and scaled to fit any TV.
// Input: the paired phone (touchpad / keyboard), a TV remote D-pad, or a real
// mouse and keyboard plugged into the TV.
(function (global) {
  'use strict';
  const I = global.PocketDeskIcons;
  const CATALOG = global.PocketDeskApps;
  const W = 1920, H = 1080, TOP = 76, DOCK = 156, GAP = 24;
  const AREA = { x: GAP, y: TOP + 16, w: W - GAP * 2, h: H - TOP - 16 - DOCK };
  const REPO_URL = 'https://github.com/Bharathshiva24/pocketdesk';
  const VERSION = '1.1.0';

  // ------------------------------------------------------------- helpers
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pocketdesk.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('pocketdesk.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
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
  const ic = (name) => h('span', { class: 'ic', html: I[name] || '' });
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
  const isEditable = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'file'].includes(el.type)));
  const initials = (name) => { const w = String(name || '?').split(/[\s’']+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };
  const badge = (status, label) => h('span', { class: `badge badge-${status}` }, h('span', { class: 'badge-dot' }), label);
  const btn = (variant, label, onclick, icon, extra = '') => h('button', { class: `btn btn-${variant} ${extra}`, onclick }, icon ? ic(icon) : null, label ? h('span', {}, label) : null);
  const iconBtn = (icon, onclick, title, extra = '') => h('button', { class: `btn btn-ghost btn-icon ${extra}`, onclick, title, 'aria-label': title }, ic(icon));

  // ------------------------------------------------------------- apps
  const APPS = {
    gallery: { w: 874, h: 640, single: true, desc: (d) => `${d.media.filter((m) => m.kind !== 'audio').length} items from ${d.deviceName()}`, mount: mountGallery },
    player: { w: 1200, h: 760, single: true, desc: () => 'Now playing', mount: mountPlayer },
    music: { w: 760, h: 560, single: true, desc: (d) => `${d.media.filter((m) => m.kind === 'audio').length} songs`, mount: mountMusic },
    notes: { w: 600, h: 520, single: true, desc: () => 'Typed from your phone', mount: mountNotes },
    web: { w: 1280, h: 780, desc: () => 'Browse the web', mount: mountWeb },
    calc: { w: 420, h: 620, single: true, desc: () => 'Type numbers on your phone', mount: mountCalc },
    settings: { w: 940, h: 640, single: true, desc: () => 'PocketDesk on this TV', mount: mountSettings },
  };

  function mountGallery(desk, win) {
    let filter = 'all', selected = -1;
    const tabs = h('div', { class: 'tabs' });
    ['all', 'photos', 'videos'].forEach((f) => tabs.append(h('button', { class: 'tab', 'data-f': f, onclick: () => { filter = f; render(); } }, f[0].toUpperCase() + f.slice(1))));
    win.tools.append(tabs);
    const grid = h('div', { class: 'gal-grid' });
    const empty = h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, ic('upload')), h('div', { class: 'empty-t' }, 'Nothing here yet'),
      h('div', { class: 'empty-s' }, 'Open the Cast tab on your phone and choose photos or videos. They appear here instantly.'));
    const selText = h('span', { class: 'foot-text' });
    const openBtn = btn('brand', 'Open', () => open(selected), 'tv');
    const showBtn = btn('outline', 'Slideshow', () => open(selected < 0 ? firstIndex() : selected, true), 'play');
    win.body.append(h('div', { class: 'scroll pad' }, grid, empty));
    win.footer.append(selText, showBtn, openBtn); win.footer.hidden = false;
    const items = () => desk.media.map((m, i) => ({ ...m, i })).filter((m) => m.kind !== 'audio' && (filter === 'all' || (filter === 'photos' ? m.kind === 'image' : m.kind === 'video')));
    const firstIndex = () => (items()[0] ? items()[0].i : -1);
    function open(i, slideshow) { if (i < 0) return; desk.openApp('player', { index: i, slideshow }); }
    function render() {
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.f === filter));
      grid.innerHTML = '';
      const list = items();
      empty.hidden = list.length > 0;
      for (const m of list) {
        const thumb = m.kind === 'video' ? h('video', { src: m.url + '#t=0.5', muted: true, preload: 'metadata', playsinline: true }) : h('img', { src: m.url, alt: m.name, loading: 'lazy' });
        grid.append(h('button', {
          class: `gal-item ${m.i === selected ? 'sel' : ''}`, title: m.name,
          onclick: () => { if (selected === m.i) open(m.i); else { selected = m.i; render(); } },
          ondblclick: () => open(m.i),
        }, thumb, m.kind === 'video' ? h('span', { class: 'gal-badge' }, badge('neutral', 'Video')) : null));
      }
      const sel = desk.media[selected];
      selText.textContent = sel ? `1 selected · ${sel.name}` : `${list.length} item${list.length === 1 ? '' : 's'}`;
      openBtn.disabled = !sel; showBtn.disabled = !list.length;
      win.setDesc(APPS.gallery.desc(desk));
    }
    render();
    const off = desk.on('media', () => { if (selected < 0 && desk.media.length) selected = -1; render(); });
    return {
      destroy: off,
      onKey(k) {
        const list = items(); if (!list.length) return;
        let pos = list.findIndex((m) => m.i === selected);
        if (k === 'ArrowRight') pos = Math.min(list.length - 1, pos + 1);
        else if (k === 'ArrowLeft') pos = Math.max(0, pos - 1);
        else if (k === 'Enter') return open(selected);
        else return;
        selected = list[Math.max(0, pos)].i; render();
      },
    };
  }

  function mountPlayer(desk, win, payload) {
    let index = payload?.index ?? desk.media.length - 1;
    let slideshow = !!payload?.slideshow, slideT = null;
    const stage = h('div', { class: 'pl-stage' });
    const playBtn = h('button', { class: 'pl-play', onclick: () => toggle(), 'aria-label': 'Play or pause' });
    const time = h('span', { class: 'pl-time' }, '0:00 / 0:00');
    const fill = h('div', { class: 'slider-fill' });
    const thumb = h('div', { class: 'slider-thumb' });
    const seek = h('div', { class: 'slider pl-seek', onclick: (e) => {
      const v = video(); if (!v || !v.duration) return;
      const r = seek.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration;
    } }, h('div', { class: 'slider-track' }, fill), thumb);
    const muteBtn = iconBtn('volume2', () => { const v = video(); if (v) { v.muted = !v.muted; sync(true); } }, 'Mute');
    const bar = h('div', { class: 'pl-bar' },
      iconBtn('skipBack', () => go(-1), 'Previous'), iconBtn('rotateCcw', () => skip(-10), 'Back 10 seconds'),
      playBtn, iconBtn('rotateCw', () => skip(10), 'Forward 10 seconds'), iconBtn('skipForward', () => go(1), 'Next'),
      seek, time, muteBtn, iconBtn('monitor', () => desk.toggleMax(win), 'Full screen'));
    win.body.append(h('div', { class: 'pl' }, stage, bar));
    win.body.classList.add('dark');
    const video = () => stage.querySelector('video, audio');
    let lastSent = 0;
    function sync(force) {
      const v = video(); const m = desk.media[index];
      playBtn.innerHTML = (v && !v.paused) || (slideshow && m && m.kind === 'image') ? I.pauseFill : I.playFill;
      bar.classList.toggle('no-media', !v);
      if (v) {
        time.textContent = `${fmtTime(v.currentTime)} / ${fmtTime(v.duration)}`;
        const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
        fill.style.width = `${pct}%`; thumb.style.left = `${pct}%`;
        muteBtn.innerHTML = v.muted ? I.volumeX : I.volume2;
      }
      const now = Date.now();
      if (force || now - lastSent > 900) {
        lastSent = now;
        desk.send({ t: 'media-state', title: m?.name || '', kind: m?.kind || null, playing: !!(v && !v.paused),
          current: v?.currentTime || 0, duration: v?.duration || 0, index, count: desk.media.length, volume: v ? (v.muted ? 0 : v.volume) : 1 });
      }
      desk.refreshStatus();
    }
    function show() {
      clearTimeout(slideT);
      const m = desk.media[index];
      stage.innerHTML = '';
      if (!m) {
        stage.append(h('div', { class: 'empty dark' }, h('div', { class: 'empty-ic' }, ic('tv')), h('div', { class: 'empty-t' }, 'Nothing is playing'), h('div', { class: 'empty-s' }, 'Cast a photo, video or song from your phone.')));
        win.setTitle('Player'); win.setDesc('Nothing playing'); sync(true); return;
      }
      win.setTitle(m.name); win.setDesc(`${m.kind === 'video' ? 'Video' : m.kind === 'audio' ? 'Song' : 'Photo'} · ${index + 1} of ${desk.media.length}`);
      if (m.bad) { showBad(m); return; }
      if (m.kind === 'video' || m.kind === 'audio') {
        if (m.kind === 'audio') stage.append(h('div', { class: 'pl-art' }, h('div', { class: 'pl-art-ic' }, ic('music')), h('div', { class: 'pl-art-t' }, m.name)));
        const v = h(m.kind, { src: m.url, autoplay: true, playsinline: true });
        ['play', 'pause', 'timeupdate', 'loadedmetadata', 'volumechange'].forEach((ev) => v.addEventListener(ev, () => sync(ev !== 'timeupdate')));
        v.addEventListener('ended', () => { if (index < desk.media.length - 1) go(1); });
        if (m.kind === 'video') {
          v.addEventListener('click', toggle);
          // A video the browser can't decode (often HEVC / H.265) plays its sound over a black frame, or errors.
          const check = () => { if (desk.media[index] === m && v.currentTime > 0.3 && !v.videoWidth) unplayable(m, v); };
          v.addEventListener('timeupdate', check);
        }
        v.addEventListener('error', () => { if (desk.media[index] === m) unplayable(m, v); });
        stage.append(v);
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); // autoplay policies
      } else {
        stage.append(h('img', { src: m.url, alt: m.name }));
        if (slideshow) slideT = setTimeout(() => go(1), 5000);
      }
      sync(true);
    }
    function unplayable(m, v) {
      if (m.bad) return; m.bad = true;
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* already gone */ }
      showBad(m);
      desk.toast(`Can't play ${m.name}`, 'This browser does not support the video format.', 'warning');
      desk.send({ t: 'cast-status', name: m.name, ok: false, reason: 'format' });
    }
    function showBad(m) {
      stage.innerHTML = '';
      stage.append(h('div', { class: 'empty dark' }, h('div', { class: 'empty-ic' }, ic('alert')),
        h('div', { class: 'empty-t' }, 'This video format is not supported here'),
        h('div', { class: 'empty-s' }, 'It is probably HEVC (H.265), which most phones record by default. Record in H.264 (iPhone: Settings › Camera › Formats › Most Compatible) or send an MP4 (H.264) copy.')));
      sync(true);
    }
    function go(d) { if (!desk.media.length) return; index = (index + d + desk.media.length) % desk.media.length; show(); }
    function skip(s) { const v = video(); if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s)); }
    function toggle() {
      const v = video();
      if (v) { if (v.paused) v.play(); else v.pause(); return; }
      if (desk.media[index]?.kind === 'image') { slideshow = !slideshow; show(); }
    }
    show();
    return {
      onPayload(p) { if (p && p.index != null) { index = p.index; slideshow = !!p.slideshow; show(); } },
      onKey(k) { if (k === 'ArrowRight') go(1); else if (k === 'ArrowLeft') go(-1); else if (k === 'Enter') toggle(); },
      onText(t) { if (t === ' ') toggle(); },
      onMedia(action, value) {
        const v = video();
        if (action === 'toggle') toggle();
        else if (action === 'next') go(1);
        else if (action === 'prev') go(-1);
        else if (action === 'seek') skip(value);
        else if (action === 'seekTo' && v && v.duration) v.currentTime = Math.max(0, Math.min(1, value)) * v.duration;
        else if (action === 'volume' && v) { v.muted = false; v.volume = Math.max(0, Math.min(1, value)); }
        else if (action === 'fullscreen') desk.toggleMax(win);
        sync(true);
      },
      onMediaChange() { if (!desk.media[index]) { index = desk.media.length - 1; show(); } },
      destroy() { clearTimeout(slideT); const v = video(); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } desk.send({ t: 'media-state', kind: null, playing: false, title: '' }); setTimeout(() => desk.refreshStatus(), 0); },
    };
  }

  function mountMusic(desk, win) {
    const list = h('div', { class: 'list' });
    const empty = h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, ic('music')), h('div', { class: 'empty-t' }, 'No songs yet'),
      h('div', { class: 'empty-s' }, 'Cast audio files from your phone’s Cast tab to build a queue here.'));
    win.body.append(h('div', { class: 'scroll pad' }, list, empty));
    function render() {
      const songs = desk.media.map((m, i) => ({ ...m, i })).filter((m) => m.kind === 'audio');
      list.innerHTML = ''; empty.hidden = songs.length > 0; list.hidden = !songs.length;
      songs.forEach((s, n) => list.append(h('button', { class: 'list-row', onclick: () => desk.openApp('player', { index: s.i }) },
        h('span', { class: 'list-num' }, String(n + 1)), h('span', { class: 'icon-box' }, ic('music')),
        h('span', { class: 'list-main' }, h('span', { class: 'list-t' }, s.name), h('span', { class: 'list-s' }, 'From your phone')),
        ic('playFill'))));
      win.setDesc(APPS.music.desc(desk));
    }
    render();
    return { destroy: desk.on('media', render) };
  }

  function mountNotes(desk, win) {
    const saved = store.get('note', { title: 'Untitled note', body: '' });
    const status = badge('active', 'Saved');
    win.tools.append(status);
    const now = new Date();
    const date = h('div', { class: 'note-date' }, `${now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} · ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    const title = h('input', { class: 'note-title', value: saved.title, placeholder: 'Title', spellcheck: 'false' });
    const body = h('textarea', { class: 'note-body', placeholder: 'Start typing on your phone…', spellcheck: 'false' });
    body.value = saved.body;
    let t;
    const save = () => {
      status.className = 'badge badge-warning'; status.lastChild.textContent = 'Saving…';
      clearTimeout(t); t = setTimeout(() => { store.set('note', { title: title.value, body: body.value }); status.className = 'badge badge-active'; status.lastChild.textContent = 'Saved'; }, 400);
    };
    title.addEventListener('input', save); body.addEventListener('input', save);
    win.body.append(h('div', { class: 'note' }, date, title, body));
    setTimeout(() => desk.focusInput(body), 60);
    return {};
  }

  function mountWeb(desk, win, payload) {
    const input = h('input', { class: 'input web-url', placeholder: 'Search Wikipedia or enter an address', spellcheck: 'false' });
    const frame = h('iframe', { class: 'web-frame', referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' });
    const FAV = [
      ['Wikipedia', 'The free encyclopedia', 'https://en.m.wikipedia.org/wiki/Main_Page'],
      ['OpenStreetMap', 'Maps of the world', 'https://www.openstreetmap.org/export/embed.html?bbox=72.77,18.89,72.99,19.12&layer=mapnik'],
      ['Wikinews', 'Free-content news', 'https://en.m.wikinews.org/wiki/Main_Page'],
      ['Project Gutenberg', '70,000+ free books', 'https://www.gutenberg.org/'],
    ];
    const home = h('div', { class: 'web-home scroll pad' },
      h('div', { class: 'section-label' }, 'Favourites'),
      h('div', { class: 'web-favs' }, FAV.map(([n, d, u]) => h('button', { class: 'card fav', onclick: () => go(u) },
        h('span', { class: 'icon-box brand' }, n[0]), h('span', { class: 'list-main' }, h('span', { class: 'list-t' }, n), h('span', { class: 'list-s' }, d))))),
      h('p', { class: 'muted small' }, 'Tip: paste a link in the Cast tab on your phone. Some sites block being shown inside other apps and will stay blank.'));
    const view = h('div', { class: 'web-view' }, home, frame);
    function go(raw) {
      let u = String(raw || '').trim(); if (!u) return;
      if (!/^https?:\/\//i.test(u)) u = /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(u) ? `https://${u}` : `https://en.m.wikipedia.org/w/index.php?search=${encodeURIComponent(u)}`;
      input.value = u; frame.src = u; home.hidden = true; frame.hidden = false;
      try { win.setDesc(new URL(u).hostname.replace(/^www\./, '')); } catch { /* invalid */ }
    }
    frame.hidden = true;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(input.value); });
    win.tools.append(iconBtn('house', () => { frame.removeAttribute('src'); frame.hidden = true; home.hidden = false; input.value = ''; win.setDesc('Browse the web'); }, 'Home'), input, btn('primary', 'Go', () => go(input.value), null, 'btn-sm'));
    win.body.append(view);
    if (payload?.url) go(payload.url);
    return { onPayload(p) { if (p?.url) go(p.url); } };
  }

  function mountCalc(desk, win) {
    let expr = '', result = '';
    const exprEl = h('div', { class: 'calc-expr' }), resEl = h('div', { class: 'calc-res' });
    const show = () => { exprEl.textContent = expr.replace(/\*/g, '×').replace(/\//g, '÷') || '0'; resEl.textContent = result ? `= ${result}` : ''; };
    function evaluate() {
      if (!/^[\d.+\-*/() %]+$/.test(expr)) return '';
      try { const v = Function(`"use strict";return (${expr.replace(/%/g, '/100')})`)(); return Number.isFinite(v) ? String(+v.toPrecision(12)) : 'Error'; } catch { return ''; }
    }
    function input(k) {
      if (k === 'C') { expr = ''; result = ''; }
      else if (k === '⌫') expr = expr.slice(0, -1);
      else if (k === '=') { const r = evaluate(); if (r && r !== 'Error') { expr = r; result = ''; } else result = r || 'Error'; show(); return; }
      else if (k === '±') expr = expr.startsWith('-') ? expr.slice(1) : '-' + expr;
      else expr += k;
      result = evaluate(); if (result === expr) result = ''; show();
    }
    const KEYS = ['C', '±', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '⌫', '='];
    win.body.append(h('div', { class: 'calc' }, h('div', { class: 'calc-screen' }, resEl, exprEl),
      h('div', { class: 'calc-keys' }, KEYS.map((k) => h('button', {
        class: `btn calc-k ${k === '=' ? 'btn-brand' : '/*-+'.includes(k) ? 'btn-secondary op' : ['C', '±', '%', '⌫'].includes(k) ? 'btn-secondary' : 'btn-outline'}`, onclick: () => input(k),
      }, k === '*' ? '×' : k === '/' ? '÷' : k === '-' ? '−' : k)))));
    show();
    return {
      onText(t) { for (const c of t) { if ('0123456789.+-*/%()'.includes(c)) input(c); else if (c === 'x' || c === 'X') input('*'); else if (c === '=') input('='); } },
      onKey(k) { if (k === 'Enter') input('='); else if (k === 'Backspace') input('⌫'); else if (k === 'Escape') input('C'); },
    };
  }

  function mountSettings(desk, win) {
    let section = win.payload?.section || 'general';
    const nav = h('div', { class: 'set-nav' });
    const panel = h('div', { class: 'set-panel scroll' });
    win.body.append(h('div', { class: 'set' }, nav, panel));
    const SECTIONS = [['general', 'General', 'tv'], ['pointer', 'Pointer', 'crosshair'], ['phone', 'Phone', 'phone'], ['about', 'About', 'help']];
    function render() {
      nav.innerHTML = '';
      SECTIONS.forEach(([id, label, icn]) => nav.append(h('button', { class: `nav-item ${section === id ? 'on' : ''}`, onclick: () => { section = id; render(); } }, ic(icn), h('span', {}, label))));
      panel.innerHTML = '';
      const s = desk.settings;
      if (section === 'general') {
        const name = h('input', { class: 'input', value: s.tvName, placeholder: 'Living Room TV' });
        name.addEventListener('input', () => { desk.setSetting('tvName', name.value.trim() || 'Living Room TV'); });
        panel.append(h('h3', {}, 'General'),
          h('div', { class: 'card set-card' }, h('label', { class: 'field' }, h('span', { class: 'field-l' }, 'TV name'), name, h('span', { class: 'field-h' }, 'Shown on your phone and in the top bar.'))),
          h('div', { class: 'card set-card' }, h('div', { class: 'row-between' }, h('div', {}, h('div', { class: 'field-l' }, 'Desktop widgets'), h('div', { class: 'field-h' }, 'Battery, latency, queue and session cards.')),
            h('button', { class: `switch ${s.widgets ? 'on' : ''}`, onclick: () => { desk.setSetting('widgets', !s.widgets); render(); }, 'aria-label': 'Toggle widgets' }, h('span', {})))));
      } else if (section === 'pointer') {
        panel.append(h('h3', {}, 'Pointer'),
          h('div', { class: 'card set-card' }, h('div', { class: 'field-l' }, 'Pointer speed'),
            h('div', { class: 'stepper' },
              btn('outline', null, () => { desk.setSetting('speed', Math.max(0.6, +(s.speed - 0.2).toFixed(1))); render(); }, 'minus', 'btn-icon'),
              h('div', { class: 'slider static' }, h('div', { class: 'slider-track' }, h('div', { class: 'slider-fill', style: `width:${((s.speed - 0.6) / 2.4) * 100}%` }))),
              btn('outline', null, () => { desk.setSetting('speed', Math.min(3, +(s.speed + 0.2).toFixed(1))); render(); }, 'plus', 'btn-icon'),
              h('span', { class: 'mono' }, `${s.speed.toFixed(1)}×`)),
            h('div', { class: 'field-h' }, 'TV remote arrows also move the pointer; OK clicks.')));
      } else if (section === 'phone') {
        const d = desk.device;
        panel.append(h('h3', {}, 'Phone'),
          d ? h('div', { class: 'card set-card dev' }, h('span', { class: 'avatar' }, initials(d.name)),
            h('div', { class: 'list-main' }, h('span', { class: 'list-t' }, d.name || 'Phone'), h('span', { class: 'list-s' }, [d.os, d.battery != null ? `${d.battery}% battery` : null].filter(Boolean).join(' · '))),
            badge('active', 'Connected'), desk.local ? null : btn('outline', 'Disconnect', () => desk.kickPhone()))
            : h('div', { class: 'card set-card' }, h('div', { class: 'list-t' }, 'No phone connected'), h('div', { class: 'field-h' }, 'Open PocketDesk on your phone and enter the pairing code.')),
          desk.local ? null : btn('outline', 'Show pairing code', () => desk.showPairing(true), 'scan'));
      } else {
        panel.append(h('h3', {}, 'About'),
          h('div', { class: 'card set-card about' }, h('span', { class: 'logo lg brand-mark', html: I.logo }),
            h('div', {}, h('div', { class: 'list-t' }, `PocketDesk ${VERSION}`), h('div', { class: 'field-h' }, 'A desktop for your TV, driven by your phone. Open source under the MIT licence.'))),
          h('div', { class: 'card set-card' }, h('div', { class: 'field-l' }, 'Connection'), h('div', { class: 'field-h' }, desk.modeLabel())),
          h('div', { class: 'card set-card' }, h('div', { class: 'field-l' }, 'Source code'), h('div', { class: 'mono small' }, REPO_URL.replace('https://', ''))));
      }
    }
    render();
    const off = desk.on('device', render);
    return { destroy: off, onPayload(p) { if (p?.section) { section = p.section; render(); } } };
  }

  // ------------------------------------------------------------- desktop
  class TVDesktop {
    constructor(mount, transport, opts = {}) {
      this.mount = mount; this.transport = transport; this.local = !!opts.local;
      this.windows = []; this.z = 10; this.seq = 0; this.media = [];
      this.cursor = { x: W / 2, y: H / 2 }; this.press = null; this.lastClick = null;
      this.focusEl = null; this.device = null; this.listeners = {}; this.rtt = null; this.since = null;
      this.settings = Object.assign({ speed: 1.6, tvName: 'Living Room TV', widgets: true }, store.get('settings', {}));
      this.build();
      this.bindPointer(); this.bindKeys(); this.bindTransport();
      this.tick(); setInterval(() => this.tick(), 15000);
      setInterval(() => this.ping(), 5000);
      const ro = new ResizeObserver(() => this.fit()); ro.observe(mount); this.fit();
    }
    on(ev, fn) { (this.listeners[ev] ||= new Set()).add(fn); return () => this.listeners[ev].delete(fn); }
    emit(ev, d) { (this.listeners[ev] || []).forEach((fn) => fn(d)); }
    send(msg) { this.transport.send(msg); }
    deviceName() { return this.device?.name || 'your phone'; }
    modeLabel() { const k = this.transport.kind; return k === 'native' ? 'Wired display · offline' : this.local ? 'Demo · in-page link' : k === 'p2p' ? 'Peer-to-peer · WebRTC' : 'Local server · WebSocket'; }

    // ---------- build
    build() {
      this.mount.classList.add('pd-tv-mount');
      this.screen = h('div', { class: 'pd-tv' });
      // top bar
      this.crumb = h('span', { class: 'crumb-cur' }, 'Desktop');
      this.crumbTv = h('span', { class: 'crumb' });
      this.statusBadge = h('span', {});
      this.wifiEl = h('span', { class: 'top-ic' });
      this.battEl = h('span', { class: 'top-batt' });
      this.timeEl = h('div', { class: 'clock' });
      this.avatarEl = h('span', {});
      this.top = h('header', { class: 'top' },
        h('div', { class: 'top-l' }, h('span', { class: 'logo brand-mark', html: I.logo }), h('span', { class: 'brand' }, 'PocketDesk'), h('span', { class: 'vsep' }),
          this.crumbTv, ic('chevronRight'), this.crumb),
        h('button', { class: 'search-trigger', onclick: () => this.toggleLauncher() }, ic('search'), h('span', {}, 'Search apps and windows…'), h('kbd', {}, '⌘K')),
        h('div', { class: 'top-r' }, this.statusBadge, this.wifiEl, this.battEl, h('span', { class: 'vsep' }), this.timeEl, this.avatarEl));
      // widgets
      this.kpis = {};
      const kpi = (id, accent, label) => { const v = h('div', { class: 'kpi-v' }, '—'), m = h('div', { class: 'kpi-m' }, ''); this.kpis[id] = { v, m }; return h('div', { class: `kpi kpi-${accent}` }, h('div', { class: 'kpi-l' }, label), v, m); };
      this.widgets = h('section', { class: 'widgets' }, kpi('battery', 'emerald', 'Phone battery'), kpi('latency', 'blue', 'Latency'), kpi('queue', 'amber', 'Up next'), kpi('session', 'orange', 'Session'));
      this.layer = h('div', { class: 'windows' });
      this.snapEl = h('div', { class: 'snap' });
      this.dock = h('nav', { class: 'dock' });
      this.launcher = this.buildLauncher();
      this.ctxEl = h('div', { class: 'popover ctx' });
      this.toasts = h('div', { class: 'toasts' });
      this.pairEl = h('div', { class: 'pair' });
      this.cursorEl = h('div', { class: 'cursor', html: '<svg viewBox="0 0 30 38" width="30" height="38"><path d="M3 2v28l7.2-6.9 4.6 11 4.6-1.9-4.6-10.8h9.9z" fill="#09090B" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>' });
      this.screen.append(this.top, this.widgets, this.layer, this.snapEl, this.dock, this.launcher, this.ctxEl, this.toasts, this.pairEl, this.cursorEl);
      this.mount.append(this.screen);
      this.renderDock(); this.placeCursor(); this.refreshStatus(); this.applySettings();
    }

    buildLauncher() {
      this.lpInput = h('input', { class: 'lp-input', placeholder: 'Type to search apps, windows and actions…', spellcheck: 'false' });
      this.lpList = h('div', { class: 'lp-list scroll' });
      this.lpInput.addEventListener('input', () => this.renderLauncher());
      this.lpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.lpList.querySelector('.lp-item')?.click(); });
      return h('div', { class: 'launcher-wrap' }, h('div', { class: 'launcher card' }, h('div', { class: 'lp-search' }, ic('search'), this.lpInput, h('kbd', {}, 'Esc')), this.lpList));
    }
    renderLauncher() {
      const q = this.lpInput.value.trim().toLowerCase();
      const match = (s) => !q || s.toLowerCase().includes(q);
      const L = this.lpList; L.innerHTML = '';
      const group = (label, rows) => { const r = rows.filter(Boolean); if (!r.length) return; L.append(h('div', { class: 'section-label' }, label), ...r); };
      const item = (icon, title, sub, fn, kb) => h('button', { class: 'lp-item', onclick: () => { this.closeLauncher(); fn(); } }, h('span', { class: 'icon-box' }, ic(icon)), h('span', { class: 'list-main' }, h('span', { class: 'list-t' }, title), sub ? h('span', { class: 'list-s' }, sub) : null), kb ? h('kbd', {}, kb) : null);
      group('Apps', Object.entries(APPS).filter(([id]) => match(CATALOG[id].name)).map(([id]) => item(CATALOG[id].icon, CATALOG[id].name, APPS[id].desc(this), () => this.openApp(id))));
      group('Windows', this.windows.filter((w) => match(w.title)).map((w) => item(CATALOG[w.app].icon, w.title, w.min ? 'Minimised' : 'Open', () => this.restore(w))));
      group('Actions', [
        match('Tile windows') && item('tile', 'Tile windows', 'Arrange side by side', () => this.tile()),
        match('Show desktop') && item('monitor', 'Show desktop', 'Minimise everything', () => this.showDesktop()),
        !this.local && match('Pairing code') && item('scan', 'Pairing code', 'Connect another phone', () => this.showPairing(true)),
      ]);
      if (!L.children.length) L.append(h('div', { class: 'lp-empty' }, `No results for “${this.lpInput.value}”`));
    }
    toggleLauncher(force) {
      const open = force ?? !this.launcher.classList.contains('open');
      this.closeCtx();
      this.launcher.classList.toggle('open', open);
      if (open) { this.lpInput.value = ''; this.renderLauncher(); this.focusInput(this.lpInput); } else if (this.focusEl === this.lpInput) this.blurInput();
      this.renderDock();
    }
    closeLauncher() { if (this.launcher.classList.contains('open')) this.toggleLauncher(false); }

    fit() {
      const r = this.mount.getBoundingClientRect();
      this.scale = Math.min(r.width / W, r.height / H) || 1;
      this.screen.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
    }
    applySettings() {
      this.widgets.hidden = !this.settings.widgets;
      this.crumbTv.textContent = this.settings.tvName;
    }
    setSetting(k, v) {
      this.settings[k] = v; store.set('settings', this.settings); this.applySettings();
      if (k === 'tvName') this.send({ t: 'tv-info', name: v });
    }
    tick() {
      const d = new Date();
      this.timeEl.innerHTML = '';
      this.timeEl.append(h('div', { class: 'clock-t' }, d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })), h('div', { class: 'clock-d' }, d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })));
      this.refreshStatus();
    }
    ping() { if (this.device) this.send({ t: 'ping', ts: performance.now() }); }

    refreshStatus() {
      const d = this.device;
      const playing = this.windows.some((w) => w.app === 'player') && this.media.length;
      this.statusBadge.replaceChildren(d ? (playing ? badge('info', 'Casting') : badge('active', 'Connected')) : badge('warning', 'Waiting for phone'));
      const online = this.transport.status === 'open';
      this.wifiEl.innerHTML = online ? I.wifi : I.wifiOff; this.wifiEl.title = online ? this.modeLabel() : 'Offline';
      this.battEl.replaceChildren(...(d && d.battery != null ? [ic('battery'), h('span', {}, `${d.battery}%`)] : []));
      this.avatarEl.replaceChildren(d ? h('span', { class: 'avatar', title: d.name }, initials(d.name)) : h('span', { class: 'avatar ghost', title: 'No phone' }, ic('phone')));
      const k = this.kpis;
      k.battery.v.textContent = d && d.battery != null ? `${d.battery}%` : '—'; k.battery.m.textContent = d ? `${d.name || 'Phone'}${d.charging ? ' · charging' : ''}` : 'No phone connected';
      k.latency.v.textContent = this.rtt != null ? `${this.rtt} ms` : '—'; k.latency.m.textContent = this.modeLabel();
      const visual = this.media.length;
      k.queue.v.textContent = visual ? `${visual} item${visual === 1 ? '' : 's'}` : 'Nothing yet'; k.queue.m.textContent = visual ? this.media[visual - 1].name : 'Cast from your phone';
      if (this.since) { const mins = Math.max(0, Math.round((Date.now() - this.since) / 60000)); k.session.v.textContent = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`; k.session.m.textContent = `Started ${new Date(this.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; }
      else { k.session.v.textContent = '—'; k.session.m.textContent = 'Waiting for phone'; }
      const act = this.activeWin(); this.crumb.textContent = act ? act.title : 'Desktop';
    }

    renderDock() {
      const d = this.dock; d.innerHTML = '';
      const act = this.activeWin();
      const ids = ['launcher', 'gallery', 'player', 'music', 'notes', 'web', 'calc', null, 'settings'];
      for (const id of ids) {
        if (!id) { d.append(h('span', { class: 'dock-sep' })); continue; }
        const wins = this.windows.filter((w) => w.app === id);
        const focused = id === 'launcher' ? this.launcher.classList.contains('open') : act && act.app === id;
        const running = id !== 'launcher' && wins.length > 0;
        const tip = id === 'gallery' ? `Photos · ${this.media.filter((m) => m.kind !== 'audio').length} items` : CATALOG[id].name + (wins.length > 1 ? ` · ${wins.length} windows` : '');
        d.append(h('button', { class: `dock-item ${focused ? 'focused' : ''} ${running ? 'running' : ''}`, 'data-tip': tip, onclick: () => this.dockClick(id) },
          h('span', { class: 'tile' }, ic(CATALOG[id].icon)), h('span', { class: 'dock-l' }, CATALOG[id].name), h('span', { class: 'dock-ind' })));
      }
    }
    dockClick(id) {
      if (id === 'launcher') return this.toggleLauncher();
      const wins = this.windows.filter((w) => w.app === id).sort((a, b) => b.z - a.z);
      if (!wins.length) return this.openApp(id);
      const top = wins[0];
      if (top === this.activeWin() && !top.min) this.minimize(top); else this.restore(top);
    }

    toast(title, desc, kind = 'active', action) {
      const icn = { active: 'check', info: 'cast', warning: 'alert', error: 'alert' }[kind] || 'check';
      const t = h('div', { class: 'toast card' }, h('span', { class: `toast-ic ${kind}` }, ic(icn)),
        h('div', { class: 'list-main' }, h('span', { class: 'list-t' }, title), desc ? h('span', { class: 'list-s' }, desc) : null),
        btn('outline', action ? action[0] : 'Dismiss', () => { if (action) action[1](); dismiss(); }, null, 'btn-sm'));
      const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
      this.toasts.append(t);
      while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
      setTimeout(dismiss, 5000);
    }

    // ---------- coordinates & synthetic input
    toLogical(e) { const r = this.screen.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale }; }
    toClient(x, y) { const r = this.screen.getBoundingClientRect(); return { cx: r.left + x * this.scale, cy: r.top + y * this.scale }; }
    elAt(x, y) { const { cx, cy } = this.toClient(x, y); const el = document.elementFromPoint(cx, cy); return el && this.screen.contains(el) ? el : null; }
    fire(type, el, extra = {}) {
      if (!el) return;
      const { cx, cy } = this.toClient(this.cursor.x, this.cursor.y);
      const init = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: extra.button || 0, buttons: extra.buttons || 0, view: window, detail: extra.detail || 1 };
      el.dispatchEvent(type.startsWith('pointer') && global.PointerEvent ? new PointerEvent(type, { ...init, pointerId: 77, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init));
    }
    placeCursor() { this.cursorEl.style.transform = `translate(${this.cursor.x}px, ${this.cursor.y}px)`; }
    wakeCursor() { this.cursorEl.classList.remove('idle'); clearTimeout(this.idleT); this.idleT = setTimeout(() => this.cursorEl.classList.add('idle'), 6000); }
    updateHover(el) {
      const target = el && el.closest('button, .win-head, a, .lp-item, input, textarea');
      if (target === this.hoverEl) return;
      if (this.hoverEl) this.hoverEl.classList.remove('hov');
      this.hoverEl = target; if (target) target.classList.add('hov');
    }
    moveBy(dx, dy) {
      const s = this.settings.speed;
      this.cursor.x = Math.max(0, Math.min(W - 1, this.cursor.x + dx * s));
      this.cursor.y = Math.max(0, Math.min(H - 1, this.cursor.y + dy * s));
      this.placeCursor(); this.wakeCursor();
      const el = this.elAt(this.cursor.x, this.cursor.y);
      this.updateHover(el);
      this.fire('pointermove', el || this.screen, { buttons: this.press ? 1 : 0 });
      if (this.press && Math.hypot(this.cursor.x - this.press.x, this.cursor.y - this.press.y) > 8) this.press.moved = true;
    }
    remoteDown(button = 0) {
      this.wakeCursor();
      const el = this.elAt(this.cursor.x, this.cursor.y);
      this.press = { x: this.cursor.x, y: this.cursor.y, el, moved: false, button };
      this.fire('pointerdown', el, { button, buttons: 1 }); this.fire('mousedown', el, { button, buttons: 1 });
    }
    remoteUp() {
      const el = this.elAt(this.cursor.x, this.cursor.y);
      this.fire('pointerup', el || this.screen, { buttons: 0 }); this.fire('mouseup', el, {});
      const p = this.press; this.press = null;
      if (!p || p.moved || !el) return;
      this.focusFrom(el);
      this.fire('click', el, {});
      const now = Date.now(), lc = this.lastClick;
      if (lc && now - lc.t < 450 && Math.hypot(lc.x - this.cursor.x, lc.y - this.cursor.y) < 20) { this.fire('dblclick', el, { detail: 2 }); this.lastClick = null; }
      else this.lastClick = { t: now, x: this.cursor.x, y: this.cursor.y };
    }
    remoteContext() {
      const el = this.elAt(this.cursor.x, this.cursor.y);
      this.fire('pointerdown', el, { button: 2, buttons: 2 }); this.fire('pointerup', el, { button: 2 }); this.fire('contextmenu', el, { button: 2 });
    }
    remoteScroll(dx, dy) {
      let el = this.elAt(this.cursor.x, this.cursor.y);
      while (el && el !== this.screen) {
        const cs = getComputedStyle(el);
        if ((el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) || (dx && el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX))) { el.scrollBy({ top: dy, left: dx }); return; }
        el = el.parentElement;
      }
    }

    // ---------- text input (tracked without real DOM focus so the TV's own
    // on-screen keyboard doesn't appear; characters come from the phone)
    focusFrom(el, native = false) { const f = el.closest('input, textarea'); if (f && isEditable(f)) this.focusInput(f, native); else this.blurInput(); }
    focusInput(el, native = false) {
      if (this.focusEl === el) return;
      this.blurInput();
      this.focusEl = el; el.classList.add('tv-focus');
      if (native) el.focus({ preventScroll: true });
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* not a text input */ }
      const win = this.winOf(el);
      this.send({ t: 'kbd-hint', field: win ? `${win.title}${el.placeholder ? ' · ' + el.placeholder : ''}` : el.placeholder || 'Search' });
    }
    blurInput() {
      if (!this.focusEl) return;
      this.focusEl.classList.remove('tv-focus');
      if (document.activeElement === this.focusEl) this.focusEl.blur();
      this.focusEl = null;
    }
    liveInput() { const f = this.focusEl; return f && f.isConnected && f.offsetParent !== null ? f : null; }
    typeText(text) {
      const f = this.liveInput();
      if (f) {
        const s = f.selectionStart ?? f.value.length, e = f.selectionEnd ?? s;
        f.setRangeText(text, s, e, 'end'); f.dispatchEvent(new Event('input', { bubbles: true })); f.scrollTop = f.scrollHeight;
        return;
      }
      if (this.activeWin()?.api.onText) return this.activeWin().api.onText(text);
      if (text.trim()) { this.toggleLauncher(true); this.typeText(text); } // type-to-search, like a desktop
    }
    pressKey(key) {
      const f = this.liveInput();
      if (key === 'Escape') { if (this.menuOpen()) this.closeMenus(); else this.blurInput(); this.activeWin()?.api.onKey?.(key); return; }
      if (key === 'Home' || key === 'Meta') { this.toggleLauncher(); return; }
      if (key === 'Tab' && !f) { this.cycleWindows(); return; }
      if (f) {
        let s = f.selectionStart ?? f.value.length; const e = f.selectionEnd ?? s;
        const fire = () => f.dispatchEvent(new Event('input', { bubbles: true }));
        if (key === 'Backspace') { if (s === e && s > 0) s -= 1; f.setRangeText('', s, e, 'end'); fire(); }
        else if (key === 'Enter') { if (f.tagName === 'TEXTAREA') { f.setRangeText('\n', s, e, 'end'); fire(); } else f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
        else if (key === 'ArrowLeft') { const p = Math.max(0, s - 1); f.setSelectionRange(p, p); }
        else if (key === 'ArrowRight') { const p = Math.min(f.value.length, e + 1); f.setSelectionRange(p, p); }
        else if (key === 'Tab') { f.setRangeText('\t', s, e, 'end'); fire(); }
        return;
      }
      this.activeWin()?.api.onKey?.(key);
    }

    // ---------- real pointer / keyboard on the TV
    bindPointer() {
      const scr = this.screen;
      scr.addEventListener('pointerdown', (e) => {
        const t = e.target;
        if (!t.closest('.launcher, .search-trigger, .dock-item')) this.closeLauncher();
        if (!t.closest('.ctx')) this.closeCtx();
        if (e.isTrusted) { this.cursor = this.toLogical(e); this.placeCursor(); this.focusFrom(t, true); }
        const win = this.winOf(t);
        if (win) this.focusWin(win);
        if (e.button !== 0) return;
        const head = t.closest('.win-head');
        if (head && win && !t.closest('button, input, .tabs')) {
          const p = this.toLogical(e);
          this.drag = { win, kind: 'move', ox: p.x - win.x, oy: p.y - win.y, sx: p.x, sy: p.y, started: false };
          e.preventDefault();
        } else if (t.closest('.win-resize') && win) {
          const p = this.toLogical(e);
          this.drag = { win, kind: 'resize', sx: p.x, sy: p.y, w: win.w, h: win.h }; e.preventDefault();
        }
      });
      window.addEventListener('pointermove', (e) => {
        if (e.isTrusted && scr.contains(e.target)) { this.cursor = this.toLogical(e); this.placeCursor(); this.wakeCursor(); this.updateHover(e.target); }
        if (!this.drag) return;
        const p = e.isTrusted ? this.toLogical(e) : { ...this.cursor };
        const d = this.drag, win = d.win;
        if (d.kind === 'move') {
          if (!d.started && Math.hypot(p.x - d.sx, p.y - d.sy) < 4) return;
          if (!d.started && win.max) { const ratio = (p.x - win.x) / win.w; this.toggleMax(win); d.ox = win.w * ratio; d.oy = 30; }
          d.started = true; win.el.classList.add('dragging');
          win.x = Math.round(p.x - d.ox); win.y = Math.round(Math.max(TOP, Math.min(H - DOCK, p.y - d.oy)));
          this.layout(win);
          d.snap = p.y <= TOP + 4 ? 'max' : p.x <= 6 ? 'left' : p.x >= W - 7 ? 'right' : null;
          this.showSnap(d.snap);
        } else {
          win.w = Math.max(380, Math.round(d.w + p.x - d.sx)); win.h = Math.max(260, Math.round(d.h + p.y - d.sy)); this.layout(win);
        }
      });
      window.addEventListener('pointerup', () => {
        const d = this.drag; if (!d) return;
        this.drag = null; d.win.el.classList.remove('dragging');
        if (d.snap) this.snap(d.win, d.snap);
        this.showSnap(null);
      });
      scr.addEventListener('dblclick', (e) => { const head = e.target.closest('.win-head'); if (head && !e.target.closest('button, input, .tabs')) this.toggleMax(this.winOf(head)); });
      scr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.isTrusted) { this.cursor = this.toLogical(e); this.placeCursor(); }
        if (e.target.closest('.win-head')) this.openCtx(this.winOf(e.target));
        else if (!e.target.closest('.win, .dock, .top, .launcher')) this.openCtx();
      });
    }
    bindKeys() {
      window.addEventListener('keydown', (e) => {
        if (isEditable(e.target) && !this.screen.contains(e.target)) return; // e.g. the phone in the demo
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggleLauncher(); return; }
        if (isEditable(e.target)) { if (e.key === 'Escape') { this.blurInput(); this.closeMenus(); } return; }
        if (e.target !== document.body && !this.screen.contains(e.target) && !this.mount.contains(e.target)) return;
        const step = 40, arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (arrows[e.key] && !this.activeWin()?.api.onKey) { e.preventDefault(); this.moveBy(arrows[e.key][0] / this.settings.speed, arrows[e.key][1] / this.settings.speed); }
        else if (e.key === 'Enter' && !this.press) { e.preventDefault(); this.remoteDown(); this.remoteUp(); }
        else if (['Escape', 'Tab', 'Backspace'].includes(e.key) || arrows[e.key]) { e.preventDefault(); this.pressKey(e.key); }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) this.typeText(e.key);
      });
    }

    // ---------- transport
    bindTransport() {
      const tr = this.transport;
      tr.onMessage((m) => this.handle(m));
      tr.onStatus(() => this.refreshStatus());
      if (this.local) { tr.connect(); return; }
      let resume = null; try { resume = sessionStorage.getItem('pocketdesk.code'); } catch { /* private mode */ }
      if (tr.kind === 'p2p') tr.wantCode = resume;
      tr.onStatus((s) => {
        if (s === 'open') tr.send({ t: 'host', resume });
        if (s === 'closed' && !this.device) this.showPairing(false, 'Reconnecting…');
      });
      this.showPairing(false, 'Starting…');
      tr.connect();
    }
    handle(m) {
      switch (m.t) {
        case 'hosted':
          this.code = m.code; try { sessionStorage.setItem('pocketdesk.code', m.code); } catch { /* private mode */ }
          if (!this.device) this.showPairing(false);
          break;
        case 'peer':
          clearTimeout(this.leftT);
          if (!this.device) { this.toast(`${m.device?.name || 'Phone'} connected`, 'Your phone is now the trackpad.', 'active'); this.since = this.since || Date.now(); }
          this.device = m.device || {}; this.emit('device'); this.hidePairing();
          this.send({ t: 'tv-info', name: this.settings.tvName }); this.ping(); this.refreshStatus();
          break;
        case 'peer-left':
          this.device = null; this.rtt = null; this.emit('device'); this.refreshStatus();
          this.toast('Phone disconnected', 'Waiting for it to reconnect…', 'warning');
          clearTimeout(this.leftT); this.leftT = setTimeout(() => { if (!this.device) { this.since = null; this.showPairing(false); } }, 6000);
          break;
        case 'device': this.device = { ...this.device, ...m.device }; this.emit('device'); this.refreshStatus(); break;
        case 'ping': this.send({ t: 'pong', ts: m.ts }); break;
        case 'pong': this.rtt = Math.max(1, Math.round(performance.now() - m.ts)); this.refreshStatus(); break;
        case 'move': this.moveBy(m.dx, m.dy); break;
        case 'down': this.remoteDown(m.button || 0); break;
        case 'up': this.remoteUp(); break;
        case 'click': if (m.button === 2) this.remoteContext(); else { this.remoteDown(0); this.remoteUp(); } break;
        case 'scroll': this.remoteScroll(m.dx || 0, m.dy || 0); break;
        case 'text': this.typeText(String(m.text || '')); break;
        case 'key': this.pressKey(m.key); break;
        case 'open': if (m.app === 'launcher') this.toggleLauncher(true); else this.openApp(m.app, m.payload); break;
        case 'action': this.action(m.action); break;
        case 'cast': this.addMedia(m.item); break;
        case 'media': {
          let pw = this.windows.find((w) => w.app === 'player');
          if (!pw && this.media.length) pw = this.openApp('player');
          if (pw) pw.api.onMedia(m.action, m.value);
          break;
        }
        default: break;
      }
    }
    action(a) {
      if (a === 'start' || a === 'launcher') this.toggleLauncher();
      else if (a === 'tile') this.tile();
      else if (a === 'desktop') this.showDesktop();
      else if (a === 'close') { const w = this.activeWin(); if (w) this.closeWin(w); }
      else if (a === 'switch') this.cycleWindows();
      else if (a === 'center') { this.cursor = { x: W / 2, y: H / 2 }; this.placeCursor(); this.wakeCursor(); }
    }
    addMedia(item) {
      if (!item || !item.url) return;
      const kind = ['video', 'audio'].includes(item.kind) ? item.kind : 'image';
      this.media.push({ url: item.url, kind, name: item.name || 'Untitled' });
      this.emit('media');
      this.windows.forEach((w) => w.api.onMediaChange && w.api.onMediaChange());
      this.toast(`Received ${item.name || 'media'}`, kind === 'video' ? 'Playing on the TV' : kind === 'audio' ? 'Added to Music' : 'Added to Photos', 'info');
      if (item.autoplay !== false) this.openApp('player', { index: this.media.length - 1 });
      this.refreshStatus(); this.renderDock();
    }

    // ---------- pairing screen
    phoneUrl() {
      let base = location.origin + location.pathname.replace(/\/(tv(\.html)?)?$/, '');
      if (this.lanBase) base = this.lanBase;
      const q = new URLSearchParams(); if (this.code) q.set('code', this.code);
      const mode = new URLSearchParams(location.search).get('mode'); if (mode) q.set('mode', mode);
      return `${base.replace(/\/$/, '')}/phone${q.toString() ? '?' + q : ''}`;
    }
    async showPairing(dismissable, statusText) {
      if (this.local) return;
      if (this.transport.kind === 'server' && /localhost|127\.0\.0\.1/.test(location.hostname) && !this.lanBase) {
        try { const info = await (await fetch('/api/info')).json(); if (info.urls?.length) this.lanBase = info.urls[0]; } catch { /* ignore */ }
      }
      const url = this.phoneUrl();
      const code = (this.code || '------').split('');
      let qrSvg = '';
      try { const qr = global.qrcode(0, 'M'); qr.addData(url); qr.make(); qrSvg = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true }); } catch { /* lib missing */ }
      const el = this.pairEl; el.innerHTML = ''; el.classList.add('open');
      const step = (n, ...t) => h('li', {}, h('span', { class: 'step-n' }, String(n)), h('span', {}, ...t));
      el.append(h('div', { class: 'pair-card card' },
        h('div', { class: 'pair-l' },
          h('div', { class: 'pair-brand' }, h('span', { class: 'logo brand-mark', html: I.logo }), h('span', { class: 'brand' }, 'PocketDesk'), badge('neutral', this.settings.tvName)),
          h('h1', {}, 'Connect your phone'),
          h('p', { class: 'pair-sub' }, 'Your phone becomes the trackpad, keyboard and remote for this TV.'),
          h('ol', { class: 'steps' },
            step(1, 'Scan the QR code with your phone camera, or open ', h('b', { class: 'mono' }, url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''))),
            step(2, 'Enter this pairing code if asked:')),
          h('div', { class: 'otp' }, h('div', { class: 'otp-g' }, code.slice(0, 3).map((c) => h('span', {}, c))), h('span', { class: 'otp-dash' }), h('div', { class: 'otp-g' }, code.slice(3).map((c) => h('span', {}, c)))),
          h('div', { class: 'pair-status' }, this.code ? badge('warning', statusText || 'Waiting for your phone') : badge('neutral', statusText || 'Starting…'),
            h('span', { class: 'muted small' }, this.modeLabel())),
          dismissable ? btn('outline', 'Close', () => this.hidePairing()) : null),
        h('div', { class: 'pair-r' }, h('div', { class: 'qr card', html: qrSvg }), h('div', { class: 'muted small center' }, 'Works with Android and iPhone · no install needed'))));
    }
    hidePairing() { this.pairEl.classList.remove('open'); }

    // ---------- menus
    menuOpen() { return this.launcher.classList.contains('open') || this.ctxEl.classList.contains('open'); }
    closeCtx() { this.ctxEl.classList.remove('open'); }
    closeMenus() { this.closeLauncher(); this.closeCtx(); }
    openCtx(win) {
      const items = win ? [
        [win.max ? 'Restore' : 'Maximise', () => this.toggleMax(win)], ['Snap left', () => this.snap(win, 'left')], ['Snap right', () => this.snap(win, 'right')],
        ['Minimise', () => this.minimize(win)], null, ['Close window', () => this.closeWin(win), 'danger'],
      ] : [
        ['Open Photos', () => this.openApp('gallery')], ['New note', () => this.openApp('notes')], ['Search…', () => this.toggleLauncher(true)], null,
        ['Tile windows', () => this.tile()], ['Show desktop', () => this.showDesktop()], [this.settings.widgets ? 'Hide widgets' : 'Show widgets', () => this.setSetting('widgets', !this.settings.widgets)], null,
        ['Settings', () => this.openApp('settings')],
      ];
      const el = this.ctxEl; el.innerHTML = '';
      items.forEach((it) => el.append(it ? h('button', { class: `ctx-item ${it[2] || ''}`, onclick: () => { this.closeCtx(); it[1](); } }, it[0]) : h('div', { class: 'ctx-sep' })));
      el.classList.add('open');
      el.style.left = `${Math.min(this.cursor.x, W - el.offsetWidth - 12)}px`;
      el.style.top = `${Math.min(this.cursor.y, H - el.offsetHeight - 12)}px`;
      this.closeLauncher();
    }

    // ---------- windows
    winOf(el) { const w = el && el.closest && el.closest('.win'); return w ? this.windows.find((x) => x.el === w) : null; }
    activeWin() { return this.windows.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0] || null; }
    openApp(id, payload) {
      const def = APPS[id]; if (!def) return null;
      this.closeMenus();
      if (def.single) {
        const ex = this.windows.find((w) => w.app === id);
        if (ex) { this.restore(ex); ex.api.onPayload?.(payload); return ex; }
      }
      const n = this.windows.filter((w) => !w.min).length % 5;
      const w = Math.min(def.w, AREA.w), hh = Math.min(def.h, AREA.h - 120);
      const win = { id: ++this.seq, app: id, def, w, h: hh, payload,
        x: Math.round(Math.max(AREA.x, Math.min(AREA.x + AREA.w - w, (W - w) / 2 + n * 44 - 88))),
        y: Math.round(Math.max(AREA.y + 160, Math.min(AREA.y + AREA.h - hh, 268 + n * 36 - 36))), max: false, min: false };
      win.titleEl = h('div', { class: 'win-t' }, CATALOG[id].name);
      win.descEl = h('div', { class: 'win-d' }, def.desc(this));
      win.tools = h('div', { class: 'win-tools' });
      win.maxBtn = iconBtn('winMax', () => this.toggleMax(win), 'Maximise');
      win.body = h('div', { class: 'win-body' });
      win.footer = h('div', { class: 'win-foot' }); win.footer.hidden = true;
      win.el = h('div', { class: 'win opening' },
        h('div', { class: 'win-head' }, h('span', { class: 'icon-box' }, ic(CATALOG[id].icon)), h('div', { class: 'win-tt' }, win.titleEl, win.descEl), win.tools,
          h('div', { class: 'win-ctl' }, iconBtn('winMin', () => this.minimize(win), 'Minimise'), win.maxBtn, iconBtn('winClose', () => this.closeWin(win), 'Close'))),
        win.body, win.footer, h('div', { class: 'win-resize' }));
      win.title = CATALOG[id].name;
      win.setTitle = (t) => { win.title = t; win.titleEl.textContent = t; this.renderDock(); this.refreshStatus(); };
      win.setDesc = (t) => { win.descEl.textContent = t; };
      this.windows.push(win); this.layer.append(win.el);
      this.layout(win); this.focusWin(win);
      win.api = def.mount(this, win, payload) || {};
      requestAnimationFrame(() => requestAnimationFrame(() => win.el.classList.remove('opening')));
      this.renderDock();
      return win;
    }
    layout(win) {
      const el = win.el;
      el.classList.toggle('max', win.max); el.classList.toggle('min', win.min);
      const g = win.max ? AREA : win;
      Object.assign(el.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px`, zIndex: win.z });
      win.maxBtn.innerHTML = win.max ? I.winRestore : I.winMax;
    }
    focusWin(win) {
      if (!win) { this.renderDock(); this.refreshStatus(); return; }
      if (this.focusEl && !win.el.contains(this.focusEl) && !this.launcher.contains(this.focusEl)) this.blurInput();
      win.z = ++this.z; win.el.style.zIndex = win.z;
      this.windows.forEach((w) => w.el.classList.toggle('active', w === win));
      this.renderDock(); this.refreshStatus();
    }
    restore(win) { win.min = false; this.layout(win); this.focusWin(win); }
    minimize(win) { win.min = true; this.layout(win); if (this.focusEl && win.el.contains(this.focusEl)) this.blurInput(); this.focusWin(this.activeWin()); }
    toggleMax(win) {
      if (!win) return;
      if (win.max) { win.max = false; if (win.prev) Object.assign(win, win.prev); } else { win.prev = { x: win.x, y: win.y, w: win.w, h: win.h }; win.max = true; }
      win.min = false; this.layout(win); this.focusWin(win);
    }
    snap(win, where) {
      if (where === 'max') { if (!win.max) this.toggleMax(win); return; }
      win.max = false;
      const half = (AREA.w - 16) / 2;
      Object.assign(win, { x: where === 'left' ? AREA.x : AREA.x + half + 16, y: AREA.y, w: half, h: AREA.h });
      this.layout(win); this.focusWin(win);
    }
    showSnap(where) {
      const s = this.snapEl;
      if (!where) { s.classList.remove('on'); return; }
      const half = (AREA.w - 16) / 2;
      const g = where === 'max' ? AREA : where === 'left' ? { ...AREA, w: half } : { ...AREA, x: AREA.x + half + 16, w: half };
      Object.assign(s.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
      s.classList.add('on');
    }
    closeWin(win) {
      try { win.api.destroy?.(); } catch (e) { console.error(e); }
      if (this.focusEl && win.el.contains(this.focusEl)) this.blurInput();
      win.el.classList.add('closing'); setTimeout(() => win.el.remove(), 160);
      this.windows = this.windows.filter((w) => w !== win);
      this.focusWin(this.activeWin());
    }
    tile() {
      const ws = this.windows.filter((w) => !w.min); const n = ws.length; if (!n) return;
      const g = 16, A = AREA;
      const cols = n <= 3 ? Math.min(n, 2) : Math.ceil(Math.sqrt(n)), rows = n === 3 ? 2 : Math.ceil(n / cols);
      const cw = (A.w - g * (cols - 1)) / cols, rh = (A.h - g * (rows - 1)) / rows;
      ws.forEach((w, i) => {
        let r;
        if (n === 1) r = A;
        else if (n === 3) r = i === 0 ? { x: A.x, y: A.y, w: cw, h: A.h } : { x: A.x + cw + g, y: A.y + (i - 1) * (rh + g), w: cw, h: rh };
        else r = { x: A.x + (i % cols) * (cw + g), y: A.y + Math.floor(i / cols) * (rh + g), w: cw, h: rh };
        Object.assign(w, { max: false, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }); this.layout(w);
      });
    }
    showDesktop() {
      const visible = this.windows.filter((w) => !w.min);
      if (visible.length) { this.hiddenByDesk = visible; visible.forEach((w) => { w.min = true; this.layout(w); }); }
      else if (this.hiddenByDesk) { this.hiddenByDesk.forEach((w) => { if (this.windows.includes(w)) { w.min = false; this.layout(w); } }); this.hiddenByDesk = null; }
      this.focusWin(this.activeWin());
    }
    cycleWindows() {
      if (!this.windows.length) return;
      const next = [...this.windows].sort((a, b) => a.z - b.z)[0];
      this.restore(next);
    }
    kickPhone() { this.send({ t: 'kick' }); }
  }

  global.PocketDeskTV = { TVDesktop, W, H };
})(window);

/* Bannerfall app: input, sound, fog, minimap, shop, scoreboard, HUD and saves around the pure rules. */
(function (global) {
  'use strict';

  const B = global.Bannerfall, { TILE_W, TILE_H } = global.BannerfallView, SAVE_KEY = 'bannerfall-save', BEST_KEY = 'bannerfall-best';
  const STEP_MS = B.STEP * 1000;
  const TEAM = [[96, 172, 255], [240, 96, 84], [232, 192, 96]];
  const BAR = { self: [120, 232, 110], ally: [96, 172, 255], foe: [240, 84, 72], neutral: [232, 192, 96] };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  class Sound {
    constructor() { this.muted = false; this.context = null; }
    ensure() {
      if (this.muted) return null;
      const Audio = global.AudioContext || global.webkitAudioContext;
      if (!Audio) return null;
      try {
        if (!this.context) {
          this.context = new Audio();
          this.master = this.context.createGain();
          this.master.gain.value = 0.3;
          this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch { return null; }
      return this.context;
    }
    tone(frequency, duration, { type = 'square', volume = 0.1, slide = 0, delay = 0 } = {}) {
      const c = this.ensure();
      if (!c) return;
      const now = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    noise(duration, { volume = 0.12, filter = 900 } = {}) {
      const c = this.ensure();
      if (!c) return;
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = c.createBufferSource(), biquad = c.createBiquadFilter(), gain = c.createGain();
      biquad.type = 'lowpass';
      biquad.frequency.value = filter;
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.master);
      source.start();
      source.onended = () => { source.disconnect(); biquad.disconnect(); gain.disconnect(); };
    }
    play(name) {
      switch (name) {
        case 'strike': this.noise(0.06, { volume: 0.08, filter: 1800 }); break;
        case 'shoot': this.tone(720, 0.08, { type: 'triangle', slide: -300, volume: 0.04 }); break;
        case 'hurt': this.tone(140, 0.18, { type: 'sawtooth', slide: -60, volume: 0.1 }); break;
        case 'gold': this.tone(1046, 0.08, { type: 'triangle', volume: 0.05 }); this.tone(1318, 0.1, { type: 'triangle', volume: 0.05, delay: 0.05 }); break;
        case 'cast': this.tone(440, 0.16, { type: 'sine', slide: 320, volume: 0.08 }); break;
        case 'boom': this.noise(0.4, { volume: 0.18, filter: 380 }); break;
        case 'level': [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', volume: 0.08, delay: i * 0.07 })); break;
        case 'kill': [392, 523].forEach((f, i) => this.tone(f, 0.16, { type: 'square', volume: 0.06, delay: i * 0.08 })); break;
        case 'death': [262, 208, 165].forEach((f, i) => this.tone(f, 0.26, { type: 'sawtooth', volume: 0.07, delay: i * 0.12 })); break;
        case 'tower': this.noise(0.7, { volume: 0.2, filter: 300 }); break;
        case 'horn': this.tone(196, 0.5, { type: 'sawtooth', slide: 40, volume: 0.06 }); break;
        case 'roar': this.tone(70, 0.8, { type: 'sawtooth', slide: 40, volume: 0.15 }); break;
        case 'buy': this.tone(880, 0.07, { type: 'triangle', volume: 0.06 }); break;
        case 'denied': this.tone(150, 0.12, { volume: 0.07 }); break;
        case 'recall': this.tone(330, 0.5, { type: 'sine', slide: 330, volume: 0.06 }); break;
        case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', volume: 0.1, delay: i * 0.12 })); break;
        case 'defeat': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, { type: 'sawtooth', volume: 0.07, delay: i * 0.18 })); break;
      }
    }
  }

  class BannerfallApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.BannerfallView(this.canvas);
      this.minimap = document.getElementById('minimap');
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      const ids = ['title', 'pause', 'help', 'end', 'shop', 'board', 'hud', 'toast', 'mute', 'continue', 'difficulty', 'heroes', 'hero-note', 'objective', 'hp', 'hp-bar',
        'mana', 'mana-bar', 'xp-bar', 'who', 'gold', 'score', 'hotbar', 'log', 'best', 'end-title', 'end-detail', 'end-score', 'shop-list', 'shop-note', 'shop-gold', 'board-body', 'items', 'arm'];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.el.stats = document.querySelector('.stats');
      this.mode = 'title';
      this.state = null;
      this.heroChoice = 'warden';
      this.keys = new Set();
      this.mouse = { x: 0, y: 0, known: false };
      this.pending = {};
      this.armed = false;
      this.particles = [];
      this.marks = [];
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.shake = 0;
      this.time = 0;
      this.accumulator = 0;
      this.saveTimer = 0;
      this.hudTimer = 0;
      this.fogTimer = 0;
      this.sight = new Uint8Array(B.WIDTH * B.HEIGHT);
      this.explored = new Uint8Array(B.WIDTH * B.HEIGHT);
      this.shown = new Uint8Array(B.WIDTH * B.HEIGHT);
      this.last = performance.now();
      this.demo = B.newGame('title-battle', 'ranger', 'normal');
      this.bind();
      this.buildHeroPicker();
      this.buildHotbar();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bind() {
      global.addEventListener('resize', () => this.resize());
      global.addEventListener('blur', () => { this.keys.clear(); if (this.mode === 'play') this.show('pause'); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.show('pause'); });
      const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'play' && (this.shopOpen || this.boardOpen)) { this.toggleShop(false); this.toggleBoard(false); }
          else if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') { event.preventDefault(); this.newGame(); return; }
        if (this.mode !== 'play') return;
        if (CAPTURE.has(event.code)) event.preventDefault();
        this.keys.add(event.code);
        if (event.repeat) return;
        const slot = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[event.code];
        if (slot !== undefined) this.castSlot(slot, true);
        if (event.code === 'KeyB') this.pending.recall = true;
        if (event.code === 'KeyS') this.toggleShop();
        if (event.code === 'Tab') this.toggleBoard(true);
        if (event.code === 'KeyA') { this.armed = true; this.el.arm.hidden = false; }
      });
      global.addEventListener('keyup', event => {
        this.keys.delete(event.code);
        if (event.code === 'Tab') this.toggleBoard(false);
      });

      const track = event => {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        this.mouse.known = event.pointerType !== 'touch';
      };
      this.canvas.addEventListener('pointermove', track);
      this.canvas.addEventListener('pointerdown', event => {
        if (this.mode !== 'play') return;
        event.preventDefault();
        track(event);
        this.command(this.toWorld(event.clientX, event.clientY), event.button === 2);
      });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
      this.minimap.addEventListener('pointerdown', event => {
        if (this.mode !== 'play') return;
        event.preventDefault();
        const r = this.minimap.getBoundingClientRect();
        const point = { x: (event.clientX - r.left) / r.width * B.WIDTH, y: (event.clientY - r.top) / r.height * B.HEIGHT };
        this.pending.order = { kind: this.armed ? 'attackMove' : 'move', x: point.x, y: point.y };
        this.disarm();
        this.mark(point, false);
      });

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newGame());
      click('continue', () => this.resume());
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && this.state.status === 'play' ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-help', () => this.show('help'));
      click('pause-title', () => { this.save(); this.show('title'); });
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('shop-btn', () => this.toggleShop());
      click('shop-close', () => this.toggleShop(false));
      click('board-btn', () => this.toggleBoard());
      click('board-close', () => this.toggleBoard(false));
      click('end-again', () => this.newGame());
      click('end-menu', () => this.show('title'));
      this.el['shop-list'].addEventListener('click', event => {
        const button = event.target.closest('button[data-item]');
        if (button) this.pending.buy = button.dataset.item;
      });
      this.el.hotbar.addEventListener('click', event => {
        const button = event.target.closest('button[data-slot]');
        if (!button || this.mode !== 'play') return;
        if (button.dataset.slot === 'recall') this.pending.recall = true;
        else this.castSlot(Number(button.dataset.slot), false);
      });

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Sound off' : 'Sound on';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        showMute();
        try { localStorage.setItem('bannerfall-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('bannerfall-muted') === '1';
        const stored = localStorage.getItem('bannerfall-difficulty');
        if (B.DIFFICULTIES[stored]) this.el.difficulty.value = stored;
        const hero = localStorage.getItem('bannerfall-hero');
        if (B.HEROES[hero]) this.heroChoice = hero;
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('bannerfall-difficulty', this.el.difficulty.value); } catch {}
      });
      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.touch = true;
    }

    buildHeroPicker() {
      const box = this.el.heroes;
      box.textContent = '';
      for (const kind of B.HERO_KINDS) {
        const hero = B.HEROES[kind], button = document.createElement('button');
        button.type = 'button';
        button.dataset.hero = kind;
        button.className = 'hero';
        button.setAttribute('aria-pressed', kind === this.heroChoice ? 'true' : 'false');
        const letter = document.createElement('b');
        letter.textContent = hero.letter;
        const name = document.createElement('strong');
        name.textContent = hero.name;
        const role = document.createElement('small');
        role.textContent = hero.role;
        button.append(letter, name, role);
        button.addEventListener('click', () => {
          this.heroChoice = kind;
          try { localStorage.setItem('bannerfall-hero', kind); } catch {}
          this.buildHeroPicker();
        });
        box.append(button);
      }
      const hero = B.HEROES[this.heroChoice];
      this.el['hero-note'].textContent = hero.abilities.map(a => `${a.key} ${a.name}`).join(' · ');
    }

    buildHotbar() {
      const bar = this.el.hotbar;
      bar.textContent = '';
      for (let slot = 0; slot < 4; slot++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ability';
        button.dataset.slot = slot;
        button.innerHTML = '<i></i><b></b><small></small><span class="cool"></span>';
        bar.append(button);
      }
      const recall = document.createElement('button');
      recall.type = 'button';
      recall.className = 'ability recall';
      recall.dataset.slot = 'recall';
      recall.innerHTML = '<i>B</i><b>Home</b><small>4s</small><span class="cool"></span>';
      bar.append(recall);
      this.hotbarKey = '';
    }

    resize() {
      const narrow = global.innerWidth < 700;
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      this.view.resize(global.innerWidth, global.innerHeight, this.quality.cell(narrow ? [7, 10] : [8, 12]));
    }

    show(mode) {
      const was = this.mode;
      this.mode = mode;
      this.keys.clear();
      this.disarm();
      for (const name of ['title', 'pause', 'help', 'end']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      if (mode !== 'play') { this.toggleShop(false); this.toggleBoard(false); }
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      if (was === 'play' && mode === 'pause') this.save();
      if (mode !== 'play') this.el[mode]?.querySelector('button')?.focus();
    }
    toggleShop(open = !this.shopOpen) {
      this.shopOpen = open && this.mode === 'play';
      this.el.shop.hidden = !this.shopOpen;
      if (this.shopOpen) { this.toggleBoard(false); this.renderShop(); }
    }
    toggleBoard(open = !this.boardOpen) {
      this.boardOpen = open && this.mode === 'play';
      this.el.board.hidden = !this.boardOpen;
      if (this.boardOpen) { this.el.shop.hidden = true; this.shopOpen = false; this.renderBoard(); }
    }

    refreshTitle() {
      let saved = null, best = [];
      try {
        saved = localStorage.getItem(SAVE_KEY);
        best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
      } catch {}
      this.el.continue.hidden = !saved;
      this.el.best.textContent = best.length
        ? 'Best battles · ' + best.slice(0, 3).map(b => `${b.score} (${b.hero}, ${b.minutes} min)`).join(' · ')
        : 'No banners burned yet. A battle takes about fifteen minutes.';
    }

    newGame(seed) {
      seed = seed || Math.random().toString(36).slice(2, 8);
      this.begin(B.newGame(seed, this.heroChoice, this.el.difficulty.value));
      this.toast(this.touch
        ? 'Tap the ground to move, tap a red unit to attack, and use the ability buttons.'
        : 'Click to move or attack. Q W E R cast toward the cursor. S opens the shop, B goes home.');
    }

    resume() {
      try {
        this.begin(B.restore(localStorage.getItem(SAVE_KEY)));
        this.toast('Battle restored.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.refreshTitle();
      }
    }

    begin(state) {
      this.state = state;
      this.particles = [];
      this.marks = [];
      this.pending = {};
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.accumulator = 0;
      this.saveTimer = 0;
      this.explored.fill(0);
      this.fogTimer = 0;
      this.hotbarKey = '';
      this.logKey = '';
      this.ended = false;
      this.show('play');
      this.updateFog(state);
      this.updateHud();
      this.sound.ensure();
    }

    save() {
      if (!this.state || this.state.status !== 'play') return;
      try { localStorage.setItem(SAVE_KEY, B.save(this.state)); } catch { this.toast('This browser could not save the battle.'); }
    }

    record() {
      const s = this.state, p = B.playerHero(s), minutes = Math.round((s.endTime || s.time) / 60);
      try {
        localStorage.removeItem(SAVE_KEY);
        if (s.status !== 'won') return;
        const best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
        best.push({ score: B.score(s), minutes, hero: B.HEROES[p.kind].name, seed: s.seed });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem(BEST_KEY, JSON.stringify(best.slice(0, 5)));
      } catch {}
    }

    toast(text) {
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 4200);
    }

    pulse(r, g, b, alpha, seconds = 0.25) {
      this.tint = [r, g, b, this.reducedMotion ? alpha * 0.35 : alpha];
      this.tintTimer = seconds;
    }

    // --- Orders
    toWorld(clientX, clientY) {
      const cam = this.cam || { x: 0, y: 0 }, engine = this.view.engine;
      return { x: (clientX / engine.cellSize[0] + cam.x) / TILE_W, y: (clientY / engine.cellSize[1] + cam.y) / TILE_H };
    }
    visibleFoe(u) {
      if (!B.alive(u) || u.team === 0 || u.invisible > 0 || (u.type === 'hero' && u.dead > 0)) return false;
      return this.sight[Math.floor(u.y) * B.WIDTH + Math.floor(u.x)] === 2;
    }
    // The visible enemy or neutral under a point, preferring heroes.
    unitAt(point, slack = 0.6) {
      let best = null, bestScore = Infinity;
      for (const u of this.state.units) {
        if (!this.visibleFoe(u)) continue;
        const reach = u.type === 'hero' ? 1.3 : u.type === 'colossus' ? 2.4 : u.type === 'banner' ? 2 : u.type === 'tower' ? 1.5 : 1;
        const d = Math.hypot(point.x - u.x, (point.y - (u.type === 'tower' ? u.y - 0.6 : u.y)) * 1.2);
        if (d > reach + slack) continue;
        const score = d - (u.type === 'hero' ? 0.6 : 0);
        if (score < bestScore) { bestScore = score; best = u; }
      }
      return best;
    }
    command(point, rightClick) {
      const target = this.unitAt(point, this.touch ? 1.1 : 0.6);
      if (target && !(this.armed && !rightClick)) {
        this.pending.order = { kind: 'attack', id: target.id };
        this.mark(target, true);
      } else {
        this.pending.order = { kind: this.armed && !rightClick ? 'attackMove' : 'move', x: point.x, y: point.y };
        this.mark(point, this.armed);
      }
      this.disarm();
    }
    disarm() {
      this.armed = false;
      if (this.el.arm) this.el.arm.hidden = true;
    }
    mark(point, hostile) {
      this.marks.push({ x: point.x, y: point.y, r: 0.9, kind: 7, team: hostile ? 1 : 0, life: 0.45 });
    }
    // Keys cast at the cursor; buttons and touch aim at the nearest sensible target.
    castSlot(slot, atCursor) {
      const s = this.state, p = B.playerHero(s);
      if (!B.canCast(p, slot)) {
        this.sound.play('denied');
        const spec = B.HEROES[p.kind].abilities[slot];
        if (slot === 3 && p.level < 6) this.toast(`${spec.name} unlocks at level 6.`);
        else if (p.mana < spec.mana) this.toast(`Not enough mana for ${spec.name}.`);
        return;
      }
      const spec = B.HEROES[p.kind].abilities[slot];
      let aim = atCursor && this.mouse.known && !this.touch ? this.toWorld(this.mouse.x, this.mouse.y) : null;
      if (!aim) {
        const reach = (spec.range || 4) + 2;
        const foes = s.units.filter(u => this.visibleFoe(u) && u.type !== 'tower' && u.type !== 'banner' && dist(u, p) < reach);
        const target = foes.filter(u => u.type === 'hero').sort((a, b) => dist(a, p) - dist(b, p))[0] || foes.sort((a, b) => dist(a, p) - dist(b, p))[0];
        aim = target ? { x: target.x, y: target.y } : { x: p.x + p.facing * 4, y: p.y };
      }
      this.pending.cast = { slot, x: aim.x, y: aim.y };
    }

    // --- Panels
    renderShop() {
      const s = this.state, p = B.playerHero(s), home = B.atBase(p, 1), list = this.el['shop-list'];
      this.el['shop-gold'].textContent = `${Math.floor(p.gold)} gold`;
      this.el['shop-note'].textContent = home ? `Click an item to buy it. ${p.items.length}/${B.SLOTS} slots used.` : 'You can only buy at your base. Press B to recall home.';
      list.textContent = '';
      for (const [id, item] of Object.entries(B.ITEMS)) {
        const button = document.createElement('button'), full = id !== 'potion' && p.items.length >= B.SLOTS;
        button.type = 'button';
        button.dataset.item = id;
        const ready = home && p.gold >= item.cost && !full;
        button.disabled = !ready;
        button.className = ready ? 'item ready' : 'item';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const cost = document.createElement('em');
        cost.textContent = item.cost;
        const text = document.createElement('small');
        text.textContent = item.text + (full ? ' · bag full' : '');
        button.append(name, cost, text);
        list.append(button);
      }
      this.shopKey = `${Math.floor(p.gold)}|${home}|${p.items.join()}`;
    }
    renderBoard() {
      const body = this.el['board-body'];
      body.textContent = '';
      for (const h of B.heroes(this.state)) {
        const row = document.createElement('tr');
        row.className = h.team === 0 ? 'blue' : 'red';
        const cells = [`${B.HEROES[h.kind].name}${h.player ? ' (you)' : ''}`, h.level, `${h.kills} / ${h.deaths} / ${h.assists}`, h.cs, h.items.map(id => B.ITEMS[id].name).join(', ') || '-'];
        for (const text of cells) { const td = document.createElement('td'); td.textContent = text; row.append(td); }
        body.append(row);
      }
    }

    // --- Rule events to feedback
    burst(x, y, chars, colour, count = 5) {
      if (this.reducedMotion) count = Math.min(2, count);
      for (let i = 0; i < count && this.particles.length < 60; i++) {
        this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: -1.5 - Math.random() * 3, life: 0.45 + Math.random() * 0.3, char: chars[i % chars.length], colour, gravity: 10 });
      }
    }
    number(x, y, text, colour) {
      [...String(text)].forEach((char, i) => this.particles.push({ x: x - 0.2 + i * 0.34, y: y - 1.2, vx: 0, vy: -1.6, life: 0.75, char, colour, gravity: 0 }));
    }
    handle(events) {
      const s = this.state, p = B.playerHero(s);
      for (const e of events) {
        const near = e.x === undefined || Math.hypot(e.x - p.x, e.y - p.y) < 18;
        switch (e.type) {
          case 'hit':
            if (e.target === p.id) { this.number(e.x, e.y, e.amount, [255, 96, 80]); this.pulse(0.7, 0.05, 0.04, 0.16, 0.15); if (e.amount > 40) this.sound.play('hurt'); }
            else if (e.source === p.id) this.number(e.x, e.y, e.amount, e.ability ? [255, 220, 120] : [255, 255, 255]);
            break;
          case 'strike': if (near) this.sound.play('strike'); break;
          case 'shoot': if (e.id === p.id) this.sound.play('shoot'); break;
          case 'gold': this.sound.play('gold'); this.number(e.x, e.y - 0.6, '+' + e.amount, [255, 214, 90]); break;
          case 'cast':
            if (near) this.sound.play('cast');
            if (e.id === p.id) this.marks.push({ x: e.x, y: e.y, r: 1.4, kind: 5, team: 0, life: 0.3 });
            break;
          case 'burst':
            if (near) { this.sound.play('boom'); this.shake = e.kind === 'meteor' ? 0.4 : 0.15; }
            this.marks.push({ x: e.x, y: e.y, r: e.r, kind: 5, team: e.kind === 'slam' ? 2 : 1, life: 0.4 });
            this.burst(e.x, e.y, ['*', '+', '.'], e.kind === 'slam' ? [200, 150, 255] : [255, 150, 60], 8);
            break;
          case 'snap': this.burst(e.x, e.y, ['^', '*'], [255, 220, 120], 6); break;
          case 'level':
            if (e.id === p.id) { this.sound.play('level'); this.pulse(1, 0.85, 0.4, 0.18, 0.4); this.toast(e.level === 6 ? `Level 6! Your ultimate (R) is ready: ${B.HEROES[p.kind].abilities[3].name}.` : `Level ${e.level}.`); this.buildHotbarKey = ''; }
            break;
          case 'heroKill':
            if (e.victim === p.id) { this.sound.play('death'); this.pulse(0.3, 0, 0, 0.5, 0.8); this.toast('You fell. Your hero returns to base shortly.'); }
            else if (e.killer === p.id) { this.sound.play('kill'); this.toast('Hero down!'); }
            else this.sound.play('kill');
            this.burst(e.x, e.y, ['*', '%', '.'], e.team === 0 ? [255, 120, 90] : [120, 180, 255], 10);
            break;
          case 'towerDown':
            this.sound.play('tower');
            this.shake = 0.5;
            this.burst(e.x, e.y, ['#', '%', '.', '*'], [200, 190, 170], 14);
            this.toast(e.team === 1 ? 'A red tower fell!' : 'We lost a tower!');
            break;
          case 'minionDown': if (near && Math.random() < 0.5) this.burst(e.x, e.y, ['.', ','], e.team === 0 ? [96, 172, 255] : [240, 96, 84], 2); break;
          case 'beastDown': this.burst(e.x, e.y, ['.', '*'], [240, 170, 80], 5); break;
          case 'colossusUp': this.sound.play('roar'); this.toast('The Colossus has risen in the river pit!'); break;
          case 'colossusDown': this.sound.play('horn'); this.toast(e.team === 0 ? 'Blue slew the Colossus! Our minions surge.' : 'Red slew the Colossus. Their minions surge.'); break;
          case 'wave': if (e.wave === 1) { this.sound.play('horn'); this.toast('The first minions march!'); } break;
          case 'recall': if (e.id === p.id) this.sound.play('recall'); break;
          case 'recalled': if (e.id === p.id) { this.toast('Home. Heal up and shop (S).'); } break;
          case 'buy': if (e.id === p.id) { this.sound.play('buy'); this.toast(`Bought ${B.ITEMS[e.item].name}.`); } break;
          case 'victory':
          case 'defeat':
            if (this.ended) break;
            this.ended = true;
            this.sound.play(e.type);
            this.record();
            this.pulse(e.type === 'victory' ? 1 : 0.4, e.type === 'victory' ? 0.8 : 0.05, e.type === 'victory' ? 0.3 : 0.05, 0.45, 1.2);
            setTimeout(() => this.showEnd(), 1600);
            break;
        }
      }
    }
    showEnd() {
      const s = this.state, p = B.playerHero(s), won = s.status === 'won';
      this.el['end-title'].textContent = won ? 'The red banner burns' : 'Your banner has fallen';
      this.el['end-detail'].textContent = `${won ? 'Victory' : 'Defeat'} in ${clock(s.endTime || s.time)} as ${B.HEROES[p.kind].name}: ${p.kills} kills, ${p.deaths} deaths, ${p.assists} assists, ${p.cs} minions, level ${p.level}.`;
      this.el['end-score'].textContent = `Score ${B.score(s)} · team kills ${s.kills[0]} to ${s.kills[1]} · ${B.DIFFICULTIES[s.difficulty].label} · seed ${s.seed}`;
      this.show('end');
    }

    // --- HUD
    updateHud() {
      const s = this.state, p = B.playerHero(s), hero = B.HEROES[p.kind];
      this.el.who.textContent = `${hero.name} · level ${p.level}`;
      this.el.hp.textContent = `${Math.max(0, Math.ceil(p.hp))}/${Math.round(p.maxHp)}`;
      this.el['hp-bar'].style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`;
      this.el['hp-bar'].classList.toggle('low', p.hp < p.maxHp * 0.3 && p.dead === 0);
      this.el.mana.textContent = `${Math.floor(p.mana)}/${Math.round(p.maxMana)}`;
      this.el['mana-bar'].style.width = `${clamp(p.mana / p.maxMana * 100, 0, 100)}%`;
      this.el['xp-bar'].style.width = p.level >= 10 ? '100%' : `${clamp(p.xp / B.xpNeed(p.level) * 100, 0, 100)}%`;
      this.el.gold.textContent = `${Math.floor(p.gold)} gold`;
      this.el.score.textContent = `BLUE ${s.kills[0]} : ${s.kills[1]} RED · ${clock(s.time)}`;
      this.el.objective.textContent = B.objective(s);
      const panelBottom = Math.ceil(this.el.stats.getBoundingClientRect().bottom);
      if (panelBottom !== this.panelBottom) {
        this.panelBottom = panelBottom;
        document.documentElement.style.setProperty('--stats-bottom', panelBottom + 'px');
      }
      const items = p.items.map(id => B.ITEMS[id].name).join(' · ');
      if (items !== this.itemsText) { this.itemsText = items; this.el.items.textContent = items || 'No items yet. Shop at base (S).'; }
      // Ability buttons
      const buttons = this.el.hotbar.children;
      for (let slot = 0; slot < 4; slot++) {
        const spec = hero.abilities[slot], button = buttons[slot], cd = p.cooldowns[slot];
        const locked = slot === 3 && p.level < 6, ready = B.canCast(p, slot);
        const key = `${p.kind}|${locked}|${ready}|${Math.ceil(cd)}|${p.mana >= spec.mana}`;
        if (button.dataset.key === key) continue;
        button.dataset.key = key;
        button.querySelector('i').textContent = spec.key;
        button.querySelector('b').textContent = spec.name;
        button.querySelector('small').textContent = locked ? 'Level 6' : `${spec.mana} mana`;
        button.querySelector('.cool').textContent = cd > 0 ? Math.ceil(cd) : '';
        button.title = `${spec.name}: ${spec.text}`;
        button.setAttribute('aria-label', `${spec.key} ${spec.name}${locked ? ', unlocks at level 6' : cd > 0 ? `, ready in ${Math.ceil(cd)} seconds` : ''}`);
        button.classList.toggle('ready', ready);
        button.classList.toggle('locked', locked);
      }
      buttons[4].classList.toggle('active', p.recall > 0);
      buttons[4].querySelector('.cool').textContent = p.recall > 0 ? p.recall.toFixed(1) : '';
      if (this.shopOpen) {
        const shopKey = `${Math.floor(p.gold)}|${B.atBase(p, 1)}|${p.items.join()}`;
        if (shopKey !== this.shopKey) this.renderShop();
      }
      if (this.boardOpen) this.renderBoard();
      const logKey = s.log.map(l => l.time).join();
      if (logKey !== this.logKey) {
        this.logKey = logKey;
        this.el.log.textContent = '';
        for (const line of s.log.slice(-4)) {
          const div = document.createElement('div');
          div.textContent = line.text;
          div.className = line.team === 0 ? 'blue' : line.team === 1 ? 'red' : '';
          this.el.log.append(div);
        }
      }
    }
    updateFog(state) {
      B.vision(state, 0, this.sight);
      for (let i = 0; i < this.sight.length; i++) {
        if (this.sight[i] === 2) this.explored[i] = 1;
        this.shown[i] = this.sight[i] === 2 ? 2 : this.explored[i];
      }
    }
    drawMinimap(state) {
      const c = this.minimap, ctx = c.getContext('2d'), map = B.mapFor(state.seed), w = c.width, h = c.height, sx = w / B.WIDTH, sy = h / B.HEIGHT;
      if (!this.minimapBase || this.minimapSeed !== state.seed) {
        this.minimapSeed = state.seed;
        const img = ctx.createImageData(B.WIDTH, B.HEIGHT), tones = [[24, 52, 26], [46, 58, 34], [118, 96, 64], [40, 86, 150], [70, 74, 92], [72, 58, 84]];
        for (let i = 0; i < map.tiles.length; i++) img.data.set([...tones[map.tiles[i]], 255], i * 4);
        this.minimapBase = img;
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.width = B.WIDTH;
        this.minimapCanvas.height = B.HEIGHT;
      }
      const base = this.minimapCanvas.getContext('2d'), img = base.createImageData(B.WIDTH, B.HEIGHT);
      for (let i = 0; i < this.shown.length; i++) {
        const k = this.shown[i] === 2 ? 1 : this.shown[i] === 1 ? 0.6 : 0.4;
        img.data[i * 4] = this.minimapBase.data[i * 4] * k;
        img.data[i * 4 + 1] = this.minimapBase.data[i * 4 + 1] * k;
        img.data[i * 4 + 2] = this.minimapBase.data[i * 4 + 2] * k;
        img.data[i * 4 + 3] = 255;
      }
      base.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.minimapCanvas, 0, 0, w, h);
      const dot = (u, size, colour) => { ctx.fillStyle = colour; ctx.fillRect(u.x * sx - size / 2, u.y * sy - size / 2, size, size); };
      for (const u of state.units) {
        if (!B.alive(u) || (u.type === 'hero' && u.dead > 0)) continue;
        if (u.team !== 0 && !this.visibleFoe(u)) continue;
        const colour = u.team === 0 ? '#60acff' : u.team === 1 ? '#f06054' : '#e8c060';
        if (u.type === 'tower' || u.type === 'banner') dot(u, u.type === 'banner' ? 7 : 5, colour);
        else if (u.type === 'hero') dot(u, u.player ? 6 : 5, u.player ? '#9cf08c' : colour);
        else dot(u, u.type === 'colossus' ? 6 : 2, colour);
      }
      if (this.cam) {
        ctx.strokeStyle = '#ffffffaa';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.cam.x / TILE_W * sx + 0.5, this.cam.y / TILE_H * sy + 0.5, this.view.columns / TILE_W * sx, this.view.rows / TILE_H * sy);
      }
    }

    // --- Frame
    gatherInput() {
      const k = this.keys, pad = this.pad, input = this.pending;
      this.pending = {};
      let mx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0), my = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
      if (pad.connected) { mx += pad.axis(0); my += pad.axis(1); }
      if (Math.hypot(mx, my) > 0.3) { input.moveX = mx; input.moveY = my; }
      return input;
    }
    pollPad() {
      const pad = this.pad;
      if (this.mode !== 'play') {
        if (pad.pressed(0)) document.activeElement?.click?.();
        if (pad.pressed(9) && this.mode === 'pause') this.show('play');
        return;
      }
      if (pad.pressed(9)) this.show('pause');
      if (pad.pressed(8)) this.toggleShop();
      if (pad.pressed(4)) this.pending.recall = true;
      [[2, 0], [3, 1], [1, 2], [5, 3]].forEach(([button, slot]) => { if (pad.pressed(button)) this.castSlot(slot, false); });
      if (pad.pressed(0)) {
        const p = B.playerHero(this.state);
        const foe = this.state.units.filter(u => this.visibleFoe(u) && u.team !== 2 && dist(u, p) < 9).sort((a, b) => dist(a, p) - dist(b, p))[0];
        if (foe) this.pending.order = { kind: 'attack', id: foe.id };
      }
    }
    collectSprites(state, cam, playing) {
      const sprites = [], toCell = (x, y) => ({ x: Math.round(x * TILE_W) - cam.x, y: Math.round(y * TILE_H) - cam.y });
      const onScreen = (s, w, h) => s.x + w >= 0 && s.y + h >= -1 && s.x < this.view.columns && s.y < this.view.rows;
      for (const part of this.particles) {
        const at = toCell(part.x, part.y);
        if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: part.char, colour: part.colour });
      }
      for (const shot of state.projectiles) {
        const at = toCell(shot.x, shot.y);
        if (!onScreen(at, 1, 1) || (playing && this.sight[Math.floor(shot.y) * B.WIDTH + Math.floor(shot.x)] !== 2)) continue;
        const target = B.unitById(state, shot.target), dx = target ? target.x - shot.x : 1, dy = target ? target.y - shot.y : 0;
        const char = shot.kind === 'shell' ? '@' : shot.kind === 'bolt' ? '*' : Math.abs(dy) > Math.abs(dx) * 1.5 ? '|' : Math.abs(dx) > Math.abs(dy) * 1.5 ? '-' : (dx > 0) === (dy > 0) ? '\\' : '/';
        sprites.push({ x: at.x, y: at.y, char, colour: shot.kind === 'shell' ? [255, 200, 120] : shot.team === 0 ? [170, 215, 255] : [255, 170, 150] });
      }
      for (const e of state.effects) {
        if (e.kind !== 'fireball') continue;
        const at = toCell(e.x, e.y);
        if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: '@', colour: [255, 140, 50] });
      }
      const list = [];
      for (const u of state.units) {
        if (u.type === 'hero' && u.dead > 0) continue;
        if (!B.alive(u) && u.type !== 'tower') continue;
        if (playing && u.team !== 0 && !this.visibleFoe(u) && u.type !== 'tower' && u.type !== 'banner') continue;
        if (playing && (u.type === 'tower' || u.type === 'banner') && u.team !== 0 && !this.explored[Math.floor(u.y) * B.WIDTH + Math.floor(u.x)]) continue;
        list.push(u);
      }
      // Nearer the bottom of the screen draws on top.
      list.sort((a, b) => b.y - a.y);
      const bob = u => Math.floor(this.time * 4 + u.id * 0.37) % 2 === 1;
      for (const u of list) {
        let frame, w, h, dy;
        if (u.type === 'hero') { frame = u.kind + (u.anim > 0 ? 'A' : u.moving && bob(u) ? 'B' : ''); w = 3; h = 3; dy = 2.2; }
        else if (u.type === 'minion') { frame = u.kind + (u.moving && bob(u) ? 'B' : ''); w = u.kind === 'siege' ? 3 : 2; h = 2; dy = 1.3; }
        else if (u.type === 'tower') { frame = B.alive(u) ? 'tower' : 'rubble'; w = 3; h = 4; dy = 3.2; }
        else if (u.type === 'banner') { frame = Math.floor(this.time * 1.5) % 2 ? 'bannerB' : 'banner'; w = 5; h = 5; dy = 4; }
        else if (u.type === 'beast') { frame = u.moving && bob(u) ? 'beastB' : 'beast'; w = 3; h = 2; dy = 1.3; }
        else if (u.type === 'colossus') { frame = u.anim > 0 ? 'colossusB' : 'colossus'; w = 7; h = 4; dy = 3; }
        else continue;
        const at = { x: Math.round(u.x * TILE_W - w / 2), y: Math.round(u.y * TILE_H - dy) - cam.y };
        at.x -= cam.x;
        if (!onScreen(at, w, h)) continue;
        const facing = u.type === 'banner' ? (u.team === 0 ? 1 : -1) : u.facing;
        const bar = B.alive(u) && (u.hp < u.maxHp || u.type === 'hero' || u.type === 'tower' || u.type === 'banner')
          ? { fill: u.hp / u.maxHp, colour: u.player ? BAR.self : u.team === 0 ? BAR.ally : u.team === 1 ? BAR.foe : BAR.neutral } : null;
        sprites.push({ x: at.x, y: at.y, frame: facing < 0 ? frame + '.left' : frame, team: TEAM[u.team], flash: u.flash > 0.08, shade: u.invisible > 0, bar });
      }
      return sprites;
    }
    collectFx(state, playing) {
      const fx = [], p = playing ? B.playerHero(state) : null;
      for (const e of state.effects) {
        if (e.kind === 'trap' && e.team !== 0) continue;
        const kind = { trap: 1, storm: 2, frost: 3, meteor: 4 }[e.kind];
        if (!kind) continue;
        fx.push({ x: e.x, y: e.y, r: e.r, kind, progress: e.kind === 'meteor' ? clamp(e.time / 1.2, 0, 1) : 0, team: e.team });
      }
      for (const m of this.marks) fx.push({ x: m.x, y: m.y, r: m.r, kind: m.kind, progress: 1 - m.life / 0.45, team: m.team });
      for (const h of B.heroes(state)) if (h.recall > 0 && (h.team === 0 || !playing || this.visibleFoe(h))) fx.push({ x: h.x, y: h.y, r: 1.3, kind: 6, team: h.team });
      if (p && this.mode === 'play' && this.mouse.known) {
        const hover = this.unitAt(this.toWorld(this.mouse.x, this.mouse.y));
        if (hover) fx.push({ x: hover.x, y: hover.y, r: hover.type === 'colossus' ? 2.2 : hover.type === 'banner' ? 1.8 : 1.1, kind: 7, team: hover.team === 2 ? 2 : 1 });
      }
      if (p && p.order && p.order.kind === 'attack') {
        const target = B.unitById(state, p.order.id);
        if (target && this.visibleFoe(target)) fx.push({ x: target.x, y: target.y, r: target.type === 'colossus' ? 2.2 : 1.1, kind: 7, team: target.team === 2 ? 2 : 1 });
      }
      return fx;
    }
    frame(now) {
      const elapsed = Math.min(50, now - this.last), dt = elapsed / 1000;
      this.quality.sample(now - this.last);
      this.last = now;
      this.time += dt;
      this.pad.poll();
      if (this.pad.connected) this.pollPad();

      const playing = Boolean(this.state) && this.mode !== 'title';
      const state = playing ? this.state : this.demo;
      if (this.mode === 'play' && this.state.status === 'play' || (!playing && !this.reducedMotion)) {
        this.accumulator += elapsed;
        let steps = 0;
        while (this.accumulator >= STEP_MS && steps < 4) {
          const events = B.step(state, playing ? this.gatherInput() : { auto: true });
          if (playing) this.handle(events);
          this.accumulator -= STEP_MS;
          steps++;
          if (state.status !== 'play') break;
        }
        if (steps === 4) this.accumulator = 0;
        if (!playing && state.status !== 'play') { this.demo = B.newGame('title-' + Math.floor(this.time), 'ranger', 'normal'); }
      }
      if (playing) {
        this.hudTimer += dt;
        if (this.hudTimer > 0.1) { this.hudTimer = 0; this.updateHud(); }
        this.saveTimer += dt;
        if (this.saveTimer > 20 && this.mode === 'play') { this.saveTimer = 0; this.save(); }
      }
      this.fogTimer -= dt;
      if (this.fogTimer <= 0) {
        this.fogTimer = 0.1;
        if (playing) this.updateFog(state);
        else { this.sight.fill(2); this.shown.fill(2); }
        this.drawMinimap(state);
      }
      for (const part of this.particles) {
        part.vy += part.gravity * dt;
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.life -= dt;
      }
      this.particles = this.particles.filter(part => part.life > 0);
      for (const m of this.marks) m.life -= dt;
      this.marks = this.marks.filter(m => m.life > 0);
      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      }
      this.shake = Math.max(0, this.shake - dt);

      let centre;
      if (playing) {
        const p = B.playerHero(state);
        centre = p.dead > 0 ? B.BASES[0] : p;
      } else {
        const t = this.reducedMotion ? 0 : this.time * 0.03;
        centre = { x: B.WIDTH / 2 + Math.sin(t) * 30, y: B.HEIGHT / 2 + Math.sin(t * 1.7) * 14 };
      }
      const cam = this.view.camera(centre.x, centre.y);
      if (this.shake > 0 && !this.reducedMotion) {
        cam.x += Math.round((Math.random() - 0.5) * 3);
        cam.y += Math.round((Math.random() - 0.5) * 2);
      }
      this.cam = cam;
      const walls = new Map();
      for (const e of state.effects) if (e.kind === 'wall') for (const i of e.tiles) walls.set(i, e.team + 1);
      try {
        this.view.uploadMap(B.mapFor(state.seed).tiles, this.shown, walls);
        this.view.draw({
          cam, time: this.reducedMotion ? 0 : this.time, tint: this.tint, dissolve: 0,
          sprites: this.collectSprites(state, cam, playing), fx: this.collectFx(state, playing)
        });
      } catch (error) { this.fatal(error); return; }
      requestAnimationFrame(this.frame);
    }
    fatal(error) {
      console.error(error);
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
    }
  }

  global.addEventListener('DOMContentLoaded', () => {
    try {
      global.bannerfall = new BannerfallApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

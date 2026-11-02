/* Inkfire app: real-time loop, keyboard/mouse/touch input, Web Audio synth,
 * pause, mute, HUD, and localStorage persistence around the pure Inkfire rules. */
(function (global) {
  'use strict';

  const I = global.Inkfire;
  const EYE = 1.05;

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  class Sound {
    constructor() {
      this.muted = false;
      this.context = null;
    }
    ensure() {
      if (this.muted) return null;
      const Audio = global.AudioContext || global.webkitAudioContext;
      if (!Audio) return null;
      if (!this.context) {
        try {
          this.context = new Audio();
          this.master = this.context.createGain();
          this.master.gain.value = 0.32;
          this.master.connect(this.context.destination);
        } catch {
          return null;
        }
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return this.context;
    }
    tone(frequency, duration, { type = 'square', volume = 0.12, slide = 0, delay = 0 } = {}) {
      const c = this.ensure();
      if (!c) return;
      const now = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(25, frequency + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    noise(duration, { volume = 0.15, filter = 1000, delay = 0 } = {}) {
      const c = this.ensure();
      if (!c) return;
      const now = c.currentTime + delay;
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = c.createBufferSource();
      const biquad = c.createBiquadFilter();
      const gain = c.createGain();
      biquad.type = 'lowpass';
      biquad.frequency.value = filter;
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.onended = () => { source.disconnect(); biquad.disconnect(); gain.disconnect(); };
    }
    play(name) {
      switch (name) {
        case 'pistol':
          this.noise(0.09, { volume: 0.16, filter: 1800 });
          this.tone(240, 0.08, { type: 'sawtooth', slide: -160, volume: 0.14 });
          break;
        case 'shotgun':
          this.noise(0.18, { volume: 0.22, filter: 1200 });
          this.tone(140, 0.15, { type: 'sawtooth', slide: -95, volume: 0.18 });
          break;
        case 'chaingun':
          this.noise(0.06, { volume: 0.14, filter: 2200 });
          this.tone(290, 0.05, { type: 'square', slide: -140, volume: 0.12 });
          break;
        case 'launcher':
          this.noise(0.24, { volume: 0.18, filter: 700 });
          this.tone(110, 0.22, { type: 'sawtooth', slide: -60, volume: 0.16 });
          break;
        case 'empty':
          this.tone(600, 0.04, { type: 'triangle', volume: 0.08 });
          break;
        case 'switch':
          this.tone(440, 0.05, { type: 'triangle', slide: 180, volume: 0.08 });
          break;
        case 'hit':
          this.tone(190, 0.07, { slide: -80, volume: 0.10 });
          break;
        case 'die':
          this.tone(220, 0.28, { type: 'sawtooth', slide: -170, volume: 0.14 });
          break;
        case 'explode':
          this.noise(0.42, { volume: 0.26, filter: 420 });
          this.tone(85, 0.35, { type: 'sawtooth', slide: -55, volume: 0.18 });
          break;
        case 'hurt':
          this.tone(120, 0.20, { type: 'sawtooth', slide: -50, volume: 0.16 });
          break;
        case 'pickup':
          this.tone(587, 0.07, { type: 'triangle', volume: 0.10 });
          this.tone(880, 0.11, { type: 'triangle', volume: 0.10, delay: 0.06 });
          break;
        case 'door':
          this.noise(0.32, { volume: 0.12, filter: 240 });
          this.tone(80, 0.30, { type: 'sawtooth', slide: 30, volume: 0.06 });
          break;
        case 'locked':
          this.tone(150, 0.09, { type: 'square', volume: 0.12 });
          this.tone(120, 0.12, { type: 'square', volume: 0.12, delay: 0.09 });
          break;
        case 'win':
          [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', volume: 0.12, delay: i * 0.10 }));
          break;
        case 'player_die':
          [220, 196, 165, 110].forEach((f, i) => this.tone(f, 0.35, { type: 'sawtooth', volume: 0.10, delay: i * 0.15 }));
          break;
      }
    }
  }

  class InkfireApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.InkfireView(this.canvas);
      this.sound = new Sound();
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

      const ids = [
        'title', 'pause', 'help', 'end', 'hud', 'log', 'minimap', 'touch',
        'end-title', 'end-detail', 'end-score', 'continue',
        'hp', 'hp-bar', 'armour', 'armour-bar', 'weapon', 'ammo', 'keys', 'score', 'kills',
        'toast', 'mute', 'pause-btn'
      ];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

      this.state = null;
      this.mode = 'title';
      this.held = new Set();
      this.touchHeld = new Set();
      this.touchPointers = new Map();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.pendingWeapon = null;
      this.pendingUse = false;
      this.pendingShot = false;
      this.mouseTurn = 0;

      this.camera = { x: 0, y: EYE, z: 0, yaw: 0, pitch: 0 };
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.dissolve = 0;
      this.shake = 0;
      this.muzzleFlash = 0;
      this.bobPhase = 0;
      this.effects = [];
      this.saveTimer = 0;
      this.hudTimer = 0;
      this.time = 0;
      this.last = performance.now();

      // Pre-allocated scene buffers to prevent per-frame allocations
      this._spritePool = Array.from({ length: 96 }, () => ({
        x: 0, y: 0, z: 0, size: 1, frame: 0, material: 10, flash: 0, selfLit: false, dist: 0
      }));
      this._activeSprites = [];
      this._lightPool = Array.from({ length: 32 }, () => ({
        x: 0, y: 0, z: 0, intensity: 1, r: 1, g: 1, b: 1, dist: 0
      }));
      this._activeLights = [];
      this._stepInput = { moveX: 0, moveY: 0, turn: 0, shoot: false, use: false, switchWeapon: null };

      // Pre-cache frame indices from atlas
      this.frames = {};
      for (const m of ['trooper', 'spitter', 'brute', 'wisp', 'titan']) {
        for (const f of ['walk0', 'walk1', 'attack', 'corpse']) {
          this.frames[`${m}.${f}`] = this.view.frameIndex(`${m}.${f}`);
        }
      }
      for (const item of [
        'fireball', 'plasma', 'rocket', 'burst.small', 'burst.large',
        'medkit', 'stim', 'armour', 'clip', 'bulletbox', 'shells', 'shellbox', 'rockets', 'rocketbox',
        'key.red', 'key.blue', 'barrel', 'barrel.hot',
        'lamp.warm', 'lamp.cold', 'lamp.red',
        'gun.shotgun', 'gun.chaingun', 'gun.launcher',
        'view.pistol', 'view.shotgun', 'view.chaingun', 'view.chaingun.spin', 'view.launcher', 'view.flash'
      ]) {
        this.frames[item] = this.view.frameIndex(item);
      }

      this.demo = I.newGame('title-' + today());
      this.view.updateMap(this.demo);
      this.placeCamera(this.demo);

      this.bind();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bind() {
      global.addEventListener('resize', () => this.resize());

      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause') this.show('play');
          else if (this.mode === 'help') this.show(this.state && !this.state.dead && !this.state.won ? 'pause' : 'title');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') {
          event.preventDefault();
          this.newRun();
          return;
        }
        if (this.mode === 'end' && (event.code === 'Enter' || event.code === 'Space')) {
          event.preventDefault();
          this.newRun();
          return;
        }
        if (this.mode !== 'play') return;

        if (event.code === 'KeyM') {
          this.el.minimap.classList.toggle('large');
          return;
        }
        if (event.code === 'Digit1') { this.pendingWeapon = 1; return; }
        if (event.code === 'Digit2') { this.pendingWeapon = 2; return; }
        if (event.code === 'Digit3') { this.pendingWeapon = 3; return; }
        if (event.code === 'Digit4') { this.pendingWeapon = 4; return; }
        if (event.code === 'Enter') {
          event.preventDefault();
          this.pendingUse = true;
          return;
        }
        if (event.code === 'Space' || event.code === 'KeyF' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
          event.preventDefault();
          this.pendingShot = true;
        }
        this.held.add(event.code);
      });

      global.addEventListener('keyup', event => {
        this.held.delete(event.code);
      });

      global.addEventListener('blur', () => {
        this.held.clear();
        this.clearTouch();
      });

      // Mouse look & click to fire when playing
      this.canvas.addEventListener('mousedown', event => {
        if (this.mode !== 'play') return;
        if (event.button === 0) {
          this.pendingShot = true;
          this.held.add('Mouse0');
          if (this.canvas.requestPointerLock && !document.pointerLockElement) {
            this.canvas.requestPointerLock().catch?.(() => {});
          }
        }
      });
      global.addEventListener('mouseup', event => {
        if (event.button === 0) this.held.delete('Mouse0');
      });
      global.addEventListener('mousemove', event => {
        if (this.mode === 'play' && document.pointerLockElement === this.canvas) {
          this.mouseTurn += event.movementX * 0.003;
        }
      });

      const difficulty = document.getElementById('difficulty');
      try {
        const stored = localStorage.getItem('inkfire-difficulty');
        if (I.DIFFICULTIES[stored]) difficulty.value = stored;
      } catch {}
      difficulty.addEventListener('change', () => {
        try { localStorage.setItem('inkfire-difficulty', difficulty.value); } catch {}
      });

      document.getElementById('new-run').addEventListener('click', () => this.newRun());
      document.getElementById('daily-run').addEventListener('click', () => this.newRun('daily-' + today()));
      this.el.continue.addEventListener('click', () => this.resume());
      document.getElementById('how-to').addEventListener('click', () => this.show('help'));
      document.getElementById('help-back').addEventListener('click', () => {
        this.show(this.state && !this.state.dead && !this.state.won ? 'play' : 'title');
      });

      // Pause modal buttons
      this.el['pause-btn'].addEventListener('click', () => {
        if (this.mode === 'play') this.show('pause');
        else if (this.mode === 'pause') this.show('play');
      });
      document.getElementById('resume-btn').addEventListener('click', () => this.show('play'));
      document.getElementById('pause-help').addEventListener('click', () => this.show('help'));
      document.getElementById('pause-restart').addEventListener('click', () => this.newRun(this.state?.seed, this.state?.difficulty));
      document.getElementById('pause-title').addEventListener('click', () => {
        this.save();
        this.show('title');
      });

      // End modal buttons
      document.getElementById('end-again').addEventListener('click', () => this.newRun());
      document.getElementById('end-same').addEventListener('click', () => this.newRun(this.state?.seed, this.state?.difficulty));
      document.getElementById('end-menu').addEventListener('click', () => this.show('title'));

      // Mute toggle with localStorage persistence
      const updateMuteLabel = () => {
        this.el.mute.textContent = this.sound.muted ? 'Sound off' : 'Sound on';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        updateMuteLabel();
        try { localStorage.setItem('inkfire-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try { this.sound.muted = localStorage.getItem('inkfire-muted') === '1'; } catch {}
      updateMuteLabel();

      // Touch controls
      this.el.touch.addEventListener('pointerdown', event => {
        const btn = event.target.closest('button');
        if (!btn) return;
        event.preventDefault();
        if (btn.dataset.hold) {
          this.touchPointers.set(event.pointerId, btn.dataset.hold);
          this.syncTouch();
          if (btn.dataset.hold === 'shoot') this.pendingShot = true;
        } else if (btn.dataset.action) {
          const act = btn.dataset.action;
          if (act === 'pause') this.show('pause');
          else if (act === 'use') this.pendingUse = true;
          else if (act === 'nextWeapon') this.cycleWeapon(1);
          else if (act === 'prevWeapon') this.cycleWeapon(-1);
        }
      });
      const releaseTouch = event => {
        this.touchPointers.delete(event.pointerId);
        this.syncTouch();
      };
      global.addEventListener('pointerup', releaseTouch);
      global.addEventListener('pointercancel', releaseTouch);
      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    syncTouch() {
      this.touchHeld.clear();
      for (const hold of this.touchPointers.values()) this.touchHeld.add(hold);
    }

    clearTouch() {
      this.touchPointers.clear();
      this.touchHeld.clear();
    }

    cycleWeapon(direction) {
      if (!this.state) return;
      const order = ['pistol', 'shotgun', 'chaingun', 'launcher'];
      const p = this.state.player;
      const at = order.indexOf(p.weapon);
      for (let i = 1; i < order.length; i++) {
        const next = (at + direction * i + order.length * 2) % order.length;
        if (p.weapons[order[next]]) {
          this.pendingWeapon = next + 1;
          return;
        }
      }
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.el.touch.hidden = false;
    }

    resize() {
      const coarse = global.innerWidth < 700;
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      this.view.resize(global.innerWidth, global.innerHeight, this.quality.cell(coarse ? [7, 10] : [8, 12]));
    }

    show(mode) {
      this.mode = mode;
      this.held.clear();
      this.clearTouch();
      if (mode !== 'play' && document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      for (const name of ['title', 'pause', 'help', 'end']) {
        this.el[name].hidden = mode !== name;
      }
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      document.body.dataset.mode = mode;
      if (mode === 'title') {
        this.refreshTitle();
        this.dissolve = 0;
        this.tint = [0, 0, 0, 0];
        this.view.updateMap(this.demo);
        this.placeCamera(this.demo);
      }
      this.el[mode]?.querySelector('button')?.focus();
    }

    refreshTitle() {
      let saved = null;
      try { saved = localStorage.getItem('inkfire-run'); } catch {}
      this.el.continue.hidden = !saved;
      let best = [];
      try { best = JSON.parse(localStorage.getItem('inkfire-best') || '[]'); } catch {}
      document.getElementById('best').textContent = best.length
        ? 'Best runs · ' + best.slice(0, 3).map(b => `${b.score} (${b.won ? 'escaped' : b.kills + ' kills'})`).join(' · ')
        : 'No runs yet. Find the Red & Blue keycards, defeat the Titan, and reach the exit.';
      document.getElementById('daily-run').textContent = 'Daily sector · ' + today();
    }

    newRun(seed, difficulty) {
      seed = seed || Math.random().toString(36).slice(2, 8);
      difficulty = difficulty || document.getElementById('difficulty').value;
      this.start(I.newGame(seed, difficulty));
      const controls = document.body.classList.contains('touch')
        ? 'Left thumb moves · right thumb turns and fires.'
        : 'WASD move · Arrows/Mouse turn · Space/Click fire · 1-4 weapons · P pause.';
      this.toast(`Sector ${seed} · ${I.DIFFICULTIES[this.state.difficulty].label}. ${controls}`);
    }

    resume() {
      try {
        const data = JSON.parse(localStorage.getItem('inkfire-run'));
        this.start(I.restore(data));
        this.toast('Sector run resumed.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem('inkfire-run'); } catch {}
        this.refreshTitle();
      }
    }

    start(state) {
      this.state = state;
      this.effects = [];
      this.tint = [0, 0, 0, 0];
      this.dissolve = 0;
      this.shake = 0;
      this.muzzleFlash = 0;
      this.el.log.replaceChildren();
      this.view.updateMap(state);
      this.placeCamera(state);
      this.updateHud();
      this.drawMinimap();
      this.show('play');
      this.sound.ensure();
      this.save();
    }

    placeCamera(state) {
      const p = state.player;
      this.camera.x = p.x;
      this.camera.y = EYE;
      this.camera.z = p.y;
      this.camera.yaw = p.angle;
      this.camera.pitch = -0.02;
    }

    save() {
      try {
        if (!this.state || this.state.dead || this.state.won) {
          localStorage.removeItem('inkfire-run');
        } else {
          localStorage.setItem('inkfire-run', JSON.stringify(this.state));
        }
      } catch {}
    }

    record() {
      try {
        const best = JSON.parse(localStorage.getItem('inkfire-best') || '[]');
        best.push({
          score: I.score(this.state),
          kills: this.state.kills,
          won: this.state.won,
          seed: this.state.seed
        });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem('inkfire-best', JSON.stringify(best.slice(0, 5)));
      } catch {}
    }

    log(text) {
      const line = document.createElement('div');
      line.textContent = text;
      this.el.log.append(line);
      while (this.el.log.children.length > 4) this.el.log.firstChild.remove();
    }

    toast(text) {
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 4000);
    }

    flash(r, g, b, alpha, duration = 0.28) {
      this.tint[0] = r;
      this.tint[1] = g;
      this.tint[2] = b;
      this.tint[3] = this.reducedMotion ? alpha * 0.35 : alpha;
      this.tintTimer = duration;
    }

    handleEvents(events) {
      let mapDirty = false;
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        switch (e.type) {
          case 'shoot':
            this.sound.play(e.weapon);
            this.muzzleFlash = 1.0;
            if (!this.reducedMotion) this.shake = Math.max(this.shake, e.weapon === 'shotgun' || e.weapon === 'launcher' ? 0.45 : 0.2);
            break;
          case 'empty':
            this.sound.play('empty');
            this.log('Out of ammo for ' + this.state.player.weapon + '!');
            break;
          case 'switch':
            this.sound.play('switch');
            this.log('Equipped ' + e.weapon + '.');
            break;
          case 'spark':
            this.effects.push({ x: e.x, y: 0.9, z: e.y, frame: this.frames['burst.small'], life: 0.16, maxLife: 0.16, size: 0.45 });
            break;
          case 'burst':
            this.effects.push({ x: e.x, y: 0.9, z: e.y, frame: this.frames['burst.small'], life: 0.22, maxLife: 0.22, size: 0.65 });
            break;
          case 'explode':
            this.sound.play('explode');
            this.effects.push({ x: e.x, y: 0.8, z: e.y, frame: this.frames['burst.large'], life: 0.38, maxLife: 0.38, size: 1.45 });
            if (!this.reducedMotion) this.shake = 0.85;
            break;
          case 'hit':
            this.sound.play('hit');
            break;
          case 'die':
            this.sound.play('die');
            this.log(`Destroyed ${e.monster} (+${e.score}).`);
            break;
          case 'titan_killed':
            this.flash(1.0, 0.85, 0.3, 0.38, 0.5);
            this.log('The Titan collapses! Reach the green exit pad (>).');
            break;
          case 'hurt':
            this.sound.play('hurt');
            this.flash(0.85, 0.08, 0.06, 0.42, 0.32);
            if (!this.reducedMotion) this.shake = 0.65;
            break;
          case 'pickup':
            this.sound.play('pickup');
            this.flash(0.3, 0.85, 0.95, 0.20, 0.22);
            this.log('Picked up ' + e.kind.replace('.', ' ') + '.');
            break;
          case 'door':
            this.sound.play('door');
            mapDirty = true;
            break;
          case 'locked':
            this.sound.play('locked');
            this.log(`Locked: requires ${e.kind} keycard.`);
            break;
          case 'win':
            this.sound.play('win');
            this.save();
            this.record();
            this.showEnd();
            break;
          case 'player_die':
            this.sound.play('player_die');
            this.save();
            this.record();
            this.showEnd();
            break;
        }
      }
      if (mapDirty || this.state.doors.some(d => d.state === 'opening' || d.state === 'closing')) {
        this.view.updateMap(this.state);
      }
    }

    updateHud() {
      if (!this.state) return;
      const s = this.state, p = s.player;
      const wInfo = I.WEAPONS[p.weapon];
      const ammo = p.ammo[wInfo.ammoType];

      this.el.hp.textContent = `${p.hp}/${p.maxHp}`;
      this.el['hp-bar'].style.width = `${(p.hp / p.maxHp) * 100}%`;
      this.el['hp-bar'].classList.toggle('low', p.hp < p.maxHp * 0.3);

      this.el.armour.textContent = `${p.armour}`;
      this.el['armour-bar'].style.width = `${(p.armour / p.maxArmour) * 100}%`;

      const ownedList = ['pistol', 'shotgun', 'chaingun', 'launcher']
        .map((w, idx) => p.weapons[w] ? (p.weapon === w ? `[${idx + 1}:${w.toUpperCase()}]` : `${idx + 1}:${w}`) : '')
        .filter(Boolean)
        .join(' ');
      this.el.weapon.textContent = ownedList;
      this.el.ammo.textContent = `AMMO ${ammo} (${wInfo.ammoType})`;

      const keysText = [p.keys.red ? 'RED' : null, p.keys.blue ? 'BLUE' : null].filter(Boolean).join(' + ') || 'NONE';
      this.el.keys.textContent = `KEYS: ${keysText}`;
      this.el.score.textContent = `SCORE ${I.score(s)}`;
      this.el.kills.textContent = `KILLS ${s.kills}`;
    }

    drawMinimap() {
      if (!this.state) return;
      const s = this.state, p = s.player;
      const px = Math.floor(p.x), py = Math.floor(p.y);
      const radius = 14;
      const rows = [];
      for (let y = Math.max(0, py - radius); y <= Math.min(I.SIZE - 1, py + radius); y++) {
        let row = '';
        for (let x = Math.max(0, px - radius); x <= Math.min(I.SIZE - 1, px + radius); x++) {
          if (x === px && y === py) {
            const dirIdx = Math.round(((p.angle % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4;
            row += '>v<^'[dirIdx];
            continue;
          }
          const t = s.tiles[I.index(x, y)];
          if (t === I.WALL) row += '#';
          else if (t === I.EXIT) row += '>';
          else if (t === I.DOOR_RED) row += 'R';
          else if (t === I.DOOR_BLUE) row += 'B';
          else if (t === I.DOOR) row += '+';
          else row += '.';
        }
        rows.push(row);
      }
      this.el.minimap.textContent = rows.join('\n');
    }

    showEnd() {
      const s = this.state;
      this.el['end-title'].textContent = s.won ? 'Sector Cleared' : 'Signal Lost';
      this.el['end-detail'].textContent = s.won
        ? `You escaped the sector in ${s.time.toFixed(1)}s with ${s.kills} kills.`
        : `Brought down after ${s.kills} kills in ${s.time.toFixed(1)}s.`;
      this.el['end-score'].textContent = `Score ${I.score(s)} · ${s.kills} kills · seed ${s.seed}`;
      this.show('end');
    }

    pollPad() {
      const pad = this.pad;
      pad.poll();
      if (!pad.connected) return;
      if (this.mode !== 'play') {
        if (pad.pressed(0)) document.activeElement?.click?.();
        if (pad.pressed(9) && this.mode === 'pause') this.show('play');
        return;
      }
      if (pad.pressed(9)) this.show('pause');
      if (pad.pressed(2)) this.pendingUse = true;
      if (pad.pressed(4)) this.cycleWeapon(-1);
      if (pad.pressed(5)) this.cycleWeapon(1);
    }

    buildSceneArrays(world) {
      const camX = this.camera.x, camZ = this.camera.z;
      this._activeSprites.length = 0;
      let poolIdx = 0;
      const allocSprite = (x, y, z, size, frame, material, flash, selfLit) => {
        const dist = Math.hypot(x - camX, z - camZ);
        if (dist >= 34 || poolIdx >= this._spritePool.length) return;
        const s = this._spritePool[poolIdx++];
        s.x = x; s.y = y; s.z = z; s.size = size;
        s.frame = frame; s.material = material;
        s.flash = flash; s.selfLit = selfLit; s.dist = dist;
        this._activeSprites.push(s);
      };

      // Monsters
      for (let i = 0; i < world.monsters.length; i++) {
        const m = world.monsters[i];
        const size = m.kind === 'titan' ? 2.1 : m.kind === 'brute' ? 1.55 : 1.35;
        const frame = this.frames[`${m.kind}.${m.frame}`] ?? this.frames[`${m.kind}.walk0`];
        allocSprite(m.x, 0.0, m.y, size, frame, 10, m.flash > 0 ? 0.85 : 0, m.kind === 'wisp');
      }

      // Items
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3.5) * 0.05;
      for (let i = 0; i < world.items.length; i++) {
        const it = world.items[i];
        if (it.collected) continue;
        const frame = this.frames[it.kind];
        if (frame !== undefined) {
          allocSprite(it.x, 0.08 + bob, it.y, 0.95, frame, 12, 0, it.kind.startsWith('key.'));
        }
      }

      // Barrels
      const hotBarrel = Math.floor(this.time * 3) % 2 === 0 ? this.frames['barrel'] : this.frames['barrel.hot'];
      for (let i = 0; i < world.barrels.length; i++) {
        const b = world.barrels[i];
        if (b.dead) continue;
        allocSprite(b.x, 0.0, b.y, 1.15, hotBarrel, 14, 0, false);
      }

      // Lamps & Lights
      this._activeLights.length = 0;
      let lightIdx = 0;
      for (let i = 0; i < world.lamps.length; i++) {
        const l = world.lamps[i];
        const frame = this.frames[l.kind];
        if (frame !== undefined) {
          allocSprite(l.x, 0.0, l.y, 1.5, frame, 16, 0, true);
        }
        const dist = Math.hypot(l.x - camX, l.y - camZ);
        if (dist < 28 && lightIdx < this._lightPool.length) {
          const lt = this._lightPool[lightIdx++];
          lt.x = l.x; lt.y = 1.6; lt.z = l.y; lt.intensity = 1.4; lt.dist = dist;
          if (l.kind === 'lamp.red') { lt.r = 1.0; lt.g = 0.35; lt.b = 0.25; }
          else if (l.kind === 'lamp.cold') { lt.r = 0.45; lt.g = 0.80; lt.b = 1.0; }
          else { lt.r = 1.0; lt.g = 0.75; lt.b = 0.42; }
          this._activeLights.push(lt);
        }
      }

      // Projectiles
      for (let i = 0; i < world.projectiles.length; i++) {
        const pr = world.projectiles[i];
        const frame = this.frames[pr.kind] ?? this.frames.fireball;
        allocSprite(pr.x, 0.75, pr.y, 0.85, frame, 20, 0, true);
      }

      // Transient burst effects
      for (let i = 0; i < this.effects.length; i++) {
        const ef = this.effects[i];
        allocSprite(ef.x, ef.y, ef.z, ef.size, ef.frame, 22, 0, true);
      }

      this._activeSprites.sort((a, b) => a.dist - b.dist);
      this._activeLights.sort((a, b) => a.dist - b.dist);
    }

    frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
      this.quality.sample(now - this.last);
      this.last = now;
      this.time += dt;
      this.pollPad();

      if (this.mode === 'play' && this.state && !this.state.dead && !this.state.won) {
        const inp = this._stepInput;
        const fwd = (this.held.has('KeyW') || this.held.has('ArrowUp') || this.touchHeld.has('forward') ? 1 : 0) -
                    (this.held.has('KeyS') || this.held.has('ArrowDown') || this.touchHeld.has('back') ? 1 : 0);
        const strafe = (this.held.has('KeyD') || this.touchHeld.has('right') ? 1 : 0) -
                       (this.held.has('KeyA') || this.touchHeld.has('left') ? 1 : 0);
        const keyTurn = (this.held.has('KeyE') || this.held.has('ArrowRight') || this.touchHeld.has('turnRight') ? 1 : 0) -
                        (this.held.has('KeyQ') || this.held.has('ArrowLeft') || this.touchHeld.has('turnLeft') ? 1 : 0);

        inp.moveX = Math.max(-1, Math.min(1, strafe + this.pad.axis(0)));
        inp.moveY = Math.max(-1, Math.min(1, fwd - this.pad.axis(1)));
        inp.turn = keyTurn + this.pad.axis(2) + this.mouseTurn / dt;
        this.mouseTurn = 0;
        inp.shoot = this.pendingShot || this.pad.held(7) || this.pad.held(0) || this.held.has('Space') || this.held.has('KeyF') ||
                    this.held.has('ControlLeft') || this.held.has('ControlRight') ||
                    this.held.has('Mouse0') || this.touchHeld.has('shoot');
        inp.use = this.pendingUse;
        inp.switchWeapon = this.pendingWeapon;

        this.pendingShot = false;
        this.pendingUse = false;
        this.pendingWeapon = null;

        const events = I.step(this.state, dt, inp);
        if (events.length) this.handleEvents(events);

        const moving = Math.hypot(inp.moveX, inp.moveY) > 0.1;
        if (moving && !this.reducedMotion) this.bobPhase += dt * 9.0;

        const p = this.state.player;
        const shakeYaw = this.reducedMotion ? 0 : (Math.random() - 0.5) * this.shake * 0.05;
        this.camera.x = p.x;
        this.camera.z = p.y;
        this.camera.y = EYE + (this.reducedMotion ? 0 : Math.sin(this.bobPhase) * 0.035);
        this.camera.yaw = p.angle + shakeYaw;
        this.camera.pitch = -0.02;

        this.hudTimer += dt;
        if (this.hudTimer >= 0.08 || events.length) {
          this.hudTimer = 0;
          this.updateHud();
          this.drawMinimap();
        }
        this.saveTimer += dt;
        if (this.saveTimer >= 2.0) {
          this.saveTimer = 0;
          this.save();
        }
      } else if (this.mode === 'title' && !this.reducedMotion) {
        this.camera.yaw += dt * 0.18;
      }

      // Decay visual timers
      this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 7.5);
      this.shake = Math.max(0, this.shake - dt * 4.5);
      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      }
      for (let i = this.effects.length - 1; i >= 0; i--) {
        this.effects[i].life -= dt;
        if (this.effects[i].life <= 0) this.effects.splice(i, 1);
      }

      const playing = this.state && this.mode !== 'title';
      const world = playing ? this.state : this.demo;
      this.buildSceneArrays(world);

      let weaponFrame = -1;
      let bobX = 0, bobY = 0;
      if (playing && !this.state.dead) {
        const w = this.state.player.weapon;
        if (w === 'chaingun' && this.muzzleFlash > 0.1) {
          weaponFrame = this.frames['view.chaingun.spin'];
        } else {
          weaponFrame = this.frames[`view.${w}`] ?? this.frames['view.pistol'];
        }
        if (!this.reducedMotion) {
          bobX = Math.cos(this.bobPhase * 0.5) * 0.025;
          bobY = Math.abs(Math.sin(this.bobPhase)) * 0.03 + this.muzzleFlash * 0.04;
        }
      }

      try {
        this.view.draw({
          camera: this.camera,
          sprites: this._activeSprites,
          lights: this._activeLights,
          weaponFrame,
          weaponBobX: bobX,
          weaponBobY: bobY,
          muzzleFlash: this.muzzleFlash,
          time: this.time,
          ink: true,
          tint: this.tint,
          dissolve: this.dissolve
        });
      } catch (error) {
        this.fatal(error);
        return;
      }

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
      global.inkfire = new InkfireApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

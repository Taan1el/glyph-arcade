/* Ricochet app: input, synthesised WebAudio sound, particles, HUD, and saves. */
(function (global) {
  'use strict';

  const R = global.Ricochet, { TILE_W, TILE_H } = global.RicochetView;
  const SAVE_KEY = 'ricochet-save', BEST_KEY = 'ricochet-best';
  const STEP_MS = R.STEP * 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Sound {
    constructor() {
      this.muted = false;
      this.context = null;
      this.chargeOsc = null;
      this.chargeGain = null;
    }
    ensure() {
      if (this.muted) return null;
      const Audio = global.AudioContext || global.webkitAudioContext;
      if (!Audio) return null;
      try {
        if (!this.context) {
          this.context = new Audio();
          this.master = this.context.createGain();
          this.master.gain.value = 0.28;
          this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch { return null; }
      return this.context;
    }
    updateCharge(level, active) {
      if (this.muted || !active) {
        if (this.chargeGain && this.context) {
          this.chargeGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.03);
        }
        return;
      }
      const c = this.ensure();
      if (!c) return;
      if (!this.chargeOsc) {
        try {
          const osc = c.createOscillator(), gain = c.createGain();
          osc.type = 'sine';
          gain.gain.value = 0.0001;
          osc.connect(gain);
          gain.connect(this.master);
          osc.start();
          this.chargeOsc = osc;
          this.chargeGain = gain;
        } catch { return; }
      }
      this.chargeOsc.frequency.setTargetAtTime(220 + clamp(level, 0, 1.2) * 340, c.currentTime, 0.03);
      this.chargeGain.gain.setTargetAtTime(0.045, c.currentTime, 0.03);
    }
    tone(frequency, duration, { type = 'square', volume = 0.1, slide = 0, delay = 0 } = {}) {
      const c = this.ensure();
      if (!c) return;
      const now = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
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
    play(name, extra = 0) {
      switch (name) {
        case 'catch': this.tone(360, 0.07, { type: 'square', slide: 120, volume: 0.07 }); break;
        case 'throw': this.tone(280, 0.11, { type: 'triangle', slide: 240, volume: 0.09 }); break;
        case 'spin': this.tone(340, 0.14, { type: 'sine', slide: 380, volume: 0.09 }); break;
        case 'dash': this.noise(0.08, { volume: 0.08, filter: 1600 }); break;
        case 'bank': this.tone(320 * Math.pow(1.22, extra), 0.08, { type: 'triangle', volume: 0.09 }); break;
        case 'prism': this.tone(540 * Math.pow(1.18, extra), 0.11, { type: 'sine', slide: 180, volume: 0.1 }); break;
        case 'shield': this.noise(0.16, { volume: 0.15, filter: 1400 }); this.tone(220, 0.16, { type: 'sawtooth', slide: -110, volume: 0.09 }); break;
        case 'parry': [660, 990, 1320].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', volume: 0.09, delay: i * 0.025 })); break;
        case 'fumble': this.tone(170, 0.22, { type: 'sawtooth', slide: -90, volume: 0.1 }); break;
        case 'goal': [440, 554, 659].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', volume: 0.1, delay: i * 0.05 })); break;
        case 'concede': [330, 247, 196].forEach((f, i) => this.tone(f, 0.2, { type: 'sawtooth', volume: 0.08, delay: i * 0.07 })); break;
        case 'court': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', volume: 0.1, delay: i * 0.07 })); break;
        case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', volume: 0.11, delay: i * 0.11 })); break;
        case 'defeat': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.32, { type: 'sawtooth', volume: 0.09, delay: i * 0.12 })); break;
      }
    }
  }

  class RicochetApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.RicochetView(this.canvas);
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

      const ids = ['title', 'pause', 'help', 'end', 'hud', 'touch', 'toast', 'mute', 'continue', 'difficulty',
        'archetypes', 'arch-note', 'best', 'court-name', 'rally-badge', 'scoreline', 'setsline', 'objective',
        'end-title', 'end-detail', 'end-score'];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.el.stats = document.querySelector('.stats');

      this.mode = 'title';
      this.state = null;
      this.archChoice = 'striker';
      this.keys = new Set();
      this.pointers = new Map();
      this.held = new Set();
      this.mouse = { x: 0, y: 0, down: false, known: false };
      this.pending = { throwPressed: false, throwRelease: false, spin: false, dash: false };
      this.particles = [];
      this.trail = [];
      this.pulse = [0, 0, 0, 0];
      this.pulseTimer = 0;
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.shake = 0;
      this.time = 0;
      this.accumulator = 0;
      this.hudTimer = 0;
      this.saveTimer = 0;
      this.last = performance.now();

      this.demo = R.newGame('title-court', 'striker', 'normal');
      this.buildArchPicker();
      this.bind();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    buildArchPicker() {
      const box = this.el.archetypes;
      box.textContent = '';
      for (const kind of R.ARCHETYPE_KEYS) {
        const spec = R.ARCHETYPES[kind], btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arch';
        btn.dataset.arch = kind;
        btn.setAttribute('aria-pressed', kind === this.archChoice ? 'true' : 'false');
        const b = document.createElement('b');
        b.textContent = spec.letter;
        const name = document.createElement('strong');
        name.textContent = spec.name;
        btn.append(b, name);
        btn.addEventListener('click', () => {
          this.archChoice = kind;
          try { localStorage.setItem('ricochet-arch', kind); } catch {}
          this.buildArchPicker();
        });
        box.append(btn);
      }
      this.el['arch-note'].textContent = R.ARCHETYPES[this.archChoice].note;
    }

    bind() {
      global.addEventListener('resize', () => this.resize());
      global.addEventListener('blur', () => {
        this.clearInputs();
        this.sound.updateCharge(0, false);
        if (this.mode === 'play') this.show('pause');
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.show('pause'); });

      const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') { event.preventDefault(); this.newGame(); return; }
        if (this.mode !== 'play') return;
        if (CAPTURE.has(event.code)) event.preventDefault();
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
          this.mouse.known = false;
        }
        if (!this.keys.has(event.code)) {
          if (event.code === 'KeyJ' || event.code === 'Enter') this.pending.throwPressed = true;
          if (event.code === 'KeyK' || event.code === 'KeyE') this.pending.spin = true;
          if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.pending.dash = true;
        }
        this.keys.add(event.code);
      });
      global.addEventListener('keyup', event => {
        this.keys.delete(event.code);
        if (event.code === 'KeyJ' || event.code === 'Enter') this.pending.throwRelease = true;
      });

      this.canvas.addEventListener('pointermove', event => {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        this.mouse.known = event.pointerType !== 'touch';
      });
      this.canvas.addEventListener('pointerdown', event => {
        if (this.mode !== 'play' || event.pointerType === 'touch') return;
        event.preventDefault();
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        this.mouse.known = true;
        if (event.button === 2) this.pending.spin = true;
        else { this.mouse.down = true; this.pending.throwPressed = true; }
      });
      global.addEventListener('pointerup', event => {
        if (event.button === 0 && this.mouse.down) {
          this.mouse.down = false;
          if (this.mode === 'play') this.pending.throwRelease = true;
        }
      });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newGame());
      click('continue', () => this.resume());
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && this.state.status === 'play' ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-help', () => this.show('help'));
      click('pause-title', () => { this.save(); this.show('title'); });
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('end-again', () => this.newGame());
      click('end-menu', () => this.show('title'));

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Sound off' : 'Sound on';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        showMute();
        if (this.sound.muted) this.sound.updateCharge(0, false);
        try { localStorage.setItem('ricochet-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('ricochet-muted') === '1';
        const storedDiff = localStorage.getItem('ricochet-difficulty');
        if (R.DIFFICULTIES[storedDiff]) this.el.difficulty.value = storedDiff;
        const storedArch = localStorage.getItem('ricochet-arch');
        if (R.ARCHETYPES[storedArch]) { this.archChoice = storedArch; this.buildArchPicker(); }
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('ricochet-difficulty', this.el.difficulty.value); } catch {}
      });

      this.el.touch.addEventListener('pointerdown', event => {
        const hold = event.target.closest('button[data-hold]');
        const press = event.target.closest('button[data-press]');
        if (!hold && !press) return;
        event.preventDefault();
        if (hold) {
          const action = hold.dataset.hold;
          this.pointers.set(event.pointerId, action);
          this.held.add(action);
          if (action === 'throw') this.pending.throwPressed = true;
        }
        if (press) {
          const action = press.dataset.press;
          if (action === 'spin') this.pending.spin = true;
          if (action === 'dash') this.pending.dash = true;
        }
      });
      const releaseTouch = event => {
        const action = this.pointers.get(event.pointerId);
        if (!action) return;
        this.pointers.delete(event.pointerId);
        if (![...this.pointers.values()].includes(action)) {
          this.held.delete(action);
          if (action === 'throw' && this.mode === 'play') this.pending.throwRelease = true;
        }
      };
      global.addEventListener('pointerup', releaseTouch);
      global.addEventListener('pointercancel', releaseTouch);
      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    clearInputs() {
      this.keys.clear();
      this.pointers.clear();
      this.held.clear();
      this.mouse.down = false;
      this.pending = { throwPressed: false, throwRelease: false, spin: false, dash: false };
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.el.touch.hidden = false;
      this.resize();
    }

    resize() {
      const narrow = global.innerWidth < 700;
      const base = narrow ? (global.innerWidth < 450 ? [5, 8] : [6, 9]) : [8, 12];
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      this.view.resize(global.innerWidth, global.innerHeight, this.quality.cell(base));
    }

    show(mode) {
      const was = this.mode;
      this.mode = mode;
      this.clearInputs();
      this.sound.updateCharge(0, false);
      for (const name of ['title', 'pause', 'help', 'end']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      if (was === 'play' && mode === 'pause') this.save();
      if (mode !== 'play') this.el[mode]?.querySelector('button')?.focus();
    }

    refreshTitle() {
      let saved = null, best = [];
      try {
        saved = localStorage.getItem(SAVE_KEY);
        best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
      } catch {}
      this.el.continue.hidden = !saved;
      this.el.best.textContent = best.length
        ? 'Best runs · ' + best.slice(0, 3).map(b => `${b.score} (${b.arch}, ${b.minutes}m)`).join(' · ')
        : 'Four courts, best of 3 sets to 5 points. Bank off walls to break shields.';
    }

    newGame(seed) {
      seed = seed || Math.random().toString(36).slice(2, 8);
      this.begin(R.newGame(seed, this.archChoice, this.el.difficulty.value));
      this.toast(this.touch
        ? 'Move with the left pad. Hold J to charge a throw, or press K to curve!'
        : 'Move with WASD/Arrows. Hold Click or J to charge & aim, K/Right-click to Spin, Space to Dash.');
    }

    resume() {
      try {
        this.begin(R.restore(localStorage.getItem(SAVE_KEY)));
        this.toast('Match restored.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.refreshTitle();
      }
    }

    begin(state) {
      this.state = state;
      this.particles = [];
      this.trail = [];
      this.pulse = [0, 0, 0, 0];
      this.pulseTimer = 0;
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.accumulator = 0;
      this.saveTimer = 0;
      this.show('play');
      this.updateHud();
      this.sound.ensure();
    }

    save() {
      if (!this.state || this.state.status !== 'play') return;
      try { localStorage.setItem(SAVE_KEY, R.save(this.state)); } catch {}
    }

    record() {
      const s = this.state, minutes = Math.max(1, Math.round((s.endTime || s.time) / 60));
      try {
        localStorage.removeItem(SAVE_KEY);
        if (s.status !== 'won') return;
        const best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
        best.push({ score: R.score(s), arch: R.ARCHETYPES[s.archetype].name, minutes, seed: s.seed });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem(BEST_KEY, JSON.stringify(best.slice(0, 5)));
      } catch {}
    }

    toast(text) {
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 3600);
    }

    flash(r, g, b, alpha, seconds = 0.24) {
      this.tint = [r, g, b, this.reducedMotion ? alpha * 0.35 : alpha];
      this.tintTimer = seconds;
    }

    burst(x, y, chars, colour, count = 6) {
      if (this.reducedMotion) count = Math.min(2, count);
      for (let i = 0; i < count && this.particles.length < 48; i++) {
        const a = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 5;
        this.particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.35 + Math.random() * 0.25, char: chars[i % chars.length], colour });
      }
    }

    handle(events) {
      for (const e of events) {
        switch (e.type) {
          case 'catch': this.sound.play('catch'); break;
          case 'throw': this.sound.play(e.spin ? 'spin' : 'throw'); break;
          case 'dash': this.sound.play('dash'); this.burst(e.x, e.y, ['.', ':'], [72, 208, 255], 4); break;
          case 'bank': this.sound.play('bank', e.bounces); this.burst(e.x, e.y, ['*', '+'], [255, 224, 85], 4); break;
          case 'prism': this.sound.play('prism', e.bounces); this.burst(e.x, e.y, ['*', '/'], [208, 120, 255], 5); break;
          case 'parry':
            this.sound.play('parry');
            this.pulse = [e.x, e.y, 0.5, 0];
            this.pulseTimer = 0.28;
            this.flash(0.3, 0.85, 1.0, 0.14, 0.16);
            this.burst(e.x, e.y, ['*', '!'], [72, 224, 255], 8);
            if (e.side === 0) this.toast('PERFECT PARRY!');
            break;
          case 'fumble':
            this.sound.play('fumble');
            if (e.side === 0) this.toast('Overcharged! Release before the meter fills.');
            break;
          case 'shield':
            this.sound.play('shield');
            this.shake = 0.14;
            this.burst(e.x, e.y, ['#', '=', '*'], [92, 232, 104], 7);
            if (e.side === 1 && e.broken === 2) this.toast('DOUBLE SHIELD BREAK!');
            break;
          case 'goal':
            this.sound.play(e.scorer === 0 ? 'goal' : 'concede');
            this.pulse = [e.x, e.y, 0.6, 1];
            this.pulseTimer = 0.35;
            this.shake = 0.22;
            this.flash(e.scorer === 0 ? 1.0 : 0.9, e.scorer === 0 ? 0.85 : 0.15, e.scorer === 0 ? 0.3 : 0.15, 0.22, 0.28);
            this.burst(e.x, e.y, ['$', '*', '!'], [255, 224, 85], 12);
            if (e.bullseye) this.toast(e.scorer === 0 ? 'BULLSEYE +2!' : 'Rival hit the bullseye!');
            break;
          case 'matchWon':
            this.sound.play('court');
            this.toast(`Court cleared! Next: ${R.COURTS[e.nextCourt].name}`);
            break;
          case 'victory':
          case 'defeat':
            this.sound.play(e.type);
            this.record();
            this.sound.updateCharge(0, false);
            setTimeout(() => this.showEnd(), 900);
            break;
        }
      }
    }

    showEnd() {
      const s = this.state, won = s.status === 'won';
      this.el['end-title'].textContent = won ? 'Tournament champion' : `Eliminated on ${R.COURTS[s.courtIndex].name}`;
      this.el['end-detail'].textContent = `${won ? 'Won' : 'Lost'} as ${R.ARCHETYPES[s.archetype].name} in ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')} · ${s.stats.goals} goals (${s.stats.bullseyes} bullseyes), ${s.stats.parries} parries.`;
      this.el['end-score'].textContent = `Score ${R.score(s)} · ${R.DIFFICULTIES[s.difficulty].label} · seed ${s.seed}`;
      this.show('end');
    }

    updateHud() {
      const s = this.state, court = R.COURTS[s.courtIndex];
      this.el['court-name'].textContent = `${s.courtIndex + 1}/4 · ${court.name}`;
      this.el['rally-badge'].textContent = s.holder < 0 && s.disc.bounces > 0 ? `BANK x${s.disc.bounces}` : '';
      this.el.scoreline.textContent = `YOU ${s.points[0]} : ${s.points[1]} RIVAL`;
      this.el.setsline.textContent = `SETS ${s.sets[0]} - ${s.sets[1]}`;
      this.el.objective.textContent = R.objective(s);
      const bottom = Math.ceil(this.el.stats.getBoundingClientRect().bottom);
      if (bottom !== this.statsBottom) {
        this.statsBottom = bottom;
        document.documentElement.style.setProperty('--stats-bottom', bottom + 'px');
      }
    }

    toWorld(clientX, clientY) {
      const cam = this.cam || { x: 0, y: 0 }, size = this.view.engine.cellSize;
      return { x: (clientX / size[0] + cam.x) / TILE_W, y: (clientY / size[1] + cam.y) / TILE_H };
    }

    gatherInput() {
      const k = this.keys, pad = this.pad;
      let mx = (k.has('ArrowRight') || k.has('KeyD') || this.held.has('right') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') || this.held.has('left') ? 1 : 0);
      let my = (k.has('ArrowDown') || k.has('KeyS') || this.held.has('down') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') || this.held.has('up') ? 1 : 0);
      if (pad.connected) {
        mx += pad.axis(0) + (pad.held(15) ? 1 : 0) - (pad.held(14) ? 1 : 0);
        my += pad.axis(1) + (pad.held(13) ? 1 : 0) - (pad.held(12) ? 1 : 0);
      }
      const aim = this.mouse.known && !this.touch ? this.toWorld(this.mouse.x, this.mouse.y) : { x: undefined, y: undefined };
      const throwHeld = k.has('KeyJ') || k.has('Enter') || this.mouse.down || this.held.has('throw') || (pad.connected && pad.held(0));
      const input = {
        moveX: clamp(mx, -1, 1),
        moveY: clamp(my, -1, 1),
        aimX: aim.x,
        aimY: aim.y,
        throwHeld,
        throwPressed: this.pending.throwPressed,
        throwRelease: this.pending.throwRelease,
        spin: this.pending.spin,
        dash: this.pending.dash
      };
      this.pending = { throwPressed: false, throwRelease: false, spin: false, dash: false };
      return input;
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
      if (pad.pressed(0)) this.pending.throwPressed = true;
      if (!pad.held(0) && pad.before[0]) this.pending.throwRelease = true;
      if (pad.pressed(2)) this.pending.spin = true;
      if (pad.pressed(1) || pad.pressed(5)) this.pending.dash = true;
    }

    collectSprites(state, cam) {
      const sprites = [], toCell = (x, y) => ({ x: Math.round(x * TILE_W) - cam.x, y: Math.round(y * TILE_H) - cam.y });
      for (const part of this.particles) {
        const at = toCell(part.x, part.y);
        sprites.push({ x: at.x, y: at.y, char: part.char, colour: part.colour });
      }
      for (const tr of this.trail) {
        const at = toCell(tr.x, tr.y);
        sprites.push({ x: at.x, y: at.y, char: tr.bounces >= 2 ? ':' : '.', colour: tr.bounces >= 2 ? [255, 72, 72] : tr.bounces === 1 ? [255, 160, 56] : [255, 224, 85] });
      }
      if (state.disc) {
        const d = state.disc, at = toCell(d.x, d.y);
        if (state.holder < 0 && d.bounces >= 2) {
          sprites.push({ x: at.x - 1, y: at.y - 1, frame: 'discCrit' });
        } else if (state.holder < 0 && d.charged) {
          sprites.push({ x: at.x - 1, y: at.y - 1, frame: 'discHalo' });
        } else {
          sprites.push({ x: at.x, y: at.y, char: state.holder < 0 && d.bounces > 0 ? '*' : '@', colour: d.bounces > 0 ? [255, 146, 43] : [255, 224, 85] });
        }
      }
      const bob = Math.floor(this.time * 8) % 2 === 1;
      for (const p of state.players) {
        const moving = Math.hypot(p.vx, p.vy) > 1.2;
        const pose = p.dashTimer > 0 ? 'dash' : state.holder === p.side ? 'hold' : p.throwLock > 0.06 ? 'throw' : moving ? (bob ? 'walkB' : 'walkA') : 'idle';
        const at = toCell(p.x, p.y);
        const bar = state.holder === p.side && p.charging
          ? { fill: p.chargeTimer / 1.0, colour: p.chargeTimer > 1.0 ? [255, 68, 56] : [255, 224, 85] }
          : null;
        sprites.push({
          x: at.x - 1,
          y: at.y - 1,
          frame: `${p.kind}.${pose}${p.side === 1 ? '.left' : ''}`,
          team: p.side === 0 ? [72, 208, 255] : [255, 90, 78],
          flash: p.stunTimer > 0 && bob,
          bar
        });
      }
      return sprites;
    }

    frame(now) {
      const elapsed = Math.min(50, now - this.last), dt = elapsed / 1000;
      this.quality.sample(now - this.last);
      this.last = now;
      this.time += dt;
      this.pollPad();

      const playing = Boolean(this.state) && this.mode !== 'title';
      const state = playing ? this.state : this.demo;
      if ((this.mode === 'play' && state.status === 'play') || (!playing && !this.reducedMotion)) {
        this.accumulator += elapsed;
        let steps = 0;
        while (this.accumulator >= STEP_MS && steps < 4) {
          const events = R.step(state, playing ? this.gatherInput() : { auto: true });
          if (playing) this.handle(events);
          if (state.holder < 0 && state.disc && this.state === state && steps === 0 && !this.reducedMotion) {
            this.trail.push({ x: state.disc.x, y: state.disc.y, life: 0.22, bounces: state.disc.bounces });
            if (this.trail.length > 24) this.trail.shift();
          }
          this.accumulator -= STEP_MS;
          steps++;
          if (state.status !== 'play') break;
        }
        if (steps === 4) this.accumulator = 0;
        if (!playing && state.status !== 'play') this.demo = R.newGame('title-' + Math.floor(this.time), 'striker', 'normal');
      }

      if (playing && this.mode === 'play') {
        const p0 = state.players[0];
        this.sound.updateCharge(p0.chargeTimer, state.holder === 0 && p0.charging);
        this.hudTimer += dt;
        if (this.hudTimer > 0.08) { this.hudTimer = 0; this.updateHud(); }
        this.saveTimer += dt;
        if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
      } else {
        this.sound.updateCharge(0, false);
      }

      for (const part of this.particles) { part.x += part.vx * dt; part.y += part.vy * dt; part.life -= dt; }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const tr of this.trail) tr.life -= dt;
      this.trail = this.trail.filter(tr => tr.life > 0);
      if (this.pulseTimer > 0) {
        this.pulseTimer = Math.max(0, this.pulseTimer - dt);
        this.pulse[2] += 18 * dt;
        if (this.pulseTimer === 0) this.pulse[2] = 0;
      }
      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      }
      this.shake = Math.max(0, this.shake - dt);

      const focusX = state.disc ? state.players[0].x * 0.45 + state.disc.x * 0.55 : R.NET_X;
      const cam = this.view.camera(focusX);
      if (this.shake > 0 && !this.reducedMotion) {
        cam.x += Math.round((Math.random() - 0.5) * 2);
        cam.y += Math.round((Math.random() - 0.5) * 2);
      }
      this.cam = cam;
      try {
        this.view.uploadCourt(state);
        this.view.draw({
          state,
          cam,
          sprites: this.collectSprites(state, cam),
          time: this.reducedMotion ? 0 : this.time,
          tint: this.tint,
          pulse: this.pulse
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
      global.ricochet = new RicochetApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

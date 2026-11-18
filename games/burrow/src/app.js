/* Burrow app: input, particles, sound, crafting panel, HUD and saves around the pure rules. */
(function (global) {
  'use strict';

  const B = global.Burrow, { TILE_W, TILE_H } = global.BurrowView, SAVE_KEY = 'burrow-save', BEST_KEY = 'burrow-best';
  const STEP_MS = B.STEP * 1000, HOTBAR = 9;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
        case 'mine': this.noise(0.05, { volume: 0.07, filter: 1400 }); break;
        case 'break': this.noise(0.1, { volume: 0.13, filter: 700 }); break;
        case 'tree': this.noise(0.28, { volume: 0.16, filter: 420 }); break;
        case 'place': this.tone(180, 0.06, { type: 'triangle', volume: 0.1 }); break;
        case 'swing': this.noise(0.08, { volume: 0.08, filter: 2600 }); break;
        case 'hit': this.tone(190, 0.1, { slide: -90, volume: 0.12 }); break;
        case 'kill': this.tone(300, 0.2, { type: 'triangle', slide: -220, volume: 0.12 }); break;
        case 'hurt': this.tone(115, 0.22, { type: 'sawtooth', slide: -50, volume: 0.13 }); break;
        case 'jump': this.tone(330, 0.07, { type: 'sine', slide: 180, volume: 0.05 }); break;
        case 'eat': this.tone(420, 0.2, { type: 'sine', slide: 260, volume: 0.1 }); break;
        case 'craft': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', volume: 0.09, delay: i * 0.06 })); break;
        case 'denied': this.tone(150, 0.14, { volume: 0.08 }); break;
        case 'door': this.noise(0.12, { volume: 0.1, filter: 500 }); break;
        case 'dawn': [392, 523, 659].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', volume: 0.06, delay: i * 0.14 })); break;
        case 'shot': this.tone(620, 0.16, { type: 'sine', slide: -380, volume: 0.07 }); break;
        case 'roar': this.tone(80, 0.6, { type: 'sawtooth', slide: 50, volume: 0.16 }); break;
        case 'death': [262, 208, 165].forEach((f, i) => this.tone(f, 0.3, { type: 'sawtooth', volume: 0.08, delay: i * 0.14 })); break;
        case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', volume: 0.1, delay: i * 0.12 })); break;
      }
    }
  }

  class BurrowApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.BurrowView(this.canvas);
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      const ids = ['title', 'pause', 'help', 'end', 'craft', 'hud', 'touch', 'toast', 'mute', 'continue', 'difficulty', 'objective', 'hp', 'hp-bar', 'depth', 'clock', 'gear', 'hotbar', 'recipes', 'end-title', 'end-detail', 'end-score', 'boss', 'boss-bar', 'best'];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.el.stats = document.querySelector('.stats');
      this.mode = 'title';
      this.state = null;
      this.keys = new Set();
      this.mouse = { x: 0, y: 0, down: false, pressed: false, attack: false, known: false };
      this.touches = new Map();
      this.held = new Set();
      this.queued = null;
      this.selectQueued = null;
      this.particles = [];
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.shake = 0;
      this.flash = new Map();
      this.time = 0;
      this.accumulator = 0;
      this.saveTimer = 0;
      this.hudTimer = 0;
      this.last = performance.now();
      this.demo = B.newGame('title-world');
      this.demo.clock = 0.5;
      this.demoX = B.WIDTH / 2;
      this.bind();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bind() {
      global.addEventListener('resize', () => this.resize());
      global.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); this.mouse.down = false; if (this.mode === 'play') this.show('pause'); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.show('pause'); });
      const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause' || this.mode === 'craft') this.show('play');
          return;
        }
        if (event.code === 'KeyC' && !event.repeat) {
          if (this.mode === 'play') this.show('craft');
          else if (this.mode === 'craft') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') { event.preventDefault(); this.newGame(); return; }
        if (this.mode !== 'play') return;
        if (CAPTURE.has(event.code)) event.preventDefault();
        this.keys.add(event.code);
        if (/^Digit[1-9]$/.test(event.code)) this.selectSlot(Number(event.code.slice(5)) - 1);
        if (event.code === 'KeyF') this.mouse.attack = true;
      });
      global.addEventListener('keyup', event => {
        this.keys.delete(event.code);
        if (event.code === 'KeyF') this.mouse.attack = false;
      });

      const track = event => {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        this.mouse.known = true;
      };
      this.canvas.addEventListener('pointermove', track);
      this.canvas.addEventListener('pointerdown', event => {
        if (this.mode !== 'play') return;
        event.preventDefault();
        track(event);
        if (event.button === 2) this.mouse.attack = true;
        else { this.mouse.down = true; this.mouse.pressed = true; }
      });
      global.addEventListener('pointerup', event => {
        if (event.button === 2) this.mouse.attack = false;
        else this.mouse.down = false;
      });
      this.canvas.addEventListener('pointercancel', () => { this.mouse.down = false; });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
      this.canvas.addEventListener('wheel', event => {
        if (this.mode !== 'play') return;
        event.preventDefault();
        this.cycle(Math.sign(event.deltaY));
      }, { passive: false });

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newGame());
      click('continue', () => this.resume());
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && !this.state.won ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-help', () => this.show('help'));
      click('pause-title', () => { this.save(); this.show('title'); });
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('craft-btn', () => { if (this.mode === 'play') this.show('craft'); });
      click('craft-close', () => this.show('play'));
      click('end-again', () => this.newGame());
      click('end-menu', () => this.show('title'));

      this.el.recipes.addEventListener('click', event => {
        const button = event.target.closest('button[data-recipe]');
        if (!button) return;
        this.queued = button.dataset.recipe;
        this.flushCraft();
      });
      this.el.hotbar.addEventListener('click', event => {
        const button = event.target.closest('button[data-item]');
        if (button) this.selectQueued = button.dataset.item;
      });

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Sound off' : 'Sound on';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        showMute();
        try { localStorage.setItem('burrow-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('burrow-muted') === '1';
        const stored = localStorage.getItem('burrow-difficulty');
        if (B.DIFFICULTIES[stored]) this.el.difficulty.value = stored;
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('burrow-difficulty', this.el.difficulty.value); } catch {}
      });

      // Touch: tap the world to dig or place; the pads hold movement, jump and attack.
      this.el.touch.addEventListener('pointerdown', event => {
        const button = event.target.closest('button[data-hold]');
        if (!button) return;
        event.preventDefault();
        this.touches.set(event.pointerId, button.dataset.hold);
        this.held.add(button.dataset.hold);
      });
      const release = event => {
        const held = this.touches.get(event.pointerId);
        if (!held) return;
        this.touches.delete(event.pointerId);
        if (![...this.touches.values()].includes(held)) this.held.delete(held);
      };
      global.addEventListener('pointerup', release);
      global.addEventListener('pointercancel', release);
      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.el.touch.hidden = false;
    }

    resize() {
      const narrow = global.innerWidth < 700;
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      // The smallest letters that still read as letters on a high-density screen.
      this.view.resize(global.innerWidth, global.innerHeight, this.quality.cell(narrow ? [4, 6] : [4, 6]));
    }

    show(mode) {
      const was = this.mode;
      this.mode = mode;
      this.keys.clear();
      this.held.clear();
      this.touches.clear();
      this.mouse.down = false;
      this.mouse.attack = false;
      for (const name of ['title', 'pause', 'help', 'end', 'craft']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      if (mode === 'craft') this.renderRecipes();
      if (was === 'play' && mode === 'pause') this.save();
      this.el[mode]?.querySelector('button')?.focus();
    }

    refreshTitle() {
      let saved = null, best = [];
      try {
        saved = localStorage.getItem(SAVE_KEY);
        best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
      } catch {}
      this.el.continue.hidden = !saved;
      this.el.best.textContent = best.length
        ? 'Best worlds · ' + best.slice(0, 3).map(b => `${b.score} (${b.minutes} min)`).join(' · ')
        : 'No worlds finished yet. The Maw sleeps under the spawn.';
    }

    newGame(seed, difficulty) {
      seed = seed || Math.random().toString(36).slice(2, 8);
      this.begin(B.newGame(seed, difficulty || this.el.difficulty.value));
      this.toast(document.body.classList.contains('touch')
        ? 'Tap the world to dig or place. Follow the note at the top.'
        : 'A / D to move, Space to jump, hold click to dig. Follow the note at the top.');
    }

    resume() {
      try {
        this.begin(B.restore(localStorage.getItem(SAVE_KEY)));
        this.toast('World restored.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.refreshTitle();
      }
    }

    begin(state) {
      this.state = state;
      this.particles = [];
      this.flash.clear();
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.accumulator = 0;
      this.saveTimer = 0;
      this.hotbarKey = '';
      state.dirty = true;
      this.updateHud();
      this.show('play');
      this.sound.ensure();
    }

    save() {
      if (!this.state || this.state.won) return;
      try { localStorage.setItem(SAVE_KEY, B.save(this.state)); } catch { this.toast('This browser could not save the world.'); }
    }

    record() {
      const s = this.state, minutes = Math.round((s.endTime || s.time) / 60);
      try {
        localStorage.removeItem(SAVE_KEY);
        const best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
        best.push({ score: B.score(s), minutes, seed: s.seed });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem(BEST_KEY, JSON.stringify(best.slice(0, 5)));
      } catch {}
    }

    toast(text) {
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 3800);
    }

    pulse(r, g, b, alpha, seconds = 0.25) {
      this.tint = [r, g, b, this.reducedMotion ? alpha * 0.35 : alpha];
      this.tintTimer = seconds;
      this.tintLength = seconds;
    }

    // --- Hotbar and crafting
    selectSlot(i) {
      const id = this.state.order[i];
      if (id) this.selectQueued = id;
    }
    cycle(direction) {
      const order = this.state.order, at = order.indexOf(this.state.selected);
      if (order.length) this.selectQueued = order[(at + direction + order.length) % order.length];
    }
    flushCraft() {
      if (!this.queued) return;
      const events = B.step(this.state, { craft: this.queued });
      this.queued = null;
      this.handle(events);
      this.updateHud();
      this.renderRecipes();
    }
    renderRecipes() {
      const s = this.state, list = this.el.recipes, labels = { ready: '', missing: 'Need materials', bench: 'Stand near a workbench', locked: 'Needs the earlier tier', owned: 'Owned' };
      list.textContent = '';
      for (const recipe of B.RECIPES) {
        const status = B.recipeState(s, recipe);
        if (status === 'owned' && recipe.upgrade) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.recipe = recipe.id;
        button.disabled = status !== 'ready';
        button.className = status === 'ready' ? 'recipe ready' : 'recipe';
        const name = document.createElement('strong');
        name.textContent = recipe.name;
        const cost = document.createElement('small');
        cost.textContent = Object.entries(recipe.cost).map(([id, n]) => `${s.items[id] || 0}/${n} ${B.ITEMS[id].name}`).join(' · ') + (labels[status] ? ` · ${labels[status]}` : '');
        button.append(name, cost);
        list.append(button);
      }
    }

    // --- Rule events to feedback
    burst(x, y, chars, colour, count = 5) {
      if (this.reducedMotion) count = Math.min(2, count);
      for (let i = 0; i < count && this.particles.length < 48; i++) {
        this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 5, life: 0.5 + Math.random() * 0.35, char: chars[i % chars.length], colour, gravity: 22 });
      }
    }
    number(x, y, text, colour) {
      [...String(text)].forEach((char, i) => this.particles.push({ x: x + i * 0.34, y, vx: 0, vy: -2.6, life: 0.8, char, colour, gravity: 0, lit: true }));
    }
    handle(events) {
      for (const e of events) {
        switch (e.type) {
          case 'mined': this.sound.play('break'); this.burst(e.x + 0.5, e.y + 0.5, ['.', ',', '*'], [180, 150, 110]); break;
          case 'felled': this.sound.play('tree'); this.toast(`+${e.wood} wood`); this.burst(e.x + 0.5, e.y, ['=', '%', '.'], [130, 150, 70], 8); break;
          case 'placed': this.sound.play('place'); break;
          case 'door': this.sound.play('door'); break;
          case 'swing': this.sound.play('swing'); break;
          case 'hit': this.sound.play('hit'); this.number(e.x, e.y - 0.8, e.damage, [255, 255, 255]); break;
          case 'kill': this.sound.play('kill'); this.burst(e.x, e.y, ['*', '+', '.'], [230, 90, 60], 9); break;
          case 'hurt': this.sound.play('hurt'); this.pulse(0.75, 0.05, 0.04, 0.34); this.shake = 0.25; this.number(e.x, e.y - 0.5, e.amount, [255, 90, 70]); break;
          case 'died': this.sound.play('death'); this.pulse(0.3, 0, 0, 0.55, 0.7); this.toast(`Slain by ${e.source}. You wake at the surface with everything you carried.`); break;
          case 'jump': this.sound.play('jump'); break;
          case 'eat': this.sound.play('eat'); this.pulse(0.2, 0.8, 0.4, 0.2); this.number(this.state.player.x, this.state.player.y - 0.5, e.amount, [120, 255, 150]); break;
          case 'craft': this.sound.play('craft'); this.pulse(0.9, 0.75, 0.3, 0.16); this.toast(`Crafted: ${e.name}`); break;
          case 'tooHard': this.sound.play('denied'); this.toast(`This needs a ${e.tier} Pick.`); break;
          case 'altarLocked': this.sound.play('denied'); this.toast('The altar is cold. It wants an Ember Key.'); break;
          case 'dawn': this.sound.play('dawn'); this.toast(`Day ${e.day}. The night things sink away.`); break;
          case 'shot': case 'bossShot': this.sound.play('shot'); break;
          case 'bossAwake': case 'bossRoar': this.sound.play('roar'); this.shake = 0.6; if (e.type === 'bossAwake') this.toast('THE MAW WAKES'); break;
          case 'steam': this.burst(e.x + 0.5, e.y, ['~', '.'], [220, 220, 230], 4); break;
          case 'victory':
            this.sound.play('victory');
            this.record();
            this.pulse(1, 0.8, 0.3, 0.5, 1);
            setTimeout(() => this.showEnd(), 1400);
            break;
        }
      }
    }
    showEnd() {
      const s = this.state, minutes = Math.round((s.endTime || s.time) / 60);
      this.el['end-title'].textContent = 'The Maw is dead';
      this.el['end-detail'].textContent = `You broke the deep in ${minutes} minutes, across ${s.day} day${s.day === 1 ? '' : 's'}, with ${s.deaths} death${s.deaths === 1 ? '' : 's'}.`;
      this.el['end-score'].textContent = `Score ${B.score(s)} · ${s.kills} kills · ${B.DIFFICULTIES[s.difficulty].label} · seed ${s.seed}`;
      this.show('end');
    }

    // --- HUD
    updateHud() {
      const s = this.state, p = s.player, surface = s.surface[clamp(Math.floor(p.x), 0, B.WIDTH - 1)], depth = Math.floor(p.y + p.h) - surface;
      this.el.hp.textContent = `${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`;
      this.el['hp-bar'].style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`;
      this.el['hp-bar'].classList.toggle('low', p.hp < p.maxHp * 0.3);
      this.el.depth.textContent = depth <= 0 ? 'Surface' : `Depth ${depth}`;
      const hours = Math.floor((s.clock * 24 + 6) % 24), minutes = Math.floor(((s.clock * 24 + 6) % 1) * 60);
      this.el.clock.textContent = `Day ${s.day} · ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${B.isNight(s) ? ' · night' : ''}`;
      this.el.gear.textContent = `${B.TIERS[s.pickTier]} pick · ${B.TIERS[s.swordTier]} sword · ${s.armourTier > 1 ? B.TIERS[s.armourTier] + ' armour' : 'no armour'}`;
      this.el.objective.textContent = B.objective(s);
      // The status panel's height depends on its wrapped text, so the bar below follows it.
      const panelBottom = Math.ceil(this.el.stats.getBoundingClientRect().bottom);
      if (panelBottom !== this.panelBottom) {
        this.panelBottom = panelBottom;
        document.documentElement.style.setProperty('--stats-bottom', panelBottom + 'px');
      }
      const showBoss = Boolean(s.boss);
      this.el.boss.hidden = !showBoss;
      if (showBoss) this.el['boss-bar'].style.width = `${s.boss.hp / s.boss.maxHp * 100}%`;
      const key = s.order.join() + '|' + s.selected + '|' + s.order.map(id => s.items[id]).join();
      if (key === this.hotbarKey) return;
      this.hotbarKey = key;
      const bar = this.el.hotbar;
      bar.textContent = '';
      for (const [i, id] of s.order.entries()) {
        const button = document.createElement('button'), item = B.ITEMS[id];
        button.type = 'button';
        button.dataset.item = id;
        button.className = id === s.selected ? 'slot selected' : 'slot';
        button.setAttribute('aria-label', `${item.name}${id === 'pick' ? '' : `, ${s.items[id]}`}`);
        button.title = item.name;
        const glyph = document.createElement('b');
        glyph.textContent = item.glyph;
        const count = document.createElement('small');
        count.textContent = id === 'pick' ? '' : s.items[id];
        const index = document.createElement('i');
        index.textContent = i < HOTBAR ? i + 1 : '';
        button.append(index, glyph, count);
        bar.append(button);
      }
    }

    // --- Frame
    gatherInput() {
      const k = this.keys, h = this.held, pad = this.pad, stick = pad.axis(0), stickY = pad.axis(1);
      const input = {
        left: k.has('KeyA') || k.has('ArrowLeft') || h.has('left') || stick < -0.4,
        right: k.has('KeyD') || k.has('ArrowRight') || h.has('right') || stick > 0.4,
        up: k.has('KeyW') || k.has('ArrowUp') || h.has('up') || stickY < -0.5,
        down: k.has('KeyS') || k.has('ArrowDown') || h.has('down') || stickY > 0.5,
        jump: k.has('Space') || k.has('KeyW') || k.has('ArrowUp') || h.has('up') || pad.held(0),
        attack: this.mouse.attack || h.has('attack') || pad.held(5) || pad.held(2),
        use: this.mouse.down || pad.held(7),
        usePressed: this.mouse.pressed || pad.pressed(7)
      };
      const p = this.state.player;
      if (pad.connected && (Math.abs(pad.axis(2)) > 0 || Math.abs(pad.axis(3)) > 0)) {
        this.padAim = { x: pad.axis(2) * B.REACH, y: pad.axis(3) * B.REACH };
      }
      if (pad.connected && this.padAim && !this.mouse.known) {
        input.aimX = p.x + p.w / 2 + this.padAim.x;
        input.aimY = p.y + p.h / 2 + this.padAim.y;
      } else {
        const aim = this.aimTile();
        input.aimX = aim.x;
        input.aimY = aim.y;
      }
      this.mouse.pressed = false;
      if (this.selectQueued) { input.select = this.selectQueued; this.selectQueued = null; }
      return input;
    }
    aimTile() {
      const cam = this.cam || { x: 0, y: 0 }, engine = this.view.engine;
      return {
        x: (this.mouse.x / engine.cellSize[0] + cam.x) / TILE_W,
        y: (this.mouse.y / engine.cellSize[1] + cam.y) / TILE_H
      };
    }
    collectSprites(state, cam) {
      const sprites = [], view = this.view, toCell = (x, y) => ({ x: Math.round(x * TILE_W) - cam.x, y: Math.round(y * TILE_H) - cam.y });
      const onScreen = (s, w, h) => s.x + w >= 0 && s.y + h >= 0 && s.x < view.columns && s.y < view.rows;
      // Art stands on the bottom-centre of the body it belongs to, or centres on it.
      const place = (body, art, facing, flash, lit, centred) => {
        const { w, h } = view.size(art);
        const x = Math.round((body.x + body.w / 2) * TILE_W - w / 2) - cam.x;
        const y = (centred ? Math.round((body.y + body.h / 2) * TILE_H - h / 2) : Math.round((body.y + body.h) * TILE_H) - h) - cam.y;
        return onScreen({ x, y }, w, h) ? { x, y, art, flip: facing < 0, flash, lit } : null;
      };
      const add = (...args) => { const s = place(...args); if (s) sprites.push(s); };
      if (this.mode !== 'title') {
        const p = state.player, moving = Math.abs(p.vx) > 0.5, step = Math.floor(p.anim * 0.9) % 2;
        const frame = p.climbing ? 'climb' : !p.grounded ? 'jump' : moving ? (step ? 'walkA' : 'walkB') : 'idle';
        const blink = p.hurtTimer > 0 && Math.floor(this.time * 18) % 2 === 0;
        if (!blink) add(p, frame, p.facing, false);
        if (p.swing > 0) {
          const blade = place({ x: p.facing > 0 ? p.x + p.w - 0.1 : p.x - 0.9, y: p.y + 0.1, w: 1, h: 0.9 }, 'sword', p.facing, false, true);
          if (blade) sprites.unshift(blade);
        }
      }
      for (const c of state.creatures) {
        const step = Math.floor(c.anim * 5) % 2, name = c.kind === 'slime' ? (c.grounded ? 'slime' : 'slimeHop') : step ? c.kind : c.kind + 'B';
        add(c, name, c.facing, c.flash > 0.3, false, c.kind === 'bat');
      }
      if (state.boss) {
        // Earlier sprites draw on top, so the head (the weak point) goes first.
        const pulse = Math.floor(this.time * 3) % 2 === 1;
        for (const [i, s] of state.boss.segments.entries()) {
          const art = i === 0 ? (state.boss.lunge > 0 ? 'mawHeadOpen' : 'mawHead') : pulse === (i % 2 === 0) ? 'mawBodyB' : 'mawBody';
          add({ x: s.x, y: s.y, w: 0, h: 0 }, art, 1, state.boss.flash > 0.3, true, true);
        }
      }
      for (const shot of state.shots) {
        const at = toCell(shot.x, shot.y);
        if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: '*', colour: [255, 170, 60], lit: true });
      }
      for (const part of this.particles) {
        const at = toCell(part.x, part.y);
        if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: part.char, colour: part.colour, lit: true });
      }
      return sprites;
    }
    frame(now) {
      const elapsed = Math.min(50, now - this.last), dt = elapsed / 1000;
      this.quality.sample(now - this.last);
      this.last = now;
      this.time += dt;
      this.pad.poll();
      if (this.pad.connected) this.pollPadMenus();

      if (this.mode === 'play' && this.state && !this.state.won) {
        this.accumulator += elapsed;
        let steps = 0;
        while (this.accumulator >= STEP_MS && steps < 4) {
          this.handle(B.step(this.state, this.gatherInput()));
          this.accumulator -= STEP_MS;
          steps++;
          if (this.state.won) break;
        }
        if (steps === 4) this.accumulator = 0;
        this.hudTimer += dt;
        if (this.hudTimer > 0.12) { this.hudTimer = 0; this.updateHud(); }
        this.saveTimer += dt;
        if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }
      }
      for (const part of this.particles) {
        part.vy += part.gravity * dt;
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.life -= dt;
      }
      this.particles = this.particles.filter(part => part.life > 0);
      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      }
      this.shake = Math.max(0, this.shake - dt);

      const playing = this.state && this.mode !== 'title', state = playing ? this.state : this.demo;
      if (!playing && !this.reducedMotion) this.demoX = B.WIDTH / 2 + Math.sin(this.time * 0.05) * 60;
      const centre = playing
        ? { x: state.player.x + state.player.w / 2, y: state.player.y + state.player.h / 2 }
        : { x: this.demoX, y: state.surface[Math.floor(this.demoX)] + 2 };
      const cam = this.view.camera(centre.x, centre.y);
      if (this.shake > 0 && !this.reducedMotion) {
        cam.x += Math.round((Math.random() - 0.5) * 3);
        cam.y += Math.round((Math.random() - 0.5) * 2);
      }
      this.cam = cam;
      const clock = state.clock, day = B.daylight(state), dusk = Math.max(0, 1 - Math.abs(clock - 0.56) / 0.07);
      // The sun crosses by day and the moon by night.
      const night = B.isNight(state), span = night ? (clock - 0.58) / 0.42 : clock / 0.58;
      const sunX = Math.round(span * this.view.columns), sunY = Math.round(this.view.rows * 0.42 - Math.sin(span * Math.PI) * this.view.rows * 0.34);
      let cursor = null, crack = null;
      if (playing && this.mode === 'play') {
        if (this.mouse.known) {
          const aim = this.aimTile(), p = state.player;
          const inReach = Math.hypot(aim.x - p.x - p.w / 2, aim.y - p.y - p.h / 2) <= B.REACH;
          cursor = { x: Math.floor(aim.x), y: Math.floor(aim.y), kind: inReach ? 1 : 2 };
        }
        if (state.mining) crack = { x: state.mining.x, y: state.mining.y, stage: 1 + Math.floor(state.mining.progress / state.mining.time * 4) };
        if (state.mining && Math.floor(this.time * 8) !== this.mineBeat) { this.mineBeat = Math.floor(this.time * 8); this.sound.play('mine'); }
      }
      const glowAt = playing ? [state.player.x + state.player.w / 2, state.player.y + state.player.h / 2] : [-999, -999];
      try {
        this.view.draw({
          state, cam, cursor, crack, day, dusk, time: this.reducedMotion ? 0 : this.time, tint: this.tint, dissolve: 0,
          sprites: this.collectSprites(state, cam), glow: glowAt, sun: [sunX, sunY, night ? 2 : 1]
        });
      } catch (error) { this.fatal(error); return; }
      requestAnimationFrame(this.frame);
    }
    pollPadMenus() {
      const pad = this.pad;
      if (this.mode !== 'play') {
        if (pad.pressed(0)) document.activeElement?.click?.();
        if (pad.pressed(9) && (this.mode === 'pause' || this.mode === 'craft')) this.show('play');
        return;
      }
      if (pad.pressed(9)) this.show('pause');
      if (pad.pressed(3)) this.show('craft');
      if (pad.pressed(14)) this.cycle(-1);
      if (pad.pressed(15)) this.cycle(1);
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
      global.burrow = new BurrowApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

/* Lockwork app: keyboard/touch/gamepad input, WebAudio clockwork SFX, vault selector, HUD and saves. */
(function (global) {
  'use strict';

  const L = global.Lockwork, { TILE_W, TILE_H } = global.LockworkView;
  const SAVE_KEY = 'lockwork-save', BEST_KEY = 'lockwork-best';

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
          this.master.gain.value = 0.28;
          this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch { return null; }
      return this.context;
    }
    tone(frequency, duration, { type = 'triangle', volume = 0.09, slide = 0, delay = 0 } = {}) {
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
    noise(duration, { volume = 0.1, filter = 700 } = {}) {
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
        case 'step': this.tone(240, 0.04, { type: 'sine', volume: 0.045 }); break;
        case 'push': this.noise(0.08, { volume: 0.12, filter: 550 }); this.tone(110, 0.08, { type: 'triangle', slide: -30, volume: 0.09 }); break;
        case 'rotate': this.tone(540, 0.045, { type: 'square', slide: 180, volume: 0.05 }); break;
        case 'wait': this.tone(320, 0.04, { type: 'sine', volume: 0.035 }); break;
        case 'bump': this.tone(95, 0.06, { type: 'triangle', volume: 0.06 }); break;
        case 'undo': this.tone(360, 0.06, { type: 'triangle', slide: -120, volume: 0.06 }); break;
        case 'reset': this.tone(280, 0.12, { type: 'sawtooth', slide: -100, volume: 0.07 }); break;
        case 'receptor': this.tone(392 * Math.pow(1.12, extra), 0.16, { type: 'sine', volume: 0.08 }); break;
        case 'unlock': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', volume: 0.09, delay: i * 0.05 })); break;
        case 'clear': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', volume: 0.1, delay: i * 0.06 })); break;
        case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', volume: 0.11, delay: i * 0.1 })); break;
      }
    }
  }

  class LockworkApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.LockworkView(this.canvas);
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

      const ids = ['title', 'pause', 'help', 'end', 'vaults', 'hud', 'touch', 'toast', 'mute', 'continue', 'difficulty',
        'best', 'vault-title', 'cogs', 'steps', 'chapter', 'objective', 'vault-grid', 'hint-btn', 'end-title', 'end-detail', 'end-score'];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.el.stats = document.querySelector('.stats');

      this.mode = 'title';
      this.state = null;
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.time = 0;
      this.padStick = { x: 0, y: 0 };
      this.swipe = null;
      this.last = performance.now();

      this.demo = L.newGame('lockwork', 'standard', 6);
      this.bind();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bind() {
      global.addEventListener('resize', () => this.resize());
      global.addEventListener('blur', () => { if (this.mode === 'play') this.show('pause'); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.show('pause'); });

      const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'vaults') this.show('play');
          else if (this.mode === 'help') this.show(this.state && this.state.status === 'play' && this.lastMode !== 'title' ? 'pause' : 'title');
          else if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') { event.preventDefault(); this.newGame(); return; }
        if (event.code === 'KeyL' || event.code === 'Tab') {
          if (this.mode === 'play' || this.mode === 'vaults') {
            event.preventDefault();
            this.show(this.mode === 'vaults' ? 'play' : 'vaults');
            return;
          }
        }
        if (this.mode !== 'play') return;
        if (CAPTURE.has(event.code)) event.preventDefault();
        if (event.code === 'ArrowUp' || event.code === 'KeyW') this.act({ moveX: 0, moveY: -1 });
        else if (event.code === 'ArrowDown' || event.code === 'KeyS') this.act({ moveX: 0, moveY: 1 });
        else if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.act({ moveX: -1, moveY: 0 });
        else if (event.code === 'ArrowRight' || event.code === 'KeyD') this.act({ moveX: 1, moveY: 0 });
        else if (!event.repeat) {
          if (event.code === 'Space' || event.code === 'KeyE' || event.code === 'Enter') this.act({ action: true });
          else if (event.code === 'KeyZ' || event.code === 'Backspace') this.act({ undo: true });
          else if (event.code === 'KeyR') this.act({ reset: true });
          else if (event.code === 'KeyH') this.act({ hint: true });
        }
      });

      this.canvas.addEventListener('pointerdown', event => {
        if (this.mode !== 'play') return;
        event.preventDefault();
        this.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
      });
      this.canvas.addEventListener('pointerup', event => {
        if (!this.swipe || event.pointerId !== this.swipe.id || this.mode !== 'play') return;
        const dx = event.clientX - this.swipe.x, dy = event.clientY - this.swipe.y;
        this.swipe = null;
        if (Math.hypot(dx, dy) > 28) {
          if (Math.abs(dx) > Math.abs(dy)) this.act({ moveX: Math.sign(dx), moveY: 0 });
          else this.act({ moveX: 0, moveY: Math.sign(dy) });
          return;
        }
        const cam = this.view.camera(), size = this.view.engine.cellSize;
        const tx = Math.floor((event.clientX / size[0] + cam.x) / TILE_W);
        const ty = Math.floor((event.clientY / size[1] + cam.y) / TILE_H);
        const v = this.state.vault, rx = tx - v.px, ry = ty - v.py;
        if (rx === 0 && ry === 0) { this.act({ action: true }); return; }
        if (Math.abs(rx) + Math.abs(ry) === 1) {
          const obj = L.objAt(v, tx, ty);
          if (obj && (obj.kind === 'mirror' || obj.kind === 'splitter')) {
            v.facing = rx === 1 ? 1 : rx === -1 ? 3 : ry === 1 ? 2 : 0;
            this.act({ action: true });
          } else {
            this.act({ moveX: rx, moveY: ry });
          }
        } else if (Math.abs(rx) > Math.abs(ry)) {
          this.act({ moveX: Math.sign(rx), moveY: 0 });
        } else {
          this.act({ moveX: 0, moveY: Math.sign(ry) });
        }
      });
      this.canvas.addEventListener('pointercancel', () => { this.swipe = null; });

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newGame());
      click('continue', () => this.resume());
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && this.state.status === 'play' ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-help', () => this.show('help'));
      click('pause-title', () => { this.save(); this.show('title'); });
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('undo-btn', () => this.act({ undo: true }));
      click('reset-btn', () => this.act({ reset: true }));
      click('hint-btn', () => this.act({ hint: true }));
      click('vaults-btn', () => this.show('vaults'));
      click('vaults-close', () => this.show('play'));
      click('end-again', () => this.newGame());
      click('end-menu', () => this.show('title'));

      this.el['vault-grid'].addEventListener('click', event => {
        const btn = event.target.closest('button[data-vault]');
        if (!btn) return;
        // act() only runs in play mode, so leave the picker before switching.
        this.show('play');
        this.act({ selectVault: Number(btn.dataset.vault) });
      });

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Off' : 'Sound';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        showMute();
        try { localStorage.setItem('lockwork-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('lockwork-muted') === '1';
        const storedDiff = localStorage.getItem('lockwork-difficulty');
        if (L.DIFFICULTIES[storedDiff]) this.el.difficulty.value = storedDiff;
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('lockwork-difficulty', this.el.difficulty.value); } catch {}
      });

      this.el.touch.addEventListener('pointerdown', event => {
        const dirBtn = event.target.closest('button[data-dir]');
        const actBtn = event.target.closest('button[data-act]');
        if (!dirBtn && !actBtn) return;
        event.preventDefault();
        if (dirBtn) {
          const [mx, my] = dirBtn.dataset.dir.split(',').map(Number);
          this.act({ moveX: mx, moveY: my });
        } else if (actBtn) {
          const a = actBtn.dataset.act;
          this.act({ [a]: true });
        }
      });
      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.el.touch.hidden = false;
      this.resize();
    }

    resize() {
      const w = global.innerWidth, h = global.innerHeight;
      // Narrow windows get the on-screen pads even with a mouse.
      if (w < 560 && !document.body.classList.contains('touch')) { this.enableTouch(); return; }
      // Size cells so the whole board fits the space the HUD leaves free, and centre it there.
      const cols = L.WIDTH * TILE_W, rows = L.HEIGHT * TILE_H, area = this.boardArea(w, h, cols, rows);
      // Letters as small as still read (4x6), shrinking further only when the board would not fit.
      const cellH = Math.max(3, Math.min(6, Math.floor(Math.min(area.h / rows, area.w / cols * 1.5))));
      const cellW = Math.max(2, Math.floor(cellH / 1.5));
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      this.view.resize(w, h, [cellW, cellH]);
      this.view.offset = {
        x: Math.round((area.x + (area.w - cols * cellW) / 2) / cellW),
        y: Math.round((area.y + (area.h - rows * cellH) / 2) / cellH)
      };
    }

    // The larger of two spaces: beside the status panel, or below it.
    boardArea(w, h, cols, rows) {
      if (this.el.hud.hidden) return { x: 0, y: 0, w, h };
      const stats = this.el.stats.getBoundingClientRect(), goal = this.el.objective.getBoundingClientRect();
      const pads = document.body.classList.contains('touch') ? [...this.el.touch.querySelectorAll('.pad, .side')].map(n => n.getBoundingClientRect()).filter(r => r.height) : [];
      const bottom = Math.min(h - 40, ...pads.map(r => r.top - 6));
      const below = Math.max(stats.bottom, goal.bottom) + 6;
      const side = { x: stats.right + 8, y: goal.bottom + 6, w: w - stats.right - 16, h: bottom - goal.bottom - 6 };
      const top = { x: 8, y: below, w: w - 16, h: bottom - below };
      const fit = a => Math.min(a.h / rows, a.w / cols * 1.5);
      return fit(side) >= fit(top) ? side : top;
    }

    show(mode) {
      const was = this.mode;
      if (mode === 'help') this.lastMode = was;
      this.mode = mode;
      for (const name of ['title', 'pause', 'help', 'end', 'vaults']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      if (mode === 'vaults') this.renderVaults();
      if (mode === 'play' || was === 'play' || was === 'title') this.resize();
      if (was === 'play' && mode === 'pause') this.save();
      if (mode !== 'play') this.el[mode]?.querySelector('button')?.focus();
    }

    renderVaults() {
      const grid = this.el['vault-grid'], s = this.state;
      grid.textContent = '';
      L.VAULTS.forEach((v, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.vault = i;
        const best = s.bestSteps[i], par = v.par + L.DIFFICULTIES[s.difficulty].parSlack;
        const cog = best !== null && best <= par;
        btn.className = 'vbtn' + (cog ? ' cog' : s.cleared[i] ? ' cleared' : '');
        const strong = document.createElement('strong');
        strong.textContent = `${i + 1}. ${v.name}`;
        const small = document.createElement('small');
        small.textContent = best !== null ? `${best}/${par} steps${cog ? ' · Gold Cog' : ''}` : `${v.chapter} · Par ${par}`;
        btn.append(strong, small);
        grid.append(btn);
      });
    }

    refreshTitle() {
      let saved = null, best = [];
      try {
        saved = localStorage.getItem(SAVE_KEY);
        best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
      } catch {}
      this.el.continue.hidden = !saved;
      this.el.best.textContent = best.length
        ? 'Best runs · ' + best.slice(0, 3).map(b => `${b.score} (${b.cogs}/30 cogs)`).join(' · ')
        : 'Five chapters, 30 clockwork vaults. Beat Par to earn Gold Cogs.';
    }

    newGame(seed) {
      seed = seed || 'lockwork';
      this.begin(L.newGame(seed, this.el.difficulty.value, 0));
      this.toast(document.body.classList.contains('touch')
        ? 'Tap adjacent tiles to step or turn mirrors. Light every (O) to open {O}.'
        : 'Arrows/WASD move & push crates. Space/E turns mirrors or waits 1 tick.');
    }

    resume() {
      try {
        this.begin(L.restore(localStorage.getItem(SAVE_KEY)));
        this.toast('Vaults restored.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.refreshTitle();
      }
    }

    begin(state) {
      this.state = state;
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.show('play');
      this.updateHud();
      this.sound.ensure();
    }

    save() {
      if (!this.state || this.state.status !== 'play') return;
      try { localStorage.setItem(SAVE_KEY, L.save(this.state)); } catch {}
    }

    record() {
      const s = this.state;
      try {
        localStorage.removeItem(SAVE_KEY);
        const best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
        best.push({ score: L.score(s), cogs: s.cogs, seed: s.seed });
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

    act(input) {
      if (!this.state || this.mode !== 'play') return;
      // A held key must not spill into the next vault the moment one is cleared.
      if (performance.now() < (this.calmUntil || 0) && (input.moveX || input.moveY || input.action)) return;
      // The hint searches the whole vault, which can take a moment: say so first.
      if (input.hint && !input.now) {
        this.toast('Working out a hint...');
        setTimeout(() => this.act({ hint: true, now: true }), 40);
        return;
      }
      const events = L.step(this.state, input);
      for (const e of events) {
        if (e.type === 'step') this.sound.play('step');
        else if (e.type === 'push') this.sound.play('push');
        else if (e.type === 'rotate') this.sound.play('rotate');
        else if (e.type === 'wait') this.sound.play('wait');
        else if (e.type === 'bump') this.sound.play('bump');
        else if (e.type === 'undo') this.sound.play('undo');
        else if (e.type === 'reset') this.sound.play('reset');
        else if (e.type === 'receptor') this.sound.play('receptor', e.lit);
        else if (e.type === 'unlock') { this.sound.play('unlock'); this.flash(0.3, 0.9, 0.4, 0.14); }
        else if (e.type === 'hint' && e.hint) this.toast(e.hint.text);
        else if (e.type === 'vaultClear') {
          this.calmUntil = performance.now() + 450;
          this.sound.play('clear');
          this.flash(1.0, 0.85, 0.3, 0.2);
          this.toast(`Vault ${e.index + 1} cleared in ${e.steps}/${e.par} steps${e.cog ? ' · Gold Cog *!' : '!'}`);
        } else if (e.type === 'victory') {
          this.sound.play('victory');
          this.record();
          setTimeout(() => this.showEnd(), 700);
        }
      }
      this.save();
      this.updateHud();
    }

    showEnd() {
      const s = this.state;
      this.el['end-title'].textContent = 'All 30 brass vaults powered';
      this.el['end-detail'].textContent = `Completed on ${L.DIFFICULTIES[s.difficulty].label} with ${s.cogs}/30 Gold Cogs in ${s.totalSteps} total steps.`;
      this.el['end-score'].textContent = `Score ${L.score(s)} · seed ${s.seed}`;
      this.show('end');
    }

    updateHud() {
      const s = this.state, v = s.vault;
      this.el['vault-title'].textContent = `VAULT ${v.index + 1}/30 · ${v.name}`;
      this.el.cogs.textContent = `* ${s.cogs}`;
      this.el.steps.textContent = `STEPS ${v.steps} / PAR ${v.par}`;
      this.el.chapter.textContent = v.chapter;
      this.el['hint-btn'].disabled = !L.DIFFICULTIES[s.difficulty].hints;
      this.el.objective.textContent = L.objective(s);
      const bottom = Math.ceil(this.el.stats.getBoundingClientRect().bottom);
      if (bottom !== this.statsBottom) {
        this.statsBottom = bottom;
        document.documentElement.style.setProperty('--stats-bottom', bottom + 'px');
      }
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
      if (pad.pressed(8)) { this.show('vaults'); return; }
      if (pad.pressed(0)) this.act({ action: true });
      if (pad.pressed(1)) this.act({ undo: true });
      if (pad.pressed(3)) this.act({ reset: true });
      if (pad.pressed(12)) this.act({ moveX: 0, moveY: -1 });
      if (pad.pressed(13)) this.act({ moveX: 0, moveY: 1 });
      if (pad.pressed(14)) this.act({ moveX: -1, moveY: 0 });
      if (pad.pressed(15)) this.act({ moveX: 1, moveY: 0 });

      const sx = Math.abs(pad.axis(0)) > 0.55 ? Math.sign(pad.axis(0)) : 0;
      const sy = Math.abs(pad.axis(1)) > 0.55 ? Math.sign(pad.axis(1)) : 0;
      if (sx && !this.padStick.x) this.act({ moveX: sx, moveY: 0 });
      else if (sy && !this.padStick.y) this.act({ moveX: 0, moveY: sy });
      this.padStick.x = sx;
      this.padStick.y = sy;
    }

    frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
      this.quality.sample(now - this.last);
      this.last = now;
      this.time += dt;
      this.pollPad();

      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      }

      const state = this.state && this.mode !== 'title' ? this.state : this.demo;
      try {
        this.view.draw({ state, time: this.reducedMotion ? 0 : this.time, tint: this.tint });
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
      global.lockwork = new LockworkApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

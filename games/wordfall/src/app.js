/* Wordfall app: input, HUD, sound and best scores around the pure rules. */
(function (global) {
  'use strict';

  const W = global.Wordfall;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  class Sound {
    constructor() {
      this.muted = false;
      this.context = null;
    }
    tone(frequency, duration, type = 'triangle', volume = 0.1, delay = 0) {
      if (this.muted) return;
      const Audio = global.AudioContext || global.webkitAudioContext;
      if (!Audio) return;
      try {
        if (!this.context) this.context = new Audio();
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
        const c = this.context, now = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      } catch {}
    }
    play(name) {
      if (name === 'catch') this.tone(660, 0.1);
      else if (name === 'wrong') this.tone(130, 0.28, 'sawtooth', 0.12);
      else if (name === 'word') [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.1, i * 0.07));
      else if (name === 'over') [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, i * 0.14));
    }
  }

  class WordfallApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.WordfallView(this.canvas);
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      const ids = ['title', 'pause', 'help', 'end', 'hud', 'touch', 'word', 'score', 'lives', 'clock', 'combo', 'mute', 'toast', 'difficulty', 'end-title', 'end-detail', 'end-score'];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.state = null;
      this.mode = 'title';
      this.held = new Set();
      this.pointers = new Map();
      this.nudge = 0;
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.time = 0;
      this.hudTimer = 0;
      this.last = performance.now();
      this.bind();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bind() {
      global.addEventListener('resize', () => this.resize());
      const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'];
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') {
          event.preventDefault();
          this.newRun();
          return;
        }
        if (this.mode !== 'play') return;
        if (LEFT.includes(event.code) || RIGHT.includes(event.code)) {
          event.preventDefault();
          if (!event.repeat) this.nudge = LEFT.includes(event.code) ? -1 : 1;
          this.held.add(LEFT.includes(event.code) ? 'left' : 'right');
        }
      });
      global.addEventListener('keyup', event => {
        if (LEFT.includes(event.code)) this.held.delete('left');
        if (RIGHT.includes(event.code)) this.held.delete('right');
      });
      global.addEventListener('blur', () => this.clearInput());

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newRun());
      click('daily-run', () => this.newRun('daily-' + today()));
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && !this.state.over ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-help', () => this.show('help'));
      click('pause-restart', () => this.newRun(this.state.seed, this.state.difficulty));
      click('pause-title', () => this.show('title'));
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('end-again', () => this.newRun());
      click('end-same', () => this.newRun(this.state.seed, this.state.difficulty));
      click('end-menu', () => this.show('title'));

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Sound off' : 'Sound on';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        showMute();
        try { localStorage.setItem('wordfall-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('wordfall-muted') === '1';
        const stored = localStorage.getItem('wordfall-difficulty');
        if (W.DIFFICULTIES[stored]) this.el.difficulty.value = stored;
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('wordfall-difficulty', this.el.difficulty.value); } catch {}
      });

      this.el.touch.addEventListener('pointerdown', event => {
        const button = event.target.closest('button[data-hold]');
        if (!button) return;
        event.preventDefault();
        this.pointers.set(event.pointerId, button.dataset.hold);
        this.nudge = button.dataset.hold === 'left' ? -1 : 1;
      });
      const release = event => this.pointers.delete(event.pointerId);
      global.addEventListener('pointerup', release);
      global.addEventListener('pointercancel', release);
      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    clearInput() {
      this.held.clear();
      this.pointers.clear();
      this.nudge = 0;
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.el.touch.hidden = false;
      this.resize();
    }

    resize() {
      const coarse = global.innerWidth < 700;
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      const touch = document.body.classList.contains('touch');
      const reserved = touch ? Math.max(80, Math.min(130, global.innerHeight * 0.2 + 10)) : 0;
      this.view.resize(global.innerWidth, global.innerHeight, this.quality.cell(coarse ? [7, 10] : [8, 12]), reserved);
    }

    show(mode) {
      this.mode = mode;
      this.clearInput();
      for (const name of ['title', 'pause', 'help', 'end']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      this.el[mode]?.querySelector('button')?.focus();
    }

    refreshTitle() {
      let best = [];
      try { best = JSON.parse(localStorage.getItem('wordfall-best') || '[]'); } catch {}
      document.getElementById('best').textContent = best.length
        ? 'Best runs · ' + best.slice(0, 3).map(b => `${b.score} (${b.words} words)`).join(' · ')
        : 'No runs yet. Two minutes, one word at a time.';
      document.getElementById('daily-run').textContent = 'Daily words · ' + today();
    }

    newRun(seed, difficulty) {
      seed = seed || Math.random().toString(36).slice(2, 8);
      this.state = W.newRun(seed, difficulty || this.el.difficulty.value);
      this.tint = [0, 0, 0, 0];
      this.updateHud();
      this.show('play');
      this.toast(document.body.classList.contains('touch')
        ? 'Tap left or right. Catch the gold letters, dodge the blue ones.'
        : 'Arrow keys or A / D. Catch the gold letters, dodge the blue ones.');
    }

    record() {
      try {
        const best = JSON.parse(localStorage.getItem('wordfall-best') || '[]');
        best.push({ score: W.score(this.state), words: this.state.words, seed: this.state.seed });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem('wordfall-best', JSON.stringify(best.slice(0, 5)));
      } catch {}
    }

    toast(text) {
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 3600);
    }

    flash(r, g, b, alpha) {
      this.tint[0] = r;
      this.tint[1] = g;
      this.tint[2] = b;
      this.tint[3] = this.reducedMotion ? alpha * 0.35 : alpha;
      this.tintTimer = 0.24;
    }

    handle(events) {
      for (const event of events) {
        if (event.type === 'catch') this.sound.play('catch');
        else if (event.type === 'wrong') { this.sound.play('wrong'); this.flash(0.8, 0.1, 0.08, 0.34); }
        else if (event.type === 'word') {
          this.sound.play('word');
          this.flash(0.9, 0.75, 0.25, 0.22);
          this.toast(`${event.word} +${event.gain}${event.combo > 1 ? ` · combo ×${event.combo}` : ''}`);
        } else if (event.type === 'over') {
          this.sound.play('over');
          this.record();
          this.showEnd();
        }
      }
    }

    updateHud() {
      const s = this.state, left = Math.ceil(W.DURATION - s.time);
      this.el.score.textContent = `SCORE ${W.score(s)}`;
      this.el.lives.textContent = `LIVES ${s.lives}`;
      this.el.clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      this.el.combo.textContent = s.combo > 1 ? `COMBO ×${s.combo}` : '';
      const key = s.word + s.progress;
      if (key !== this.wordKey) {
        this.wordKey = key;
        this.el.word.textContent = '';
        [...s.word].forEach((letter, i) => {
          const span = document.createElement('span');
          span.textContent = letter;
          span.className = i < s.progress ? 'done' : i === s.progress ? 'next' : '';
          this.el.word.append(span);
        });
        this.el.word.setAttribute('aria-label', `Spell ${s.word}. Next letter ${W.needed(s)}.`);
      }
    }

    showEnd() {
      const s = this.state;
      this.el['end-title'].textContent = s.won ? 'Time' : 'Out of lives';
      this.el['end-detail'].textContent = `You spelled ${s.words} word${s.words === 1 ? '' : 's'}, best combo ×${Math.max(1, s.bestCombo)}.`;
      this.el['end-score'].textContent = `Score ${W.score(s)} · ${W.DIFFICULTIES[s.difficulty].label} · seed ${s.seed}`;
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
      if (pad.pressed(14)) this.nudge = -1;
      if (pad.pressed(15)) this.nudge = 1;
    }

    frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
      this.quality.sample(now - this.last);
      this.last = now;
      this.time += dt;
      this.pollPad();

      if (this.mode === 'play' && this.state && !this.state.over) {
        const touch = [...this.pointers.values()];
        const stick = this.pad.axis(0);
        const events = W.step(this.state, dt, {
          left: this.held.has('left') || touch.includes('left') || this.pad.held(14) || stick < -0.5,
          right: this.held.has('right') || touch.includes('right') || this.pad.held(15) || stick > 0.5,
          nudge: this.nudge
        });
        this.nudge = 0;
        if (events.length) this.handle(events);
        this.hudTimer += dt;
        if (this.hudTimer >= 0.1 || events.length) {
          this.hudTimer = 0;
          if (this.state) this.updateHud();
        }
      }
      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      }
      try {
        this.view.draw({
          state: this.mode === 'title' ? null : this.state,
          time: this.reducedMotion ? 0 : this.time,
          tint: this.tint
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
      global.wordfall = new WordfallApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

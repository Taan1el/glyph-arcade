/* Joyride app: input, WebAudio engine/siren/crash synth, particles, HUD, minimap, full map, and saves. */
(function (global) {
  'use strict';

  const J = global.Joyride, { TILE_W, TILE_H, headingDir } = global.JoyrideView;
  const SAVE_KEY = 'joyride-save', BEST_KEY = 'joyride-best';
  const STEP_MS = J.STEP * 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Sound {
    constructor() {
      this.muted = false;
      this.context = null;
      this.engineOsc = null;
      this.engineGain = null;
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
    updateEngine(speed, active) {
      if (this.muted || !active) {
        if (this.engineGain && this.context) {
          this.engineGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.05);
        }
        return;
      }
      const c = this.ensure();
      if (!c) return;
      if (!this.engineOsc) {
        try {
          const osc = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
          osc.type = 'sawtooth';
          filter.type = 'lowpass';
          filter.frequency.value = 220;
          gain.gain.value = 0.0001;
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.master);
          osc.start();
          this.engineOsc = osc;
          this.engineGain = gain;
        } catch { return; }
      }
      const pitch = 48 + Math.min(28, Math.abs(speed)) * 4.2;
      this.engineOsc.frequency.setTargetAtTime(pitch, c.currentTime, 0.04);
      this.engineGain.gain.setTargetAtTime(0.035 + Math.min(0.035, Math.abs(speed) * 0.0012), c.currentTime, 0.05);
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
        case 'skid': this.noise(0.09, { volume: 0.06, filter: 1900 }); break;
        case 'hit': this.noise(0.08, { volume: 0.1, filter: 550 }); this.tone(130, 0.09, { type: 'triangle', slide: -40, volume: 0.08 }); break;
        case 'alarm': this.tone(740, 0.12, { type: 'sawtooth', volume: 0.1 }); this.tone(520, 0.12, { type: 'sawtooth', volume: 0.1, delay: 0.13 }); break;
        case 'crash': this.noise(0.18, { volume: 0.16, filter: 650 }); this.tone(95, 0.14, { type: 'sawtooth', slide: -45, volume: 0.1 }); break;
        case 'explosion': this.noise(0.55, { volume: 0.25, filter: 380 }); this.tone(65, 0.45, { type: 'sawtooth', slide: -35, volume: 0.18 }); break;
        case 'horn': this.tone(370, 0.18, { type: 'sawtooth', volume: 0.09 }); this.tone(466, 0.18, { type: 'sawtooth', volume: 0.08 }); break;
        case 'ring': this.tone(880, 0.07, { type: 'square', volume: 0.05 }); this.tone(1175, 0.07, { type: 'square', volume: 0.05, delay: 0.08 }); break;
        case 'siren': this.tone(660, 0.22, { type: 'triangle', slide: 220, volume: 0.06 }); this.tone(880, 0.22, { type: 'triangle', slide: -220, volume: 0.06, delay: 0.22 }); break;
        case 'door': this.noise(0.08, { volume: 0.08, filter: 800 }); break;
        case 'checkpoint': this.tone(659, 0.1, { type: 'triangle', slide: 220, volume: 0.09 }); break;
        case 'respray': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.12, { type: 'sine', volume: 0.08, delay: i * 0.06 })); break;
        case 'jobStart': [392, 523, 659].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', volume: 0.09, delay: i * 0.06 })); break;
        case 'jobDone': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', volume: 0.1, delay: i * 0.08 })); break;
        case 'jobFail': [293, 246, 196].forEach((f, i) => this.tone(f, 0.2, { type: 'sawtooth', volume: 0.09, delay: i * 0.1 })); break;
        case 'busted': [330, 262, 196].forEach((f, i) => this.tone(f, 0.24, { type: 'square', volume: 0.09, delay: i * 0.12 })); break;
        case 'wasted': [246, 196, 146].forEach((f, i) => this.tone(f, 0.28, { type: 'sawtooth', volume: 0.1, delay: i * 0.14 })); break;
        case 'victory': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', volume: 0.11, delay: i * 0.11 })); break;
      }
    }
  }

  class JoyrideApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.JoyrideView(this.canvas);
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

      const ids = [
        'title', 'pause', 'map', 'help', 'end', 'hud', 'touch', 'toast',
        'mute', 'continue', 'difficulty', 'best',
        'cash', 'heat', 'hp-label', 'hp', 'hp-bar', 'car-name', 'speed', 'district', 'objective',
        'minimap', 'fullmap', 'map-status',
        'end-title', 'end-detail', 'end-score'
      ];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.el.stats = document.querySelector('.stats');
      this.el.enterBtn = this.el.touch.querySelector('[data-press="enter"]');
      this.miniCtx = this.el.minimap.getContext('2d');
      this.fullCtx = this.el.fullmap.getContext('2d');
      this.mapBg = null;
      this.mapBgSeed = null;

      this.mode = 'title';
      this.state = null;
      this.keys = new Set();
      this.touches = new Map();
      this.held = new Set();
      this.enterQueued = false;
      this.particles = [];
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.shake = 0;
      this.camLead = { x: 0, y: 0 };
      this.zoomScale = 1;
      this.time = 0;
      this.accumulator = 0;
      this.saveTimer = 0;
      this.hudTimer = 0;
      this.sirenTimer = 0;
      this.ringTimer = 0;
      this.last = performance.now();

      this.demo = J.newGame('title-town');
      this.demo.clock = 0.65;
      this.bind();
      this.resize();
      this.refreshTitle();
      if (global.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    bind() {
      global.addEventListener('resize', () => this.resize());
      global.addEventListener('blur', () => {
        this.keys.clear();
        this.held.clear();
        this.sound.updateEngine(0, false);
        if (this.mode === 'play') this.show('pause');
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.mode === 'play') this.show('pause');
      });

      const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause' || this.mode === 'map') this.show('play');
          return;
        }
        if (event.code === 'KeyM' && !event.repeat) {
          if (this.mode === 'play') this.show('map');
          else if (this.mode === 'map') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') {
          event.preventDefault();
          this.newGame();
          return;
        }
        if (this.mode !== 'play') return;
        if (CAPTURE.has(event.code)) event.preventDefault();
        if ((event.code === 'KeyE' || event.code === 'Enter') && !event.repeat) {
          this.enterQueued = true;
        }
        this.keys.add(event.code);
      });
      global.addEventListener('keyup', event => {
        this.keys.delete(event.code);
      });

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newGame());
      click('continue', () => this.resume());
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && !this.state.won ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-map', () => this.show('map'));
      click('pause-help', () => this.show('help'));
      click('pause-title', () => { this.save(); this.show('title'); });
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('map-btn', () => { if (this.mode === 'play') this.show('map'); });
      click('map-close', () => this.show('play'));
      click('end-keep', () => this.show('play'));
      click('end-again', () => this.newGame());
      click('end-menu', () => this.show('title'));
      this.el.minimap.addEventListener('click', () => { if (this.mode === 'play') this.show('map'); });

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Muted' : 'Sound';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        if (this.sound.muted) this.sound.updateEngine(0, false);
        showMute();
        try { localStorage.setItem('joyride-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('joyride-muted') === '1';
        const stored = localStorage.getItem('joyride-difficulty');
        if (J.DIFFICULTIES[stored]) this.el.difficulty.value = stored;
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('joyride-difficulty', this.el.difficulty.value); } catch {}
      });

      this.el.touch.addEventListener('pointerdown', event => {
        const button = event.target.closest('button');
        if (!button) return;
        event.preventDefault();
        if (button.dataset.press === 'enter') {
          this.enterQueued = true;
          return;
        }
        if (button.dataset.hold) {
          this.touches.set(event.pointerId, button.dataset.hold);
          this.held.add(button.dataset.hold);
        }
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
      const base = narrow ? [7, 10] : [8, 12];
      const cell = this.quality.cell(base);
      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      this.view.resize(global.innerWidth, global.innerHeight, cell);
      this.syncStatsBottom();
    }

    syncStatsBottom() {
      if (!this.el.stats || this.el.hud.hidden) return;
      const panelBottom = Math.ceil(this.el.stats.getBoundingClientRect().bottom);
      if (panelBottom > 0 && panelBottom !== this.panelBottom) {
        this.panelBottom = panelBottom;
        document.documentElement.style.setProperty('--stats-bottom', panelBottom + 'px');
      }
    }

    show(mode) {
      const was = this.mode;
      this.mode = mode;
      this.keys.clear();
      this.held.clear();
      this.touches.clear();
      if (mode !== 'play') this.sound.updateEngine(0, false);
      for (const name of ['title', 'pause', 'map', 'help', 'end']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode === 'title' || mode === 'end';
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      if (mode === 'map' && this.state) this.drawFullMap();
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
        ? 'Best runs · ' + best.slice(0, 3).map(b => `${b.score} (${b.minutes}m)`).join(' · ')
        : 'Twelve payphone jobs and one armoured van waiting at the Docks.';
    }

    newGame(seed, difficulty) {
      seed = seed || Math.random().toString(36).slice(2, 8);
      this.begin(J.newGame(seed, difficulty || this.el.difficulty.value));
      this.toast(document.body.classList.contains('touch')
        ? 'Walk to the green $ payphone or press E beside a car to drive.'
        : 'Walk to the $ payphone and press E, or hop into a parked car (WASD to drive, Space to drift).');
    }

    resume() {
      try {
        this.begin(J.restore(localStorage.getItem(SAVE_KEY)));
        this.toast('Town restored.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.refreshTitle();
      }
    }

    begin(state) {
      this.state = state;
      this.particles = [];
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.shake = 0;
      this.camLead = { x: 0, y: 0 };
      this.accumulator = 0;
      this.saveTimer = 0;
      this.shownVictory = Boolean(state.won);
      this.show('play');
      this.syncStatsBottom();
      this.updateHud();
      this.sound.ensure();
    }

    save() {
      if (!this.state) return;
      try { localStorage.setItem(SAVE_KEY, J.save(this.state)); } catch {}
    }

    record() {
      const s = this.state, minutes = Math.max(1, Math.round((s.endTime || s.time) / 60));
      try {
        const best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
        best.push({ score: J.score(s), minutes, seed: s.seed });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem(BEST_KEY, JSON.stringify(best.slice(0, 5)));
      } catch {}
    }

    toast(text) {
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 4000);
    }

    pulse(r, g, b, alpha, seconds = 0.25) {
      this.tint = [r, g, b, this.reducedMotion ? alpha * 0.35 : alpha];
      this.tintTimer = seconds;
    }

    burst(x, y, chars, colour, count = 6) {
      if (this.reducedMotion) count = Math.min(2, count);
      for (let i = 0; i < count && this.particles.length < 64; i++) {
        const a = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 7;
        this.particles.push({
          x, y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 0.35 + Math.random() * 0.35,
          char: chars[i % chars.length],
          colour
        });
      }
    }

    handle(events) {
      for (const e of events) {
        switch (e.type) {
          case 'enterCar':
            this.sound.play('door');
            break;
          case 'carjack':
            this.sound.play('door');
            this.toast(`Pulled driver out of ${J.CARS[e.kind].name}!`);
            break;
          case 'exitCar':
            this.sound.play('door');
            break;
          case 'skid':
            this.sound.play('skid');
            this.burst(e.x, e.y, ['.', ':'], [175, 180, 190], 2);
            break;
          case 'pedBump':
            this.sound.play('hit');
            this.shake = Math.max(this.shake, 0.12);
            this.burst(e.x, e.y, ['*', '!'], [255, 165, 90], 3);
            break;
          case 'hurt':
            this.sound.play('hit');
            this.shake = Math.max(this.shake, 0.2);
            this.pulse(0.9, 0.15, 0.15, 0.28, 0.25);
            break;
          case 'carFire':
            if (this.state && e.carId === this.state.player.carId) {
              this.sound.play('alarm');
              this.pulse(1, 0.25, 0.05, 0.38, 0.45);
              this.toast('CAR ON FIRE! Press E to bail out before it explodes!');
            }
            break;
          case 'crash':
            this.sound.play('crash');
            this.shake = Math.min(0.35, e.speed * 0.015);
            this.burst(e.x, e.y, ['*', '+', '.'], [255, 200, 90], 5);
            break;
          case 'explosion':
            this.sound.play('explosion');
            this.shake = 0.55;
            this.pulse(1, 0.45, 0.1, 0.35, 0.4);
            this.burst(e.x, e.y, ['@', '#', '*', '^'], [255, 130, 40], 14);
            break;
          case 'horn':
            this.sound.play('horn');
            break;
          case 'heat':
            this.sound.play('siren');
            this.toast(`Wanted ★${e.stars}: ${e.reason}`);
            break;
          case 'heatCool':
            this.sound.play('checkpoint');
            this.toast(e.stars === 0 ? 'Police lost your trail — heat cleared!' : `Wanted heat cooled to ★${e.stars}`);
            break;
          case 'respray':
            this.sound.play('respray');
            this.pulse(0.2, 0.9, 0.8, 0.25, 0.3);
            this.toast('Car repaired & resprayed (-$500). Wanted heat cleared!');
            break;
          case 'resprayBlocked':
            this.toast(e.reason);
            break;
          case 'garageSaved':
            this.sound.play('respray');
            this.toast(`Stored ${J.CARS[e.kind].name} in your garage (${e.stored.length}/3).`);
            break;
          case 'package':
            this.sound.play('checkpoint');
            this.toast(`Hidden package ${e.found}/${e.total} (+$${e.reward})`);
            break;
          case 'stunt':
            this.sound.play('jobStart');
            this.toast(`Stunt jump! +$${e.bonus}`);
            break;
          case 'spikesHit':
            this.sound.play('crash');
            this.toast('Tyres shredded by spike strip! Head to Respray.');
            break;
          case 'taxiStart':
            this.sound.play('ring');
            this.toast('Taxi fare aboard! Follow the yellow marker.');
            break;
          case 'taxiDone':
            this.sound.play('jobDone');
            this.toast(`Fare dropped off! +$${e.payout} (tip $${e.tip})`);
            break;
          case 'checkpoint':
            this.sound.play('checkpoint');
            this.burst(e.x, e.y, ['*', '+', '^'], [255, 226, 82], 6);
            this.toast(`Checkpoint ${e.index}/${e.total}!`);
            break;
          case 'parcelPicked':
            this.sound.play('checkpoint');
            this.burst(e.x, e.y, ['$', '*', '+'], [98, 203, 76], 6);
            break;
          case 'crewPickedUp':
            this.sound.play('jobStart');
            this.toast('Crew aboard! Lose the police heat, then reach the safe house.');
            break;
          case 'jobStarted':
            this.sound.play('jobStart');
            this.toast(`${e.title}: ${e.brief}`);
            break;
          case 'jobHint':
            this.toast(e.text);
            break;
          case 'jobCompleted':
            this.sound.play('jobDone');
            this.pulse(0.95, 0.8, 0.25, 0.22, 0.35);
            this.toast(`${e.title} complete! +$${e.payout}`);
            this.save();
            break;
          case 'jobFailed':
            this.sound.play('jobFail');
            this.toast(`${e.title} failed: ${e.reason}`);
            break;
          case 'busted':
            this.sound.play('busted');
            this.pulse(0.15, 0.35, 0.95, 0.48, 0.6);
            this.toast(`BUSTED! Released at the Police Station (-$${e.fee} and your car).`);
            break;
          case 'wasted':
            this.sound.play('wasted');
            this.pulse(0.85, 0.1, 0.1, 0.55, 0.7);
            this.toast(`WASTED! Patched up at the Hospital (-$${e.fee}).`);
            break;
          case 'carSunk':
            this.sound.play('crash');
            this.toast(`Drowned the ${J.CARS[e.kind].name} in the water! Swim ashore.`);
            break;
          case 'victory':
            this.sound.play('victory');
            this.record();
            this.save();
            this.pulse(1, 0.85, 0.3, 0.5, 1.0);
            if (!this.shownVictory) {
              this.shownVictory = true;
              setTimeout(() => this.showEnd(), 1100);
            }
            break;
        }
      }
    }

    showEnd() {
      const s = this.state, minutes = Math.max(1, Math.round((s.endTime || s.time) / 60));
      this.el['end-title'].textContent = 'The Freighter Sails';
      this.el['end-detail'].textContent = `You finished all 13 jobs and loaded the Armoured Van in ${minutes} minute${minutes === 1 ? '' : 's'}, with $${s.cash} cash, ${s.bustedCount} bust${s.bustedCount === 1 ? '' : 's'} and ${s.wastedCount} hospital trip${s.wastedCount === 1 ? '' : 's'}.`;
      this.el['end-score'].textContent = `Score ${J.score(s)} · ${J.DIFFICULTIES[s.difficulty].label} · seed ${s.seed}`;
      this.show('end');
    }

    updateHud() {
      const s = this.state, car = J.playerCar(s), pos = J.playerPos(s);
      this.el.cash.textContent = `$${s.cash}`;
      const stars = '★'.repeat(s.heat) + '☆'.repeat(5 - s.heat);
      this.el.heat.textContent = stars;
      this.el.heat.classList.toggle('wanted', s.heat > 0);

      const hp = car ? car.hp : s.player.hp;
      this.el['hp-label'].textContent = car ? 'CAR' : 'FOOT';
      this.el.hp.textContent = `${Math.max(0, Math.ceil(hp))}%`;
      this.el['hp-bar'].style.width = `${clamp(hp, 0, 100)}%`;
      this.el['hp-bar'].classList.toggle('low', hp < 35);

      const kmh = car ? Math.round(Math.abs(car.speed) * 5.2) : Math.round(Math.hypot(s.player.vx, s.player.vy) * 3.5);
      this.el['car-name'].textContent = car ? J.CARS[car.kind].name : 'On foot';
      this.el.speed.textContent = `${kmh} km/h`;
      const dCode = J.districtAt(s, Math.floor(pos.x), Math.floor(pos.y));
      this.el.district.textContent = J.DISTRICTS[dCode]?.name || 'Town';
      const objText = J.objective(s);
      this.el.objective.textContent = objText;

      if (this.el.enterBtn) {
        let label = car ? 'E out' : 'E';
        if (car && car.fireTimer > 0) label = 'E bail!';
        else if (objText.includes('Press E to answer')) label = 'E phone';
        else if (!car && objText.includes('Press E: enter')) label = 'E car';
        this.el.enterBtn.textContent = label;
      }
      this.drawMinimap();
    }

    ensureMapBg(s) {
      if (this.mapBg && this.mapBgSeed === s.seed) return this.mapBg;
      const bg = document.createElement('canvas');
      bg.width = J.WIDTH;
      bg.height = J.HEIGHT;
      const bctx = bg.getContext('2d');
      bctx.fillStyle = '#080b12';
      bctx.fillRect(0, 0, J.WIDTH, J.HEIGHT);
      for (let y = 0; y < J.HEIGHT; y += 2) {
        for (let x = 0; x < J.WIDTH; x += 2) {
          const t = s.tiles[J.index(x, y)];
          if (t === J.T.WATER) bctx.fillStyle = '#113458';
          else if (t === J.T.GRASS) bctx.fillStyle = '#1d4822';
          else if (t >= J.T.ROAD && t <= J.T.BRIDGE) bctx.fillStyle = '#484d58';
          else continue;
          bctx.fillRect(x, y, 2, 2);
        }
      }
      this.mapBg = bg;
      this.mapBgSeed = s.seed;
      return bg;
    }

    drawMapToCanvas(ctx, width, height, full = false) {
      const s = this.state, pos = J.playerPos(s);
      ctx.drawImage(this.ensureMapBg(s), 0, 0, width, height);

      const sx = width / J.WIDTH, sy = height / J.HEIGHT;

      // Search circle when wanted
      if (s.searchCircle && s.heat > 0) {
        ctx.save();
        ctx.strokeStyle = this.time % 0.5 < 0.25 ? '#ff4438' : '#4488ff';
        ctx.fillStyle = 'rgba(255, 60, 50, 0.16)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.searchCircle.x * sx, s.searchCircle.y * sy, s.searchCircle.r * sx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Landmarks on full map (or respray on minimap when wanted)
      const dot = (x, y, col, r = 2.5) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x * sx, y * sy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      dot(s.respray.x, s.respray.y, '#48f0f0', full ? 4 : 2.2);
      if (full) {
        dot(s.garage.x, s.garage.y, '#b8f048', 4);
        dot(s.hospital.x, s.hospital.y, '#ff5858', 4);
        dot(s.policeStation.x, s.policeStation.y, '#6898ff', 4);
      }

      // Available payphones
      for (const ph of s.payphones) {
        if (J.availableJobForPhone(s, ph)) {
          dot(ph.x, ph.y, '#48ff68', full ? 4.5 : 3);
        }
      }

      // Police cruisers
      for (const c of s.cars) {
        if (!c.wrecked && c.driver === 'police') {
          dot(c.x, c.y, this.time % 0.3 < 0.15 ? '#ff3838' : '#3888ff', full ? 3.5 : 2.2);
        }
      }

      // Objective target or taxi fare (with dashed guide line from player)
      const target = J.objectiveTarget(s) || s.taxiFare;
      if (target) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 216, 56, 0.55)';
        ctx.lineWidth = full ? 1.5 : 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pos.x * sx, pos.y * sy);
        ctx.lineTo(target.x * sx, target.y * sy);
        ctx.stroke();
        ctx.restore();
        dot(target.x, target.y, '#ffd838', full ? 5 : 3.5);
      }

      // Player blip
      dot(pos.x, pos.y, '#ffffff', full ? 4.5 : 3);
    }

    drawMinimap() {
      this.drawMapToCanvas(this.miniCtx, this.el.minimap.width, this.el.minimap.height, false);
    }

    drawFullMap() {
      this.drawMapToCanvas(this.fullCtx, this.el.fullmap.width, this.el.fullmap.height, true);
      const s = this.state;
      const pkgs = s.packages.filter(p => p.collected).length;
      const ramps = s.ramps.filter(r => r.jumped).length;
      this.el['map-status'].textContent = `Jobs ${s.jobsDone}/13 · Packages ${pkgs}/10 · Stunt jumps ${ramps}/5 · Garage ${s.storedCars.length}/3`;
    }

    gatherInput() {
      const k = this.keys, h = this.held, pad = this.pad;
      const stickX = pad.axis(0), stickY = pad.axis(1);
      const enter = this.enterQueued || pad.pressed(3) || pad.pressed(2);
      this.enterQueued = false;
      return {
        up: k.has('KeyW') || k.has('ArrowUp') || h.has('up') || pad.held(7) || stickY < -0.45,
        down: k.has('KeyS') || k.has('ArrowDown') || h.has('down') || pad.held(6) || stickY > 0.45,
        left: k.has('KeyA') || k.has('ArrowLeft') || h.has('left') || stickX < -0.35,
        right: k.has('KeyD') || k.has('ArrowRight') || h.has('right') || stickX > 0.35,
        handbrake: k.has('Space') || h.has('handbrake') || pad.held(0),
        enter,
        sprint: k.has('ShiftLeft') || k.has('ShiftRight') || pad.held(4),
        horn: k.has('KeyH') || pad.held(1)
      };
    }

    collectSprites(state, cam) {
      const sprites = [];
      const toCell = (x, y) => ({ x: Math.round(x * TILE_W) - cam.x, y: Math.round(y * TILE_H) - cam.y });
      const onScreen = (at, w, h) => at.x + w >= 0 && at.y + h >= 0 && at.x < this.view.columns && at.y < this.view.rows;
      const addFrame = (x, y, frameName, flash = false, lit = false) => {
        const f = this.view.art.index[frameName];
        if (!f) return;
        const at = toCell(x - f.w / (2 * TILE_W), y - f.h / (2 * TILE_H));
        if (onScreen(at, f.w, f.h)) sprites.push({ x: at.x, y: at.y, frame: frameName, flash, lit });
      };

      // Particles and smoke/fire on damaged cars first (drawn on top)
      for (const part of this.particles) {
        const at = toCell(part.x, part.y);
        if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: part.char, colour: part.colour, lit: true });
      }

      // Active job marker / parcels / checkpoints + off-screen directional edge arrow
      const job = state.activeJob;
      const navTarget = job ? J.objectiveTarget(state) : (state.taxiFare || J.objectiveTarget(state));
      if (job && job.type === 'pickup') {
        for (const p of job.parcels) if (!p.taken) addFrame(p.x, p.y, 'parcel', false, true);
      }
      if (navTarget && this.mode !== 'title') {
        const mAt = toCell(navTarget.x, navTarget.y - 1.5);
        if (onScreen(mAt, 3, 2)) {
          addFrame(navTarget.x, navTarget.y - 1.5, 'marker', false, true);
        } else {
          const pos = J.playerPos(state);
          const angle = Math.atan2(navTarget.y - pos.y, navTarget.x - pos.x);
          const dir = headingDir(angle);
          const f = this.view.art.index[`arrow.${dir}`];
          if (f) {
            const cx = this.view.columns / 2, cy = this.view.rows / 2;
            const padX = Math.max(4, Math.floor(this.view.columns * 0.1));
            const minY = 9, maxY = Math.max(minY + 4, this.view.rows - (document.body.classList.contains('touch') ? 16 : 5));
            const halfW = Math.max(6, cx - padX), halfH = Math.max(4, (maxY - minY) / 2);
            const midY = (minY + maxY) / 2;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const scale = Math.min(
              Math.abs(cos) > 0.01 ? halfW / Math.abs(cos) : 999,
              Math.abs(sin) > 0.01 ? halfH / Math.abs(sin) : 999
            );
            const ax = clamp(Math.round(cx + cos * scale - f.w / 2), 2, this.view.columns - f.w - 2);
            const ay = clamp(Math.round(midY + sin * scale - f.h / 2), minY, maxY - f.h);
            sprites.push({ x: ax, y: ay, frame: `arrow.${dir}`, flash: false, lit: true });
          }
        }
      }

      // Hidden packages (?)
      for (const pkg of state.packages) {
        if (!pkg.collected) {
          const at = toCell(pkg.x, pkg.y);
          if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: '?', colour: [110, 235, 255], lit: true });
        }
      }

      // Spike strips
      for (const sp of state.spikes) {
        for (let dx = -1; dx <= 1; dx++) {
          const at = toCell(sp.x + dx * 0.4, sp.y);
          if (onScreen(at, 1, 1)) sprites.push({ x: at.x, y: at.y, char: '^', colour: [255, 90, 90], lit: true });
        }
      }

      // Player on foot (drawn before cars so parked cars never hide the player)
      if (!state.player.carId && this.mode !== 'title') {
        const p = state.player, moving = Math.hypot(p.vx, p.vy) > 0.6;
        const step = Math.floor(p.anim * 2) % 2;
        addFrame(p.x, p.y, moving && step ? 'playerWalk' : 'playerIdle', p.hurtTimer > 0.2, true);
      }

      // Cars (8 headings, plus police roof light bars and night headlights)
      const night = J.isNight(state);
      for (const car of state.cars) {
        const dir = headingDir(car.angle);
        const kind = car.wrecked ? 'wreck' : car.kind;
        if (!car.wrecked && car.driver === 'police') {
          const at = toCell(car.x, car.y);
          if (onScreen(at, 1, 1)) {
            const red = Math.floor(this.time * 10 + car.id) % 2 === 0;
            sprites.push({ x: at.x, y: at.y, char: '*', colour: red ? [255, 60, 60] : [70, 145, 255], lit: true });
          }
        }
        if (night && !car.wrecked && car.occupied) {
          const hx = car.x + Math.cos(car.angle) * 1.15, hy = car.y + Math.sin(car.angle) * 1.15;
          const hAt = toCell(hx, hy);
          if (onScreen(hAt, 1, 1)) {
            sprites.push({ x: hAt.x, y: hAt.y, char: '*', colour: [255, 240, 175], lit: true });
          }
        }
        const isLit = car.id === state.player.carId || car.missionImportant || (night && !car.wrecked && car.occupied);
        addFrame(car.x, car.y, `${kind}.${dir}`, car.flash > 0.1, isLit);
      }

      // Pedestrians
      const pedRgb = {
        s: [235, 184, 142], c: [82, 180, 232], y: [255, 226, 82],
        p: [198, 104, 232], g: [98, 203, 76], o: [242, 155, 46], w: [244, 242, 232]
      };
      for (const ped of state.peds) {
        if (ped.downTimer > 0) {
          addFrame(ped.x, ped.y, 'pedDown', false, false);
        } else {
          const at = toCell(ped.x, ped.y);
          if (onScreen(at, 1, 1)) {
            sprites.push({ x: at.x, y: at.y, char: 'O', colour: pedRgb[ped.colour] || pedRgb.w, lit: false });
          }
        }
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

      if (this.mode === 'play' && this.state) {
        this.accumulator += elapsed;
        let steps = 0;
        while (this.accumulator >= STEP_MS && steps < 4) {
          this.handle(J.step(this.state, this.gatherInput()));
          this.accumulator -= STEP_MS;
          steps++;
        }
        if (steps === 4) this.accumulator = 0;

        const car = J.playerCar(this.state);
        this.sound.updateEngine(car ? car.speed : 0, Boolean(car));

        // Emit smoke/fire particles on damaged cars
        for (const c of this.state.cars) {
          if (!c.wrecked && c.hp < 40 && Math.random() < (c.hp < 15 ? 0.45 : 0.18)) {
            const fire = c.hp < 15;
            this.particles.push({
              x: c.x + (Math.random() - 0.5) * 0.6,
              y: c.y + (Math.random() - 0.5) * 0.6,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -1.2 - Math.random() * 1.5,
              life: 0.35,
              char: fire ? '^' : '%',
              colour: fire ? [255, 120, 40] : [160, 165, 175]
            });
          }
        }

        // Periodic siren and payphone ring audio cues
        if (this.state.heat > 0) {
          this.sirenTimer -= dt;
          if (this.sirenTimer <= 0) {
            this.sirenTimer = 1.6;
            if (J.canPoliceSeePlayer(this.state)) this.sound.play('siren');
          }
        }
        if (!this.state.activeJob) {
          const pos = J.playerPos(this.state);
          const nearPhone = this.state.payphones.some(ph => J.availableJobForPhone(this.state, ph) && Math.hypot(ph.x - pos.x, ph.y - pos.y) < 12);
          if (nearPhone) {
            this.ringTimer -= dt;
            if (this.ringTimer <= 0) {
              this.ringTimer = 2.4;
              this.sound.play('ring');
            }
          }
        }

        this.hudTimer += dt;
        if (this.hudTimer > 0.12) { this.hudTimer = 0; this.updateHud(); }
        this.saveTimer += dt;
        if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
      }

      for (const part of this.particles) {
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.life -= dt;
      }
      this.particles = this.particles.filter(part => part.life > 0);

      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (this.tintTimer === 0) this.tint[3] = 0;
      } else if (this.state && this.state.heat >= 3 && this.mode === 'play' && !this.reducedMotion) {
        // Subtle red/blue police flash at high heat
        const red = Math.sin(this.time * 10) > 0;
        this.tint = red ? [0.9, 0.15, 0.15, 0.08] : [0.15, 0.35, 0.95, 0.08];
      } else {
        this.tint[3] = 0;
      }
      this.shake = Math.max(0, this.shake - dt);

      const playing = this.state && this.mode !== 'title';
      const state = playing ? this.state : this.demo;
      if (!playing && !this.reducedMotion) J.step(this.demo, {});

      const pos = J.playerPos(state);
      const car = J.playerCar(state);

      // Camera leads smoothly ahead of a fast car without reallocating WebGL buffers mid-drive
      const targetLeadX = car && !this.reducedMotion ? car.vx * 0.28 : 0;
      const targetLeadY = car && !this.reducedMotion ? car.vy * 0.28 : 0;
      this.camLead.x += (targetLeadX - this.camLead.x) * Math.min(1, dt * 4.5);
      this.camLead.y += (targetLeadY - this.camLead.y) * Math.min(1, dt * 4.5);

      const centre = playing
        ? { x: pos.x + this.camLead.x, y: pos.y + this.camLead.y }
        : { x: 80 + Math.cos(this.time * 0.12) * 28, y: 80 + Math.sin(this.time * 0.12) * 28 };
      const cam = this.view.camera(centre.x, centre.y);
      if (this.shake > 0 && !this.reducedMotion) {
        cam.x += Math.round((Math.random() - 0.5) * 3);
        cam.y += Math.round((Math.random() - 0.5) * 2);
      }

      const beam = car ? [car.x, car.y, car.angle, 1] : [0, 0, 0, 0];
      const cop = state.cars.find(c => !c.wrecked && c.driver === 'police' && Math.hypot(c.x - pos.x, c.y - pos.y) < 22);
      const siren = cop && state.heat > 0 ? [cop.x, cop.y, 1] : [0, 0, 0];
      const obj = playing ? (J.objectiveTarget(state) || state.taxiFare) : null;
      const marker = obj ? [obj.x, obj.y, 1] : [0, 0, 0];

      try {
        this.view.draw({
          state, cam,
          sprites: this.collectSprites(state, cam),
          day: J.daylight(state),
          rain: state.rain,
          beam, siren, marker,
          time: this.reducedMotion ? 0 : this.time,
          tint: this.tint
        });
      } catch (error) {
        this.fatal(error);
        return;
      }
      requestAnimationFrame(this.frame);
    }

    pollPadMenus() {
      const pad = this.pad;
      if (this.mode !== 'play') {
        if (pad.pressed(0)) document.activeElement?.click?.();
        if (pad.pressed(9) && (this.mode === 'pause' || this.mode === 'map')) this.show('play');
        return;
      }
      if (pad.pressed(9)) this.show('pause');
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
      global.joyride = new JoyrideApp();
    } catch (error) {
      const box = document.getElementById('fatal');
      box.hidden = false;
      box.querySelector('p').textContent = error.message;
      console.error(error);
    }
  });
})(window);

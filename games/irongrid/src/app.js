/* Irongrid app: keyboard/mouse/touch/gamepad input, WebAudio tactical SFX, card HUD and saves. */
(function (global) {
  'use strict';

  const R = global.IrongridRules, { TILE_W, TILE_H } = global.IrongridView;
  const SAVE_KEY = 'irongrid-save', BEST_KEY = 'irongrid-best';

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
          this.master.gain.value = 0.26;
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
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(35, frequency + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    noise(duration, { volume = 0.1, filter = 650, delay = 0 } = {}) {
      const c = this.ensure();
      if (!c) return;
      const now = c.currentTime + delay;
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
      source.start(now);
      source.onended = () => { source.disconnect(); biquad.disconnect(); gain.disconnect(); };
    }
    play(name) {
      switch (name) {
        case 'step':
          this.tone(125, 0.09, { type: 'triangle', slide: -65, volume: 0.11 });
          this.noise(0.06, { volume: 0.08, filter: 420 });
          break;
        case 'crunch':
          this.tone(175, 0.12, { type: 'square', slide: -120, volume: 0.09 });
          this.noise(0.11, { volume: 0.14, filter: 1200 });
          break;
        case 'siren':
          this.tone(480, 0.08, { type: 'sawtooth', slide: 280, volume: 0.045 });
          this.tone(720, 0.09, { type: 'sawtooth', slide: -240, volume: 0.045, delay: 0.08 });
          break;
        case 'shield':
          this.tone(240, 0.18, { type: 'sine', slide: 140, volume: 0.08 });
          this.tone(480, 0.22, { type: 'triangle', slide: 60, volume: 0.05, delay: 0.04 });
          break;
        case 'artillery':
          this.tone(740, 0.14, { type: 'sine', slide: -480, volume: 0.06 });
          this.tone(105, 0.18, { type: 'triangle', slide: -65, volume: 0.13, delay: 0.11 });
          this.noise(0.14, { volume: 0.14, filter: 600, delay: 0.11 });
          break;
        case 'hit':
          this.tone(360, 0.09, { type: 'sawtooth', slide: -210, volume: 0.08 });
          this.noise(0.07, { volume: 0.09, filter: 900 });
          break;
        case 'drown':
          this.tone(290, 0.18, { type: 'sine', slide: -190, volume: 0.09 });
          this.noise(0.16, { volume: 0.09, filter: 480 });
          break;
        case 'undo':
          this.tone(340, 0.07, { type: 'triangle', slide: -110, volume: 0.06 });
          break;
        case 'select':
          this.tone(520, 0.04, { type: 'triangle', volume: 0.04 });
          break;
        case 'victory':
          [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.28, { type: 'sawtooth', volume: 0.06, delay: i * 0.09 }));
          break;
        case 'lose':
          [240, 210, 165, 110].forEach((f, i) => this.tone(f, 0.26, { type: 'sawtooth', volume: 0.06, delay: i * 0.11 }));
          break;
      }
    }
  }

  class IrongridApp {
    constructor() {
      this.canvas = document.getElementById('view');
      this.view = new global.IrongridView(this.canvas);
      this.sound = new Sound();
      this.pad = new global.GlyphPad();
      this.quality = new global.GlyphQuality(() => this.resize());
      this.reducedMotion = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

      const ids = ['title', 'pause', 'help', 'reward', 'end', 'hud', 'toast', 'mute', 'continue', 'difficulty',
        'best', 'sector-label', 'turn-label', 'grid-meter', 'energy-meter', 'rig-status', 'obj-line',
        'preview-line', 'card-row', 'reward-cards', 'pause-info', 'end-tag', 'end-title', 'end-detail', 'end-score',
        'undo-btn', 'cycle-rig-btn', 'end-turn-btn'];
      this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
      this.el.stats = document.querySelector('.stats');
      this.el.hotbar = document.getElementById('hotbar');

      this.mode = 'title';
      this.state = null;
      this.demo = R.newGame(1, 'normal');
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.time = 0;
      this.padStick = { x: 0, y: 0 };
      this.pendingTouchTile = null;
      this.hoverTile = null;
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
      global.addEventListener('blur', () => { if (this.mode === 'play') this.show('pause'); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.show('pause'); });

      const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
      global.addEventListener('keydown', event => {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.mode === 'help') this.show(this.state && this.state.mode === 'play' ? 'pause' : 'title');
          else if (this.mode === 'play') this.show('pause');
          else if (this.mode === 'pause') this.show('play');
          return;
        }
        if (this.mode === 'title' && event.code === 'Enter') { event.preventDefault(); this.newGame(); return; }
        if (this.mode === 'reward') {
          if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
            event.preventDefault();
            this.pickReward(Number(event.code.slice(5)) - 1);
          }
          return;
        }
        if (this.mode !== 'play') return;
        if (CAPTURE.has(event.code)) event.preventDefault();
        if (event.code === 'ArrowUp' || event.code === 'KeyW') this.moveCursor(0, -1);
        else if (event.code === 'ArrowDown' || event.code === 'KeyS') this.moveCursor(0, 1);
        else if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.moveCursor(-1, 0);
        else if (event.code === 'ArrowRight' || event.code === 'KeyD') this.moveCursor(1, 0);
        else if (!event.repeat) {
          if (event.code === 'Space' || event.code === 'Enter') this.confirmCursor();
          else if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3' || event.code === 'Digit4') {
            this.selectCard(Number(event.code.slice(5)) - 1);
          }
          else if (event.code === 'Tab' || event.code === 'KeyQ') this.act({ cycleRig: true });
          else if (event.code === 'KeyZ' || event.code === 'Backspace') this.act({ undoMove: true });
          else if (event.code === 'KeyE') this.finishTurn();
        }
      });

      this.canvas.addEventListener('pointermove', event => {
        if (this.mode !== 'play' || event.pointerType === 'touch') return;
        const cell = this.tileAtPointer(event.clientX, event.clientY);
        if (cell) {
          this.hoverTile = cell;
          this.state.cursorX = cell.x;
          this.state.cursorY = cell.y;
          this.pendingTouchTile = null;
          this.updatePreviewLine();
        }
      });

      this.canvas.addEventListener('pointerdown', event => {
        if (this.mode !== 'play') return;
        event.preventDefault();
        const cell = this.tileAtPointer(event.clientX, event.clientY);
        if (!cell) return;
        const isTouch = document.body.classList.contains('touch') || event.pointerType === 'touch';

        if (this.state.selectedCardIndex >= 0 && isTouch) {
          const cid = this.state.hand[this.state.selectedCardIndex];
          const legal = R.cardTargets(this.state, this.state.selectedRigId, cid);
          const isTarget = legal.some(t => t.x === cell.x && t.y === cell.y);
          if (isTarget && (!this.pendingTouchTile || this.pendingTouchTile.x !== cell.x || this.pendingTouchTile.y !== cell.y)) {
            this.pendingTouchTile = { x: cell.x, y: cell.y };
            this.state.cursorX = cell.x;
            this.state.cursorY = cell.y;
            this.sound.play('select');
            this.updatePreviewLine();
            this.toast('Tap highlighted tile again to confirm card.');
            return;
          }
        }
        this.pendingTouchTile = null;
        this.act({ confirmAt: { x: cell.x, y: cell.y } });
      });
      this.canvas.addEventListener('contextmenu', event => {
        if (this.mode !== 'play' || !this.state) return;
        event.preventDefault();
        if (this.state.selectedCardIndex >= 0) {
          this.pendingTouchTile = null;
          this.act({ selectCard: -1 });
        }
      });

      const click = (id, run) => document.getElementById(id).addEventListener('click', run);
      click('new-run', () => this.newGame());
      click('continue', () => this.resume());
      click('how-to', () => this.show('help'));
      click('help-back', () => this.show(this.state && this.state.mode === 'play' ? 'pause' : 'title'));
      click('resume-btn', () => this.show('play'));
      click('pause-help', () => this.show('help'));
      click('pause-title', () => { this.save(); this.show('title'); });
      click('pause-btn', () => { if (this.mode === 'play') this.show('pause'); });
      click('cycle-rig-btn', () => this.act({ cycleRig: true }));
      click('undo-btn', () => this.act({ undoMove: true }));
      click('end-turn-btn', () => this.finishTurn());
      click('end-again', () => this.newGame());
      click('end-menu', () => this.show('title'));

      this.el['card-row'].addEventListener('click', event => {
        const btn = event.target.closest('button[data-slot]');
        if (!btn) return;
        this.selectCard(Number(btn.dataset.slot));
      });

      this.el['reward-cards'].addEventListener('click', event => {
        const btn = event.target.closest('button[data-reward]');
        if (!btn) return;
        this.pickReward(btn.dataset.reward);
      });

      const showMute = () => {
        this.el.mute.textContent = this.sound.muted ? 'Off' : 'Sound';
        this.el.mute.setAttribute('aria-pressed', this.sound.muted ? 'true' : 'false');
      };
      this.el.mute.addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        showMute();
        try { localStorage.setItem('irongrid-muted', this.sound.muted ? '1' : '0'); } catch {}
      });
      try {
        this.sound.muted = localStorage.getItem('irongrid-muted') === '1';
        const storedDiff = localStorage.getItem('irongrid-difficulty');
        if (R.DIFFICULTIES[storedDiff]) this.el.difficulty.value = storedDiff;
      } catch {}
      showMute();
      this.el.difficulty.addEventListener('change', () => {
        try { localStorage.setItem('irongrid-difficulty', this.el.difficulty.value); } catch {}
      });

      global.addEventListener('touchstart', () => this.enableTouch(), { passive: true, once: true });
    }

    tileAtPointer(clientX, clientY) {
      const cam = this.view.camera(), size = this.view.engine.cellSize;
      const tx = Math.floor((clientX / size[0] + cam.x) / TILE_W);
      const ty = Math.floor((clientY / size[1] + cam.y) / TILE_H);
      if (tx < 0 || ty < 0 || tx >= R.BOARD_SIZE || ty >= R.BOARD_SIZE) return null;
      return { x: tx, y: ty };
    }

    enableTouch() {
      document.body.classList.add('touch');
      this.resize();
    }

    resize() {
      const w = global.innerWidth, h = global.innerHeight;
      const statsR = this.el.stats ? this.el.stats.getBoundingClientRect() : null;
      if (statsR && statsR.height > 0) {
        document.documentElement.style.setProperty('--stats-bottom', Math.ceil(statsR.bottom) + 'px');
      }
      const objR = this.el['obj-line']?.parentElement?.getBoundingClientRect();
      const hotR = this.el.hotbar ? this.el.hotbar.getBoundingClientRect() : null;
      const measuredTop = Math.max(statsR && statsR.height > 0 ? statsR.bottom : 0, objR && objR.height > 0 ? objR.bottom : 0);
      const topBand = measuredTop > 0 ? Math.ceil(measuredTop + 8) : (w < 720 ? 148 : 114);
      const botBand = (hotR && hotR.height > 0) ? Math.ceil(h - hotR.top + 8) : (w < 720 ? 112 : 68);
      const availW = Math.max(200, w - 16);
      const availH = Math.max(140, h - topBand - botBand);

      let cw = Math.max(4, Math.floor(availW / (R.BOARD_SIZE * TILE_W + 2)));
      let ch = Math.max(6, Math.floor(availH / (R.BOARD_SIZE * TILE_H + 1)));
      ch = Math.min(ch, Math.round(cw * 1.8));
      cw = Math.min(cw, Math.max(4, Math.round(ch * 0.72)));
      // Keep the entire 8x8 fixed board inside the viewport even when GlyphQuality lowers DPR
      const cell = [cw, ch];
      const shiftCells = Math.round((topBand - botBand) / cell[1]);

      this.view.engine.maxDpr = this.quality.setting.maxDpr;
      this.view.resize(w, h, cell, shiftCells);
    }

    show(mode) {
      const was = this.mode;
      this.mode = mode;
      for (const name of ['title', 'pause', 'help', 'reward', 'end']) this.el[name].hidden = mode !== name;
      this.el.hud.hidden = mode !== 'play';
      document.body.dataset.mode = mode;
      if (mode === 'title') this.refreshTitle();
      if (mode === 'pause' && this.state) {
        const sec = R.SECTORS[this.state.sectorIndex];
        this.el['pause-info'].textContent = `Sector ${sec.index}/4 (${sec.name}) · Turn ${this.state.turn}/${R.TURNS_PER_BATTLE} · Grid Power ${this.state.gridPower}/${this.state.maxGridPower}`;
      }
      if (mode === 'reward' && this.state) this.renderRewards();
      if (was === 'play' && mode === 'pause') this.save();
      this.resize();
      if (mode !== 'play') this.el[mode]?.querySelector('button')?.focus();
    }

    renderRewards() {
      const wrap = this.el['reward-cards'];
      wrap.textContent = '';
      this.state.rewardOptions.forEach((cid, i) => {
        const card = R.CARDS[cid];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rcard';
        btn.dataset.reward = cid;
        const t = document.createElement('strong');
        t.textContent = `[${i + 1}] ${card.name}`;
        const m = document.createElement('span');
        m.textContent = `${card.cost} NRG · ${card.tag}`;
        const d = document.createElement('small');
        d.textContent = card.desc;
        btn.append(t, m, d);
        wrap.append(btn);
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
        ? 'Best campaigns · ' + best.slice(0, 3).map(b => `${b.score} (${b.difficulty}, sec ${b.sector}/4)`).join(' · ')
        : '4 sectors · 12 Command Cards · Perfect-information tactical grid defence.';
    }

    newGame(seed) {
      const s = seed || (1 + Math.floor(Math.random() * 9999));
      this.begin(R.newGame(s, this.el.difficulty.value));
      this.toast(document.body.classList.contains('touch')
        ? 'Tap a rig, tap a blue tile to move, then pick a Command Card below.'
        : 'Arrows/WASD move cursor. Click blue tile to move or keys 1-4 to cast cards.');
    }

    resume() {
      try {
        const restored = R.restore(localStorage.getItem(SAVE_KEY));
        if (!restored) throw new Error('Saved campaign data is corrupted.');
        this.begin(restored);
        this.toast('Campaign resumed.');
      } catch (error) {
        this.toast(error.message);
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.refreshTitle();
      }
    }

    begin(state) {
      this.state = state;
      this.pendingTouchTile = null;
      this.tint = [0, 0, 0, 0];
      this.tintTimer = 0;
      this.sound.ensure();
      this.show(state.mode === 'reward' ? 'reward' : (state.mode === 'win' || state.mode === 'lose' ? 'end' : 'play'));
      this.updateHud();
    }

    save() {
      if (!this.state || (this.state.mode !== 'play' && this.state.mode !== 'reward')) return;
      try { localStorage.setItem(SAVE_KEY, R.save(this.state)); } catch {}
    }

    recordEnd() {
      const s = this.state;
      try {
        localStorage.removeItem(SAVE_KEY);
        const best = JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
        best.push({ score: R.score(s), difficulty: s.difficulty, sector: s.sectorIndex + 1, win: s.mode === 'win' });
        best.sort((a, b) => b.score - a.score);
        localStorage.setItem(BEST_KEY, JSON.stringify(best.slice(0, 6)));
      } catch {}
      this.el['end-tag'].textContent = s.mode === 'win' ? 'Campaign victory' : 'Defense fallen';
      this.el['end-title'].textContent = s.mode === 'win' ? 'Island Grid Secured' : 'Grid Power Collapsed';
      this.el['end-detail'].textContent = s.mode === 'win'
        ? `Survived all 4 sectors with ${s.gridPower} Grid Power remaining and defeated the Brood Queen.`
        : `Fell in Sector ${s.sectorIndex + 1} (${R.SECTORS[s.sectorIndex].name}) on Turn ${s.turn}.`;
      this.el['end-score'].textContent = `Score ${R.score(s)} · Kills ${s.kills} · Fissures blocked ${s.fissuresBlocked} · Difficulty ${R.DIFFICULTIES[s.difficulty].name}`;
      this.sound.play(s.mode === 'win' ? 'victory' : 'lose');
      this.show('end');
    }

    moveCursor(dx, dy) {
      this.act({ moveCursor: { dx, dy } });
    }

    confirmCursor() {
      this.act({ confirm: true });
    }

    selectCard(slotIndex) {
      if (this.mode !== 'play' || !this.state) return;
      if (slotIndex < 0 || slotIndex >= this.state.hand.length) return;
      this.pendingTouchTile = null;
      const cid = this.state.hand[slotIndex];
      const selfCast = cid === 'overclock' || cid === 'repair_nanites' || cid === 'repulsor_pulse';
      if (this.state.selectedCardIndex === slotIndex && selfCast) {
        // Clicking the already-armed self-cast card fires immediately
        const rig = this.state.rigs.find(r => r.id === this.state.selectedRigId);
        if (rig) { this.act({ confirmAt: { x: rig.x, y: rig.y } }); return; }
      }
      this.act({ selectCard: slotIndex });
      this.sound.play('select');
    }

    pickReward(cardOrIdx) {
      if (this.mode !== 'reward' || !this.state) return;
      this.state = R.step(this.state, { pickReward: cardOrIdx });
      this.sound.play('victory');
      this.save();
      this.show('play');
      this.updateHud();
      this.toast(`Entering Sector ${this.state.sectorIndex + 1}: ${R.SECTORS[this.state.sectorIndex].name}`);
    }

    finishTurn() {
      if (this.mode !== 'play' || !this.state) return;
      this.pendingTouchTile = null;
      this.state = R.step(this.state, { endTurn: true });
      this.reactToEvents(this.state.events);
      if (this.state.mode === 'win' || this.state.mode === 'lose') {
        this.recordEnd();
        return;
      }
      if (this.state.mode === 'reward') {
        this.sound.play('victory');
        this.save();
        this.show('reward');
        return;
      }
      if (this.state.fissures && this.state.fissures.length) this.sound.play('siren');
      this.save();
      this.updateHud();
    }

    act(input) {
      if (!this.state || this.mode !== 'play') return;
      const prevMode = this.state.mode;
      this.state = R.step(this.state, input);
      if (input.undoMove) this.sound.play('undo');
      if (this.state.events && this.state.events.length && (input.confirm || input.confirmAt)) {
        this.reactToEvents(this.state.events);
      }
      if (this.state.mode !== prevMode) {
        if (this.state.mode === 'win' || this.state.mode === 'lose') { this.recordEnd(); return; }
        if (this.state.mode === 'reward') { this.sound.play('victory'); this.save(); this.show('reward'); return; }
      }
      this.save();
      this.updateHud();
    }

    reactToEvents(events) {
      if (!events || !events.length) return;
      let playedSound = false;
      for (const ev of events) {
        if (ev.type === 'collision') {
          this.sound.play('crunch');
          this.flash(1.0, 0.55, 0.2, 0.3);
          playedSound = true;
        } else if (ev.type === 'drown') {
          this.sound.play('drown');
          this.flash(0.25, 0.72, 1.0, 0.3);
          playedSound = true;
        } else if (ev.type === 'shield') {
          this.sound.play('shield');
          playedSound = true;
        } else if (ev.type === 'relay_hit') {
          this.sound.play('crunch');
          this.flash(1.0, 0.2, 0.18, 0.45);
          playedSound = true;
        } else if (ev.type === 'dmg' && ev.dmg > 0) {
          this.sound.play(ev.source === 'Mortar' ? 'artillery' : 'hit');
          if (ev.killed) this.flash(0.55, 0.95, 0.45, 0.22);
          playedSound = true;
        } else if (ev.type === 'move' && !playedSound) {
          this.sound.play('step');
          playedSound = true;
        }
      }
    }

    flash(r, g, b, strength) {
      if (this.reducedMotion) return;
      this.tint = [r, g, b, strength];
      this.tintTimer = 0.22;
    }

    currentPreview() {
      if (!this.state || this.mode !== 'play') return { preview: null, tile: null };
      const tx = this.pendingTouchTile ? this.pendingTouchTile.x : this.state.cursorX;
      const ty = this.pendingTouchTile ? this.pendingTouchTile.y : this.state.cursorY;
      const rig = this.state.rigs.find(r => r.id === this.state.selectedRigId);
      if (!rig || rig.hp <= 0) return { preview: null, tile: { x: tx, y: ty } };

      if (this.state.selectedCardIndex >= 0 && this.state.selectedCardIndex < this.state.hand.length) {
        const res = R.previewAction(this.state, {
          type: 'card',
          rigId: rig.id,
          handIndex: this.state.selectedCardIndex,
          x: tx,
          y: ty
        });
        return { preview: res.ok ? res : null, tile: { x: tx, y: ty } };
      }
      const resM = R.previewAction(this.state, { type: 'move', rigId: rig.id, x: tx, y: ty });
      return { preview: resM.ok ? resM : null, tile: { x: tx, y: ty } };
    }

    updatePreviewLine() {
      if (!this.state) return;
      const { preview, tile } = this.currentPreview();
      if (preview && preview.summary) {
        this.el['preview-line'].textContent = preview.summary;
        return;
      }
      const u = R.unitAt(this.state, tile.x, tile.y);
      const rel = R.relayAt(this.state, tile.x, tile.y);
      const fis = R.fissureAt(this.state, tile.x, tile.y);
      const ter = this.state.board[tile.y][tile.x];
      if (u) {
        const extras = [];
        if (u.shielded) extras.push('SHIELDED');
        if (u.cancelled) extras.push('SMOKED');
        if (u.webbed) extras.push('WEBBED');
        this.el['preview-line'].textContent = `${u.name} ${u.hp}/${u.maxHp}HP${extras.length ? ' · ' + extras.join(' ') : ''}`;
      } else if (rel) {
        this.el['preview-line'].textContent = `Civilian Relay Tower (${rel.shielded ? 'SHIELDED' : 'defend!'})`;
      } else if (fis) {
        this.el['preview-line'].textContent = `Spawn Fissure (%) · Emerging ${R.FOES[fis.kind].name} (step here to block for 1 HP)`;
      } else {
        this.el['preview-line'].textContent = `Tile (${tile.x},${tile.y}): ${ter.toUpperCase()} · Select rig move or Command Card (1-4)`;
      }
    }

    updateHud() {
      const s = this.state;
      if (!s) return;
      const sec = R.SECTORS[s.sectorIndex];
      this.el['sector-label'].textContent = `SEC ${sec.index}/4 · ${sec.name}`;
      this.el['turn-label'].textContent = `TURN ${s.turn} / ${R.TURNS_PER_BATTLE}`;
      this.el['grid-meter'].textContent = `PWR [${'#'.repeat(s.gridPower)}${'.'.repeat(Math.max(0, s.maxGridPower - s.gridPower))}] ${s.gridPower}/${s.maxGridPower}`;
      this.el['energy-meter'].textContent = `NRG ${'* '.repeat(s.energy).trim() || '-'}`;

      const rig = s.rigs.find(r => r.id === s.selectedRigId) || s.rigs[0];
      if (rig) {
        const st = rig.hp <= 0 ? 'DOWN' : (rig.webbed ? 'WEBBED' : (rig.acted ? 'ACTED' : (rig.moved ? 'READY CARD' : 'READY')));
        this.el['rig-status'].textContent = `${rig.glyph} ${rig.name.toUpperCase()} ${rig.hp}/${rig.maxHp}HP · ${st}`;
      }

      this.el['obj-line'].textContent = R.objective(s);
      this.updatePreviewLine();

      const slots = this.el['card-row'].querySelectorAll('button[data-slot]');
      slots.forEach((btn, i) => {
        const cid = s.hand[i];
        if (!cid) {
          btn.disabled = true;
          btn.className = 'slot card-btn cant';
          btn.querySelector('strong').textContent = `${i + 1}. Empty`;
          btn.querySelector('small').textContent = '---';
          return;
        }
        const card = R.CARDS[cid];
        const rigOk = rig && rig.hp > 0 && !rig.acted;
        const can = rigOk && s.energy >= card.cost;
        btn.disabled = !can;
        btn.className = 'slot card-btn' + (s.selectedCardIndex === i ? ' active' : '') + (can ? '' : ' cant');
        btn.querySelector('strong').textContent = `${i + 1}. ${card.name}`;
        btn.querySelector('small').textContent = `${card.cost} NRG · ${card.tag}`;
        btn.title = card.desc;
      });

      this.el['undo-btn'].disabled = s.moveUndoStack.length === 0 && !(s.undoCardsLeft > 0 && s.cardSnapshot);
      this.resize();
    }

    toast(text) {
      clearTimeout(this.toastTimer);
      this.el.toast.textContent = text;
      this.el.toast.classList.add('visible');
      this.toastTimer = setTimeout(() => this.el.toast.classList.remove('visible'), 3600);
    }

    pollPad() {
      const pad = this.pad;
      pad.poll();
      if (!pad.connected) return;
      if (pad.pressed(9)) {
        if (this.mode === 'play') { this.show('pause'); return; }
        if (this.mode === 'pause') { this.show('play'); return; }
        if (this.mode === 'title') { this.newGame(); return; }
      }
      if (this.mode !== 'play') return;
      if (pad.pressed(0)) this.confirmCursor();
      if (pad.pressed(1)) {
        if (this.state.selectedCardIndex >= 0) this.act({ selectCard: -1 });
        else this.act({ undoMove: true });
      }
      if (pad.pressed(4) || pad.pressed(5)) this.act({ cycleRig: true });
      if (pad.pressed(2) || pad.pressed(3)) {
        const nextIdx = (this.state.selectedCardIndex + 1) % Math.max(1, this.state.hand.length);
        this.selectCard(nextIdx);
      }
      if (pad.pressed(8)) this.finishTurn();

      if (pad.pressed(12)) { this.moveCursor(0, -1); return; }
      if (pad.pressed(13)) { this.moveCursor(0, 1); return; }
      if (pad.pressed(14)) { this.moveCursor(-1, 0); return; }
      if (pad.pressed(15)) { this.moveCursor(1, 0); return; }

      const sx = Math.abs(pad.axis(0)) > 0.55 ? Math.sign(pad.axis(0)) : 0;
      const sy = Math.abs(pad.axis(1)) > 0.55 ? Math.sign(pad.axis(1)) : 0;
      if (sx && !this.padStick.x) this.moveCursor(sx, 0);
      else if (sy && !this.padStick.y) this.moveCursor(0, sy);
      this.padStick.x = sx;
      this.padStick.y = sy;
    }

    frame(now) {
      const rawMs = now - this.last;
      const dt = Math.min(0.05, Math.max(0.001, rawMs / 1000));
      this.quality.sample(rawMs);
      this.last = now;
      if (!this.reducedMotion) this.time += dt;
      this.pollPad();

      if (this.tintTimer > 0) {
        this.tintTimer = Math.max(0, this.tintTimer - dt);
        if (!this.tintTimer) this.tint = [0, 0, 0, 0];
      }

      const active = this.state || this.demo;
      const { preview, tile } = this.mode === 'play' ? this.currentPreview() : { preview: null, tile: null };
      this.view.draw({ state: active, time: this.time, tint: this.tint, preview, previewTile: tile });
      requestAnimationFrame(this.frame);
    }

    log(text) { this.toast(text); }
    inspect() { return this.view.inspect(); }
  }

  global.irongrid = new IrongridApp();
  global.addEventListener('error', () => {
    const f = document.getElementById('fatal');
    if (f) f.hidden = false;
  });
})(window);

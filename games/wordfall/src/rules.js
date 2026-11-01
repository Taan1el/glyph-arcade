/* Wordfall rules: a two-minute lane game. Letters fall; catch the next letter of the
 * target word and dodge the rest. Pure and seeded, so tests and bots can play it headlessly. */
(function (global) {
  'use strict';

  const LANES = 9, DURATION = 120, FALL_RAMP = 0.6, GAP_RAMP = 0.35, MOVE_DELAY = 0.11, MAX_DROPS = 32;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const WORDS = ['GLYPH', 'LETTER', 'ARCADE', 'INK', 'FIRE', 'DELVE', 'STONE', 'LANTERN', 'SHADOW', 'EMBER',
    'RAVEN', 'TORCH', 'CIPHER', 'QUILL', 'SCRIPT', 'RUNE', 'ECHO', 'FOREST', 'RIVER', 'COMET',
    'PIXEL', 'VELVET', 'THUNDER', 'MOSS', 'HARBOR', 'WINTER', 'AMBER', 'ORBIT', 'CANDLE', 'MIRROR'];
  const DIFFICULTIES = {
    easy:   { name: 'easy',   label: 'Easy',   lives: 5, speed: 0.24, gap: 0.75, bonus: 0.35 },
    normal: { name: 'normal', label: 'Normal', lives: 3, speed: 0.32, gap: 0.6,  bonus: 0.45 },
    hard:   { name: 'hard',   label: 'Hard',   lives: 2, speed: 0.4,  gap: 0.48, bonus: 0.5 }
  };

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function random(state) {
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (state, n) => Math.floor(random(state) * n);
  const settingsOf = state => DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
  const needed = state => state.word[state.progress];

  function nextWord(state) {
    let word = state.word;
    while (word === state.word) word = WORDS[int(state, WORDS.length)];
    state.word = word;
    state.progress = 0;
  }

  function newRun(seed, difficulty = 'normal') {
    seed = String(seed || 'wordfall').slice(0, 40);
    const key = DIFFICULTIES[difficulty] ? difficulty : 'normal';
    const state = {
      version: 1, seed, difficulty: key, rng: hashString(seed + '|run'), time: 0, over: false, won: false,
      lives: DIFFICULTIES[key].lives, points: 0, combo: 0, bestCombo: 0, words: 0, word: '', progress: 0,
      lane: Math.floor(LANES / 2), moveCooldown: 0, spawnTimer: 0.3, nextId: 1, drops: []
    };
    nextWord(state);
    return state;
  }

  function spawn(state, events) {
    if (state.drops.length >= MAX_DROPS) return;
    const blocked = new Set(state.drops.filter(d => d.y < 0.16).map(d => d.lane));
    const open = [];
    for (let lane = 0; lane < LANES; lane++) if (!blocked.has(lane)) open.push(lane);
    if (!open.length) return;
    const want = needed(state), onScreen = state.drops.some(d => d.glyph === want);
    let glyph = want;
    if (onScreen && random(state) >= settingsOf(state).bonus) {
      do glyph = ALPHABET[int(state, ALPHABET.length)]; while (glyph === want);
    }
    const drop = { id: state.nextId++, lane: open[int(state, open.length)], y: 0, glyph };
    state.drops.push(drop);
    events.push({ type: 'spawn', id: drop.id });
  }

  function catchDrop(state, drop, events) {
    if (drop.glyph !== needed(state)) {
      state.lives--;
      state.combo = 0;
      events.push({ type: 'wrong', glyph: drop.glyph });
      return;
    }
    state.progress++;
    state.points += 50;
    events.push({ type: 'catch', glyph: drop.glyph });
    if (state.progress < state.word.length) return;
    state.combo++;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.words++;
    const gain = state.word.length * 100 * state.combo;
    state.points += gain;
    events.push({ type: 'word', word: state.word, gain, combo: state.combo });
    nextWord(state);
  }

  // input: { left, right } held state, and nudge -1 or 1 for a single tap between frames.
  function step(state, dt, input = {}) {
    const events = [];
    if (state.over) return events;
    state.time = Math.min(DURATION, state.time + dt);

    const direction = input.nudge || (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!direction) state.moveCooldown = 0;
    else if (input.nudge || state.moveCooldown <= 0) {
      state.lane = Math.max(0, Math.min(LANES - 1, state.lane + direction));
      state.moveCooldown = MOVE_DELAY;
    } else state.moveCooldown -= dt;

    const settings = settingsOf(state), progress = state.time / DURATION;
    const speed = settings.speed * (1 + FALL_RAMP * progress);
    for (const drop of state.drops) drop.y += speed * dt;
    const landed = state.drops.filter(d => d.y >= 1);
    state.drops = state.drops.filter(d => d.y < 1);
    for (const drop of landed) if (drop.lane === state.lane) catchDrop(state, drop, events);

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = settings.gap * (1 - GAP_RAMP * progress);
      spawn(state, events);
    }

    if (state.lives <= 0) {
      state.lives = 0;
      state.over = true;
      events.push({ type: 'over' });
    } else if (state.time >= DURATION) {
      state.over = true;
      state.won = true;
      events.push({ type: 'over' });
    }
    return events;
  }

  function score(state) {
    return state.points + (state.won ? state.lives * 250 : 0);
  }

  function restore(data) {
    const valid = data && data.version === 1 && typeof data.word === 'string' && WORDS.includes(data.word) &&
      Number.isInteger(data.progress) && data.progress >= 0 && data.progress < data.word.length &&
      Number.isInteger(data.lane) && data.lane >= 0 && data.lane < LANES &&
      Array.isArray(data.drops) && Number.isFinite(data.time) && Number.isInteger(data.lives);
    if (!valid) throw new Error('This saved run is not valid.');
    return JSON.parse(JSON.stringify(data));
  }

  // Headless bot: heads for the lowest needed letter and sidesteps wrong letters about to land.
  function botInput(state) {
    const want = needed(state);
    const target = state.drops.filter(d => d.glyph === want).sort((a, b) => b.y - a.y)[0];
    const danger = lane => state.drops.some(d => d.lane === lane && d.y > 0.72 && d.glyph !== want);
    let goal = target ? target.lane : state.lane;
    if (goal === state.lane && danger(state.lane)) goal = state.lane > 0 && !danger(state.lane - 1) ? state.lane - 1 : state.lane + 1;
    const stepTo = state.lane + Math.sign(goal - state.lane);
    if (stepTo !== state.lane && danger(stepTo) && !danger(state.lane)) return { left: false, right: false };
    return { left: goal < state.lane, right: goal > state.lane };
  }

  global.Wordfall = { LANES, DURATION, MAX_DROPS, WORDS, DIFFICULTIES, newRun, step, score, restore, needed, botInput, hashString };
})(typeof window !== 'undefined' ? window : globalThis);

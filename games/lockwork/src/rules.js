/* Lockwork rules: 30 single-screen clockwork signal-routing vaults on a 15x11 grid.
 * Deterministic turn-based clock, beam tracing with mirrors, splitters, cross-bridges,
 * pressure gates, inverters, delay capacitors, pulse coils, dual-colour filters, undo & solver. */
(function (global) {
  'use strict';

  const WIDTH = 15;
  const HEIGHT = 11;
  const STEP = 1 / 60;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W

  const DIFFICULTIES = {
    relaxed: { label: 'Relaxed', parSlack: 4, hints: true, masterObstacle: false },
    standard: { label: 'Standard', parSlack: 0, hints: true, masterObstacle: false },
    master: { label: 'Master', parSlack: 0, hints: false, masterObstacle: true }
  };

  // Compact vault specs: 15x11 ASCII rows.
  // '#' wall, '.' floor, 'S' player, 'X' exit door
  // '>' '<' '^' 'v' Amber generators, 'e' 'w' 'n' 's' Cyan generators
  // 'O' Amber receptor, 'Q' Cyan receptor
  // '/' '\' rotatable mirror, 'T' rotatable T-splitter (initial rot 0..3 via meta or seed)
  // 'C' pushable crate, '+' pushable cross-bridge, '-' '|' pushable pipes
  // '_' pressure plate, '=' shutter gate (opens when plate is weighted)
  // 'P' pulse coil (emits every even tick in 4 dirs), '1' '2' delay capacitor (1 or 2 ticks)
  // '!' phase inverter (emits East/South/etc when not powered), ':' Amber filter, ';' Cyan filter
  // 'm' extra locked bronze crate placed only on Master difficulty
  const RAW_VAULTS = [
    // --- Chapter 1: Copper Hall (1-6) ---
    { name: 'First Spark', chapter: 'Copper Hall', par: 17, rows: [
      '###############',
      '#.............#',
      '#.>....../....#',
      '#.............#',
      '#..S..........#',
      '#.........m...#',
      '#.............#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0 } },
    { name: 'Two Turns', chapter: 'Copper Hall', par: 20, rows: [
      '###############',
      '#.............#',
      '#.>.....\\.....#',
      '#.............#',
      '#..S..........#',
      '#......m......#',
      '#.............#',
      '#......./....O#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '8,2': 0, '8,7': 1 } },
    { name: 'Brass Blocking', chapter: 'Copper Hall', par: 18, rows: [
      '###############',
      '#.............#',
      '#..>...../....#',
      '#.............#',
      '#...S....C....#',
      '#.............#',
      '#......m......#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0 } },
    { name: 'Clear the Path', chapter: 'Copper Hall', par: 17, rows: [
      '###############',
      '#.............#',
      '#.>..C.../....#',
      '#.............#',
      '#....S........#',
      '#.....m.......#',
      '#.............#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0 } },
    { name: 'Twin Mirrors', chapter: 'Copper Hall', par: 24, rows: [
      '###############',
      '#.............#',
      '#.>..../......#',
      '#.............#',
      '#..S..........#',
      '#.............#',
      '#......\\....\\.#',
      '#...m..#......#',
      '#...........O.#',
      '#...........X.#',
      '###############'
    ], rots: { '7,2': 0, '7,6': 0, '12,6': 0 } },
    { name: 'Vault Corner', chapter: 'Copper Hall', par: 22, rows: [
      '###############',
      '#.............#',
      '#.>...C../....#',
      '#.............#',
      '#..S..........#',
      '#.......m.....#',
      '#.............#',
      '#........\\..O.#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0, '9,7': 1 } },

    // --- Chapter 2: The Splitters (7-12) ---
    { name: 'Forked Beam', chapter: 'The Splitters', par: 17, rows: [
      '###############',
      '#........O....#',
      '#.............#',
      '#.>......T....#',
      '#.............#',
      '#...S.........#',
      '#.....m.......#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,3': 2 } },
    { name: 'Cross Bridge', chapter: 'The Splitters', par: 17, rows: [
      '###############',
      '#......v......#',
      '#.............#',
      '#.>...+.....O.#',
      '#...S.........#',
      '#.............#',
      '#.....m.......#',
      '#......O......#',
      '#.............#',
      '#...........X.#',
      '###############'
    ] },
    { name: 'Weight Plate', chapter: 'The Splitters', par: 15, rows: [
      '###############',
      '#.............#',
      '#.>.....=....O#',
      '#.............#',
      '#..S.C..._....#',
      '#.............#',
      '#......m......#',
      '#.............#',
      '#.............#',
      '#...........X.#',
      '###############'
    ] },
    { name: 'Pipe Fitters', chapter: 'The Splitters', par: 17, rows: [
      '###############',
      '#.............#',
      '#......v......#',
      '#.>....|....O.#',
      '#...S.........#',
      '#.......m.....#',
      '#.............#',
      '#......O......#',
      '#.............#',
      '#...........X.#',
      '###############'
    ] },
    { name: 'Double Fork', chapter: 'The Splitters', par: 22, rows: [
      '###############',
      '#......O......#',
      '#.............#',
      '#.>....T...T.O#',
      '#.............#',
      '#..S..........#',
      '#......m......#',
      '#..........O..#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '7,3': 0, '11,3': 3 } },
    { name: 'Gate & Split', chapter: 'The Splitters', par: 20, rows: [
      '###############',
      '#........O....#',
      '#.............#',
      '#.>..=...T....#',
      '#.............#',
      '#..S.C....._..#',
      '#......m......#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,3': 2 } },

    // --- Chapter 3: Phase Chambers (13-18) ---
    { name: 'Dark Spark', chapter: 'Phase Chambers', par: 16, rows: [
      '###############',
      '#.............#',
      '#.>.....!....O#',
      '#....C........#',
      '#..S..........#',
      '#......m......#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], invDirs: { '8,2': 1 } },
    { name: 'Shadow Relay', chapter: 'Phase Chambers', par: 15, rows: [
      '###############',
      '#.............#',
      '#.>...../.....#',
      '#.............#',
      '#..S..........#',
      '#.......!....O#',
      '#.............#',
      '#......m......#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '8,2': 0 }, invDirs: { '8,5': 1 } },
    { name: 'Gatekeeper', chapter: 'Phase Chambers', par: 18, rows: [
      '###############',
      '#........O....#',
      '#.............#',
      '#.>..=...T....#',
      '#.............#',
      '#..S.C..._..!.#',
      '#.............#',
      '#.....m.....O.#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,3': 0 }, invDirs: { '12,5': 2 } },
    { name: 'Cross Inverter', chapter: 'Phase Chambers', par: 20, rows: [
      '###############',
      '#......v......#',
      '#.............#',
      '#.>..C.+..!..O#',
      '#..S..........#',
      '#.............#',
      '#....m........#',
      '#......O......#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], invDirs: { '10,3': 1 } },
    { name: 'Mirror Cut', chapter: 'Phase Chambers', par: 20, rows: [
      '###############',
      '#.........O...#',
      '#.>.....!./...#',
      '#....C........#',
      '#...S.........#',
      '#.............#',
      '#......m......#',
      '#.............#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '10,2': 1 }, invDirs: { '8,2': 1 } },
    { name: 'Double Negation', chapter: 'Phase Chambers', par: 18, rows: [
      '###############',
      '#.............#',
      '#.>...!...!..O#',
      '#.............#',
      '#..S..........#',
      '#......m......#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], invDirs: { '6,2': 1, '10,2': 1 } },

    // --- Chapter 4: Chronos Works (19-24) ---
    { name: 'Even Beat', chapter: 'Chronos Works', par: 16, rows: [
      '###############',
      '#.............#',
      '#.P....../....#',
      '#.............#',
      '#...S.........#',
      '#.......m.....#',
      '#.............#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0 }, pulseDirs: { '2,2': [1] } },
    { name: 'One Tick Late', chapter: 'Chronos Works', par: 16, rows: [
      '###############',
      '#.............#',
      '#.P...1../....#',
      '#.............#',
      '#...S.........#',
      '#......m......#',
      '#.............#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0 }, pulseDirs: { '2,2': [1] } },
    { name: 'Twin Pulses', chapter: 'Chronos Works', par: 18, rows: [
      '###############',
      '#........O....#',
      '#.............#',
      '#.P..1...T....#',
      '#.............#',
      '#..S..........#',
      '#......m......#',
      '#........O....#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,3': 2 }, pulseDirs: { '2,3': [1] } },
    { name: 'Two Beat Hold', chapter: 'Chronos Works', par: 16, rows: [
      '###############',
      '#.............#',
      '#.P..2..../...#',
      '#.............#',
      '#....S........#',
      '#.......m.....#',
      '#.............#',
      '#.........O...#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '10,2': 0 }, pulseDirs: { '2,2': [1] } },
    { name: 'Clocked Gate', chapter: 'Chronos Works', par: 16, rows: [
      '###############',
      '#.............#',
      '#.P..1..=....O#',
      '#.............#',
      '#..S.C..._....#',
      '#.............#',
      '#......m......#',
      '#.............#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], pulseDirs: { '2,2': [1] } },
    { name: 'Pendulum Beat', chapter: 'Chronos Works', par: 16, rows: [
      '###############',
      '#......P......#',
      '#.............#',
      '#.P..1.+....O.#',
      '#...S.........#',
      '#.............#',
      '#....m........#',
      '#......O......#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], pulseDirs: { '7,1': [2], '2,3': [1] } },

    // --- Chapter 5: The Grand Mainspring (25-30) ---
    { name: 'Amber & Cyan', chapter: 'Grand Mainspring', par: 22, rows: [
      '###############',
      '#.............#',
      '#.>...:../....#',
      '#........O....#',
      '#..S..........#',
      '#.............#',
      '#.e...;..\\....#',
      '#......m......#',
      '#........Q....#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0, '9,6': 0 } },
    { name: 'Filter Swap', chapter: 'Grand Mainspring', par: 22, rows: [
      '###############',
      '#.............#',
      '#.>....../....#',
      '#........:....#',
      '#..S.....O....#',
      '#.............#',
      '#.e......\\....#',
      '#.......m;....#',
      '#........Q....#',
      '#...........X.#',
      '###############'
    ], rots: { '9,2': 0, '9,6': 0 } },
    { name: 'Dual Crossing', chapter: 'Grand Mainspring', par: 18, rows: [
      '###############',
      '#......s......#',
      '#.............#',
      '#.>...+...:..O#',
      '#..S..........#',
      '#.............#',
      '#......;....m.#',
      '#......Q......#',
      '#.............#',
      '#...........X.#',
      '###############'
    ] },
    { name: 'Split Prism', chapter: 'Grand Mainspring', par: 24, rows: [
      '###############',
      '#........O....#',
      '#........:....#',
      '#.>......T....#',
      '#.............#',
      '#..S.....\\.;.Q#',
      '#.............#',
      '#...e..../..m.#',
      '#.............#',
      '#...........X.#',
      '###############'
    ], rots: { '9,3': 2, '9,5': 0, '9,7': 1 } },
    { name: 'Chrono Filter', chapter: 'Grand Mainspring', par: 20, rows: [
      '###############',
      '#.............#',
      '#.P..1...:...O#',
      '#.............#',
      '#..S..........#',
      '#.............#',
      '#.e......\\....#',
      '#.......m;....#',
      '#........Q....#',
      '#...........X.#',
      '###############'
    ], rots: { '9,6': 0 }, pulseDirs: { '2,2': [1] } },
    { name: 'Mainspring', chapter: 'Grand Mainspring', par: 18, rows: [
      '###############',
      '#......s......#',
      '#...S.........#',
      '#.>..C.+..=:O.#',
      '#....._.......#',
      '#.............#',
      '#......;....m.#',
      '#......Q...X..#',
      '#.............#',
      '#.............#',
      '###############'
    ] }
  ];

  function hash(seed) {
    let n = 2166136261;
    for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0;
  }

  function parseVault(index, difficulty, seed) {
    const spec = RAW_VAULTS[index];
    const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
    const tiles = new Uint8Array(WIDTH * HEIGHT);
    // Tile ids: 0 floor, 1 wall, 2 exit, 3 plate, 4 gate, 5 filterAmber, 6 filterCyan, 7 lockedCrate
    const objs = []; // { id, kind, x, y, dir, rot, color, dirs, delay, queue }
    const receptors = []; // { x, y, color, lit }
    let px = 1, py = 1;
    let nextId = 1;
    const h = hash(seed + ':' + index);

    for (let y = 0; y < HEIGHT; y++) {
      const row = spec.rows[y];
      for (let x = 0; x < WIDTH; x++) {
        const ch = row[x];
        const i = y * WIDTH + x;
        const key = `${x},${y}`;
        if (ch === '#') tiles[i] = 1;
        else if (ch === 'X') tiles[i] = 2;
        else if (ch === '_') tiles[i] = 3;
        else if (ch === '=') tiles[i] = 4;
        else if (ch === ':') tiles[i] = 5;
        else if (ch === ';') tiles[i] = 6;
        else if (ch === 'm') tiles[i] = diff.masterObstacle ? 7 : 0;
        else if (ch === 'S') { px = x; py = y; }
        else if (ch === 'O') receptors.push({ x, y, color: 1, lit: false });
        else if (ch === 'Q') receptors.push({ x, y, color: 2, lit: false });
        else if ('^>v<'.includes(ch)) objs.push({ id: nextId++, kind: 'gen', x, y, dir: '^>v<'.indexOf(ch), color: 1 });
        else if ('nesw'.includes(ch)) objs.push({ id: nextId++, kind: 'gen', x, y, dir: 'nesw'.indexOf(ch), color: 2 });
        else if (ch === 'P') objs.push({ id: nextId++, kind: 'pulse', x, y, dirs: spec.pulseDirs?.[key] || [0, 1, 2, 3], color: 1 });
        else if (ch === '1' || ch === '2') objs.push({ id: nextId++, kind: 'cap', x, y, delay: Number(ch), color: 1, queue: [] });
        else if (ch === '!') objs.push({ id: nextId++, kind: 'inv', x, y, dir: spec.invDirs?.[key] ?? 1, color: 1 });
        else if (ch === '/' || ch === '\\') {
          let rot = spec.rots?.[key] ?? (ch === '/' ? 0 : 1);
          if (seed !== 'lockwork' && seed !== 'default') rot = (rot + ((h + x + y) % 2)) % 2;
          objs.push({ id: nextId++, kind: 'mirror', x, y, rot });
        } else if (ch === 'T') {
          let rot = spec.rots?.[key] ?? 0;
          if (seed !== 'lockwork' && seed !== 'default') rot = (rot + ((h + x) % 3) + 1) % 4;
          objs.push({ id: nextId++, kind: 'splitter', x, y, rot });
        } else if (ch === 'C') objs.push({ id: nextId++, kind: 'crate', x, y });
        else if (ch === '+') objs.push({ id: nextId++, kind: 'bridge', x, y });
        else if (ch === '-' || ch === '|') objs.push({ id: nextId++, kind: 'pipe', x, y, rot: ch === '-' ? 0 : 1 });
      }
    }

    return {
      index,
      name: spec.name,
      chapter: spec.chapter,
      par: spec.par + diff.parSlack,
      tiles,
      objs,
      receptors,
      px,
      py,
      facing: 1,
      vaultTick: 0,
      steps: 0,
      unlocked: false,
      beamsAmber: new Uint8Array(WIDTH * HEIGHT),
      beamsCyan: new Uint8Array(WIDTH * HEIGHT),
      gatesOpen: false,
      history: []
    };
  }

  function newGame(seed = 'lockwork', difficulty = 'standard', startVault = 0) {
    seed = String(seed);
    if (!DIFFICULTIES[difficulty]) difficulty = 'standard';
    const vIdx = Math.max(0, Math.min(RAW_VAULTS.length - 1, startVault | 0));
    const state = {
      version: 1,
      seed,
      difficulty,
      status: 'play',
      time: 0,
      tick: 0,
      endTime: 0,
      vaultIndex: vIdx,
      vaults: null,
      cleared: new Array(RAW_VAULTS.length).fill(false),
      bestSteps: new Array(RAW_VAULTS.length).fill(null),
      cogs: 0,
      totalSteps: 0,
      hint: null
    };
    state.vault = parseVault(vIdx, difficulty, seed);
    traceSignals(state);
    return state;
  }

  function objAt(v, x, y) {
    return v.objs.find(o => o.x === x && o.y === y) || null;
  }

  function isPushable(o) {
    return o && (o.kind === 'crate' || o.kind === 'bridge' || o.kind === 'pipe');
  }

  function isRotatable(o) {
    return o && (o.kind === 'mirror' || o.kind === 'splitter');
  }

  function platesPressed(v) {
    for (let i = 0; i < v.tiles.length; i++) {
      if (v.tiles[i] !== 3) continue;
      const x = i % WIDTH, y = (i - x) / WIDTH;
      if ((v.px === x && v.py === y) || v.objs.some(o => isPushable(o) && o.x === x && o.y === y)) return true;
    }
    return false;
  }

  function traceSignals(state, advanceCap = false) {
    const v = state.vault;
    v.beamsAmber.fill(0);
    v.beamsCyan.fill(0);
    v.gatesOpen = platesPressed(v);
    for (const r of v.receptors) r.lit = false;

    const visited = new Set();
    const invHit = new Set();
    const nextCapArrivals = new Map();

    const shoot = (sx, sy, dir, color, fromSource = true) => {
      const queue = [{ x: sx, y: sy, dir, color, skipSelf: fromSource }];
      while (queue.length) {
        const ray = queue.shift();
        let x = ray.x, y = ray.y, d = ray.dir;
        if (ray.skipSelf) {
          x += DIRS[d][0];
          y += DIRS[d][1];
        }
        while (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) {
          const i = y * WIDTH + x;
          const tile = v.tiles[i];
          if (tile === 1 || tile === 7 || (tile === 4 && !v.gatesOpen)) break;
          if (tile === 5 && ray.color !== 1) break;
          if (tile === 6 && ray.color !== 2) break;

          const key = (i << 4) | (d << 2) | ray.color;
          if (visited.has(key)) break;
          visited.add(key);

          const rec = v.receptors.find(r => r.x === x && r.y === y);
          if (rec) {
            if (rec.color === ray.color) rec.lit = true;
            if (ray.color === 1) v.beamsAmber[i] |= (1 << d);
            else v.beamsCyan[i] |= (1 << d);
            break;
          }

          const obj = objAt(v, x, y);
          if (obj) {
            if (obj.kind === 'crate' || obj.kind === 'gen' || obj.kind === 'pulse') break;
            if (obj.kind === 'inv') {
              invHit.add(obj.id);
              break;
            }
            if (obj.kind === 'cap') {
              if (advanceCap) {
                const list = nextCapArrivals.get(obj.id) || [];
                list.push({ dir: d, color: ray.color, ttl: obj.delay });
                nextCapArrivals.set(obj.id, list);
              }
              if (ray.color === 1) v.beamsAmber[i] |= (1 << d);
              else v.beamsCyan[i] |= (1 << d);
              break;
            }
            if (obj.kind === 'pipe') {
              const horiz = d === 1 || d === 3;
              if ((obj.rot === 0 && !horiz) || (obj.rot === 1 && horiz)) break;
            }
            if (obj.kind === 'mirror') {
              if (ray.color === 1) v.beamsAmber[i] |= (1 << d);
              else v.beamsCyan[i] |= (1 << d);
              d = obj.rot === 0 ? (d ^ 1) : (3 - d);
              x += DIRS[d][0];
              y += DIRS[d][1];
              continue;
            }
            if (obj.kind === 'splitter') {
              const opp = (d + 2) % 4;
              if (opp === obj.rot) break;
              if (ray.color === 1) v.beamsAmber[i] |= (1 << d);
              else v.beamsCyan[i] |= (1 << d);
              for (let nd = 0; nd < 4; nd++) {
                if (nd !== opp && nd !== obj.rot) {
                  queue.push({ x: x + DIRS[nd][0], y: y + DIRS[nd][1], dir: nd, color: ray.color, skipSelf: false });
                }
              }
              break;
            }
          }

          if (ray.color === 1) v.beamsAmber[i] |= (1 << d);
          else v.beamsCyan[i] |= (1 << d);
          x += DIRS[d][0];
          y += DIRS[d][1];
        }
      }
    };

    for (const o of v.objs) {
      if (o.kind === 'gen') shoot(o.x, o.y, o.dir, o.color, true);
      else if (o.kind === 'pulse' && v.vaultTick % 2 === 0) {
        for (const d of o.dirs) shoot(o.x, o.y, d, o.color, true);
      } else if (o.kind === 'cap') {
        for (const q of o.queue) {
          if (q.ttl <= 0) shoot(o.x, o.y, q.dir, q.color, true);
        }
      }
    }

    // Phase inverters fire after main rays unless struck; repeat once so chained inverters cascade cleanly.
    const firedInv = new Set();
    for (let pass = 0; pass < 3; pass++) {
      let anyNew = false;
      for (const o of v.objs) {
        if (o.kind === 'inv' && !invHit.has(o.id) && !firedInv.has(o.id)) {
          firedInv.add(o.id);
          anyNew = true;
          shoot(o.x, o.y, o.dir, o.color, true);
        }
      }
      if (!anyNew) break;
    }

    if (advanceCap) {
      for (const o of v.objs) {
        if (o.kind !== 'cap') continue;
        const aged = o.queue.filter(q => q.ttl > 0).map(q => ({ ...q, ttl: q.ttl - 1 }));
        const incoming = nextCapArrivals.get(o.id) || [];
        o.queue = aged.concat(incoming);
      }
    }

    v.unlocked = v.receptors.length > 0 && v.receptors.every(r => r.lit);
    return v.unlocked;
  }

  const cloneObj = o => (o.queue ? { ...o, queue: o.queue.map(q => ({ ...q })) } : { ...o });

  function snapshot(v) {
    return {
      px: v.px,
      py: v.py,
      facing: v.facing,
      vaultTick: v.vaultTick,
      steps: v.steps,
      objs: v.objs.map(cloneObj)
    };
  }

  function applySnapshot(v, snap) {
    v.px = snap.px;
    v.py = snap.py;
    v.facing = snap.facing;
    v.vaultTick = snap.vaultTick;
    v.steps = snap.steps;
    v.objs = snap.objs.map(cloneObj);
  }

  function undo(state) {
    const v = state.vault;
    if (!v.history.length || state.status !== 'play') return false;
    const prev = v.history.pop();
    applySnapshot(v, prev);
    state.hint = null;
    traceSignals(state, false);
    return true;
  }

  function resetVault(state) {
    if (state.status !== 'play') return false;
    state.vault = parseVault(state.vaultIndex, state.difficulty, state.seed);
    state.hint = null;
    traceSignals(state, false);
    return true;
  }

  function selectVault(state, index) {
    const idx = Math.max(0, Math.min(RAW_VAULTS.length - 1, index | 0));
    state.vaultIndex = idx;
    state.vault = parseVault(idx, state.difficulty, state.seed);
    state.status = 'play';
    state.hint = null;
    traceSignals(state, false);
    return true;
  }

  function canWalkTile(v, x, y) {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return false;
    const t = v.tiles[y * WIDTH + x];
    return t === 0 || t === 2 || t === 3 || (t === 4 && v.gatesOpen);
  }

  function findAdjacentRotatable(v) {
    const check = [v.facing, (v.facing + 1) % 4, (v.facing + 3) % 4, (v.facing + 2) % 4];
    for (const d of check) {
      const o = objAt(v, v.px + DIRS[d][0], v.py + DIRS[d][1]);
      if (isRotatable(o)) return o;
    }
    return null;
  }

  function advanceTick(state, events) {
    const v = state.vault;
    const wasLit = v.receptors.filter(r => r.lit).length;
    const wasUnlocked = v.unlocked;
    v.vaultTick++;
    v.steps++;
    state.totalSteps++;
    traceSignals(state, true);
    const nowLit = v.receptors.filter(r => r.lit).length;
    if (nowLit !== wasLit) events.push({ type: 'receptor', lit: nowLit, total: v.receptors.length });
    if (!wasUnlocked && v.unlocked) events.push({ type: 'unlock', x: v.px, y: v.py });
  }

  function step(state, input = {}) {
    const events = [];
    if (state.status !== 'play') return events;
    state.tick++;
    state.time = state.tick * STEP;

    if (input.undo) {
      if (undo(state)) events.push({ type: 'undo' });
      return events;
    }
    if (input.reset) {
      resetVault(state);
      events.push({ type: 'reset' });
      return events;
    }
    if (input.selectVault !== undefined && input.selectVault !== null) {
      selectVault(state, input.selectVault);
      events.push({ type: 'select', index: state.vaultIndex });
      return events;
    }
    if (input.hint) {
      if (DIFFICULTIES[state.difficulty].hints) {
        const h = hintFor(state);
        state.hint = h;
        events.push({ type: 'hint', hint: h });
      }
      return events;
    }

    const v = state.vault;
    let dx = Math.sign(input.moveX || 0);
    let dy = Math.sign(input.moveY || 0);
    if (dx && dy) dy = 0;

    if (dx || dy) {
      const dir = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
      v.facing = dir;
      const nx = v.px + dx, ny = v.py + dy;
      const obj = objAt(v, nx, ny);
      if (isPushable(obj)) {
        const bx = nx + dx, by = ny + dy;
        if (canWalkTile(v, bx, by) && !objAt(v, bx, by) && !v.receptors.some(r => r.x === bx && r.y === by)) {
          v.history.push(snapshot(v));
          if (v.history.length > 200) v.history.shift();
          obj.x = bx;
          obj.y = by;
          v.px = nx;
          v.py = ny;
          state.hint = null;
          events.push({ type: 'push', x: bx, y: by });
          advanceTick(state, events);
        } else {
          events.push({ type: 'bump', x: nx, y: ny });
        }
      } else if (!obj && canWalkTile(v, nx, ny)) {
        v.history.push(snapshot(v));
        if (v.history.length > 200) v.history.shift();
        v.px = nx;
        v.py = ny;
        state.hint = null;
        events.push({ type: 'step', x: nx, y: ny });
        advanceTick(state, events);
      } else if (isRotatable(obj) && input.autoRotate) {
        v.history.push(snapshot(v));
        if (v.history.length > 200) v.history.shift();
        obj.rot = (obj.rot + 1) % (obj.kind === 'mirror' ? 2 : 4);
        state.hint = null;
        events.push({ type: 'rotate', x: obj.x, y: obj.y });
        advanceTick(state, events);
      } else {
        events.push({ type: 'bump', x: nx, y: ny });
      }
    } else if (input.action) {
      v.history.push(snapshot(v));
      if (v.history.length > 200) v.history.shift();
      const target = findAdjacentRotatable(v);
      if (target) {
        target.rot = (target.rot + 1) % (target.kind === 'mirror' ? 2 : 4);
        state.hint = null;
        events.push({ type: 'rotate', x: target.x, y: target.y });
      } else {
        state.hint = null;
        events.push({ type: 'wait', x: v.px, y: v.py });
      }
      advanceTick(state, events);
    }

    // Check vault exit
    if (v.unlocked && v.tiles[v.py * WIDTH + v.px] === 2) {
      const idx = state.vaultIndex;
      const prevBest = state.bestSteps[idx];
      if (prevBest === null || v.steps < prevBest) state.bestSteps[idx] = v.steps;
      state.cleared[idx] = true;
      recountCogs(state);
      const earnedCog = v.steps <= v.par;
      events.push({ type: 'vaultClear', index: idx, steps: v.steps, par: v.par, cog: earnedCog });
      if (idx + 1 < RAW_VAULTS.length) {
        state.vaultIndex = idx + 1;
        state.vault = parseVault(state.vaultIndex, state.difficulty, state.seed);
        state.hint = null;
        traceSignals(state, false);
      } else {
        state.status = 'won';
        state.endTime = state.time;
        events.push({ type: 'victory' });
      }
    }
    return events;
  }

  function recountCogs(state) {
    let cogs = 0;
    for (let i = 0; i < RAW_VAULTS.length; i++) {
      const slack = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.standard).parSlack;
      if (state.bestSteps[i] !== null && state.bestSteps[i] <= RAW_VAULTS[i].par + slack) cogs++;
    }
    state.cogs = cogs;
  }

  // BFS solver from current vault state -> returns array of plain inputs [{moveX, moveY, action}]
  function solveVault(state, maxStates = 12000) {
    const cloneVault = v => ({
      ...v,
      objs: v.objs.map(o => ({ ...o, queue: o.queue ? o.queue.map(q => ({ ...q })) : undefined })),
      receptors: v.receptors.map(r => ({ ...r })),
      beamsAmber: new Uint8Array(WIDTH * HEIGHT),
      beamsCyan: new Uint8Array(WIDTH * HEIGHT),
      history: []
    });
    const keyOf = v => {
      const objs = v.objs.filter(o => o.kind !== 'gen').map(o => `${o.x},${o.y},${o.rot || 0},${o.queue ? o.queue.map(q => q.ttl).join('.') : ''}`).join(';');
      const hasTemporal = v.objs.some(o => o.kind === 'pulse' || o.kind === 'cap');
      return `${v.px},${v.py},${hasTemporal ? v.vaultTick % 4 : 0}|${objs}`;
    };

    const startSim = {
      ...state,
      status: 'play',
      vault: cloneVault(state.vault),
      cleared: state.cleared.slice(),
      bestSteps: state.bestSteps.slice()
    };
    const seen = new Set([keyOf(startSim.vault)]);
    const queue = [{ v: startSim.vault, moves: [] }];
    let head = 0;

    while (head < queue.length && seen.size < maxStates) {
      const cur = queue[head++];
      const v0 = cur.v;
      // If unlocked and standing near exit, shortest-path walk straight to X is included naturally.
      const actions = [
        { moveX: 0, moveY: -1 },
        { moveX: 1, moveY: 0 },
        { moveX: 0, moveY: 1 },
        { moveX: -1, moveY: 0 },
        { action: true }
      ];
      for (const act of actions) {
        const sim = { ...startSim, vaultIndex: state.vaultIndex, vault: cloneVault(v0), cleared: startSim.cleared.slice(), bestSteps: startSim.bestSteps.slice() };
        const ev = step(sim, act);
        if (ev.some(e => e.type === 'vaultClear')) {
          return cur.moves.concat([act]);
        }
        if (ev.some(e => e.type === 'bump')) continue;
        const k = keyOf(sim.vault);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ v: sim.vault, moves: cur.moves.concat([act]) });
      }
    }
    return null;
  }

  function hintFor(state) {
    const plan = solveVault(state, 8000);
    if (!plan || !plan.length) return null;
    const next = plan[0];
    const v = state.vault;
    if (next.action) {
      const rot = findAdjacentRotatable(v);
      return rot ? { x: rot.x, y: rot.y, text: 'Rotate adjacent mechanism (Space/E)' } : { x: v.px, y: v.py, text: 'Wait 1 tick (Space/E)' };
    }
    const nx = v.px + (next.moveX || 0), ny = v.py + (next.moveY || 0);
    const dirName = next.moveX === 1 ? 'Right' : next.moveX === -1 ? 'Left' : next.moveY === 1 ? 'Down' : 'Up';
    return { x: nx, y: ny, text: `Step ${dirName}` };
  }

  function objective(state) {
    if (state.status === 'won') return 'All 30 brass vaults powered! Grand Mainspring unlocked.';
    const v = state.vault;
    const lit = v.receptors.filter(r => r.lit).length, total = v.receptors.length;
    if (v.unlocked) return `All ${total} receptors lit! Step onto the green exit {O}.`;
    return `Vault ${v.index + 1}/${RAW_VAULTS.length} (${v.name}): light ${lit}/${total} receptors. E/Space rotates or waits.`;
  }

  function score(state) {
    const cleared = state.cleared.filter(Boolean).length;
    return Math.max(0, cleared * 200 + state.cogs * 150 + (state.status === 'won' ? 1000 : 0) - Math.floor(state.totalSteps / 5));
  }

  function save(state) {
    const cleanVault = {
      ...state.vault,
      beamsAmber: undefined,
      beamsCyan: undefined,
      history: state.vault.history.slice(-40)
    };
    return JSON.stringify({ ...state, vault: cleanVault });
  }

  function restore(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(text));
    const ok = data && data.version === 1 && typeof data.seed === 'string' && DIFFICULTIES[data.difficulty] &&
      data.vault && Array.isArray(data.vault.objs) && Array.isArray(data.vault.receptors) &&
      Array.isArray(data.cleared) && data.cleared.length === RAW_VAULTS.length;
    if (!ok) throw new Error('Saved game is not a Lockwork run.');
    const template = parseVault(data.vaultIndex, data.difficulty, data.seed);
    data.vault.tiles = template.tiles;
    data.vault.beamsAmber = new Uint8Array(WIDTH * HEIGHT);
    data.vault.beamsCyan = new Uint8Array(WIDTH * HEIGHT);
    traceSignals(data, false);
    return data;
  }

  global.Lockwork = {
    WIDTH, HEIGHT, STEP, DIRS, VAULTS: RAW_VAULTS, DIFFICULTIES,
    newGame, step, undo, resetVault, selectVault, traceSignals, solveVault, hintFor, objective, score, save, restore, objAt
  };
})(typeof window !== 'undefined' ? window : globalThis);

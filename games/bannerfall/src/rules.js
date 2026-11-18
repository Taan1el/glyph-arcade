/* Bannerfall rules: a seeded three-lane battle map, minion waves, towers, four heroes with
 * four abilities each, items, neutral camps, the Colossus, and the AI that plays every hero
 * the player does not. Pure data in, events out, so tests and bots play whole matches. */
(function (global) {
  'use strict';
  const { Math, Object, Array, Number, String, Boolean, JSON, Map, Set, Uint8Array, Int16Array, Int32Array } = global;
  const Infinity = 1 / 0;

  const WIDTH = 96, HEIGHT = 64;
  let STEP = 1 / 60;
  const T = { TREE: 0, GRASS: 1, LANE: 2, RIVER: 3, BASE: 4, PIT: 5 };
  const BASES = [{ x: 9, y: 55 }, { x: 87, y: 9 }];
  const BASE_RADIUS = 8;
  // Every lane runs from the blue base (team 0) to the red base (team 1).
  const LANES = [
    [{ x: 9, y: 55 }, { x: 9, y: 9 }, { x: 87, y: 9 }],
    [{ x: 9, y: 55 }, { x: 87, y: 9 }],
    [{ x: 9, y: 55 }, { x: 87, y: 55 }, { x: 87, y: 9 }]
  ];
  const LANE_NAMES = ['top', 'mid', 'bottom'];
  const CAMPS = [{ x: 22, y: 32 }, { x: 48, y: 47 }, { x: 74, y: 32 }, { x: 48, y: 17 }];
  const PIT = { x: 48, y: 32 };
  const TOWER_ALONG = [31, 14]; // outer, inner: tiles from the owner's base along the lane
  const TEAM_NAMES = ['Blue', 'Red'];

  const ability = (key, name, text, cooldown, mana, range) => ({ key, name, text, cooldown, mana, range });
  const HEROES = {
    warden: {
      name: 'Warden', role: 'Tank', letter: 'W', hp: 740, hpLevel: 96, mana: 260, damage: 34, damageLevel: 4.5, range: 1.8, rate: 0.98, speed: 5.2,
      abilities: [
        ability('Q', 'Shield Bash', 'Bash the foes in front of you and stun them for a second.', 8, 50, 2.6),
        ability('W', 'Rally Shout', 'Gain a shield and force nearby foes to attack you.', 14, 70, 4.5),
        ability('E', 'Charge', 'Rush toward the cursor and slam the first foe you meet.', 10, 60, 6.5),
        ability('R', 'Bulwark', 'Raise a stone wall that foes cannot cross for five seconds.', 55, 120, 6)
      ]
    },
    ranger: {
      name: 'Ranger', role: 'Marksman', letter: 'R', hp: 438, hpLevel: 63, mana: 260, damage: 25, damageLevel: 3.8, range: 5.9, rate: 0.86, speed: 5.15,
      abilities: [
        ability('Q', 'Piercing Arrow', 'Loose an arrow that passes through every foe in a line.', 8.5, 60, 11),
        ability('W', 'Snare Trap', 'Hide a trap that roots and hurts the first foe to step on it.', 9, 45, 7),
        ability('E', 'Tumble', 'Roll toward the cursor. Your next shot hits harder.', 8, 40, 4.5),
        ability('R', 'Arrow Storm', 'Rain arrows on an area for three seconds, slowing foes.', 52, 120, 10)
      ]
    },
    ember: {
      name: 'Ember', role: 'Mage', letter: 'E', hp: 410, hpLevel: 58, mana: 300, damage: 20, damageLevel: 2.6, range: 5.1, rate: 0.76, speed: 5.0,
      abilities: [
        ability('Q', 'Fireball', 'Throw a fireball that bursts on the first foe it meets.', 8.5, 65, 8.2),
        ability('W', 'Frost Field', 'Freeze the ground: foes inside are slowed and chilled.', 15, 80, 7.5),
        ability('E', 'Blink', 'Vanish and reappear toward the cursor.', 11, 60, 6),
        ability('R', 'Meteor', 'Call a meteor down on a marked area. It stuns as it lands.', 60, 140, 10)
      ]
    },
    shade: {
      name: 'Shade', role: 'Assassin', letter: 'S', hp: 550, hpLevel: 80, mana: 240, damage: 37, damageLevel: 5.2, range: 1.8, rate: 1.02, speed: 5.6,
      abilities: [
        ability('Q', 'Shadow Step', 'Dash to the cursor and cut every foe where you land.', 7, 50, 5),
        ability('W', 'Smoke', 'Turn invisible and quick for three seconds. Striking reveals you.', 16, 60, 0),
        ability('E', 'Venom', 'For five seconds your strikes poison and come faster.', 12, 45, 0),
        ability('R', 'Execute', 'Strike a nearby hero for heavy damage, more the more they are hurt.', 45, 100, 4.5)
      ]
    }
  };
  const HERO_KINDS = Object.keys(HEROES);

  const ITEMS = {
    blade: { name: 'Iron Blade', cost: 300, damage: 15, text: '+15 damage' },
    vest: { name: 'Leather Vest', cost: 300, hp: 170, text: '+170 health' },
    boots: { name: 'Swift Boots', cost: 350, speed: 0.8, text: '+0.8 speed' },
    bow: { name: 'Hunting Bow', cost: 450, damage: 10, rate: 0.15, text: '+10 damage, attack 15% faster' },
    charm: { name: 'Sage Charm', cost: 450, mana: 120, cdr: 0.15, text: '+120 mana, abilities recharge 15% faster' },
    fang: { name: 'Blood Fang', cost: 550, damage: 10, lifesteal: 0.12, text: '+10 damage, heal 12% of damage dealt' },
    staff: { name: 'Ash Staff', cost: 600, power: 0.3, text: 'Abilities hit 30% harder' },
    mail: { name: 'Chain Mail', cost: 650, hp: 300, armour: 0.12, text: '+300 health, take 12% less damage' },
    standard: { name: 'War Standard', cost: 900, damage: 25, hp: 220, text: '+25 damage, +220 health' },
    potion: { name: 'Healing Potion', cost: 60, heal: 260, text: 'Drink at once: heal 260 over eight seconds. Takes no slot.' }
  };
  const SLOTS = 6;
  const BUILDS = {
    warden: ['vest', 'boots', 'mail', 'blade', 'standard', 'fang'],
    ranger: ['blade', 'bow', 'boots', 'fang', 'standard', 'mail'],
    ember: ['charm', 'staff', 'boots', 'vest', 'staff', 'mail'],
    shade: ['blade', 'boots', 'fang', 'standard', 'bow', 'mail']
  };

  // Rival skill. Your allies always play at Normal; difficulty only changes the red team.
  const DIFFICULTIES = {
    easy: { label: 'Easy', think: 0.55, aim: 1.6, ability: 0.45, lastHit: false, damage: 0.82, gold: 0.85, retreat: 0.3 },
    normal: { label: 'Normal', think: 0.3, aim: 0.7, ability: 0.8, lastHit: true, damage: 1, gold: 1, retreat: 0.35 },
    hard: { label: 'Hard', think: 0.16, aim: 0.3, ability: 1, lastHit: true, damage: 1.12, gold: 1.15, retreat: 0.35 }
  };

  const MINIONS = {
    melee: { hp: 210, damage: 14, range: 1.3, rate: 0.9, speed: 3.6, gold: 20, xp: 20, r: 0.45 },
    ranged: { hp: 140, damage: 18, range: 4.5, rate: 0.7, speed: 3.6, gold: 16, xp: 16, r: 0.45 },
    siege: { hp: 520, damage: 40, range: 6, rate: 0.45, speed: 3.2, gold: 45, xp: 40, r: 0.6 }
  };
  const WAVE_FIRST = 10, WAVE_EVERY = 25, COLOSSUS_AT = 360, COLOSSUS_RESPAWN = 240, CAMP_RESPAWN = 60, RECALL_TIME = 4;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = u => u.hp > 0;

  function hash(seed) {
    let n = 2166136261;
    for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0;
  }
  function random(state) {
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    return state.rng / 4294967296;
  }

  // --- Map
  const LANE_LENGTHS = LANES.map(path => {
    let length = 0;
    for (let i = 1; i < path.length; i++) length += dist(path[i], path[i - 1]);
    return length;
  });
  function lanePoint(lane, along) {
    const path = LANES[lane];
    along = clamp(along, 0, LANE_LENGTHS[lane]);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = dist(a, b);
      if (along <= length || i === path.length - 1) {
        const t = clamp(along / length, 0, 1);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      along -= length;
    }
    return { ...path[path.length - 1] };
  }
  // Nearest point on a lane: how far along it is, and how far away.
  function laneProject(lane, x, y) {
    const path = LANES[lane];
    let best = { along: 0, dist: Infinity }, start = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (length * length), 0, 1);
      const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
      if (d < best.dist) best = { along: start + t * length, dist: d };
      start += length;
    }
    return best;
  }

  const MAPS = new Map();
  function mapFor(seed) {
    let map = MAPS.get(seed);
    if (!map) {
      map = buildMap(seed);
      if (MAPS.size > 6) MAPS.delete(MAPS.keys().next().value);
      MAPS.set(seed, map);
    }
    return map;
  }
  function buildMap(seed) {
    const tiles = new Uint8Array(WIDTH * HEIGHT);
    let s = hash(seed + ':map') || 1;
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const disc = (x, y, r, tile, keep) => {
      for (let ty = Math.floor(y - r); ty <= Math.ceil(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++) {
        if (tx < 1 || ty < 1 || tx >= WIDTH - 1 || ty >= HEIGHT - 1) continue;
        const i = ty * WIDTH + tx;
        if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 > r * r || (keep && keep.includes(tiles[i]))) continue;
        tiles[i] = tile;
      }
    };
    // Every shape is also carved mirrored through the centre, so both sides are equal.
    const both = (x, y, r, tile, keep) => { disc(x, y, r, tile, keep); disc(WIDTH - x, HEIGHT - y, r, tile, keep); };
    const segment = (a, b, r, tile, keep) => {
      const n = Math.max(1, Math.ceil(dist(a, b) / 0.5));
      for (let i = 0; i <= n; i++) both(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, r, tile, keep);
    };
    const winding = (a, b, r) => {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, length = dist(a, b) || 1;
      const bend = (rand() - 0.5) * Math.min(8, length * 0.4), mid = { x: mx - (b.y - a.y) / length * bend, y: my + (b.x - a.x) / length * bend };
      segment(a, mid, r, T.GRASS, [T.LANE, T.RIVER]);
      segment(mid, b, r, T.GRASS, [T.LANE, T.RIVER]);
    };
    const nearestOnLane = (lane, p) => lanePoint(lane, laneProject(lane, p.x, p.y).along);
    // River across the map, under the mid lane.
    const riverA = { x: 20, y: 15.5 }, riverB = { x: 76, y: 48.5 };
    segment(riverA, riverB, 1.7, T.RIVER);
    const onRiver = p => {
      const dx = riverB.x - riverA.x, dy = riverB.y - riverA.y, t = clamp(((p.x - riverA.x) * dx + (p.y - riverA.y) * dy) / (dx * dx + dy * dy), 0.15, 0.85);
      return { x: riverA.x + dx * t, y: riverA.y + dy * t };
    };
    // Camps, each joined to its two lanes and to the river.
    const campLanes = [[0, 1], [1, 2]];
    for (const [i, camp] of CAMPS.slice(0, 2).entries()) {
      both(camp.x, camp.y, 3.6, T.GRASS);
      for (const lane of campLanes[i]) winding(camp, nearestOnLane(lane, camp), 1.4);
      winding(camp, onRiver(camp), 1.3);
    }
    for (let i = 0; i < 10; i++) {
      const x = 12 + rand() * 72, y = 12 + rand() * 40;
      if (x + y < 64 + 8) both(x, y, 1.4 + rand() * 1.4, T.GRASS, [T.LANE, T.RIVER]);
    }
    for (const path of LANES) for (let i = 1; i < path.length; i++) segment(path[i - 1], path[i], 2.6, T.LANE);
    both(PIT.x, PIT.y, 4.2, T.PIT, [T.LANE]);
    both(BASES[0].x, BASES[0].y, BASE_RADIUS, T.BASE);
    return { tiles, flows: new Map() };
  }
  function tileAt(map, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT) return T.TREE;
    return map.tiles[ty * WIDTH + tx];
  }
  const walkableTile = tile => tile !== T.TREE;

  function blocked(state, map, x, y, team) {
    if (!walkableTile(tileAt(map, x, y))) return true;
    if (!state.hasWall) return false;
    for (const e of state.effects) {
      if (e.kind !== 'wall' || e.team === team) continue;
      const i = Math.floor(y) * WIDTH + Math.floor(x);
      if (e.tiles.includes(i)) return true;
    }
    return false;
  }
  function clearLine(state, map, x0, y0, x1, y1, team, limit = 7) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.01) return true;
    const reach = Math.min(d, limit), n = Math.ceil(reach / 0.5);
    for (let i = 1; i <= n; i++) {
      const t = reach / d * i / n;
      if (blocked(state, map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, team)) return false;
    }
    return true;
  }
  const BFS_QUEUE = new Int32Array(WIDTH * HEIGHT);
  // Breadth-first distances to a goal tile, cached per map on a 2x2 coarse goal key.
  function flowTo(map, gx, gy) {
    const tx = clamp(Math.floor(gx), 0, WIDTH - 1) & ~1;
    const ty = clamp(Math.floor(gy), 0, HEIGHT - 1) & ~1;
    const rawGoal = ty * WIDTH + tx;
    let field = map.flows.get(rawGoal);
    if (field) return field;
    let goal = rawGoal;
    if (!walkableTile(map.tiles[goal])) {
      goal = clamp(Math.floor(gy), 0, HEIGHT - 1) * WIDTH + clamp(Math.floor(gx), 0, WIDTH - 1);
      field = map.flows.get(goal);
      if (field) { map.flows.set(rawGoal, field); return field; }
    }
    if (!walkableTile(map.tiles[goal])) {
      let best = goal, bestD = Infinity;
      for (let i = 0; i < map.tiles.length; i++) {
        if (!walkableTile(map.tiles[i])) continue;
        const d = Math.hypot(i % WIDTH - goal % WIDTH, Math.floor(i / WIDTH) - Math.floor(goal / WIDTH));
        if (d < bestD) { bestD = d; best = i; }
      }
      goal = best;
      field = map.flows.get(goal);
      if (field) { map.flows.set(rawGoal, field); return field; }
    }
    field = new Int16Array(WIDTH * HEIGHT).fill(-1);
    let head = 0, tail = 0;
    field[goal] = 0;
    BFS_QUEUE[tail++] = goal;
    while (head < tail) {
      const i = BFS_QUEUE[head++], x = i % WIDTH, y = (i - x) / WIDTH, nextD = field[i] + 1;
      if (x + 1 < WIDTH) { const j = i + 1; if (field[j] < 0 && walkableTile(map.tiles[j])) { field[j] = nextD; BFS_QUEUE[tail++] = j; } }
      if (x > 0) { const j = i - 1; if (field[j] < 0 && walkableTile(map.tiles[j])) { field[j] = nextD; BFS_QUEUE[tail++] = j; } }
      if (y + 1 < HEIGHT) { const j = i + WIDTH; if (field[j] < 0 && walkableTile(map.tiles[j])) { field[j] = nextD; BFS_QUEUE[tail++] = j; } }
      if (y > 0) { const j = i - WIDTH; if (field[j] < 0 && walkableTile(map.tiles[j])) { field[j] = nextD; BFS_QUEUE[tail++] = j; } }
    }
    map.flows.set(goal, field);
    map.flows.set(rawGoal, field);
    return field;
  }
  // The farthest point along the shortest path that can be walked to in a straight line.
  function pathStep(state, map, u, gx, gy) {
    const field = flowTo(map, gx, gy);
    let x = Math.floor(u.x), y = Math.floor(u.y), via = null;
    for (let n = 0; n < 7; n++) {
      const here = field[y * WIDTH + x];
      if (here <= 0) break;
      let best = null, bestD = here;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
        if (dx && dy && (!walkableTile(map.tiles[y * WIDTH + nx]) || !walkableTile(map.tiles[ny * WIDTH + x]))) continue;
        const d = field[ny * WIDTH + nx];
        if (d >= 0 && d < bestD) { bestD = d; best = [nx, ny]; }
      }
      if (!best) break;
      [x, y] = best;
      if (n === 0 || clearLine(state, map, u.x, u.y, x + 0.5, y + 0.5, u.team)) via = { x: x + 0.5, y: y + 0.5 };
    }
    return via;
  }

  // --- Units
  function makeUnit(state, type, team, x, y, extra) {
    return Object.assign({
      id: state.nextId++, type, team, x, y, r: 0.5, hp: 100, maxHp: 100, damage: 10, range: 1.5, rate: 1, cd: 0, speed: 0, sight: 7,
      target: null, stun: 0, root: 0, slow: 0, slowTime: 0, shield: 0, shieldTime: 0, poison: 0, poisonTime: 0, flash: 0, facing: 1, moving: false, anim: 0
    }, extra);
  }
  function makeHero(state, kind, team, lane, isPlayer) {
    const spec = HEROES[kind], spot = baseSpot(team, lane);
    const h = makeUnit(state, 'hero', team, spot.x, spot.y, {
      kind, lane, player: Boolean(isPlayer), r: 0.6, sight: 11, level: 1, xp: 0, gold: 450, items: [], cooldowns: [0, 0, 0, 0],
      ranks: [1, 1, 1, 0], skillPoints: 0,
      dead: 0, kills: 0, deaths: 0, assists: 0, cs: 0, streak: 0, recall: 0, order: null, invisible: 0, haste: 0, taunt: null, tauntTime: 0,
      venom: 0, empower: 0, potion: 0, damagedBy: {}, think: 0, mana: spec.mana, maxMana: spec.mana, towerHeat: 0, dash: null
    });
    refreshStats(h);
    h.hp = h.maxHp;
    h.mana = h.maxMana;
    return h;
  }
  function rankUp(h, slot) {
    if (!h || h.skillPoints <= 0 || slot < 0 || slot > 3) return false;
    if (slot === 3 && h.level < 6) return false;
    const maxRank = slot === 3 ? 2 : 4;
    if ((h.ranks?.[slot] || 0) >= maxRank) return false;
    h.ranks[slot] = (h.ranks[slot] || 0) + 1;
    h.skillPoints--;
    refreshStats(h);
    return true;
  }
  function autoRankHero(h) {
    if (!h.ranks) h.ranks = [1, 1, 1, h.level >= 6 ? 1 : 0];
    if (h.level >= 6 && h.ranks[3] === 0) {
      h.ranks[3] = 1;
      if (h.skillPoints > 0) h.skillPoints--;
    }
    while (h.skillPoints > 0) {
      const order = h.level >= 6 ? [3, 0, 1, 2] : [0, 1, 2];
      const pick = order.find(s => h.ranks[s] < (s === 3 ? 2 : 4));
      if (pick === undefined || !rankUp(h, pick)) break;
    }
  }
  function baseSpot(team, lane) {
    const b = BASES[team], angle = (team === 0 ? -Math.PI / 4 : Math.PI * 3 / 4) + (lane - 1) * 0.7;
    return { x: b.x + Math.cos(angle) * 2.5, y: b.y + Math.sin(angle) * 2.5 };
  }
  function refreshStats(h) {
    const spec = HEROES[h.kind], before = h.maxHp || 0, manaBefore = h.maxMana || 0;
    let hp = spec.hp + spec.hpLevel * (h.level - 1), damage = spec.damage + spec.damageLevel * (h.level - 1), mana = spec.mana + 20 * (h.level - 1);
    let rate = 0, speed = 0, lifesteal = 0, armour = spec.range < 2.5 ? 0.1 : 0, cdr = 0, power = 1;
    if (h.ranks) {
      const extraRanks = Math.max(0, (h.ranks[0] - 1) + (h.ranks[1] - 1) + (h.ranks[2] - 1) + Math.max(0, h.ranks[3] - 1));
      power += extraRanks * 0.06;
    }
    for (const id of h.items) {
      const item = ITEMS[id];
      hp += item.hp || 0; damage += item.damage || 0; mana += item.mana || 0; rate += item.rate || 0; speed += item.speed || 0;
      lifesteal += item.lifesteal || 0; armour += item.armour || 0; cdr += item.cdr || 0; power += item.power || 0;
    }
    Object.assign(h, { maxHp: hp, damage, maxMana: mana, rate: spec.rate * (1 + rate), speed: spec.speed + speed, range: spec.range, lifesteal, armour: Math.min(0.4, armour), cdr: Math.min(0.4, cdr), power });
    if (h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + Math.max(0, h.maxHp - before));
    h.mana = Math.min(h.maxMana, (h.mana || 0) + Math.max(0, h.maxMana - manaBefore));
  }
  const xpNeed = level => 100 + 55 * level;

  function attachGetters(state) {
    Object.defineProperties(state, {
      player: { get() { return playerHero(this); }, configurable: true },
      towers: { get() { return this.units.filter(u => u.type === 'tower'); }, configurable: true }
    });
    return state;
  }

  function newGame(seed = 'bannerfall', heroKind = 'warden', difficulty = 'normal') {
    seed = String(seed);
    if (!HEROES[heroKind]) heroKind = 'warden';
    if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
    const state = {
      version: 1, seed, heroKind, difficulty, time: 0, tick: 0, rng: hash(seed) || 1, status: 'play', nextId: 1,
      units: [], effects: [], projectiles: [], wave: 0, nextWave: WAVE_FIRST, kills: [0, 0], buff: [0, 0], colossusTimer: COLOSSUS_AT,
      camps: CAMPS.map(() => ({ respawn: 0 })), log: [], playerId: 0, endTime: 0, calls: [null, null]
    };
    mapFor(seed);
    // The player takes mid; the other heroes are dealt from the rest of the roster.
    const others = HERO_KINDS.filter(kind => kind !== heroKind);
    const bDrop = hash(seed + ':b') % others.length;
    const blueAllies = others.filter((_, i) => i !== bDrop);
    const rivals = HERO_KINDS.filter((_, i) => i !== hash(seed) % 4);
    const blue = [blueAllies[0], heroKind, blueAllies[1]];
    for (let lane = 0; lane < 3; lane++) {
      const h = makeHero(state, blue[lane], 0, lane, lane === 1);
      state.units.push(h);
      if (h.player) state.playerId = h.id;
    }
    for (let lane = 0; lane < 3; lane++) state.units.push(makeHero(state, rivals[(lane + hash(seed + 'r')) % 3], 1, lane, false));
    for (let team = 0; team < 2; team++) {
      for (let lane = 0; lane < 3; lane++) for (const [order, along] of TOWER_ALONG.entries()) {
        const p = lanePoint(lane, team === 0 ? along : LANE_LENGTHS[lane] - along);
        state.units.push(makeUnit(state, 'tower', team, p.x, p.y, { lane, order, r: 1, hp: order ? 4000 : 3000, maxHp: order ? 4000 : 3000, range: 7, sight: 10, rate: 0.85, streak: 0 }));
      }
      const b = BASES[team];
      state.units.push(makeUnit(state, 'banner', team, b.x, b.y, { r: 1.4, hp: 9000, maxHp: 9000, range: 7, sight: 12, rate: 0.75, streak: 0 }));
    }
    for (const [i] of CAMPS.entries()) spawnCamp(state, i);
    return attachGetters(state);
  }
  function spawnCamp(state, i) {
    const camp = CAMPS[i];
    for (const dx of [-1, 1]) {
      state.units.push(makeUnit(state, 'beast', 2, camp.x + dx, camp.y, { camp: i, homeX: camp.x + dx, homeY: camp.y, r: 0.6, hp: 380, maxHp: 380, damage: 22, range: 1.5, rate: 0.8, speed: 4.5, sight: 0, aggro: null }));
    }
  }

  const unitById = (state, id) => state.units.find(u => u.id === id) || null;
  const playerHero = state => unitById(state, state.playerId);
  const heroes = (state, team) => state.units.filter(u => u.type === 'hero' && (team === undefined || u.team === team));
  const atBase = (u, slack = 0) => dist(u, BASES[u.team]) < BASE_RADIUS + slack;
  const minute = state => state.time / 60;

  // Inner towers wait for the outer one in their lane; the banner waits for an inner tower.
  // Worked out once per step (and again when a tower falls), since targeting asks constantly.
  const guard = { state: null, tick: -1, ids: new Set() };
  function isProtected(state, u) {
    if (u.type !== 'tower' && u.type !== 'banner') return false;
    if (guard.state !== state || guard.tick !== state.tick) {
      guard.state = state;
      guard.tick = state.tick;
      guard.ids.clear();
      const standing = state.units.filter(t => t.type === 'tower' && alive(t));
      for (const t of state.units) {
        if (t.type === 'tower' && t.order === 1 && standing.some(o => o.team === t.team && o.lane === t.lane && o.order === 0)) guard.ids.add(t.id);
        if (t.type === 'banner' && standing.filter(o => o.team === t.team && o.order === 1).length === 3) guard.ids.add(t.id);
      }
    }
    return guard.ids.has(u.id);
  }
  const structure = u => u.type === 'tower' || u.type === 'banner';
  // What a unit of this team may pick as a target on its own.
  function targetable(state, u, team, neutral = false) {
    if (!alive(u) || u.team === team || (u.team === 2 && !neutral) || u.invisible > 0) return false;
    if (u.type === 'colossus' && u.sleeping) return false;
    if (structure(u) && isProtected(state, u)) return false;
    return true;
  }
  function nearestFoe(state, from, range, filter) {
    let best = null, bestD = range;
    for (const u of state.units) {
      if (Math.abs(u.x - from.x) > bestD + 1.6 || Math.abs(u.y - from.y) > bestD + 1.6) continue;
      if (!targetable(state, u, from.team) || (filter && !filter(u))) continue;
      const d = dist(from, u) - u.r;
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  function speedOf(u) {
    let speed = u.speed * (1 - (u.slowTime > 0 ? u.slow : 0));
    if (u.haste > 0) speed *= 1.4;
    return speed;
  }
  function slide(state, map, u, dx, dy) {
    const r = Math.min(0.4, u.r * 0.6);
    const free = (x, y) => !blocked(state, map, x - r, y - r, u.team) && !blocked(state, map, x + r, y - r, u.team) && !blocked(state, map, x - r, y + r, u.team) && !blocked(state, map, x + r, y + r, u.team);
    if (free(u.x + dx, u.y)) u.x += dx;
    if (free(u.x, u.y + dy)) u.y += dy;
  }
  // Walk toward a point, around trees when needed. Returns true on arrival.
  function moveToward(state, map, u, gx, gy, close = 0.15) {
    const d = Math.hypot(gx - u.x, gy - u.y);
    if (d <= close) return true;
    if (u.root > 0 || u.stun > 0) return false;
    let tx = gx, ty = gy;
    if (u._repath > 0 && Math.abs(gx - u._gx) + Math.abs(gy - u._gy) < 0.6 && u._via) {
      u._repath--;
      tx = u._via.x;
      ty = u._via.y;
    } else if (u._repath > 0 && Math.abs(gx - u._gx) + Math.abs(gy - u._gy) < 0.6 && !u._via) {
      u._repath--;
    } else {
      u._repath = 5;
      u._gx = gx;
      u._gy = gy;
      u._via = !clearLine(state, map, u.x, u.y, gx, gy, u.team) ? pathStep(state, map, u, gx, gy) : null;
      if (u._via) { tx = u._via.x; ty = u._via.y; }
    }
    const length = Math.hypot(tx - u.x, ty - u.y) || 1, stride = Math.min(d - close * 0.5, speedOf(u) * STEP);
    slide(state, map, u, (tx - u.x) / length * stride, (ty - u.y) / length * stride);
    if (Math.abs(tx - u.x) > 0.05) u.facing = tx < u.x ? -1 : 1;
    u.moving = true;
    return false;
  }

  // --- Damage, death and rewards
  function emit(state, events, event) {
    events.push(event);
    if (event.log) {
      state.log.push({ text: event.log, team: event.logTeam ?? event.team ?? -1, time: state.time });
      if (state.log.length > 8) state.log.shift();
    }
  }
  function teamDamage(state, source) {
    let mult = 1;
    if (source.type === 'hero' && source.team === 1) mult *= DIFFICULTIES[state.difficulty].damage;
    if (source.team < 2 && state.buff[source.team] > 0) mult *= source.type === 'minion' ? 1.4 : source.type === 'hero' ? 1.15 : 1;
    return mult;
  }
  function hurt(state, target, amount, source, events, { attack = false, ability = false } = {}) {
    if (!alive(target) || amount <= 0) return 0;
    if (structure(target) && isProtected(state, target)) return 0;
    let dealt = amount * (source ? teamDamage(state, source) : 1);
    if (ability && source && source.power) dealt *= source.power;
    if (target.armour) dealt *= 1 - target.armour;
    if (target.shieldTime > 0 && target.shield > 0) {
      const absorbed = Math.min(target.shield, dealt);
      target.shield -= absorbed;
      dealt -= absorbed;
    }
    target.hp -= dealt;
    target.flash = 0.15;
    if (target.recall > 0) target.recall = 0;
    if (source) {
      if (target.type === 'hero' && source.type === 'hero') {
        target.damagedBy[source.id] = state.time;
        // Hurting a hero calls that hero's towers and minions onto the attacker.
        state.calls[target.team] = { id: source.id, until: state.time + 2.5, x: target.x, y: target.y };
      }
      if (target.team === 2 && source.type === 'hero') target.aggro = source.id;
      if (attack && source.lifesteal) source.hp = Math.min(source.maxHp, source.hp + dealt * source.lifesteal);
      if (source.type === 'hero' && source.invisible > 0) source.invisible = 0;
    }
    const playerId = state.playerId;
    if (source?.id === playerId || target.id === playerId || (target.type === 'hero' && source?.type === 'hero')) {
      emit(state, events, { type: 'hit', x: target.x, y: target.y, amount: Math.round(dealt), target: target.id, source: source?.id ?? 0, ability });
    }
    if (target.hp <= 0) kill(state, target, source, events);
    return dealt;
  }
  function giveGold(state, h, amount) {
    if (h.team === 1) amount *= DIFFICULTIES[state.difficulty].gold;
    h.gold += amount;
  }
  function giveXp(state, h, amount, events) {
    if (h.level >= 10 || h.dead > 0) return;
    h.xp += amount;
    while (h.level < 10 && h.xp >= xpNeed(h.level)) {
      h.xp -= xpNeed(h.level);
      h.level++;
      h.skillPoints = (h.skillPoints || 0) + 1;
      autoRankHero(h);
      refreshStats(h);
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.1);
      emit(state, events, { type: 'level', id: h.id, level: h.level, x: h.x, y: h.y });
    }
    if (h.level >= 10) h.xp = 0;
  }
  function shareXp(state, around, team, amount, events) {
    for (const h of heroes(state, team)) if (h.dead === 0 && dist(h, around) < 12) giveXp(state, h, amount, events);
  }
  function kill(state, target, source, events) {
    target.hp = 0;
    const killer = source && source.type === 'hero' ? source : null, foeTeam = 1 - target.team;
    if (target.type === 'hero') {
      target.deaths++;
      target.dead = 5 + 1.6 * target.level + Math.max(0, minute(state) - 10) * 0.8;
      target.recall = 0;
      target.order = null;
      target.dash = null;
      state.kills[foeTeam]++;
      // The last hero to hurt the victim within eight seconds takes the kill.
      const recent = Object.entries(target.damagedBy).filter(([, t]) => state.time - t < 8).map(([id]) => unitById(state, Number(id))).filter(Boolean);
      const credited = killer || recent.sort((a, b) => target.damagedBy[b.id] - target.damagedBy[a.id])[0] || null;
      if (credited) {
        credited.kills++;
        credited.streak++;
        giveGold(state, credited, 250 + 60 * Math.min(4, target.streak));
      }
      for (const h of recent) if (h !== credited) { h.assists++; giveGold(state, h, 90); }
      target.streak = 0;
      target.damagedBy = {};
      shareXp(state, target, foeTeam, 100 + 25 * target.level, events);
      const name = HEROES[target.kind].name;
      emit(state, events, { type: 'heroKill', victim: target.id, killer: credited?.id ?? 0, team: foeTeam, x: target.x, y: target.y,
        log: credited ? `${HEROES[credited.kind].name} (${TEAM_NAMES[credited.team]}) took down ${name} (${TEAM_NAMES[target.team]}).` : `${name} (${TEAM_NAMES[target.team]}) fell.` });
    } else if (target.type === 'minion') {
      const spec = MINIONS[target.kind];
      if (killer) { giveGold(state, killer, spec.gold); killer.cs++; if (killer.player) emit(state, events, { type: 'gold', amount: spec.gold, x: target.x, y: target.y }); }
      shareXp(state, target, foeTeam, spec.xp, events);
      emit(state, events, { type: 'minionDown', x: target.x, y: target.y, team: target.team });
    } else if (target.type === 'tower') {
      guard.tick = -1;
      for (const h of heroes(state, foeTeam)) giveGold(state, h, 150);
      if (killer) giveGold(state, killer, 100);
      shareXp(state, target, foeTeam, 120, events);
      emit(state, events, { type: 'towerDown', id: target.id, team: target.team, logTeam: foeTeam, lane: target.lane, x: target.x, y: target.y,
        log: `${TEAM_NAMES[foeTeam]} destroyed the ${TEAM_NAMES[target.team].toLowerCase()} ${target.order ? 'inner' : 'outer'} ${LANE_NAMES[target.lane]} tower.` });
    } else if (target.type === 'banner') {
      state.status = target.team === 0 ? 'lost' : 'won';
      state.endTime = state.time;
      emit(state, events, { type: target.team === 0 ? 'defeat' : 'victory', x: target.x, y: target.y, log: `The ${TEAM_NAMES[target.team].toLowerCase()} banner burned.` });
    } else if (target.type === 'beast') {
      const taker = killer || nearestHero(state, target, 12);
      if (taker) { giveGold(state, taker, 45); giveXp(state, taker, 60, events); if (taker.player) emit(state, events, { type: 'gold', amount: 45, x: target.x, y: target.y }); }
      emit(state, events, { type: 'beastDown', x: target.x, y: target.y });
    } else if (target.type === 'colossus') {
      const taker = killer || nearestHero(state, target, 14);
      if (taker) {
        const team = taker.team;
        state.buff[team] = 100;
        for (const h of heroes(state, team)) { giveGold(state, h, 120); giveXp(state, h, 150, events); }
        for (const m of state.units) if (m.type === 'minion' && m.team === team && alive(m)) { m.maxHp *= 1.4; m.hp *= 1.4; }
        emit(state, events, { type: 'colossusDown', team, x: target.x, y: target.y, log: `${TEAM_NAMES[team]} slew the Colossus. Their minions surge.` });
      }
      state.colossusTimer = COLOSSUS_RESPAWN;
    }
  }
  function nearestHero(state, from, range) {
    let best = null, bestD = range;
    for (const h of heroes(state)) if (h.dead === 0 && dist(h, from) < bestD) { bestD = dist(h, from); best = h; }
    return best;
  }

  // --- Attacks and projectiles
  const inReach = (u, target, extra = 0) => dist(u, target) - target.r - u.r * 0.5 <= u.range + extra;
  function swing(state, u, target, events) {
    let damage = u.damage;
    if (u.type === 'hero') {
      if (u.empower > 0) { damage *= 1.6; u.empower = 0; }
      if (u.invisible > 0) { damage *= 1.6; u.invisible = 0; }
      u.cd = 1 / (u.rate * (u.venom > 0 ? 1.25 : 1));
    } else u.cd = 1 / u.rate;
    if (u.type === 'minion' && u.kind === 'siege' && structure(target)) damage *= 1.8;
    // Structures shrug off early pushes; late waves hit them harder and harder.
    if (u.type === 'minion' && structure(target)) damage *= 0.6 + minute(state) * 0.07 + (state.buff[u.team] > 0 ? 0.3 : 0);
    if (u.type === 'hero' && structure(target)) damage *= 0.55 + Math.min(0.7, minute(state) * 0.04);
    u.facing = target.x < u.x ? -1 : 1;
    u.anim = 0.2;
    if (u.range >= 3) {
      const kind = u.type === 'tower' || u.type === 'banner' ? 'shell' : u.type === 'hero' ? 'arrow' : u.kind === 'siege' ? 'shell' : 'bolt';
      state.projectiles.push({ kind, x: u.x, y: u.y - (structure(u) ? 1 : 0.2), target: target.id, source: u.id, team: u.team, damage, speed: kind === 'shell' ? 20 : 26, venom: u.venom > 0 });
      if (u.type !== 'minion') emit(state, events, { type: 'shoot', id: u.id, kind, x: u.x, y: u.y });
    } else {
      landHit(state, u, target, damage, u.venom > 0, events);
      if (u.type === 'hero' || u.type === 'beast' || u.type === 'colossus') emit(state, events, { type: 'strike', id: u.id, x: target.x, y: target.y });
    }
  }
  function landHit(state, source, target, damage, venom, events) {
    if (structure(source)) {
      // Towers break early minions in a few shots while late/Colossus-buffed minions endure longer; heroes take escalating shots.
      if (target.type === 'minion') damage = MINIONS[target.kind].hp * (target.kind === 'siege' ? 0.2 : 0.42);
      else {
        source.streak = source.lastTarget === target.id ? source.streak + 1 : 0;
        source.lastTarget = target.id;
        damage = (source.type === 'banner' ? 90 : 105) * (1 + minute(state) * 0.04) * Math.min(2, 1 + source.streak * 0.3);
      }
    }
    hurt(state, target, damage, source, events, { attack: true });
    if (venom && target.type !== 'tower' && target.type !== 'banner') {
      target.poison = Math.max(target.poison, 12 + 3 * (source.level || 1));
      target.poisonTime = 3;
      target.poisonFrom = source.id;
    }
  }
  function stepProjectiles(state, events) {
    for (const p of state.projectiles) {
      const target = unitById(state, p.target);
      if (!target || !alive(target)) { p.done = true; continue; }
      const d = Math.hypot(target.x - p.x, target.y - p.y), stride = p.speed * STEP;
      if (d <= stride + 0.3) {
        p.done = true;
        const source = unitById(state, p.source) || { id: p.source, team: p.team, type: 'gone', damage: p.damage };
        landHit(state, source, target, p.damage, p.venom, events);
      } else {
        p.x += (target.x - p.x) / d * stride;
        p.y += (target.y - p.y) / d * stride;
      }
    }
    state.projectiles = state.projectiles.filter(p => !p.done);
  }

  // --- Abilities
  // Abilities hit enemies and neutral beasts alike, but never structures.
  const foesIn = (state, team, x, y, r) => state.units.filter(u => alive(u) && u.team !== team && !structure(u) &&
    !(u.type === 'hero' && u.dead > 0) && Math.hypot(u.x - x, u.y - y) - u.r <= r);
  const abilityDamage = (h, base, perLevel) => base + perLevel * h.level;
  function aimPoint(h, x, y, range) {
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(d, range);
    return { x: h.x + dx / d * reach, y: h.y + dy / d * reach, dx: dx / d, dy: dy / d };
  }
  function canCast(h, slot) {
    const spec = HEROES[h.kind].abilities[slot];
    return Boolean(spec) && h.dead === 0 && h.stun <= 0 && h.cooldowns[slot] <= 0 && h.mana >= spec.mana && (slot < 3 || h.level >= 6);
  }
  function cast(state, map, h, slot, x, y, events) {
    if (!canCast(h, slot)) return false;
    const spec = HEROES[h.kind].abilities[slot];
    if (!Number.isFinite(x) || !Number.isFinite(y)) { x = h.x + h.facing * 3; y = h.y; }
    const aim = aimPoint(h, x, y, spec.range || 0.01);
    const done = CASTS[h.kind][slot](state, map, h, aim, events);
    if (done === false) return false;
    h.mana -= spec.mana;
    h.cooldowns[slot] = spec.cooldown * (1 - h.cdr) * (h.refund || 1);
    h.refund = 0;
    h.recall = 0;
    if (h.kind !== 'shade' || slot !== 1) h.invisible = 0;
    if (Math.abs(aim.x - h.x) > 0.1) h.facing = aim.x < h.x ? -1 : 1;
    emit(state, events, { type: 'cast', id: h.id, kind: h.kind, slot, x: aim.x, y: aim.y, team: h.team });
    return true;
  }
  function stunFoes(list, seconds) { for (const u of list) if (u.type !== 'tower' && u.type !== 'banner') u.stun = Math.max(u.stun, seconds); }
  function slowFoe(u, amount, seconds) { u.slow = Math.max(u.slowTime > 0 ? u.slow : 0, amount); u.slowTime = Math.max(u.slowTime, seconds); }
  function blinkTo(state, map, h, aim) {
    for (let t = 1; t >= 0; t -= 0.1) {
      const x = h.x + (aim.x - h.x) * t, y = h.y + (aim.y - h.y) * t;
      if (!blocked(state, map, x, y, h.team)) { h.x = x; h.y = y; return; }
    }
  }
  const CASTS = {
    warden: [
      (state, map, h, aim, events) => {
        const hit = foesIn(state, h.team, h.x + aim.dx * 1.2, h.y + aim.dy * 1.2, 2.2);
        for (const u of hit) hurt(state, u, abilityDamage(h, 65, 22), h, events, { ability: true });
        stunFoes(hit, 1.0);
      },
      (state, map, h) => {
        h.shield = 135 + 34 * h.level;
        h.shieldTime = 4;
        for (const u of foesIn(state, h.team, h.x, h.y, 4.5)) {
          if (u.type === 'hero') { u.taunt = h.id; u.tauntTime = 1.4; }
          else if (u.type === 'minion') u.target = h.id;
        }
      },
      (state, map, h, aim) => { h.dash = { x: aim.x, y: aim.y, speed: 20, hit: 'charge', time: 0.6 }; },
      (state, map, h, aim, events) => {
        const tiles = [], px = -aim.dy, py = aim.dx;
        for (let s = -3.5; s <= 3.5; s += 0.5) {
          const x = aim.x + px * s, y = aim.y + py * s, i = Math.floor(y) * WIDTH + Math.floor(x);
          if (walkableTile(tileAt(map, x, y)) && !tiles.includes(i)) tiles.push(i);
        }
        state.effects.push({ kind: 'wall', team: h.team, owner: h.id, x: aim.x, y: aim.y, r: 3.5, dx: px, dy: py, tiles, ttl: 5, time: 0 });
        for (const u of foesIn(state, h.team, aim.x, aim.y, 3.8)) {
          const across = Math.abs((u.x - aim.x) * aim.dx + (u.y - aim.y) * aim.dy);
          if (across < 1.6) { hurt(state, u, abilityDamage(h, 70, 20), h, events, { ability: true }); slowFoe(u, 0.4, 1.5); }
        }
      }
    ],
    ranger: [
      (state, map, h, aim, events) => {
        const length = HEROES.ranger.abilities[0].range;
        for (const u of foesIn(state, h.team, h.x + aim.dx * length / 2, h.y + aim.dy * length / 2, length / 2 + 1)) {
          const along = (u.x - h.x) * aim.dx + (u.y - h.y) * aim.dy, across = Math.abs((u.x - h.x) * aim.dy - (u.y - h.y) * aim.dx);
          if (along > 0 && along < length && across < 0.9 + u.r) hurt(state, u, abilityDamage(h, 50, 15), h, events, { ability: true });
        }
        state.effects.push({ kind: 'streak', team: h.team, x: h.x, y: h.y, dx: aim.dx, dy: aim.dy, r: length, ttl: 0.25, time: 0 });
      },
      (state, map, h, aim) => {
        const traps = state.effects.filter(e => e.kind === 'trap' && e.owner === h.id);
        if (traps.length >= 3) traps[0].ttl = 0;
        state.effects.push({ kind: 'trap', team: h.team, owner: h.id, x: aim.x, y: aim.y, r: 1.2, ttl: 25, time: 0 });
      },
      (state, map, h, aim) => { h.dash = { x: aim.x, y: aim.y, speed: 24, hit: null, time: 0.4 }; h.empower = 4; },
      (state, map, h, aim) => { state.effects.push({ kind: 'storm', team: h.team, owner: h.id, x: aim.x, y: aim.y, r: 4, ttl: 3, time: 0, pulse: 0 }); }
    ],
    ember: [
      (state, map, h, aim) => { state.effects.push({ kind: 'fireball', team: h.team, owner: h.id, x: h.x, y: h.y, tx: aim.x, ty: aim.y, r: 2, ttl: 2, time: 0 }); },
      (state, map, h, aim) => { state.effects.push({ kind: 'frost', team: h.team, owner: h.id, x: aim.x, y: aim.y, r: 3.5, ttl: 4, time: 0, pulse: 0 }); },
      (state, map, h, aim) => { blinkTo(state, map, h, aim); h.order = null; },
      (state, map, h, aim) => { state.effects.push({ kind: 'meteor', team: h.team, owner: h.id, x: aim.x, y: aim.y, r: 4, ttl: 1.2, time: 0 }); }
    ],
    shade: [
      (state, map, h, aim) => { h.dash = { x: aim.x, y: aim.y, speed: 30, hit: 'step', time: 0.4 }; },
      (state, map, h) => { h.invisible = 3; h.haste = 3; },
      (state, map, h) => { h.venom = 5; },
      (state, map, h, aim, events) => {
        let target = null, best = 2.8;
        for (const u of state.units) {
          if (u.type !== 'hero' || !alive(u) || u.team === h.team || dist(u, h) > 5) continue;
          const d = Math.hypot(u.x - aim.x, u.y - aim.y);
          if (d < best) { best = d; target = u; }
        }
        if (!target) return false;
        const damage = abilityDamage(h, 140, 35) + (target.maxHp - target.hp) * 0.3;
        h.x = target.x - (target.x - h.x) / (dist(target, h) || 1) * 1.2;
        h.y = target.y - (target.y - h.y) / (dist(target, h) || 1) * 1.2;
        hurt(state, target, damage, h, events, { ability: true });
        if (!alive(target)) h.refund = 0.3;
      }
    ]
  };
  function stepDash(state, map, h, events) {
    const dash = h.dash;
    dash.time -= STEP;
    const before = { x: h.x, y: h.y }, d = Math.hypot(dash.x - h.x, dash.y - h.y), stride = Math.min(d, dash.speed * STEP);
    if (d > 0.05) slide(state, map, h, (dash.x - h.x) / d * stride, (dash.y - h.y) / d * stride);
    const stuck = Math.hypot(h.x - before.x, h.y - before.y) < stride * 0.3;
    if (dash.hit === 'charge') {
      const foe = foesIn(state, h.team, h.x, h.y, 1.1)[0];
      if (foe) {
        hurt(state, foe, abilityDamage(h, 45, 16), h, events, { ability: true });
        stunFoes([foe], 0.5);
        h.dash = null;
        return;
      }
    }
    if (d <= 0.1 || stuck || dash.time <= 0) {
      if (dash.hit === 'step') for (const u of foesIn(state, h.team, h.x, h.y, 1.9)) hurt(state, u, abilityDamage(h, 60, 22), h, events, { ability: true });
      h.dash = null;
    }
  }
  function stepEffects(state, map, events) {
    for (const e of state.effects) {
      e.time += STEP;
      e.ttl -= STEP;
      const owner = unitById(state, e.owner) || { id: e.owner, team: e.team, type: 'gone', level: 1, power: 1 };
      if (e.kind === 'trap' && e.time > 0.5) {
        const caught = foesIn(state, e.team, e.x, e.y, e.r).find(u => u.type === 'hero' || u.type === 'minion');
        if (caught) {
          caught.root = Math.max(caught.root, 1.6);
          hurt(state, caught, abilityDamage(owner, 50, 15), owner, events, { ability: true });
          emit(state, events, { type: 'snap', x: e.x, y: e.y });
          e.ttl = 0;
        }
      } else if (e.kind === 'storm' || e.kind === 'frost') {
        e.pulse -= STEP;
        if (e.kind === 'frost') for (const u of foesIn(state, e.team, e.x, e.y, e.r)) slowFoe(u, 0.45, 0.3);
        if (e.pulse <= 0) {
          e.pulse = 0.5;
          for (const u of foesIn(state, e.team, e.x, e.y, e.r)) {
            hurt(state, u, e.kind === 'storm' ? abilityDamage(owner, 40, 12) : abilityDamage(owner, 10, 3), owner, events, { ability: true });
            if (e.kind === 'storm') slowFoe(u, 0.3, 1);
          }
        }
      } else if (e.kind === 'fireball') {
        const d = Math.hypot(e.tx - e.x, e.ty - e.y), stride = 20 * STEP;
        const touched = foesIn(state, e.team, e.x, e.y, 0.7)[0];
        if (touched || d <= stride) {
          for (const u of foesIn(state, e.team, e.x, e.y, e.r)) hurt(state, u, abilityDamage(owner, 52, 16), owner, events, { ability: true });
          emit(state, events, { type: 'burst', x: e.x, y: e.y, r: e.r, kind: 'fire' });
          e.ttl = 0;
        } else { e.x += (e.tx - e.x) / d * stride; e.y += (e.ty - e.y) / d * stride; }
      } else if (e.kind === 'meteor' && e.ttl <= 0) {
        const hit = foesIn(state, e.team, e.x, e.y, e.r);
        for (const u of hit) hurt(state, u, abilityDamage(owner, 175, 36), owner, events, { ability: true });
        stunFoes(hit, 1);
        emit(state, events, { type: 'burst', x: e.x, y: e.y, r: e.r, kind: 'meteor' });
      }
    }
    state.effects = state.effects.filter(e => e.ttl > 0);
  }

  // --- Shop and recall
  function buy(state, h, id, events) {
    const item = ITEMS[id];
    if (!item || h.dead > 0 || !atBase(h, 1) || h.gold < item.cost) return false;
    if (id !== 'potion' && h.items.length >= SLOTS) return false;
    h.gold -= item.cost;
    if (id === 'potion') h.potion = 8;
    else { h.items.push(id); refreshStats(h); }
    emit(state, events, { type: 'buy', id: h.id, item: id });
    return true;
  }
  function startRecall(state, h, events) {
    if (h.dead > 0 || h.recall > 0 || atBase(h)) return;
    h.recall = RECALL_TIME;
    h.order = null;
    emit(state, events, { type: 'recall', id: h.id });
  }

  // --- Waves, camps and the Colossus
  function spawnWave(state, events) {
    state.wave++;
    const m = minute(state), late = m >= 14;
    const kinds = ['melee', 'melee', 'melee', 'ranged', 'ranged'];
    if (state.wave % 3 === 0 || late) kinds.push('siege');
    if (late) kinds.push('siege', 'melee');
    for (let team = 0; team < 2; team++) for (let lane = 0; lane < 3; lane++) for (const [i, kind] of kinds.entries()) {
      const spec = MINIONS[kind], along = team === 0 ? 9 - i * 1.2 : LANE_LENGTHS[lane] - 9 + i * 1.2, p = lanePoint(lane, along);
      const boost = state.buff[team] > 0 ? 1.4 : 1, hp = spec.hp * (1 + 0.07 * m) * boost;
      state.units.push(makeUnit(state, 'minion', team, p.x, p.y, {
        kind, lane, r: spec.r, hp, maxHp: hp, damage: spec.damage * (1 + 0.06 * m), range: spec.range, rate: spec.rate, speed: spec.speed, sight: 6, along, cd: i * 0.1
      }));
    }
    emit(state, events, { type: 'wave', wave: state.wave });
  }
  function stepNeutrals(state, map, events) {
    for (const [i, camp] of state.camps.entries()) {
      if (camp.respawn > 0) { camp.respawn -= STEP; if (camp.respawn <= 0) spawnCamp(state, i); continue; }
      if (!state.units.some(u => u.type === 'beast' && u.camp === i && alive(u))) camp.respawn = CAMP_RESPAWN;
    }
    if (!state.units.some(u => u.type === 'colossus' && alive(u))) {
      state.colossusTimer -= STEP;
      if (state.colossusTimer <= 0) {
        state.units.push(makeUnit(state, 'colossus', 2, PIT.x, PIT.y, { homeX: PIT.x, homeY: PIT.y, r: 1.6, hp: 3400, maxHp: 3400, damage: 75, range: 2.6, rate: 0.45, speed: 3.6, sight: 0, aggro: null }));
        emit(state, events, { type: 'colossusUp', x: PIT.x, y: PIT.y, log: 'The Colossus has risen in the river pit.' });
      }
    }
    for (const u of state.units) {
      if ((u.type !== 'beast' && u.type !== 'colossus') || !alive(u)) continue;
      tickStatus(state, u, events);
      if (u.stun > 0) continue;
      const foe = u.aggro ? unitById(state, u.aggro) : null;
      const home = { x: u.homeX, y: u.homeY };
      if (!foe || !alive(foe) || dist(foe, home) > 9 || foe.invisible > 0) {
        // A beast that loses its attacker walks home, healing as it goes.
        if (u.aggro) u.resetting = true;
        u.aggro = null;
        if (u.resetting) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25 * STEP);
        if (moveToward(state, map, u, home.x, home.y, 0.3)) u.resetting = false;
        continue;
      }
      u.resetting = false;
      if (inReach(u, foe)) {
        if (u.cd <= 0) {
          if (u.type === 'colossus') {
            u.cd = 1 / u.rate;
            u.anim = 0.3;
            for (const v of state.units) if (alive(v) && v.team !== 2 && !structure(v) && dist(v, foe) < 2.8) hurt(state, v, u.damage, u, events);
            emit(state, events, { type: 'burst', x: foe.x, y: foe.y, r: 2.8, kind: 'slam' });
          } else swing(state, u, foe, events);
        }
      } else moveToward(state, map, u, foe.x, foe.y, u.range * 0.8);
    }
  }

  function tickStatus(state, u, events) {
    u.cd -= STEP;
    u.flash = Math.max(0, u.flash - STEP);
    u.anim = Math.max(0, u.anim - STEP);
    u.stun = Math.max(0, u.stun - STEP);
    u.root = Math.max(0, u.root - STEP);
    u.slowTime = Math.max(0, u.slowTime - STEP);
    u.shieldTime = Math.max(0, u.shieldTime - STEP);
    if (u.shieldTime === 0) u.shield = 0;
    u.moving = false;
    if (u.poisonTime > 0) {
      u.poisonTime -= STEP;
      hurt(state, u, u.poison * STEP, unitById(state, u.poisonFrom), events);
    }
  }

  // --- Minions and towers
  function laneDirection(u) { return u.team === 0 ? 1 : -1; }
  function stepMinion(state, map, m, events) {
    tickStatus(state, m, events);
    if (!alive(m) || m.stun > 0) return;
    let target = m.target ? unitById(state, m.target) : null;
    if (target && (!targetable(state, target, m.team) || dist(m, target) > 8)) target = m.target = null;
    const call = state.calls[m.team];
    if (call && call.until > state.time && dist(m, call) < 7) {
      const caller = unitById(state, call.id);
      if (caller && targetable(state, caller, m.team) && dist(m, caller) < 7) target = caller;
    }
    // Minions fight minions first, then structures, and turn on heroes only when nothing else is near.
    if (!target) {
      let bestMinion = null, bestMinionD = 5.5, bestStruct = null, bestStructD = 5.5, bestHero = null, bestHeroD = 4.5;
      for (const u of state.units) {
        if (Math.abs(u.x - m.x) > 7 || Math.abs(u.y - m.y) > 7) continue;
        if (!targetable(state, u, m.team)) continue;
        const d = dist(m, u) - u.r;
        if (u.type === 'minion' && d < bestMinionD) { bestMinionD = d; bestMinion = u; }
        else if (structure(u) && d < bestStructD) { bestStructD = d; bestStruct = u; }
        else if (u.type === 'hero' && d < bestHeroD) { bestHeroD = d; bestHero = u; }
      }
      target = bestMinion || bestStruct || bestHero;
    }
    if (target) {
      m.target = target.id;
      if (inReach(m, target)) { if (m.cd <= 0) swing(state, m, target, events); }
      else moveToward(state, map, m, target.x, target.y, m.range * 0.8);
    } else {
      const ahead = lanePoint(m.lane, laneProject(m.lane, m.x, m.y).along + laneDirection(m) * 2.5);
      moveToward(state, map, m, ahead.x, ahead.y, 0.05);
    }
  }
  function stepStructure(state, s, events) {
    tickStatus(state, s, events);
    if (!alive(s)) return;
    // A banner left alone mends itself, so it falls to a siege rather than one lucky push.
    if (s.type === 'banner' && s.hp < s.maxHp && state.tick % 30 === 0 && !state.units.some(u => u.team !== s.team && u.team !== 2 && alive(u) && !(u.type === 'hero' && u.dead > 0) && dist(u, s) < 12)) {
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.01);
    }
    let target = s.target ? unitById(state, s.target) : null;
    const valid = u => u && targetable(state, u, s.team) && inReach(s, u) && u.type !== 'beast' && u.type !== 'colossus';
    const call = state.calls[s.team], caller = call && call.until > state.time ? unitById(state, call.id) : null;
    if (valid(caller) && caller !== target) { target = caller; s.streak = 0; }
    if (!valid(target)) {
      target = nearestFoe(state, s, s.range, u => u.type === 'minion') || nearestFoe(state, s, s.range, u => u.type === 'hero');
      s.streak = 0;
    }
    s.target = target ? target.id : null;
    if (target && s.cd <= 0) swing(state, s, target, events);
  }

  // --- Heroes
  function stepHero(state, map, h, input, events) {
    if (h.dead > 0) {
      h.dead -= STEP;
      if (h.dead <= 0) {
        h.dead = 0;
        const spot = baseSpot(h.team, h.lane);
        Object.assign(h, { x: spot.x, y: spot.y, hp: h.maxHp, mana: h.maxMana, order: null, stun: 0, root: 0, slowTime: 0, poisonTime: 0, invisible: 0 });
        emit(state, events, { type: 'respawn', id: h.id });
      }
      return;
    }
    tickStatus(state, h, events);
    if (!alive(h)) return;
    for (let i = 0; i < 4; i++) h.cooldowns[i] = Math.max(0, h.cooldowns[i] - STEP);
    h.invisible = Math.max(0, h.invisible - STEP);
    h.haste = Math.max(0, h.haste - STEP);
    h.venom = Math.max(0, h.venom - STEP);
    h.empower = Math.max(0, h.empower - STEP);
    h.tauntTime = Math.max(0, h.tauntTime - STEP);
    h.mana = Math.min(h.maxMana, h.mana + STEP * (3 + h.level * 0.3));
    h.hp = Math.min(h.maxHp, h.hp + STEP * (1.5 + h.level * 0.2));
    giveGold(state, h, STEP * 1.6);
    if (atBase(h)) { h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.12 * STEP); h.mana = Math.min(h.maxMana, h.mana + h.maxMana * 0.12 * STEP); }
    if (h.potion > 0) { h.potion -= STEP; h.hp = Math.min(h.maxHp, h.hp + 32.5 * STEP); }

    const command = h.player && !input.auto ? input : think(state, map, h);
    if (h.player && input.auto && h.skillPoints > 0) autoRankHero(h);
    if (command.rankUp !== undefined) rankUp(h, command.rankUp);
    if (command.buy) buy(state, h, command.buy, events);
    if (command.order !== undefined) { h.order = command.order; if (h.order) h.recall = 0; }
    const direct = (command.moveX || command.moveY) && h.player;
    if (direct) { h.order = null; h.recall = 0; }
    if (command.cast) cast(state, map, h, command.cast.slot, command.cast.x, command.cast.y, events);
    if (command.recall) startRecall(state, h, events);

    if (h.recall > 0) {
      h.recall -= STEP;
      if (h.recall <= 0) {
        const spot = baseSpot(h.team, h.lane);
        h.x = spot.x; h.y = spot.y; h.recall = 0;
        emit(state, events, { type: 'recalled', id: h.id });
      }
      return;
    }
    if (h.stun > 0) return;
    if (h.dash) { stepDash(state, map, h, events); return; }
    if (direct) {
      const n = Math.hypot(command.moveX || 0, command.moveY || 0) || 1;
      moveToward(state, map, h, h.x + command.moveX / n * 2, h.y + command.moveY / n * 2, 0);
      return;
    }
    let order = h.order;
    if (h.tauntTime > 0) {
      const taunter = unitById(state, h.taunt);
      if (taunter && alive(taunter)) order = { kind: 'attack', id: taunter.id };
    }
    if (order && order.kind === 'attack') {
      const target = unitById(state, order.id);
      const allowed = target && alive(target) && target.team !== h.team && !(target.invisible > 0) && !(target.type === 'colossus' && target.sleeping) && !(structure(target) && isProtected(state, target));
      if (!allowed) { h.order = null; order = null; }
      else if (inReach(h, target)) { if (h.cd <= 0) swing(state, h, target, events); return; }
      else { moveToward(state, map, h, target.x, target.y, h.range * 0.6); return; }
    }
    if (order && order.kind === 'attackMove') {
      const foe = nearestFoe(state, h, 6);
      if (foe) {
        if (inReach(h, foe)) { if (h.cd <= 0) swing(state, h, foe, events); }
        else moveToward(state, map, h, foe.x, foe.y, h.range * 0.6);
        return;
      }
    }
    if (order && (order.kind === 'move' || order.kind === 'attackMove')) {
      if (moveToward(state, map, h, order.x, order.y, 0.25)) h.order = null;
      return;
    }
    // Idle heroes defend themselves against anything already in reach.
    const foe = nearestFoe(state, h, h.range + 0.4);
    if (foe && h.cd <= 0) swing(state, h, foe, events);
  }

  // --- AI
  function laneFront(state, team, lane) {
    let best = null, bestAlong = team === 0 ? -1 : Infinity;
    for (const m of state.units) {
      if (m.type !== 'minion' || m.team !== team || m.lane !== lane || !alive(m)) continue;
      const along = laneProject(lane, m.x, m.y).along;
      if (team === 0 ? along > bestAlong : along < bestAlong) { bestAlong = along; best = m; }
    }
    return best ? { unit: best, along: bestAlong } : null;
  }
  function holdPoint(state, team, lane) {
    // Advance the hold point as enemy towers in this lane fall so pushes do not reset to home base.
    const foeTowers = state.units.filter(t => t.type === 'tower' && t.team !== team && t.lane === lane && alive(t)).length;
    const len = LANE_LENGTHS[lane];
    if (foeTowers === 0) return lanePoint(lane, team === 0 ? len - 22 : 22);
    if (foeTowers === 1) return lanePoint(lane, len * 0.5);
    const towers = state.units.filter(t => t.type === 'tower' && t.team === team && t.lane === lane && alive(t)).sort((a, b) => a.order - b.order);
    const anchor = towers[0];
    if (!anchor) return { ...BASES[team] };
    const along = laneProject(lane, anchor.x, anchor.y).along + (team === 0 ? -2 : 2);
    return lanePoint(lane, along);
  }
  // Protected structures still shoot, so they count as danger even when they cannot be hurt.
  function enemyTowerNear(state, h, slack = 0.6) {
    return state.units.find(t => structure(t) && t.team !== h.team && alive(t) && dist(t, h) < t.range + t.r + slack) || null;
  }
  function think(state, map, h) {
    const brain = DIFFICULTIES[h.team === 1 ? state.difficulty : 'normal'];
    h.think -= STEP;
    const command = {};
    if (h.recall > 0) {
      if (nearestFoe(state, h, 6, u => u.type === 'hero')) command.order = { kind: 'move', ...BASES[h.team] };
      return command;
    }
    if (h.think > 0 && !(h.order && h.order.kind === 'attack' && !unitById(state, h.order.id))) return command;
    h.think = brain.think * (0.8 + random(state) * 0.4);

    if (atBase(h, 1)) {
      const next = BUILDS[h.kind][h.items.length];
      if (next && h.gold >= ITEMS[next].cost && h.items.length < SLOTS) { command.buy = next; return command; }
      if (h.hp < h.maxHp * 0.9 || h.mana < h.maxMana * 0.6) { command.order = null; return command; }
    }
    const hpRatio = h.hp / h.maxHp;
    const foeHeroes = state.units.filter(u => u.type === 'hero' && u.team !== h.team && alive(u) && u.invisible <= 0 && dist(u, h) < 9);
    const friends = state.units.filter(u => u.type === 'hero' && u.team === h.team && u !== h && alive(u) && dist(u, h) < 9);

    // Low on health: walk home, recalling once nobody is close.
    if (hpRatio < brain.retreat || (hpRatio < brain.retreat + 0.15 && foeHeroes.length > friends.length + 1)) {
      if (!nearestFoe(state, h, 8, u => u.type === 'hero' || structure(u)) && !atBase(h, 4)) { command.recall = true; command.order = null; }
      else {
        command.order = { kind: 'move', ...BASES[h.team] };
        if (foeHeroes.length) retreatCast(state, h, brain, foeHeroes[0], command);
      }
      return command;
    }
    // Shop when rich and the lane is quiet.
    const next = BUILDS[h.kind][h.items.length];
    if (next && h.gold >= ITEMS[next].cost + 350 && !foeHeroes.length && !atBase(h, 4) && random(state) < 0.3) { command.recall = true; command.order = null; return command; }

    const lane = minute(state) >= 10 ? groupLane(state, h.team) : h.lane;
    const tower = enemyTowerNear(state, h);
    const towerTarget = tower ? unitById(state, tower.target) : null;
    const unsafe = tower && (towerTarget === h || !state.units.some(m => m.type === 'minion' && m.team === h.team && alive(m) && dist(m, tower) < tower.range));

    // If an exposed enemy structure has minions tanking it, focus it down unless an enemy hero is right on top of us.
    const prey = foeHeroes.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (tower && !unsafe && !isProtected(state, tower) && (!towerTarget || towerTarget.type === 'minion')) {
      if (!prey || (dist(prey, h) > 3.5 && prey.hp / prey.maxHp > 0.25)) {
        command.order = { kind: 'attack', id: tower.id };
        return command;
      }
    }

    // Fight a hero when the trade looks good.
    if (prey) {
      const preyRatio = prey.hp / prey.maxHp, preyTower = enemyTowerNear(state, prey, 0.5);
      // Commit only with a real edge; never poke under an enemy tower (which draws tower aggro).
      const edge = preyRatio < hpRatio - 0.2 || preyRatio < 0.3 || friends.length > foeHeroes.length - 1 + (preyRatio > 0.6 ? 1 : 0);
      const good = edge && !tower && !(preyTower && (hpRatio < 0.6 || preyRatio > 0.25));
      if (good && !unsafe) {
        command.order = { kind: 'attack', id: prey.id };
        if (random(state) < brain.ability) fightCast(state, h, brain, prey, command);
        return command;
      }
      if (!unsafe && !tower && !preyTower && h.mana > h.maxMana * 0.45 && random(state) < brain.ability * 0.35) fightCast(state, h, brain, prey, command, false, true);
      if (dist(prey, h) < 5 && preyRatio > hpRatio + 0.2) {
        command.order = { kind: 'move', ...holdPoint(state, h.team, lane) };
        retreatCast(state, h, brain, prey, command);
        return command;
      }
    }
    if (unsafe) {
      const back = laneProject(lane, h.x, h.y).along + (h.team === 0 ? -5 : 5);
      command.order = { kind: 'move', ...lanePoint(lane, back) };
      return command;
    }
    // The Colossus, when the team is healthy and close enough to share it.
    const colossus = state.units.find(u => u.type === 'colossus' && alive(u));
    if (colossus && hpRatio > 0.6 && h.level >= 5 && dist(h, colossus) < 24) {
      const partners = state.units.filter(u => u.type === 'hero' && u.team === h.team && alive(u) && dist(u, colossus) < 24 && u.hp > u.maxHp * 0.5).length;
      if (partners >= 2 || colossus.aggro && unitById(state, colossus.aggro)?.team === h.team) {
        command.order = { kind: 'attack', id: colossus.id };
        if (random(state) < brain.ability * 0.5) fightCast(state, h, brain, colossus, command);
        return command;
      }
    }
    // Burn exposed structures while minions soak the shots.
    if (tower && !unsafe && !isProtected(state, tower) && (!towerTarget || towerTarget.type === 'minion')) { command.order = { kind: 'attack', id: tower.id }; return command; }
    // Farm: last hits first, then the closest minion. A lone hero backs off a whole wave.
    const minions = state.units.filter(u => u.type === 'minion' && u.team !== h.team && alive(u) && dist(u, h) < h.range + 5);
    const cover = state.units.some(u => u.type === 'minion' && u.team === h.team && alive(u) && dist(u, h) < 7);
    if (minions.length >= 3 && !cover && hpRatio < 0.85) {
      command.order = { kind: 'move', ...holdPoint(state, h.team, lane) };
      return command;
    }
    if (minions.length) {
      const ripe = brain.lastHit ? minions.filter(m => m.hp <= h.damage * 1.05).sort((a, b) => dist(a, h) - dist(b, h))[0] : null;
      const target = ripe || minions.sort((a, b) => dist(a, h) - dist(b, h))[0];
      command.order = { kind: 'attack', id: target.id };
      if (minions.length >= 4 && !tower && h.mana > h.maxMana * 0.7 && random(state) < brain.ability * 0.25) fightCast(state, h, brain, target, command, true);
      return command;
    }
    // Neutral camps on the way, for the junglers' gold, when the lane is empty.
    const front = laneFront(state, h.team, lane);
    if (!front && hpRatio > 0.7) {
      const beast = state.units.find(u => u.type === 'beast' && alive(u) && dist(u, h) < 10);
      if (beast) { command.order = { kind: 'attack', id: beast.id }; return command; }
    }
    // Walk with the wave, a little behind its front.
    const spot = front ? lanePoint(lane, front.along + (h.team === 0 ? -2.2 : 2.2)) : holdPoint(state, h.team, lane);
    command.order = dist(spot, h) > 1.2 ? { kind: 'move', ...spot } : null;
    return command;
  }
  function groupLane(state, team) {
    // Late on, everyone pushes the lane with the fewest enemy towers left, favouring mid.
    let best = 1, bestScore = Infinity;
    for (let lane = 0; lane < 3; lane++) {
      const left = state.units.filter(t => t.type === 'tower' && t.team !== team && t.lane === lane && alive(t)).length;
      const score = left + (lane === 1 ? -0.5 : 0);
      if (score < bestScore) { bestScore = score; best = lane; }
    }
    return best;
  }
  function aimAt(state, brain, target) {
    const error = brain.aim;
    return { x: target.x + (random(state) - 0.5) * error * 2, y: target.y + (random(state) - 0.5) * error * 2 };
  }
  // poke: safe trades in lane; melee heroes use shields or gap-closers when healthy.
  function fightCast(state, h, brain, target, command, farming = false, poke = false) {
    const d = dist(h, target), aim = aimAt(state, brain, target), enemyHero = target.type === 'hero';
    const ready = slot => canCast(h, slot) && (!poke || slot < 3);
    const choose = (slot, x = aim.x, y = aim.y) => { command.cast = { slot, x, y }; };
    switch (h.kind) {
      case 'warden':
        if (enemyHero && ready(3) && target.hp / target.maxHp < 0.45 && d < 6) {
          const away = { x: target.x + (target.x - h.x) / (d || 1) * 1.5, y: target.y + (target.y - h.y) / (d || 1) * 1.5 };
          return choose(3, away.x, away.y);
        }
        if (ready(0) && d < 2.6) return choose(0);
        if (enemyHero && ready(2) && d > 2.5 && d < 6.5 && (!poke || h.hp > h.maxHp * 0.65)) return choose(2);
        if (ready(1) && d < 5.5 && (enemyHero || farming)) return choose(1);
        break;
      case 'ranger':
        if (enemyHero && ready(3) && d < 10) return choose(3);
        if (ready(0) && d < 11) return choose(0);
        if (enemyHero && ready(1) && d < 7) return choose(1);
        break;
      case 'ember':
        if (enemyHero && ready(3) && d < 10.5) return choose(3);
        if (ready(0) && d < 9) return choose(0);
        if (ready(1) && d < 8 && (enemyHero || farming)) return choose(1);
        break;
      case 'shade':
        if (enemyHero && ready(3) && d < 4.5 && target.hp / target.maxHp < 0.5) return choose(3, target.x, target.y);
        if (enemyHero && ready(1) && d > 3 && d < 8) return choose(1);
        if (ready(2) && d < 3) return choose(2);
        if (ready(0) && d < 5 && (enemyHero || farming) && (!poke || h.hp > h.maxHp * 0.7)) return choose(0);
        break;
    }
  }
  function retreatCast(state, h, brain, threat, command) {
    if (random(state) > brain.ability) return;
    const away = { x: h.x - (threat.x - h.x), y: h.y - (threat.y - h.y) }, home = BASES[h.team];
    const toward = { x: h.x + (home.x - h.x) / (dist(home, h) || 1) * 6, y: h.y + (home.y - h.y) / (dist(home, h) || 1) * 6 };
    if (h.kind === 'ember' && canCast(h, 2) && dist(threat, h) < 5) command.cast = { slot: 2, ...toward };
    else if (h.kind === 'ranger' && canCast(h, 2) && dist(threat, h) < 4) command.cast = { slot: 2, ...toward };
    else if (h.kind === 'ranger' && canCast(h, 1) && dist(threat, h) < 5) command.cast = { slot: 1, x: (h.x + threat.x) / 2, y: (h.y + threat.y) / 2 };
    else if (h.kind === 'shade' && canCast(h, 1)) command.cast = { slot: 1, ...away };
    else if (h.kind === 'warden' && canCast(h, 0) && dist(threat, h) < 2.4) command.cast = { slot: 0, x: threat.x, y: threat.y };
    else if (h.kind === 'ember' && canCast(h, 1) && dist(threat, h) < 6) command.cast = { slot: 1, x: threat.x, y: threat.y };
  }

  // --- Separation keeps crowds from stacking on one spot.
  function separate(state, map) {
    const movers = state.units.filter(u => alive(u) && (u.type === 'minion' || u.type === 'hero') && !(u.type === 'hero' && u.dead > 0));
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const a = movers[i], b = movers[j];
      if (a.team !== b.team) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > 1.1 || Math.abs(dy) > 1.1) continue;
      const d = Math.hypot(dx, dy), want = (a.r + b.r) * 0.85;
      if (d >= want || d < 0.001) continue;
      const push = (want - d) * 0.25, nx = dx / d * push, ny = dy / d * push;
      if (a.type === 'minion') slide(state, map, a, -nx, -ny);
      if (b.type === 'minion') slide(state, map, b, nx, ny);
    }
  }

  function step(state, input = {}, dt = 1 / 60) {
    const events = [];
    if (state.status !== 'play') return events;
    const prevStep = STEP;
    STEP = dt;
    const map = mapFor(state.seed);
    state.tick++;
    state.time = dt === 1 / 60 ? state.tick * STEP : state.time + dt;
    state.hasWall = state.effects.some(e => e.kind === 'wall');
    for (let team = 0; team < 2; team++) state.buff[team] = Math.max(0, state.buff[team] - STEP);
    state.nextWave -= STEP;
    if (state.nextWave <= 0) { spawnWave(state, events); state.nextWave += WAVE_EVERY; }

    for (const u of state.units) if (u.type === 'hero') stepHero(state, map, u, u.player ? input : {}, events);
    for (const u of state.units) if (u.type === 'minion' && alive(u)) stepMinion(state, map, u, events);
    for (const u of state.units) if (structure(u)) stepStructure(state, u, events);
    stepNeutrals(state, map, events);
    stepProjectiles(state, events);
    stepEffects(state, map, events);
    if (state.tick % 4 === 0) separate(state, map);
    if (state.tick % 360 === 0) stepAllyPings(state, events);
    state.units = state.units.filter(u => alive(u) || u.type === 'hero' || structure(u));
    STEP = prevStep;
    return events;
  }

  function stepAllyPings(state, events) {
    const ally = state.units.find(u => u.type === 'hero' && u.team === 0 && !u.player && alive(u));
    if (!ally) return;
    const colossus = state.units.find(u => u.type === 'colossus' && alive(u));
    // Called out once each time it rises.
    if (colossus && !colossus.pinged) {
      colossus.pinged = true;
      emit(state, events, { type: 'ping', team: 0, x: colossus.x, y: colossus.y, log: `${HEROES[ally.kind].name}: Colossus up in the river!` });
      return;
    }
    for (const t of state.units) {
      if (t.type !== 'tower' || t.team !== 0 || !alive(t) || t.hp > t.maxHp * 0.75) continue;
      const foeNear = state.units.some(u => u.team === 1 && alive(u) && dist(u, t) < 8);
      const allyNear = state.units.some(u => u.type === 'hero' && u.team === 0 && alive(u) && dist(u, t) < 10);
      if (foeNear && !allyNear && state.time - (state.lastHelpPing || 0) > 35) {
        state.lastHelpPing = state.time;
        emit(state, events, { type: 'ping', team: 0, x: t.x, y: t.y, log: `${HEROES[ally.kind].name}: Help ${LANE_NAMES[t.lane]}!` });
        return;
      }
    }
  }

  // --- Reading the match
  function objective(state) {
    const p = playerHero(state);
    if (state.status === 'won') return 'The red banner burns. Victory!';
    if (state.status === 'lost') return 'Your banner has fallen.';
    if (p.dead > 0) return `You fell. Back in ${Math.ceil(p.dead)} seconds.`;
    if (p.recall > 0) return `Recalling... ${p.recall.toFixed(1)}s. Taking damage stops it.`;
    if (state.time < 40) return 'Walk with your blue minions down the middle lane. Click a red minion to attack it.';
    if (p.hp < p.maxHp * 0.25) return 'Low health! Back off, or press B to recall to base.';
    const next = BUILDS[p.kind].find(id => !p.items.includes(id));
    if (atBase(p, 1) && next && p.gold >= ITEMS[next].cost) return `At base with ${Math.floor(p.gold)} gold. Open the shop (S) and buy something.`;
    const banner = state.units.find(u => u.type === 'banner' && u.team === 1);
    if (!isProtected(state, banner)) return 'The red banner is exposed. Push it down with your minions!';
    const colossus = state.units.find(u => u.type === 'colossus' && alive(u));
    if (colossus && p.level >= 5 && state.buff[0] === 0 && state.buff[1] === 0) return 'The Colossus is up in the river pit. Kill it with your team for a minion surge.';
    const left = [0, 1, 2].map(lane => state.units.filter(t => t.type === 'tower' && t.team === 1 && t.lane === lane && alive(t)).length);
    const weakest = left.indexOf(Math.min(...left));
    const total = left.reduce((a, b) => a + b, 0);
    if (p.level >= 6 && p.cooldowns[3] === 0 && state.time < 600) return `Your ultimate (R) is ready. ${total} red towers stand.`;
    return `Break both red towers in one lane to expose their banner. ${total} red towers stand, fewest in ${LANE_NAMES[weakest]}.`;
  }
  function score(state) {
    const p = playerHero(state), towers = state.units.filter(t => t.type === 'tower' && t.team === 1 && !alive(t)).length;
    const minutes = (state.endTime || state.time) / 60;
    const bonus = state.status === 'won' ? 3000 + Math.max(0, Math.round((25 - minutes) * 80)) : 0;
    return Math.max(0, Math.round(p.kills * 150 + p.assists * 60 + towers * 250 + p.cs * 5 + bonus - p.deaths * 80));
  }
  // Which tiles a team can see right now: 2 in sight, 0 hidden.
  function vision(state, team, out = new Uint8Array(WIDTH * HEIGHT)) {
    out.fill(0);
    for (const u of state.units) {
      if (u.team !== team || !alive(u) || !u.sight || (u.type === 'hero' && u.dead > 0)) continue;
      const r = u.sight;
      for (let y = Math.max(0, Math.floor(u.y - r)); y <= Math.min(HEIGHT - 1, Math.ceil(u.y + r)); y++) {
        for (let x = Math.max(0, Math.floor(u.x - r)); x <= Math.min(WIDTH - 1, Math.ceil(u.x + r)); x++) {
          if ((x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2 <= r * r) out[y * WIDTH + x] = 2;
        }
      }
    }
    return out;
  }
  function save(state) {
    const { hasWall, lastColossusPing, lastHelpPing, ...clean } = state;
    return JSON.stringify(clean);
  }
  function restore(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(text));
    const ok = data && data.version === 1 && typeof data.seed === 'string' && HEROES[data.heroKind] && DIFFICULTIES[data.difficulty] &&
      Array.isArray(data.units) && Array.isArray(data.effects) && Array.isArray(data.projectiles) && Number.isSafeInteger(data.tick) &&
      data.units.every(u => u && Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp) && u.maxHp > 0) &&
      data.units.filter(u => u.type === 'hero').length === 6 && data.units.filter(u => u.type === 'tower').length === 12 && data.units.some(u => u.id === data.playerId && u.player);
    if (!ok) throw new Error('Saved match is not a Bannerfall match.');
    return attachGetters(data);
  }

  global.Bannerfall = {
    WIDTH, HEIGHT, STEP, T, BASES, BASE_RADIUS, LANES, LANE_NAMES, LANE_LENGTHS, CAMPS, PIT, HEROES, HERO_KINDS, ITEMS, SLOTS, BUILDS, DIFFICULTIES, MINIONS, TEAM_NAMES, RECALL_TIME, COLOSSUS_AT,
    newGame, step, mapFor, tileAt, lanePoint, laneProject, objective, score, vision, save, restore, unitById, playerHero, heroes, atBase, isProtected, alive, canCast, rankUp, xpNeed, refreshStats, walkableTile
  };
})(typeof window !== 'undefined' ? window : globalThis);

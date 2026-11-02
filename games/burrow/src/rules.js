/* Burrow rules: a seeded side-view world, digging, building, liquids, creatures and
 * the road to The Maw. Pure data in, events out, so tests and bots play real runs. */
(function (global) {
  'use strict';

  const WIDTH = 320, HEIGHT = 150, STEP = 1 / 60, REACH = 5.5, DAY_LENGTH = 300, NIGHT_START = 0.58;
  const T = { AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, SAND: 4, TRUNK: 5, LEAVES: 6, PLANK: 7, BRICK: 8, TORCH: 9, DOOR: 10, DOOR_OPEN: 11, COPPER: 12, IRON: 13, CRYSTAL: 14, OBSIDIAN: 15, ASH: 16, BEDROCK: 17, BENCH: 18, ALTAR: 19, LADDER: 20, MUSHROOM: 21, BUSH: 22 };
  const WATER = 1, LAVA = 2;
  const SOLID = new Set([T.DIRT, T.GRASS, T.STONE, T.SAND, T.PLANK, T.BRICK, T.DOOR, T.COPPER, T.IRON, T.CRYSTAL, T.OBSIDIAN, T.ASH, T.BEDROCK]);

  // seconds at speed 1, and the pick tier required.
  const HARDNESS = {
    [T.DIRT]: [0.3, 1], [T.GRASS]: [0.3, 1], [T.SAND]: [0.25, 1], [T.STONE]: [0.9, 1], [T.TRUNK]: [0.5, 1], [T.LEAVES]: [0.08, 1],
    [T.PLANK]: [0.3, 1], [T.BRICK]: [0.6, 1], [T.TORCH]: [0.05, 1], [T.DOOR]: [0.3, 1], [T.DOOR_OPEN]: [0.3, 1], [T.LADDER]: [0.1, 1], [T.BENCH]: [0.3, 1],
    [T.MUSHROOM]: [0.05, 1], [T.BUSH]: [0.08, 1], [T.COPPER]: [1.3, 1], [T.IRON]: [1.7, 2], [T.CRYSTAL]: [2.2, 3], [T.ASH]: [1.2, 2], [T.OBSIDIAN]: [2.6, 4]
  };
  const DROPS = {
    [T.DIRT]: 'dirt', [T.GRASS]: 'dirt', [T.SAND]: 'sand', [T.STONE]: 'stone', [T.TRUNK]: 'wood', [T.PLANK]: 'plank', [T.BRICK]: 'brick', [T.TORCH]: 'torch',
    [T.DOOR]: 'door', [T.DOOR_OPEN]: 'door', [T.LADDER]: 'ladder', [T.BENCH]: 'bench', [T.MUSHROOM]: 'mushroom', [T.BUSH]: 'berry', [T.COPPER]: 'copper', [T.IRON]: 'iron', [T.CRYSTAL]: 'crystal', [T.ASH]: 'stone', [T.OBSIDIAN]: 'stone'
  };
  const ITEMS = {
    pick: { name: 'Pick', glyph: 'T' }, dirt: { name: 'Dirt', glyph: ';', tile: T.DIRT }, sand: { name: 'Sand', glyph: ':', tile: T.SAND }, stone: { name: 'Stone', glyph: '#', tile: T.STONE },
    wood: { name: 'Wood', glyph: '=' }, plank: { name: 'Plank', glyph: '=', tile: T.PLANK }, brick: { name: 'Brick', glyph: '#', tile: T.BRICK }, torch: { name: 'Torch', glyph: '!', tile: T.TORCH },
    ladder: { name: 'Ladder', glyph: 'H', tile: T.LADDER }, door: { name: 'Door', glyph: '|', tile: T.DOOR }, bench: { name: 'Workbench', glyph: 'n', tile: T.BENCH },
    copper: { name: 'Copper', glyph: '*' }, iron: { name: 'Iron', glyph: '*' }, crystal: { name: 'Crystal', glyph: '<' },
    berry: { name: 'Berries', glyph: '%', heal: 12 }, mushroom: { name: 'Mushroom', glyph: 'f', heal: 18 }, potion: { name: 'Potion', glyph: '!', heal: 60 }, key: { name: 'Ember Key', glyph: 'K' }
  };
  const TIERS = ['', 'Flint', 'Copper', 'Iron', 'Crystal'];
  const RECIPES = [
    { id: 'torch', name: '4 Torches', gives: ['torch', 4], cost: { wood: 1 } },
    { id: 'ladder', name: '4 Ladders', gives: ['ladder', 4], cost: { wood: 2 } },
    { id: 'bench', name: 'Workbench', gives: ['bench', 1], cost: { wood: 4 } },
    { id: 'plank', name: '4 Planks', gives: ['plank', 4], cost: { wood: 1 }, bench: true },
    { id: 'brick', name: '4 Bricks', gives: ['brick', 4], cost: { stone: 2 }, bench: true },
    { id: 'door', name: 'Door', gives: ['door', 1], cost: { plank: 3 }, bench: true },
    { id: 'potion', name: 'Potion', gives: ['potion', 1], cost: { mushroom: 2, berry: 1 }, bench: true },
    { id: 'pick2', name: 'Copper Pick', upgrade: ['pickTier', 2], cost: { copper: 8, wood: 2 }, bench: true },
    { id: 'sword2', name: 'Copper Sword', upgrade: ['swordTier', 2], cost: { copper: 6, wood: 1 }, bench: true },
    { id: 'armour2', name: 'Copper Armour', upgrade: ['armourTier', 2], cost: { copper: 12 }, bench: true },
    { id: 'pick3', name: 'Iron Pick', upgrade: ['pickTier', 3], cost: { iron: 9, wood: 2 }, bench: true, needs: ['pickTier', 2] },
    { id: 'sword3', name: 'Iron Sword', upgrade: ['swordTier', 3], cost: { iron: 7, wood: 1 }, bench: true, needs: ['swordTier', 2] },
    { id: 'armour3', name: 'Iron Armour', upgrade: ['armourTier', 3], cost: { iron: 14 }, bench: true, needs: ['armourTier', 2] },
    { id: 'pick4', name: 'Crystal Pick', upgrade: ['pickTier', 4], cost: { crystal: 7, iron: 3 }, bench: true, needs: ['pickTier', 3] },
    { id: 'sword4', name: 'Crystal Blade', upgrade: ['swordTier', 4], cost: { crystal: 7, iron: 4 }, bench: true, needs: ['swordTier', 3] },
    { id: 'armour4', name: 'Crystal Armour', upgrade: ['armourTier', 4], cost: { crystal: 10, iron: 5 }, bench: true, needs: ['armourTier', 3] },
    { id: 'key', name: 'Ember Key', gives: ['key', 1], cost: { crystal: 6, iron: 6 }, bench: true, needs: ['pickTier', 3] }
  ];
  const SWORD = [0, 9, 15, 24, 38], ARMOUR = [0, 0, 2, 4, 7], PICK_SPEED = [0, 1, 1.3, 1.7, 2.2];
  const CREATURES = {
    slime: { hp: 16, damage: 6, speed: 3.2, w: 1.2, h: 0.9, ai: 'hop' },
    zombie: { hp: 34, damage: 11, speed: 2.6, w: 0.9, h: 1.8, ai: 'walk' },
    bat: { hp: 14, damage: 8, speed: 5.5, w: 1.4, h: 0.8, ai: 'fly' },
    crawler: { hp: 46, damage: 14, speed: 4.6, w: 1.5, h: 1.0, ai: 'walk' },
    imp: { hp: 40, damage: 16, speed: 3.6, w: 0.9, h: 1.4, ai: 'shoot' }
  };
  const DIFFICULTIES = { easy: { label: 'Easy', damage: 0.6, spawn: 0.7 }, normal: { label: 'Normal', damage: 1, spawn: 1 }, hard: { label: 'Hard', damage: 1.5, spawn: 1.35 } };

  const index = (x, y) => y * WIDTH + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function random(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const noiseHash = (seed, x, y) => {
    let h = Math.imul(x * 73856093 ^ y * 19349663 ^ seed, 16777619);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function noise(seed, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = noiseHash(seed, ix, iy), b = noiseHash(seed, ix + 1, iy), c = noiseHash(seed, ix, iy + 1), d = noiseHash(seed, ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (seed, x, y) => noise(seed, x, y) * 0.6 + noise(seed + 1, x * 2.1, y * 2.1) * 0.28 + noise(seed + 2, x * 4.3, y * 4.3) * 0.12;

  // --- World generation
  function generate(state) {
    const seed = hashString(state.seed + '|world'), gen = { rng: seed };
    const tiles = new Uint8Array(WIDTH * HEIGHT), walls = new Uint8Array(WIDTH * HEIGHT), liquid = new Uint8Array(WIDTH * HEIGHT), surface = new Array(WIDTH);
    for (let x = 0; x < WIDTH; x++) {
      const flat = Math.exp(-Math.pow((x - WIDTH / 2) / 12, 2));
      surface[x] = Math.round(46 + (fbm(seed, x * 0.022, 3) - 0.5) * 46 * (1 - flat) + (noise(seed + 5, x * 0.09, 9) - 0.5) * 8 * (1 - flat));
    }
    for (let x = 0; x < WIDTH; x++) {
      const top = surface[x], stoneAt = top + 8 + Math.round(noise(seed + 7, x * 0.07, 2) * 7);
      for (let y = top; y < HEIGHT; y++) {
        const i = index(x, y);
        let tile = y === top ? T.GRASS : y < stoneAt ? T.DIRT : T.STONE;
        if (y >= 122 + noise(seed + 8, x * 0.05, 1) * 6) tile = T.ASH;
        if (y >= HEIGHT - 2) tile = T.BEDROCK;
        tiles[i] = tile;
        walls[i] = y > top + 1 ? (y < stoneAt ? 1 : 2) : 0;
      }
    }
    // Sandy dips and dunes break up the surface.
    for (let x = 0; x < WIDTH; x++) {
      if (noise(seed + 11, x * 0.03, 4) > 0.72 && Math.abs(x - WIDTH / 2) > 34) {
        for (let y = surface[x]; y < surface[x] + 5; y++) tiles[index(x, y)] = T.SAND;
      }
    }
    // Caves: a noise field widening with depth, plus long worm tunnels.
    for (let y = 0; y < HEIGHT - 3; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const depth = y - surface[x];
        if (depth < 7) continue;
        const field = fbm(seed + 20, x * 0.045, y * 0.07), threshold = 0.62 - Math.min(0.08, depth / 900);
        if (field > threshold) tiles[index(x, y)] = T.AIR;
      }
    }
    for (let i = 0; i < 26; i++) {
      let x = 8 + random(gen) * (WIDTH - 16), y = 58 + random(gen) * 70, angle = random(gen) * Math.PI * 2;
      const length = 40 + random(gen) * 70;
      for (let step = 0; step < length; step++) {
        angle += (random(gen) - 0.5) * 0.7;
        x += Math.cos(angle) * 1.3;
        y += Math.sin(angle) * 0.7;
        const r = 1.4 + random(gen) * 1.4;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const cx = Math.round(x + dx), cy = Math.round(y + dy);
          if (dx * dx + dy * dy <= r * r && inBounds(cx, cy) && cy < HEIGHT - 3 && cy > surface[cx] + 6) tiles[index(cx, cy)] = T.AIR;
        }
      }
    }
    // Ore veins: random walks whose richness depends on depth.
    const vein = (tile, count, minY, maxY, length) => {
      for (let n = 0; n < count; n++) {
        let x = 4 + Math.floor(random(gen) * (WIDTH - 8)), y = minY + Math.floor(random(gen) * (maxY - minY));
        for (let i = 0; i < length; i++) {
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
            const cx = x + dx, cy = y + dy;
            if (inBounds(cx, cy) && (tiles[index(cx, cy)] === T.STONE || tiles[index(cx, cy)] === T.DIRT || tiles[index(cx, cy)] === T.ASH)) tiles[index(cx, cy)] = tile;
          }
          x += Math.floor(random(gen) * 3) - 1;
          y += Math.floor(random(gen) * 3) - 1;
          x = Math.max(2, Math.min(WIDTH - 3, x));
          y = Math.max(minY, Math.min(maxY, y));
        }
      }
    };
    vein(T.COPPER, 52, 54, 96, 9);
    vein(T.IRON, 54, 78, 126, 8);
    vein(T.CRYSTAL, 34, 108, 146, 6);
    // Liquids: water in shallow caves and surface dips, lava in the depths.
    for (let n = 0; n < 240; n++) {
      const x = 3 + Math.floor(random(gen) * (WIDTH - 6)), y = 60 + Math.floor(random(gen) * 86);
      if (tiles[index(x, y)] !== T.AIR) continue;
      let bottom = y;
      while (bottom < HEIGHT - 3 && tiles[index(x, bottom + 1)] === T.AIR) bottom++;
      const kind = bottom > 118 ? LAVA : WATER;
      if (kind === WATER && random(gen) > 0.45) continue;
      fillPool(tiles, liquid, x, bottom, kind);
    }
    for (let x = 6; x < WIDTH - 6; x++) {
      if (Math.abs(x - WIDTH / 2) > 40 && surface[x] > 52 && surface[x] >= surface[x - 3] + 1 && surface[x] >= surface[x + 3] + 1) fillPool(tiles, liquid, x, surface[x] - 1, WATER);
    }
    // Trees, bushes and mushrooms.
    for (let x = 4; x < WIDTH - 4; x++) {
      const y = surface[x] - 1;
      if (tiles[index(x, y + 1)] !== T.GRASS || liquid[index(x, y)] || Math.abs(x - WIDTH / 2) < 2) continue;
      const roll = random(gen), grove = Math.abs(x - WIDTH / 2) < 26 && Math.abs(x - WIDTH / 2) > 5;
      if (roll < (grove ? 0.34 : 0.17)) {
        const height = 5 + Math.floor(random(gen) * 5);
        for (let i = 0; i < height; i++) tiles[index(x, y - i)] = T.TRUNK;
        const top = y - height;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) + Math.abs(dy) * 1.4 <= 3.6 && inBounds(x + dx, top + dy) && tiles[index(x + dx, top + dy)] === T.AIR) tiles[index(x + dx, top + dy)] = T.LEAVES;
        }
        x += 2;
      } else if (roll < 0.24) tiles[index(x, y)] = T.BUSH;
    }
    for (let y = 60; y < HEIGHT - 3; y++) for (let x = 0; x < WIDTH; x++) {
      if (tiles[index(x, y)] === T.AIR && SOLID.has(tiles[index(x, y + 1)]) && !liquid[index(x, y)] && noiseHash(seed + 40, x, y) < 0.03) tiles[index(x, y)] = T.MUSHROOM;
    }
    // The altar chamber: an obsidian shell around a lava-lit hall under the spawn.
    const cx = Math.floor(WIDTH / 2), cy = HEIGHT - 16, rx = 24, ry = 9;
    for (let y = cy - ry - 3; y <= cy + ry + 2; y++) for (let x = cx - rx - 3; x <= cx + rx + 3; x++) {
      const d = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2), i = index(x, y);
      if (y >= HEIGHT - 2) continue;
      if (d < 1) { tiles[i] = T.AIR; liquid[i] = 0; walls[i] = 2; } else if (d < 1.6) { tiles[i] = T.OBSIDIAN; liquid[i] = 0; }
    }
    for (let x = cx - rx; x <= cx + rx; x++) for (let y = cy + 2; y <= cy + ry + 1; y++) {
      const i = index(x, y);
      if (tiles[i] === T.AIR) tiles[i] = T.OBSIDIAN;
    }
    tiles[index(cx, cy + 1)] = T.ALTAR;
    Object.assign(state, { tiles, walls, liquid, surface, altar: { x: cx, y: cy + 1 } });
  }
  function fillPool(tiles, liquid, x, y, kind) {
    for (let row = 0; row < 4; row++) {
      let left = x, right = x;
      while (left > 1 && tiles[index(left - 1, y - row)] === T.AIR && right - left < 24) left--;
      while (right < WIDTH - 2 && tiles[index(right + 1, y - row)] === T.AIR && right - left < 24) right++;
      const open = tiles[index(left - 1, y - row)] === T.AIR || tiles[index(right + 1, y - row)] === T.AIR;
      if (open) return;
      for (let px = left; px <= right; px++) {
        if (!SOLID.has(tiles[index(px, y - row + 1)]) && !liquid[index(px, y - row + 1)]) return;
      }
      for (let px = left; px <= right; px++) liquid[index(px, y - row)] = (kind << 4) | 8;
    }
  }

  // --- Queries
  const tileAt = (state, x, y) => inBounds(x, y) ? state.tiles[index(x, y)] : T.BEDROCK;
  const solidAt = (state, x, y) => SOLID.has(tileAt(state, x, y));
  const liquidKind = (state, x, y) => inBounds(x, y) ? state.liquid[index(x, y)] >> 4 : 0;
  const liquidLevel = (state, x, y) => inBounds(x, y) ? state.liquid[index(x, y)] & 15 : 0;
  function boxHits(state, x, y, w, h) {
    const x0 = Math.floor(x), x1 = Math.floor(x + w - 0.001), y0 = Math.floor(y), y1 = Math.floor(y + h - 0.001);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(state, tx, ty)) return true;
    return false;
  }
  function boxTouches(state, x, y, w, h, test) {
    const x0 = Math.floor(x), x1 = Math.floor(x + w - 0.001), y0 = Math.floor(y), y1 = Math.floor(y + h - 0.001);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (test(tx, ty)) return true;
    return false;
  }
  const nearBench = (state) => boxTouches(state, state.player.x - 5, state.player.y - 4, 11, 10, (x, y) => tileAt(state, x, y) === T.BENCH);
  const isNight = state => state.clock >= NIGHT_START;
  function daylight(state) {
    const c = state.clock;
    if (c < 0.05) return 0.25 + c / 0.05 * 0.75;
    if (c < NIGHT_START - 0.06) return 1;
    if (c < NIGHT_START + 0.04) return 1 - (c - (NIGHT_START - 0.06)) / 0.1 * 0.82;
    if (c < 0.95) return 0.18;
    return 0.18 + (c - 0.95) / 0.05 * 0.07;
  }

  // --- New game
  function newGame(seed, difficulty = 'normal') {
    seed = String(seed || 'burrow').slice(0, 40);
    if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
    const state = {
      version: 1, seed, difficulty, rng: hashString(seed + '|run'), time: 0, clock: 0.08, day: 1, nextId: 1, tick: 0, spawnTimer: 2,
      player: { x: 0, y: 0, vx: 0, vy: 0, w: 0.9, h: 1.8, hp: 100, maxHp: 100, facing: 1, grounded: false, climbing: false, hurtTimer: 0, swing: 0, swingCooldown: 0, fallFrom: null, anim: 0, breath: 0 },
      spawn: { x: 0, y: 0 }, items: { pick: 1, torch: 8 }, order: ['pick', 'torch'], selected: 'pick', pickTier: 1, swordTier: 1, armourTier: 1,
      mining: null, creatures: [], shots: [], boss: null, kills: 0, deaths: 0, deepest: 0, won: false, flags: {}, log: []
    };
    generate(state);
    const x = Math.floor(WIDTH / 2) + 0.05, y = state.surface[Math.floor(WIDTH / 2)] - state.player.h - 0.01;
    Object.assign(state.player, { x, y });
    state.spawn = { x, y };
    return state;
  }

  // --- Inventory and crafting
  function give(state, id, amount = 1) {
    state.items[id] = (state.items[id] || 0) + amount;
    if (!state.order.includes(id)) state.order.push(id);
  }
  function take(state, id, amount = 1) {
    state.items[id] -= amount;
    if (state.items[id] > 0) return;
    delete state.items[id];
    state.order = state.order.filter(item => item !== id);
    if (state.selected === id) state.selected = 'pick';
  }
  function recipeState(state, recipe) {
    if (recipe.upgrade && state[recipe.upgrade[0]] >= recipe.upgrade[1]) return 'owned';
    if (recipe.needs && state[recipe.needs[0]] < recipe.needs[1]) return 'locked';
    if (recipe.id === 'key' && (state.items.key || state.boss || state.flags.woken)) return 'owned';
    if (!Object.entries(recipe.cost).every(([id, n]) => (state.items[id] || 0) >= n)) return 'missing';
    return recipe.bench && !nearBench(state) ? 'bench' : 'ready';
  }
  function craft(state, id, events) {
    const recipe = RECIPES.find(r => r.id === id);
    if (!recipe || recipeState(state, recipe) !== 'ready') return false;
    for (const [item, n] of Object.entries(recipe.cost)) take(state, item, n);
    if (recipe.upgrade) state[recipe.upgrade[0]] = recipe.upgrade[1];
    else give(state, recipe.gives[0], recipe.gives[1]);
    events.push({ type: 'craft', id, name: recipe.name });
    return true;
  }

  // --- Objectives: always one clear next step.
  function objective(state) {
    const has = (id, n) => (state.items[id] || 0) >= n;
    if (state.won) return 'The Maw is dead. The world is yours.';
    if (state.boss) return 'Defeat The Maw';
    if (state.items.key) return 'Carry the Ember Key to the altar beneath the spawn. Obsidian needs a Crystal Pick.';
    if (state.pickTier >= 3 && state.flags.crystal) return 'Craft the Ember Key: 6 crystal, 6 iron';
    if (state.pickTier >= 3) return 'Dig below the iron for glowing crystal (depth 60+)';
    if (state.pickTier >= 2) return state.flags.iron ? 'Craft an Iron Pick: 9 iron, 2 wood' : 'Dig deeper for iron (depth 30+)';
    if (state.flags.copper) return 'Craft a Copper Pick at a workbench: 8 copper, 2 wood';
    if (state.flags.bench) return 'Dig down for copper ore';
    if (has('bench', 1)) return 'Place your workbench';
    return has('wood', 4) ? 'Press C and craft a Workbench' : 'Chop a tree for wood';
  }

  // --- Mining and placing
  function setTile(state, x, y, tile) {
    state.tiles[index(x, y)] = tile;
    state.dirty = true;
  }
  function removeTree(state, x, y, events) {
    // A felled trunk brings down the whole tree above it.
    let wood = 0;
    const stack = [[x, y]], seen = new Set();
    while (stack.length) {
      const [cx, cy] = stack.pop(), key = index(cx, cy), tile = tileAt(state, cx, cy);
      if (seen.has(key) || (tile !== T.TRUNK && tile !== T.LEAVES)) continue;
      if (tile === T.TRUNK && (cy > y || cx !== x)) continue;
      if (tile === T.LEAVES && Math.abs(cx - x) > 4) continue;
      seen.add(key);
      if (tile === T.TRUNK) wood++;
      setTile(state, cx, cy, T.AIR);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) stack.push([cx + dx, cy + dy]);
    }
    give(state, 'wood', wood);
    events.push({ type: 'felled', x, y, wood });
  }
  function finishMining(state, x, y, events) {
    const tile = tileAt(state, x, y);
    if (tile === T.TRUNK) { removeTree(state, x, y, events); return; }
    setTile(state, x, y, T.AIR);
    if (tile === T.COPPER) state.flags.copper = true;
    if (tile === T.IRON) state.flags.iron = true;
    if (tile === T.CRYSTAL) state.flags.crystal = true;
    const drop = DROPS[tile];
    if (drop) give(state, drop, 1);
    if (tile === T.LEAVES && random(state) < 0.25) give(state, 'berry', 1);
    events.push({ type: 'mined', x, y, tile, drop });
    // Anything standing on the removed tile falls with it.
    const above = tileAt(state, x, y - 1);
    if (above === T.TORCH || above === T.MUSHROOM || above === T.BUSH) finishMining(state, x, y - 1, events);
  }
  function canPlace(state, x, y, tile) {
    if (!inBounds(x, y) || tileAt(state, x, y) !== T.AIR) return false;
    if (tile === T.TORCH && !state.walls[index(x, y)] && !solidAt(state, x, y + 1) && !solidAt(state, x - 1, y) && !solidAt(state, x + 1, y) && !solidAt(state, x, y - 1)) return false;
    if (tile === T.DOOR && (tileAt(state, x, y + 1) === T.AIR)) return false;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(state, x + dx, y + dy) !== T.AIR);
    if (!touches && !state.walls[index(x, y)]) return false;
    if (SOLID.has(tile)) {
      const p = state.player;
      if (x + 1 > p.x && x < p.x + p.w && y + 1 > p.y && y < p.y + p.h) return false;
      if (state.creatures.some(c => x + 1 > c.x && x < c.x + c.w && y + 1 > c.y && y < c.y + c.h)) return false;
    }
    return true;
  }
  function useItem(state, aimX, aimY, press, events, dt) {
    const p = state.player, tx = Math.floor(aimX), ty = Math.floor(aimY);
    const reach = Math.hypot(aimX - (p.x + p.w / 2), aimY - (p.y + p.h / 2)) <= REACH;
    const here = tileAt(state, tx, ty);
    if (press && reach) {
      if (here === T.DOOR || here === T.DOOR_OPEN) {
        const opening = here === T.DOOR;
        if (opening || !(tx + 1 > p.x && tx < p.x + p.w && ty + 1 > p.y && ty < p.y + p.h)) { setTile(state, tx, ty, opening ? T.DOOR_OPEN : T.DOOR); events.push({ type: 'door', x: tx, y: ty }); return; }
      }
      if (here === T.ALTAR) { wakeBoss(state, events); return; }
    }
    const item = ITEMS[state.selected];
    if (item?.heal) {
      if (press && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + item.heal); take(state, state.selected, 1); events.push({ type: 'eat', amount: item.heal }); }
      return;
    }
    if (item?.tile !== undefined) {
      if (reach && canPlace(state, tx, ty, item.tile)) {
        setTile(state, tx, ty, item.tile);
        if (item.tile === T.BENCH) state.flags.bench = true;
        take(state, state.selected, 1);
        events.push({ type: 'placed', x: tx, y: ty, tile: item.tile });
      }
      return;
    }
    if (state.selected !== 'pick') { state.mining = null; return; }
    const hit = digTarget(state, aimX, aimY, tx, ty, reach);
    if (!hit) { state.mining = null; return; }
    const spec = HARDNESS[tileAt(state, hit.x, hit.y)];
    if (spec[1] > state.pickTier) {
      if (press) events.push({ type: 'tooHard', tier: TIERS[spec[1]] });
      state.mining = null;
      return;
    }
    if (!state.mining || state.mining.x !== hit.x || state.mining.y !== hit.y) state.mining = { x: hit.x, y: hit.y, progress: 0, time: spec[0] / PICK_SPEED[state.pickTier] };
    state.mining.progress += dt;
    if (state.mining.progress >= state.mining.time) {
      state.mining = null;
      finishMining(state, hit.x, hit.y, events);
    }
  }
  // The tile under the cursor, or if that is already gone, the next one along the same
  // line from the player. Holding the button keeps digging without chasing the cursor.
  function digTarget(state, aimX, aimY, tx, ty, reach) {
    const minable = (x, y) => HARDNESS[tileAt(state, x, y)] !== undefined;
    if (reach && minable(tx, ty)) return { x: tx, y: ty };
    const p = state.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2, dx = aimX - cx, dy = aimY - cy, length = Math.hypot(dx, dy);
    if (length < 0.01) return null;
    for (let d = 0.5; d <= REACH; d += 0.25) {
      const x = Math.floor(cx + dx / length * d), y = Math.floor(cy + dy / length * d);
      if (minable(x, y) && tileAt(state, x, y) !== T.LEAVES) return { x, y };
    }
    return null;
  }

  // --- Boss
  const SEGMENTS = 14, SEG_GAP = 2.4;
  function wakeBoss(state, events) {
    if (state.boss) return;
    if (!state.items.key) { events.push({ type: 'altarLocked' }); return; }
    take(state, 'key', 1);
    state.flags.woken = true;
    const { x, y } = state.altar, segments = [];
    for (let i = 0; i < SEGMENTS; i++) segments.push({ x: x + 18 + i * SEG_GAP, y: y + 6 });
    state.boss = { segments, hp: 1300, maxHp: 1300, angle: Math.PI, phase: 0, shotTimer: 3, lunge: 0, flash: 0 };
    state.creatures = [];
    events.push({ type: 'bossAwake' });
  }
  function stepBoss(state, dt, events) {
    const boss = state.boss, p = state.player, head = boss.segments[0], px = p.x + p.w / 2, py = p.y + p.h / 2;
    const rage = boss.hp < boss.maxHp * 0.4 ? 1.35 : 1;
    boss.phase += dt;
    boss.flash = Math.max(0, boss.flash - dt * 6);
    // Charge, bite, then swim clear: the retreat is the player's window to strike back.
    boss.retreat = Math.max(0, (boss.retreat || 0) - dt);
    const orbit = Math.sin(boss.phase * 0.7) * 7;
    const wanted = boss.retreat > 0 ? Math.atan2(head.y - py - 5, head.x - px) : Math.atan2(py + orbit - head.y, px - head.x);
    let turn = Math.atan2(Math.sin(wanted - boss.angle), Math.cos(wanted - boss.angle));
    turn = Math.max(-2.1 * dt, Math.min(2.1 * dt, turn));
    boss.angle += turn;
    boss.lunge = Math.max(0, boss.lunge - dt);
    if (boss.lunge === 0 && boss.retreat === 0 && Math.hypot(px - head.x, py - head.y) < 16 && Math.floor(boss.phase * 60) % 300 === 0) { boss.lunge = 0.9; events.push({ type: 'bossRoar' }); }
    const speed = (boss.lunge > 0 ? 15 : 7.5) * rage;
    head.x = Math.max(2, Math.min(WIDTH - 3, head.x + Math.cos(boss.angle) * speed * dt));
    head.y = Math.max(HEIGHT - 42, Math.min(HEIGHT - 4, head.y + Math.sin(boss.angle) * speed * dt));
    for (let i = 1; i < boss.segments.length; i++) {
      const a = boss.segments[i - 1], b = boss.segments[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d > SEG_GAP) { b.x = a.x + dx / d * SEG_GAP; b.y = a.y + dy / d * SEG_GAP; }
    }
    boss.shotTimer -= dt;
    if (boss.shotTimer <= 0) {
      boss.shotTimer = rage > 1 ? 2 : 3;
      for (const offset of [-0.25, 0, 0.25]) {
        const angle = Math.atan2(py - head.y, px - head.x) + offset;
        state.shots.push({ x: head.x, y: head.y, vx: Math.cos(angle) * 11, vy: Math.sin(angle) * 11, life: 3, damage: 14, gravity: 0 });
      }
      events.push({ type: 'bossShot' });
    }
    for (const [i, s] of boss.segments.entries()) {
      if (Math.abs(s.x - px) < (i === 0 ? 2.1 : 1.6) && Math.abs(s.y - py) < (i === 0 ? 2.2 : 1.7)) {
        const before = p.hurtTimer;
        hurtPlayer(state, i === 0 ? 30 : 16, 'The Maw', s.x, events);
        if (i === 0 && before === 0 && state.boss) { boss.retreat = 1.8; boss.lunge = 0; }
      }
    }
  }

  // --- Damage
  function hurtPlayer(state, amount, source, fromX, events) {
    const p = state.player;
    if (p.hurtTimer > 0 || state.won) return;
    const dealt = Math.max(1, Math.round(amount * DIFFICULTIES[state.difficulty].damage) - ARMOUR[state.armourTier]);
    p.hp -= dealt;
    p.hurtTimer = 0.75;
    p.vx = (p.x + p.w / 2 > fromX ? 1 : -1) * 8;
    p.vy = -6;
    events.push({ type: 'hurt', amount: dealt, source, x: p.x + p.w / 2, y: p.y });
    if (p.hp <= 0) {
      state.deaths++;
      Object.assign(p, { x: state.spawn.x, y: state.spawn.y, vx: 0, vy: 0, hp: p.maxHp, hurtTimer: 2, fallFrom: null, climbing: false });
      state.mining = null;
      state.creatures = [];
      state.shots = [];
      if (state.boss) { state.boss = null; give(state, 'key', 1); }
      events.push({ type: 'died', source });
    }
  }
  function hitCreature(state, creature, damage, events) {
    creature.hp -= damage;
    creature.flash = 1;
    creature.vx = (creature.x + creature.w / 2 > state.player.x + state.player.w / 2 ? 1 : -1) * 7;
    creature.vy = -4.5;
    events.push({ type: 'hit', x: creature.x + creature.w / 2, y: creature.y, damage });
    if (creature.hp > 0) return;
    state.creatures = state.creatures.filter(c => c !== creature);
    state.kills++;
    const roll = random(state);
    if (roll < 0.22) give(state, 'berry', 1);
    else if (roll < 0.34) give(state, 'mushroom', 1);
    events.push({ type: 'kill', kind: creature.kind, x: creature.x + creature.w / 2, y: creature.y });
  }
  function swing(state, events) {
    const p = state.player;
    if (p.swingCooldown > 0) return;
    p.swingCooldown = 0.34;
    p.swing = 0.2;
    events.push({ type: 'swing' });
    const cx = p.x + p.w / 2 + p.facing * 1.5, cy = p.y + p.h / 2, damage = SWORD[state.swordTier];
    for (const c of state.creatures.slice()) {
      if (Math.abs(c.x + c.w / 2 - cx) < 2 + c.w / 2 && Math.abs(c.y + c.h / 2 - cy) < 1.9 + c.h / 2) hitCreature(state, c, damage, events);
    }
    if (state.boss) {
      const hit = state.boss.segments.find(s => Math.abs(s.x - cx) < 3.4 && Math.abs(s.y - cy) < 3.2);
      if (hit) {
        const isHead = hit === state.boss.segments[0], amount = damage * (isHead ? 1.6 : 1);
        state.boss.hp -= amount;
        state.boss.flash = 1;
        events.push({ type: 'hit', x: hit.x, y: hit.y, damage: Math.round(amount) });
        if (state.boss.hp <= 0) {
          state.boss = null;
          state.won = true;
          state.kills++;
          state.endTime = state.time;
          events.push({ type: 'victory' });
        }
      }
    }
  }

  // --- Physics
  function moveBox(state, e, dt, step = false) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy)) * dt / 0.4));
    const sdt = dt / steps;
    let hitWall = false;
    e.grounded = false;
    for (let i = 0; i < steps; i++) {
      const nx = e.x + e.vx * sdt;
      if (!boxHits(state, nx, e.y, e.w, e.h) && nx >= 1 && nx + e.w <= WIDTH - 1) e.x = nx;
      else if (step && e.onGround && !boxHits(state, nx, e.y - 1.02, e.w, e.h) && nx >= 1 && nx + e.w <= WIDTH - 1) { e.x = nx; e.y -= 1.02; }
      else { hitWall = true; e.vx = 0; }
      const ny = e.y + e.vy * sdt;
      if (!boxHits(state, e.x, ny, e.w, e.h)) e.y = ny;
      else { if (e.vy > 0) e.grounded = true; e.vy = 0; }
    }
    if (!e.grounded && boxHits(state, e.x, e.y + 0.05, e.w, e.h)) e.grounded = true;
    e.onGround = e.grounded;
    return hitWall;
  }
  function stepPlayer(state, input, dt, events) {
    const p = state.player, speed = 7.4;
    const inLiquid = kind => boxTouches(state, p.x, p.y + 0.4, p.w, p.h - 0.5, (x, y) => liquidKind(state, x, y) === kind);
    const water = inLiquid(WATER), lava = inLiquid(LAVA);
    const onLadder = boxTouches(state, p.x, p.y, p.w, p.h, (x, y) => tileAt(state, x, y) === T.LADDER);
    const wanted = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (wanted) p.facing = wanted;
    const target = wanted * speed * (water ? 0.6 : 1);
    if (p.hurtTimer > 0.45) p.vx += (target - p.vx) * Math.min(1, dt * 3);
    else p.vx += (target - p.vx) * Math.min(1, dt * (p.grounded ? 16 : 9));
    p.climbing = onLadder && (input.up || input.down || (p.climbing && !p.grounded));
    if (p.climbing) {
      p.vy = (input.down ? 5 : 0) - (input.up ? 6 : 0);
      if (input.jump && !input.up) { p.climbing = false; p.vy = -11; }
      p.fallFrom = null;
    } else {
      p.vy = Math.min(water ? 4 : 26, p.vy + (water ? 12 : 38) * dt);
      if (input.jump && (p.grounded || water)) {
        p.vy = water ? -7 : -13.4;
        if (p.grounded) events.push({ type: 'jump' });
      }
    }
    // Digging straight down slides you over the hole instead of leaving you astride it.
    const m = state.mining;
    if (m && !wanted && m.y > p.y + p.h - 0.5 && m.x + 1 > p.x - 1 && m.x < p.x + p.w + 1) {
      const nudge = Math.max(-dt * 3, Math.min(dt * 3, m.x + (1 - p.w) / 2 - p.x));
      if (!boxHits(state, p.x + nudge, p.y, p.w, p.h)) p.x += nudge;
    }
    moveBox(state, p, dt, true);
    if (p.grounded) {
      if (p.fallFrom !== null && !water) {
        const fall = p.y - p.fallFrom;
        // Capped so a fall from the respawn point can never start a death loop.
        if (fall > 15) hurtPlayer(state, Math.min(40, (fall - 15) * 3), 'a long fall', p.x, events);
      }
      p.fallFrom = null;
    } else if (p.fallFrom === null && p.vy > 0 && !p.climbing) p.fallFrom = p.y;
    if (water) p.fallFrom = null;
    if (lava) hurtPlayer(state, 24, 'lava', p.x, events);
    p.anim += Math.abs(p.vx) * dt;
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.swingCooldown = Math.max(0, p.swingCooldown - dt);
    state.deepest = Math.max(state.deepest, Math.floor(p.y) - state.surface[Math.floor(p.x)]);
  }

  // --- Creatures
  function spawnCreature(state, kind, x, y) {
    const spec = CREATURES[kind];
    state.creatures.push({ id: state.nextId++, kind, x, y, vx: 0, vy: 0, w: spec.w, h: spec.h, hp: spec.hp, flash: 0, timer: random(state) * 2, anim: 0, facing: 1, grounded: false });
  }
  function pickSpawn(state) {
    const p = state.player, depth = p.y - state.surface[Math.floor(p.x)], side = random(state) < 0.5 ? -1 : 1;
    if (depth < 6) {
      const x = Math.floor(p.x + side * (26 + random(state) * 10));
      if (x < 4 || x > WIDTH - 5) return null;
      if (Math.abs(x - WIDTH / 2) < 12 && state.day === 1) return null;
      const y = state.surface[x];
      let top = y - 2;
      while (top > 2 && (solidAt(state, x, top) || tileAt(state, x, top) === T.LEAVES)) top--;
      if (solidAt(state, x, top - 1) || liquidKind(state, x, top)) return null;
      return { kind: isNight(state) ? 'zombie' : 'slime', x, y: top - 1 };
    }
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.floor(p.x + side * (16 + random(state) * 16)), y = Math.floor(p.y + (random(state) - 0.5) * 22);
      if (!inBounds(x, y) || y >= HEIGHT - 3 || solidAt(state, x, y) || solidAt(state, x, y + 1) === false && random(state) < 0.3) continue;
      if (solidAt(state, x + 1, y) || solidAt(state, x, y - 1) || liquidKind(state, x, y) || state.walls[index(x, y)] === 3) continue;
      if (y > 118) return { kind: random(state) < 0.5 ? 'imp' : 'crawler', x, y: y - 1 };
      if (y > 80) return { kind: random(state) < 0.6 ? 'crawler' : 'bat', x, y: y - 1 };
      return { kind: 'bat', x, y: y - 1 };
    }
    return null;
  }
  function stepCreatures(state, dt, events) {
    const p = state.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && !state.boss && state.creatures.length < 8) {
      const depth = p.y - state.surface[Math.floor(p.x)];
      state.spawnTimer = (depth < 6 ? (isNight(state) ? 3.5 : 14) : 7) / DIFFICULTIES[state.difficulty].spawn;
      const spot = pickSpawn(state);
      if (spot && !boxHits(state, spot.x, spot.y, CREATURES[spot.kind].w, CREATURES[spot.kind].h)) spawnCreature(state, spot.kind, spot.x, spot.y);
    }
    for (const c of state.creatures.slice()) {
      const spec = CREATURES[c.kind], cx = c.x + c.w / 2, cy = c.y + c.h / 2, dx = px - cx, dy = py - cy, dist = Math.hypot(dx, dy), aware = dist < 30;
      if (dist > 46) { state.creatures = state.creatures.filter(other => other !== c); continue; }
      c.timer -= dt;
      c.flash = Math.max(0, c.flash - dt * 6);
      c.facing = dx >= 0 ? 1 : -1;
      c.anim += dt;
      const stunned = c.flash > 0.4;
      if (spec.ai === 'hop') {
        c.vy = Math.min(26, c.vy + 38 * dt);
        if (c.grounded) c.vx *= 0.8;
        if (c.grounded && c.timer <= 0 && aware) { c.timer = 1.2; c.vy = -11; c.vx = Math.sign(dx) * spec.speed * 1.6; }
        moveBox(state, c, dt);
      } else if (spec.ai === 'walk') {
        c.vy = Math.min(26, c.vy + 38 * dt);
        if (!stunned) c.vx += ((aware ? Math.sign(dx) * spec.speed : 0) - c.vx) * Math.min(1, dt * 6);
        const blocked = moveBox(state, c, dt);
        if (blocked && c.grounded) c.vy = -11.5;
      } else {
        const hover = spec.ai === 'shoot' ? -3 : Math.sin(c.anim * 3) * 1.5;
        if (!stunned && aware) {
          c.vx += (dx / (dist || 1) * spec.speed - c.vx) * Math.min(1, dt * 3);
          c.vy += ((dy + hover) / (dist || 1) * spec.speed - c.vy) * Math.min(1, dt * 3);
        } else if (!aware) { c.vx *= 0.96; c.vy *= 0.96; }
        moveBox(state, c, dt);
        if (spec.ai === 'shoot' && c.timer <= 0 && dist < 18 && aware) {
          c.timer = 2.6;
          state.shots.push({ x: cx, y: cy, vx: dx / (dist || 1) * 10, vy: dy / (dist || 1) * 10, life: 2.5, damage: spec.damage, gravity: 0 });
          events.push({ type: 'shot' });
        }
      }
      const touching = cx + c.w / 2 > p.x && cx - c.w / 2 < p.x + p.w && cy + c.h / 2 > p.y && cy - c.h / 2 < p.y + p.h;
      if (touching) hurtPlayer(state, spec.damage, c.kind, cx, events);
      if (liquidKind(state, Math.floor(cx), Math.floor(c.y + c.h - 0.1)) === LAVA && c.kind !== 'imp') hitCreature(state, c, 999, []);
    }
    for (const shot of state.shots.slice()) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.vy += shot.gravity * dt;
      shot.life -= dt;
      const hitPlayer = shot.x > p.x && shot.x < p.x + p.w && shot.y > p.y && shot.y < p.y + p.h;
      if (hitPlayer) hurtPlayer(state, shot.damage, 'fire', shot.x, events);
      if (hitPlayer || shot.life <= 0 || solidAt(state, Math.floor(shot.x), Math.floor(shot.y))) state.shots = state.shots.filter(s => s !== shot);
    }
  }

  // --- Liquids and falling sand run near the player only.
  function stepWorld(state, events) {
    const p = state.player, x0 = Math.max(1, Math.floor(p.x) - 56), x1 = Math.min(WIDTH - 2, Math.floor(p.x) + 56), y0 = Math.max(1, Math.floor(p.y) - 36), y1 = Math.min(HEIGHT - 2, Math.floor(p.y) + 36);
    const { tiles, liquid } = state, flip = state.tick % 8 === 0;
    for (let y = y1; y >= y0; y--) {
      for (let k = x0; k <= x1; k++) {
        const x = flip ? k : x1 - (k - x0), i = index(x, y), value = liquid[i];
        if (tiles[i] === T.SAND) {
          const below = i + WIDTH;
          if (tiles[below] === T.AIR) {
            tiles[below] = T.SAND;
            tiles[i] = T.AIR;
            liquid[i] = liquid[below];
            liquid[below] = 0;
            state.dirty = true;
          }
          continue;
        }
        if (!value) continue;
        if (SOLID.has(tiles[i])) { liquid[i] = 0; continue; }
        const kind = value >> 4;
        let level = value & 15;
        const flowInto = (to, amount) => {
          if (SOLID.has(tiles[to])) return 0;
          const other = liquid[to], otherKind = other >> 4, otherLevel = other & 15;
          if (otherKind && otherKind !== kind) {
            // Water meets lava: both are spent and obsidian forms.
            tiles[to] = T.OBSIDIAN;
            liquid[to] = 0;
            level = 0;
            events.push({ type: 'steam', x: to % WIDTH, y: Math.floor(to / WIDTH) });
            state.dirty = true;
            return 0;
          }
          const moved = Math.min(amount, 8 - otherLevel);
          if (moved <= 0) return 0;
          liquid[to] = (kind << 4) | (otherLevel + moved);
          level -= moved;
          state.dirty = true;
          return moved;
        };
        flowInto(i + WIDTH, level);
        if (level > 0 && (kind === WATER || state.tick % 2 === 0)) {
          const below = liquid[i + WIDTH];
          const supported = SOLID.has(tiles[i + WIDTH]) || (below & 15) >= 8;
          if (supported) {
            for (const to of flip ? [i - 1, i + 1] : [i + 1, i - 1]) {
              const otherLevel = liquid[to] & 15;
              if (SOLID.has(tiles[to])) continue;
              if ((liquid[to] >> 4) && (liquid[to] >> 4) !== kind) { flowInto(to, 1); continue; }
              const share = Math.floor((level - otherLevel) / 2);
              if (share > 0) flowInto(to, share);
              // A thin edge only creeps away from deeper water, so settled pools rest.
              else if (level === 1 && otherLevel === 0 && (liquid[i + i - to] & 15) >= 2) flowInto(to, 1);
            }
          }
        }
        liquid[i] = level > 0 ? (kind << 4) | level : 0;
      }
    }
  }

  // --- Main step. input: {left,right,up,down,jump,aimX,aimY,use,usePressed,attack,craft}
  function step(state, input = {}) {
    const events = [];
    if (state.won) return events;
    const dt = STEP;
    state.tick++;
    state.time += dt;
    state.clock += dt / DAY_LENGTH;
    if (state.clock >= 1) { state.clock -= 1; state.day++; events.push({ type: 'dawn', day: state.day }); }
    if (input.select && state.items[input.select]) state.selected = input.select;
    if (input.craft) craft(state, input.craft, events);
    stepPlayer(state, input, dt, events);
    if (input.attack) swing(state, events);
    if (input.use && input.aimX !== undefined) useItem(state, input.aimX, input.aimY, Boolean(input.usePressed), events, dt);
    else state.mining = null;
    stepCreatures(state, dt, events);
    if (state.boss) stepBoss(state, dt, events);
    if (state.tick % 4 === 0) stepWorld(state, events);
    return events;
  }

  // --- Light: sky reach in one channel and block light in three, swept in both directions.
  const FALLOFF_AIR = 14, FALLOFF_SOLID = 46;
  function computeLight(state, x0, y0, w, h, out) {
    const light = out || new Uint8Array(w * h * 4);
    light.fill(0);
    const set = (i, r, g, b) => { light[i] = Math.max(light[i], r); light[i + 1] = Math.max(light[i + 1], g); light[i + 2] = Math.max(light[i + 2], b); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = x + x0, wy = y + y0, i = (y * w + x) * 4;
      if (!inBounds(wx, wy)) continue;
      const tile = state.tiles[index(wx, wy)], kind = state.liquid[index(wx, wy)] >> 4;
      if (wy < state.surface[wx] - 1 || (!SOLID.has(tile) && !state.walls[index(wx, wy)] && wy <= state.surface[wx] + 2)) light[i + 3] = 255;
      if (tile === T.TORCH) set(i, 255, 196, 110);
      else if (kind === LAVA) set(i, 240, 96, 24);
      else if (tile === T.CRYSTAL) set(i, 60, 150, 220);
      else if (tile === T.ALTAR) set(i, 200, 70, 40);
      else if (tile === T.MUSHROOM) set(i, 40, 90, 80);
    }
    const sweep = (i, from, cost) => {
      for (let c = 0; c < 4; c++) { const v = light[from + c] - cost; if (v > light[i + c]) light[i + c] = v; }
    };
    const costOf = (x, y) => {
      const wx = x + x0, wy = y + y0;
      return inBounds(wx, wy) && SOLID.has(state.tiles[index(wx, wy)]) ? FALLOFF_SOLID : FALLOFF_AIR;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, cost = costOf(x, y);
        if (x > 0) sweep(i, i - 4, cost);
        if (y > 0) sweep(i, i - w * 4, cost);
      }
      for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = (y * w + x) * 4, cost = costOf(x, y);
        if (x < w - 1) sweep(i, i + 4, cost);
        if (y < h - 1) sweep(i, i + w * 4, cost);
      }
    }
    return light;
  }

  // --- Scoring and saves
  function score(state) {
    const base = state.kills * 10 + state.deepest * 5 + (state.pickTier - 1) * 150;
    const bonus = state.won ? Math.max(500, 6000 - Math.floor((state.endTime || state.time) * 2)) : 0;
    return Math.max(0, base + bonus - state.deaths * 100);
  }
  const packBytes = bytes => {
    const out = [];
    for (let i = 0; i < bytes.length;) {
      let run = 1;
      while (i + run < bytes.length && bytes[i + run] === bytes[i] && run < 65535) run++;
      out.push(bytes[i], run);
      i += run;
    }
    return out;
  };
  const unpackBytes = (pairs, length) => {
    const bytes = new Uint8Array(length);
    let at = 0;
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      if (at + pairs[i + 1] > length) throw new Error('Saved world is the wrong size.');
      bytes.fill(pairs[i], at, at + pairs[i + 1]);
      at += pairs[i + 1];
    }
    if (at !== length) throw new Error('Saved world is the wrong size.');
    return bytes;
  };
  function save(state) {
    const { tiles, walls, liquid, dirty, ...rest } = state;
    return JSON.stringify({ ...rest, tiles: packBytes(tiles), walls: packBytes(walls), liquid: packBytes(liquid) });
  }
  function restore(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || data.version !== 1 || typeof data.seed !== 'string' || !Array.isArray(data.tiles) || !data.player || !DIFFICULTIES[data.difficulty]) throw new Error('Saved world is not a Burrow world.');
    const size = WIDTH * HEIGHT;
    return { ...data, tiles: unpackBytes(data.tiles, size), walls: unpackBytes(data.walls, size), liquid: unpackBytes(data.liquid, size) };
  }

  global.Burrow = {
    WIDTH, HEIGHT, STEP, REACH, T, ITEMS, RECIPES, TIERS, SWORD, CREATURES, DIFFICULTIES, WATER, LAVA, SOLID, HARDNESS, SEGMENTS,
    newGame, step, tileAt, solidAt, liquidKind, liquidLevel, recipeState, objective, daylight, isNight, computeLight, score, save, restore, index, nearBench, canPlace, give
  };
})(typeof window !== 'undefined' ? window : globalThis);

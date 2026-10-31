/* Inkfire rules: deterministic real-time FPS simulation, map generation,
 * player physics, weapon mechanics, monster AI state machines, projectiles,
 * explosive barrels, doors and pickups. Pure data in, events out.
 * No DOM dependencies, so tests and bots can play runs headlessly. */
(function (global) {
  'use strict';

  const SIZE = 40;
  const WALL = 0, FLOOR = 1, DOOR = 2, DOOR_RED = 3, DOOR_BLUE = 4, EXIT = 5;

  const MONSTERS = {
    trooper: { name: 'trooper', hp: 30, speed: 2.2, attackRange: 10, cooldown: 1.0, score: 50, drop: 'clip', size: 0.35, melee: false },
    spitter: { name: 'spitter', hp: 60, speed: 1.8, attackRange: 11, cooldown: 1.4, score: 100, drop: 'shells', size: 0.38, melee: false },
    brute:   { name: 'brute',   hp: 160, speed: 3.2, attackRange: 1.1, cooldown: 0.6, score: 150, drop: 'stim', size: 0.45, melee: true },
    wisp:    { name: 'wisp',    hp: 40, speed: 2.6, attackRange: 10, cooldown: 1.2, score: 120, drop: 'clip', size: 0.35, melee: false },
    titan:   { name: 'titan',   hp: 900, speed: 1.2, attackRange: 14, cooldown: 2.0, score: 1000, drop: null, size: 0.60, melee: false, boss: true }
  };

  const WEAPONS = {
    pistol:   { name: 'pistol', ammoType: 'bullets', cost: 1, fireRate: 0.35, damage: 15, spread: 0.02, pellets: 1 },
    shotgun:  { name: 'shotgun', ammoType: 'shells', cost: 1, fireRate: 0.75, damage: 9, spread: 0.14, pellets: 7 },
    chaingun: { name: 'chaingun', ammoType: 'bullets', cost: 1, fireRate: 0.10, damage: 12, spread: 0.05, pellets: 1 },
    launcher: { name: 'launcher', ammoType: 'rockets', cost: 1, fireRate: 0.85, damage: 90, splashRadius: 2.5, splashDamage: 80, pellets: 1 }
  };

  const MAX_AMMO = { bullets: 200, shells: 50, rockets: 50 };

  // --- Deterministic Random Generator (FNV-1a + Mulberry32)
  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  function random(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const int = (state, min, max) => min + Math.floor(random(state) * (max - min + 1));
  const pick = (state, list) => list[Math.floor(random(state) * list.length)];

  const index = (x, y) => (y | 0) * SIZE + (x | 0);
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  function tileAt(state, x, y) {
    return inBounds(x, y) ? state.tiles[index(x, y)] : WALL;
  }

  function doorAt(state, x, y) {
    const gx = Math.floor(x), gy = Math.floor(y);
    return state.doors.find(d => d.x === gx && d.y === gy);
  }

  function isPassable(state, x, y) {
    const tile = tileAt(state, x, y);
    if (tile === FLOOR || tile === EXIT) return true;
    if (tile === DOOR || tile === DOOR_RED || tile === DOOR_BLUE) {
      const door = doorAt(state, x, y);
      return door && door.open >= 0.75;
    }
    return false;
  }

  function isSeeThrough(state, x, y) {
    const tile = tileAt(state, x, y);
    if (tile === FLOOR || tile === EXIT) return true;
    if (tile === DOOR || tile === DOOR_RED || tile === DOOR_BLUE) {
      const door = doorAt(state, x, y);
      return door && door.open >= 0.5;
    }
    return false;
  }

  // Grid BFS distance map from (tx, ty) for navigation and solvability checks
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function distances(tiles, tx, ty, { allowRed = true, allowBlue = true } = {}) {
    const result = new Array(SIZE * SIZE).fill(Infinity);
    const sx = Math.floor(tx), sy = Math.floor(ty);
    if (!inBounds(sx, sy)) return result;
    const queue = [[sx, sy]];
    result[index(sx, sy)] = 0;
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      const baseDist = result[index(cx, cy)];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(nx, ny)) continue;
        const idx = index(nx, ny);
        if (result[idx] !== Infinity) continue;
        const t = tiles[idx];
        const walkable = t === FLOOR || t === EXIT || t === DOOR ||
          (t === DOOR_RED && allowRed) || (t === DOOR_BLUE && allowBlue);
        if (walkable) {
          result[idx] = baseDist + 1;
          queue.push([nx, ny]);
        }
      }
    }
    return result;
  }

  // Continuous line of sight test
  function lineOfSight(state, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
    if (dist < 0.001) return true;
    const steps = Math.ceil(dist * 5), stepX = dx / steps, stepY = dy / steps;
    let cx = x0, cy = y0;
    for (let i = 0; i <= steps; i++) {
      const gx = Math.floor(cx), gy = Math.floor(cy);
      if (!isSeeThrough(state, gx, gy)) {
        // Allow the target cell itself
        if (gx === Math.floor(x1) && gy === Math.floor(y1)) return true;
        return false;
      }
      cx += stepX;
      cy += stepY;
    }
    return true;
  }

  // --- Map Generation
  function generateMap(seed) {
    const rng = { rng: hashString(seed + '|inkfire|map') };
    const tiles = new Array(SIZE * SIZE).fill(WALL);
    const rooms = [];

    // Attempt room placement
    for (let attempt = 0; attempt < 250 && rooms.length < 12; attempt++) {
      const w = int(rng, 5, 9), h = int(rng, 5, 9);
      const x = int(rng, 2, SIZE - w - 3), y = int(rng, 2, SIZE - h - 3);
      if (rooms.some(r => x <= r.x + r.w + 2 && x + w + 2 >= r.x && y <= r.y + r.h + 2 && y + h + 2 >= r.y)) continue;
      rooms.push({ id: rooms.length, x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    }

    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          tiles[index(x, y)] = FLOOR;
        }
      }
    }

    // Connect rooms in sequence, adding extra corridors for loops
    const order = [rooms[0]], left = rooms.slice(1);
    while (left.length) {
      const last = order[order.length - 1];
      left.sort((a, b) => Math.hypot(a.cx - last.cx, a.cy - last.cy) - Math.hypot(b.cx - last.cx, b.cy - last.cy));
      order.push(left.shift());
    }

    const carve = (a, b) => {
      let x = a.cx, y = a.cy;
      const horizontalFirst = random(rng) < 0.5;
      const stepX = () => {
        while (x !== b.cx) {
          x += Math.sign(b.cx - x);
          tiles[index(x, y)] = FLOOR;
        }
      };
      const stepY = () => {
        while (y !== b.cy) {
          y += Math.sign(b.cy - y);
          tiles[index(x, y)] = FLOOR;
        }
      };
      if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    };

    for (let i = 1; i < order.length; i++) carve(order[i - 1], order[i]);
    for (let i = 0; i < 2 && order.length > 4; i++) carve(pick(rng, order), pick(rng, order));

    // Place doors at single-width doorways leading into rooms
    const doors = [];
    let doorId = 1;
    for (const r of rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          const edge = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
          if (!edge || tiles[index(x, y)] !== FLOOR) continue;
          const horiz = tiles[index(x - 1, y)] === WALL && tiles[index(x + 1, y)] === WALL;
          const vert = tiles[index(x, y - 1)] === WALL && tiles[index(x, y + 1)] === WALL;
          if (horiz || vert) {
            if (!doors.some(d => d.x === x && d.y === y)) {
              doors.push({ id: doorId++, x, y, kind: DOOR, open: 0, state: 'closed', timer: 0 });
              tiles[index(x, y)] = DOOR;
            }
          }
        }
      }
    }

    // Assign start room (0), Red Key room, Blue Key room, Titan Boss room, and Exit room
    const startRoom = order[0];
    const exitRoom = order[order.length - 1];
    const titanRoom = order.length > 2 ? order[order.length - 2] : exitRoom;
    const redKeyRoom = order[Math.floor(order.length * 0.35)];
    const blueKeyRoom = order[Math.floor(order.length * 0.65)];

    // Place Exit tile in exit room
    tiles[index(exitRoom.cx, exitRoom.cy)] = EXIT;

    // Convert up to two doors to Red and Blue keycard doors while guaranteeing solvability
    if (doors.length >= 2) {
      const redCandidates = doors.slice().sort((a, b) =>
        Math.hypot(a.x - blueKeyRoom.cx, a.y - blueKeyRoom.cy) - Math.hypot(b.x - blueKeyRoom.cx, b.y - blueKeyRoom.cy)
      );
      let chosenRedDoor = null;
      for (const cand of redCandidates) {
        tiles[index(cand.x, cand.y)] = DOOR_RED;
        const dNoKey = distances(tiles, startRoom.cx, startRoom.cy, { allowRed: false, allowBlue: false });
        if (Number.isFinite(dNoKey[index(redKeyRoom.cx, redKeyRoom.cy)])) {
          cand.kind = DOOR_RED;
          chosenRedDoor = cand;
          break;
        }
        tiles[index(cand.x, cand.y)] = DOOR;
      }

      const blueCandidates = doors.filter(d => d !== chosenRedDoor).sort((a, b) =>
        Math.hypot(a.x - exitRoom.cx, a.y - exitRoom.cy) - Math.hypot(b.x - exitRoom.cx, b.y - exitRoom.cy)
      );
      for (const cand of blueCandidates) {
        tiles[index(cand.x, cand.y)] = DOOR_BLUE;
        const dNoKey = distances(tiles, startRoom.cx, startRoom.cy, { allowRed: false, allowBlue: false });
        const dRedOnly = distances(tiles, startRoom.cx, startRoom.cy, { allowRed: true, allowBlue: false });
        if (Number.isFinite(dNoKey[index(redKeyRoom.cx, redKeyRoom.cy)]) &&
            Number.isFinite(dRedOnly[index(blueKeyRoom.cx, blueKeyRoom.cy)])) {
          cand.kind = DOOR_BLUE;
          break;
        }
        tiles[index(cand.x, cand.y)] = DOOR;
      }
    }

    return { rng, tiles, rooms, order, doors, startRoom, exitRoom, titanRoom, redKeyRoom, blueKeyRoom };
  }

  // --- New Game Setup
  function newGame(seed = 'inkfire-seed-1') {
    const map = generateMap(seed);
    const rng = map.rng;
    let nextId = 1;

    const player = {
      x: map.startRoom.cx + 0.5,
      y: map.startRoom.cy + 0.5,
      angle: 0,
      radius: 0.32,
      hp: 100,
      maxHp: 100,
      armour: 25,
      maxArmour: 100,
      weapon: 'pistol',
      weapons: { pistol: true, shotgun: false, chaingun: false, launcher: false },
      ammo: { bullets: 40, shells: 0, rockets: 0 },
      keys: { red: false, blue: false },
      cooldown: 0
    };

    const monsters = [];
    const items = [];
    const barrels = [];
    const lamps = [];

    // Place Red and Blue Keycards
    items.push({ id: nextId++, kind: 'key.red', x: map.redKeyRoom.cx + 0.5, y: map.redKeyRoom.cy + 0.5, collected: false });
    items.push({ id: nextId++, kind: 'key.blue', x: map.blueKeyRoom.cx + 0.5, y: map.blueKeyRoom.cy + 0.5, collected: false });

    // Place Weapon Pickups
    const otherRooms = map.order.slice(1);
    if (otherRooms.length > 1) {
      items.push({ id: nextId++, kind: 'gun.shotgun', x: otherRooms[0].cx + 0.5, y: otherRooms[0].cy + 0.5, collected: false });
    }
    if (otherRooms.length > 2) {
      items.push({ id: nextId++, kind: 'gun.chaingun', x: map.blueKeyRoom.x + 1.5, y: map.blueKeyRoom.y + 1.5, collected: false });
    }
    if (otherRooms.length > 3) {
      items.push({ id: nextId++, kind: 'gun.launcher', x: map.titanRoom.x + 1.5, y: map.titanRoom.y + 1.5, collected: false });
    }

    // Place Health, Armour, and Ammo in rooms
    for (const r of map.order) {
      if (r === map.startRoom) {
        items.push({ id: nextId++, kind: 'medkit', x: r.cx - 1.5, y: r.cy + 0.5, collected: false });
        items.push({ id: nextId++, kind: 'clip', x: r.cx + 1.5, y: r.cy + 0.5, collected: false });
        continue;
      }
      // Supplies
      const count = int(rng, 1, 3);
      for (let c = 0; c < count; c++) {
        const ix = int(rng, r.x + 1, r.x + r.w - 2) + 0.5;
        const iy = int(rng, r.y + 1, r.y + r.h - 2) + 0.5;
        const kind = pick(rng, ['medkit', 'stim', 'armour', 'clip', 'bulletbox', 'shells', 'shellbox', 'rockets']);
        items.push({ id: nextId++, kind, x: ix, y: iy, collected: false });
      }

      // Barrels
      if (random(rng) < 0.7) {
        const bx = int(rng, r.x + 1, r.x + r.w - 2) + 0.5;
        const by = int(rng, r.y + 1, r.y + r.h - 2) + 0.5;
        barrels.push({ id: nextId++, x: bx, y: by, hp: 20, dead: false, radius: 0.35 });
      }

      // Lamps
      const lampKind = pick(rng, ['lamp.warm', 'lamp.cold', 'lamp.red']);
      lamps.push({ x: r.x + 0.5, y: r.y + 0.5, kind: lampKind });
    }

    // Spawn Boss Titan in Titan Room
    monsters.push({
      id: nextId++,
      kind: 'titan',
      x: map.titanRoom.cx + 0.5,
      y: map.titanRoom.cy + 0.5,
      angle: Math.PI,
      hp: MONSTERS.titan.hp,
      maxHp: MONSTERS.titan.hp,
      state: 'idle',
      frame: 'walk0',
      animTimer: 0,
      cooldown: 1.0,
      flash: 0
    });

    // Spawn Enemies across rooms
    for (const r of otherRooms) {
      if (r === map.exitRoom) continue;
      const count = r === map.titanRoom ? int(rng, 1, 2) : int(rng, 2, 4);
      for (let i = 0; i < count; i++) {
        const mx = int(rng, r.x + 1, r.x + r.w - 2) + 0.5;
        const my = int(rng, r.y + 1, r.y + r.h - 2) + 0.5;
        const kind = pick(rng, ['trooper', 'trooper', 'spitter', 'brute', 'wisp']);
        const info = MONSTERS[kind];
        monsters.push({
          id: nextId++,
          kind,
          x: mx,
          y: my,
          angle: random(rng) * Math.PI * 2,
          hp: info.hp,
          maxHp: info.hp,
          state: 'idle',
          frame: 'walk0',
          animTimer: random(rng) * 0.4,
          cooldown: random(rng) * info.cooldown,
          flash: 0
        });
      }
    }

    return {
      version: 1,
      seed,
      rng: rng.rng,
      nextId,
      time: 0,
      score: 0,
      kills: 0,
      dead: false,
      won: false,
      size: SIZE,
      tiles: map.tiles,
      rooms: map.rooms,
      doors: map.doors,
      player,
      monsters,
      projectiles: [],
      items,
      barrels,
      lamps
    };
  }

  // --- Collision helper (circle vs tile grid)
  function collides(state, x, y, radius) {
    const minX = Math.floor(x - radius), maxX = Math.floor(x + radius);
    const minY = Math.floor(y - radius), maxY = Math.floor(y + radius);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!isPassable(state, tx, ty)) {
          // Nearest point in tile to circle center
          const nearX = Math.max(tx, Math.min(x, tx + 1));
          const nearY = Math.max(ty, Math.min(y, ty + 1));
          const distSq = (x - nearX) * (x - nearX) + (y - nearY) * (y - nearY);
          if (distSq < radius * radius) return true;
        }
      }
    }
    // Barrels collision
    for (const b of state.barrels) {
      if (!b.dead) {
        const d = Math.hypot(x - b.x, y - b.y);
        if (d < radius + b.radius) return true;
      }
    }
    return false;
  }

  // --- Movement with sliding collision
  function moveEntity(state, entity, dx, dy, radius) {
    // Attempt full move
    if (!collides(state, entity.x + dx, entity.y + dy, radius)) {
      entity.x += dx;
      entity.y += dy;
      return true;
    }
    // Attempt slide along X
    if (Math.abs(dx) > 0.0001 && !collides(state, entity.x + dx, entity.y, radius)) {
      entity.x += dx;
      return true;
    }
    // Attempt slide along Y
    if (Math.abs(dy) > 0.0001 && !collides(state, entity.x, entity.y + dy, radius)) {
      entity.y += dy;
      return true;
    }
    return false;
  }

  // --- Splash damage
  function applySplash(state, originX, originY, radius, maxDamage, events, sourceEntity = null) {
    // Monsters
    for (const m of state.monsters) {
      if (m.state === 'corpse') continue;
      const d = Math.hypot(m.x - originX, m.y - originY);
      if (d <= radius && lineOfSight(state, originX, originY, m.x, m.y)) {
        const falloff = 1.0 - (d / radius) * 0.5;
        const dmg = Math.round(maxDamage * Math.max(0.2, falloff));
        damageMonster(state, m, dmg, events);
      }
    }
    // Player
    const pd = Math.hypot(state.player.x - originX, state.player.y - originY);
    if (pd <= radius && lineOfSight(state, originX, originY, state.player.x, state.player.y)) {
      const falloff = 1.0 - (pd / radius) * 0.5;
      const dmg = Math.round(maxDamage * Math.max(0.2, falloff));
      damagePlayer(state, dmg, events, 'explosion');
    }
    // Barrels
    for (const b of state.barrels) {
      if (b.dead) continue;
      const bd = Math.hypot(b.x - originX, b.y - originY);
      if (bd <= radius && bd > 0.05 && lineOfSight(state, originX, originY, b.x, b.y)) {
        const dmg = Math.round(maxDamage * (1.0 - bd / radius));
        damageBarrel(state, b, dmg, events);
      }
    }
  }

  // --- Damage Handlers
  function damageMonster(state, monster, damage, events) {
    if (monster.state === 'corpse') return;
    monster.hp -= damage;
    monster.flash = 0.15;
    if (monster.state === 'idle') monster.state = 'chase';
    events.push({ type: 'hit', target: monster.id, damage });

    if (monster.hp <= 0) {
      monster.hp = 0;
      monster.state = 'corpse';
      monster.frame = 'corpse';
      state.kills++;
      const scoreGain = MONSTERS[monster.kind].score;
      state.score += scoreGain;
      events.push({ type: 'die', monster: monster.kind, x: monster.x, y: monster.y, score: scoreGain });

      // Item drop
      const dropKind = MONSTERS[monster.kind].drop;
      if (dropKind) {
        state.items.push({
          id: state.nextId++,
          kind: dropKind,
          x: monster.x,
          y: monster.y,
          collected: false
        });
        events.push({ type: 'drop', kind: dropKind, x: monster.x, y: monster.y });
      }

      if (monster.kind === 'titan') {
        events.push({ type: 'titan_killed' });
      }
    }
  }

  function damageBarrel(state, barrel, damage, events) {
    if (barrel.dead) return;
    barrel.hp -= damage;
    if (barrel.hp <= 0) {
      barrel.dead = true;
      events.push({ type: 'explode', x: barrel.x, y: barrel.y, radius: 2.6, barrel: true });
      applySplash(state, barrel.x, barrel.y, 2.6, 80, events, barrel);
    }
  }

  function damagePlayer(state, damage, events, cause = 'monster') {
    if (state.dead || state.won) return;
    let hpDmg = damage;
    if (state.player.armour > 0) {
      const armDmg = Math.min(state.player.armour, Math.ceil(damage * 0.55));
      state.player.armour -= armDmg;
      hpDmg -= armDmg;
    }
    state.player.hp = Math.max(0, state.player.hp - hpDmg);
    events.push({ type: 'hurt', damage, cause });

    if (state.player.hp <= 0) {
      state.dead = true;
      events.push({ type: 'player_die', cause });
    }
  }

  // --- Raycast hitscan attack
  function fireHitscan(state, startX, startY, angle, maxRange, damage, events) {
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    let step = 0.15;
    let dist = 0.2;
    let hitSomething = false;

    while (dist < maxRange) {
      const rx = startX + dirX * dist;
      const ry = startY + dirY * dist;

      // Check tile
      if (!isPassable(state, rx, ry)) {
        events.push({ type: 'spark', x: rx, y: ry });
        hitSomething = true;
        break;
      }

      // Check monsters
      let hitMonster = null;
      for (const m of state.monsters) {
        if (m.state === 'corpse') continue;
        if (Math.hypot(m.x - rx, m.y - ry) < MONSTERS[m.kind].size) {
          hitMonster = m;
          break;
        }
      }
      if (hitMonster) {
        damageMonster(state, hitMonster, damage, events);
        hitSomething = true;
        break;
      }

      // Check barrels
      let hitBarrel = null;
      for (const b of state.barrels) {
        if (!b.dead && Math.hypot(b.x - rx, b.y - ry) < b.radius) {
          hitBarrel = b;
          break;
        }
      }
      if (hitBarrel) {
        damageBarrel(state, hitBarrel, damage, events);
        hitSomething = true;
        break;
      }

      dist += step;
    }
    return hitSomething;
  }

  // --- Main Tick Step
  function step(state, dt, input = {}) {
    const events = [];
    if (state.dead || state.won) return events;

    // Clamp dt to avoid physics tunnelling
    dt = Math.min(0.08, Math.max(0.001, dt));
    state.time += dt;

    const p = state.player;

    // 1. Weapon Switching
    if (input.switchWeapon) {
      const wName = typeof input.switchWeapon === 'number'
        ? (['pistol', 'shotgun', 'chaingun', 'launcher'][input.switchWeapon - 1])
        : input.switchWeapon;
      if (wName && WEAPONS[wName] && p.weapons[wName] && p.weapon !== wName) {
        p.weapon = wName;
        p.cooldown = Math.min(p.cooldown, 0.15);
        events.push({ type: 'switch', weapon: wName });
      }
    }

    // 2. Turning
    if (input.turn) {
      p.angle += input.turn * dt * 2.8;
      // Normalize angle to [0, 2*PI)
      p.angle = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }

    // 3. Movement
    const speed = 4.0;
    const moveX = input.moveX || 0, moveY = input.moveY || 0;
    if (moveX !== 0 || moveY !== 0) {
      const mag = Math.hypot(moveX, moveY);
      const nx = moveX / (mag || 1), ny = moveY / (mag || 1);
      const fwdX = Math.cos(p.angle), fwdY = Math.sin(p.angle);
      const rightX = -fwdY, rightY = fwdX;

      const vx = (fwdX * ny + rightX * nx) * speed * dt;
      const vy = (fwdY * ny + rightY * nx) * speed * dt;
      moveEntity(state, p, vx, vy, p.radius);
    }

    // 4. Doors update and automatic opening on proximity / use
    for (const d of state.doors) {
      const dist = Math.hypot(p.x - (d.x + 0.5), p.y - (d.y + 0.5));
      if (dist < 1.4 || (input.use && dist < 2.0)) {
        if (d.kind === DOOR_RED && !p.keys.red) {
          if (input.use || dist < 1.1) events.push({ type: 'locked', kind: 'red' });
        } else if (d.kind === DOOR_BLUE && !p.keys.blue) {
          if (input.use || dist < 1.1) events.push({ type: 'locked', kind: 'blue' });
        } else {
          if (d.state === 'closed') {
            d.state = 'opening';
            events.push({ type: 'door', kind: d.kind, x: d.x, y: d.y });
          }
        }
      }

      if (d.state === 'opening') {
        d.open = Math.min(1, d.open + dt * 2.5);
        if (d.open >= 1) {
          d.state = 'open';
          d.timer = 3.0; // Stay open for 3 seconds
        }
      } else if (d.state === 'open') {
        d.timer -= dt;
        if (d.timer <= 0 && dist > 1.8) {
          d.state = 'closing';
        }
      } else if (d.state === 'closing') {
        d.open = Math.max(0, d.open - dt * 2.5);
        if (d.open <= 0) d.state = 'closed';
      }
    }

    // 5. Exit elevator check
    const currentTile = tileAt(state, p.x, p.y);
    if (currentTile === EXIT) {
      state.won = true;
      state.score += 500;
      events.push({ type: 'win', score: state.score });
      return events;
    }

    // 6. Player Shooting
    if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);

    if (input.shoot && p.cooldown <= 0) {
      const wInfo = WEAPONS[p.weapon];
      const ammoCount = p.ammo[wInfo.ammoType];

      if (ammoCount < wInfo.cost) {
        events.push({ type: 'empty' });
        p.cooldown = 0.25;
      } else {
        p.ammo[wInfo.ammoType] -= wInfo.cost;
        p.cooldown = wInfo.fireRate;
        events.push({ type: 'shoot', weapon: p.weapon, x: p.x, y: p.y });

        if (p.weapon === 'launcher') {
          // Launch rocket projectile
          state.projectiles.push({
            id: state.nextId++,
            kind: 'rocket',
            x: p.x + Math.cos(p.angle) * 0.4,
            y: p.y + Math.sin(p.angle) * 0.4,
            vx: Math.cos(p.angle) * 11,
            vy: Math.sin(p.angle) * 11,
            damage: wInfo.damage,
            splashRadius: wInfo.splashRadius,
            splashDamage: wInfo.splashDamage,
            owner: 'player',
            life: 3.0
          });
        } else {
          // Hitscan weapons (pistol, shotgun, chaingun)
          for (let pellet = 0; pellet < wInfo.pellets; pellet++) {
            const spreadAngle = p.angle + (random(state) - 0.5) * wInfo.spread;
            fireHitscan(state, p.x, p.y, spreadAngle, 25, wInfo.damage, events);
          }
        }
      }
    }

    // 7. Projectile simulation
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const proj = state.projectiles[i];
      proj.life -= dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;

      let hit = false;

      // Wall collision
      if (!isPassable(state, proj.x, proj.y)) {
        hit = true;
      }

      // Entity collisions
      if (!hit) {
        if (proj.owner === 'player') {
          // Monsters
          for (const m of state.monsters) {
            if (m.state === 'corpse') continue;
            if (Math.hypot(m.x - proj.x, m.y - proj.y) < MONSTERS[m.kind].size) {
              damageMonster(state, m, proj.damage, events);
              hit = true;
              break;
            }
          }
          // Barrels
          if (!hit) {
            for (const b of state.barrels) {
              if (!b.dead && Math.hypot(b.x - proj.x, b.y - proj.y) < b.radius) {
                damageBarrel(state, b, proj.damage, events);
                hit = true;
                break;
              }
            }
          }
        } else {
          // Monster projectile hitting player
          if (Math.hypot(p.x - proj.x, p.y - proj.y) < p.radius) {
            damagePlayer(state, proj.damage, events, proj.kind);
            hit = true;
          }
        }
      }

      if (hit || proj.life <= 0) {
        if (proj.splashRadius) {
          events.push({ type: 'explode', x: proj.x, y: proj.y, radius: proj.splashRadius, large: true });
          applySplash(state, proj.x, proj.y, proj.splashRadius, proj.splashDamage, events);
        } else {
          events.push({ type: 'burst', kind: proj.kind, x: proj.x, y: proj.y });
        }
        state.projectiles.splice(i, 1);
      }
    }

    // 8. Monsters AI update
    for (const m of state.monsters) {
      if (m.flash > 0) m.flash = Math.max(0, m.flash - dt);
      if (m.state === 'corpse') continue;

      const mInfo = MONSTERS[m.kind];
      const distToPlayer = Math.hypot(p.x - m.x, p.y - m.y);
      const seesPlayer = distToPlayer < 14 && lineOfSight(state, m.x, m.y, p.x, p.y);

      // State transition: Idle -> Chase
      if (m.state === 'idle' && seesPlayer) {
        m.state = 'chase';
        events.push({ type: 'alert', monster: m.kind });
      }

      // Chase state: move towards player
      if (m.state === 'chase') {
        m.angle = Math.atan2(p.y - m.y, p.x - m.x);
        m.animTimer += dt;
        m.frame = Math.floor(m.animTimer * 4) % 2 === 0 ? 'walk0' : 'walk1';

        // Move if outside melee or attack range
        if (distToPlayer > (mInfo.melee ? 0.9 : 4.0)) {
          const mSpeed = mInfo.speed;
          const mx = Math.cos(m.angle) * mSpeed * dt;
          const my = Math.sin(m.angle) * mSpeed * dt;
          moveEntity(state, m, mx, my, mInfo.size);
        }

        // Attack trigger
        if (m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);
        if (m.cooldown <= 0 && distToPlayer <= mInfo.attackRange && seesPlayer) {
          m.state = 'attack';
          m.frame = 'attack';
          m.animTimer = 0.35; // Attack frame duration
          m.cooldown = mInfo.cooldown;

          // Perform attack action
          if (mInfo.melee) {
            // Melee bite
            if (distToPlayer <= 1.2) {
              damagePlayer(state, 22, events, 'brute');
            }
          } else if (m.kind === 'trooper') {
            // Trooper rifle hitscan
            events.push({ type: 'monster_shoot', kind: 'trooper', x: m.x, y: m.y });
            damagePlayer(state, 10, events, 'trooper');
          } else if (m.kind === 'spitter') {
            // Fireball projectile
            events.push({ type: 'monster_shoot', kind: 'spitter', x: m.x, y: m.y });
            state.projectiles.push({
              id: state.nextId++,
              kind: 'fireball',
              x: m.x + Math.cos(m.angle) * 0.4,
              y: m.y + Math.sin(m.angle) * 0.4,
              vx: Math.cos(m.angle) * 6.5,
              vy: Math.sin(m.angle) * 6.5,
              damage: 16,
              owner: 'monster',
              life: 4.0
            });
          } else if (m.kind === 'wisp') {
            // Plasma projectile
            events.push({ type: 'monster_shoot', kind: 'wisp', x: m.x, y: m.y });
            state.projectiles.push({
              id: state.nextId++,
              kind: 'plasma',
              x: m.x + Math.cos(m.angle) * 0.4,
              y: m.y + Math.sin(m.angle) * 0.4,
              vx: Math.cos(m.angle) * 8.0,
              vy: Math.sin(m.angle) * 8.0,
              damage: 14,
              owner: 'monster',
              life: 4.0
            });
          } else if (m.kind === 'titan') {
            // Titan Rocket launcher
            events.push({ type: 'monster_shoot', kind: 'titan', x: m.x, y: m.y });
            state.projectiles.push({
              id: state.nextId++,
              kind: 'rocket',
              x: m.x + Math.cos(m.angle) * 0.5,
              y: m.y + Math.sin(m.angle) * 0.5,
              vx: Math.cos(m.angle) * 8.5,
              vy: Math.sin(m.angle) * 8.5,
              damage: 50,
              splashRadius: 2.2,
              splashDamage: 45,
              owner: 'monster',
              life: 5.0
            });
          }
        }
      } else if (m.state === 'attack') {
        m.animTimer -= dt;
        if (m.animTimer <= 0) {
          m.state = 'chase';
          m.frame = 'walk0';
        }
      }
    }

    // 9. Items pickup
    for (const item of state.items) {
      if (item.collected) continue;
      const d = Math.hypot(p.x - item.x, p.y - item.y);
      if (d < 0.6) {
        let picked = false;
        switch (item.kind) {
          case 'medkit':
            if (p.hp < p.maxHp) {
              p.hp = Math.min(p.maxHp, p.hp + 25);
              picked = true;
            }
            break;
          case 'stim':
            if (p.hp < p.maxHp) {
              p.hp = Math.min(p.maxHp, p.hp + 10);
              picked = true;
            }
            break;
          case 'armour':
            if (p.armour < p.maxArmour) {
              p.armour = Math.min(p.maxArmour, p.armour + 50);
              picked = true;
            }
            break;
          case 'clip':
            if (p.ammo.bullets < MAX_AMMO.bullets) {
              p.ammo.bullets = Math.min(MAX_AMMO.bullets, p.ammo.bullets + 10);
              picked = true;
            }
            break;
          case 'bulletbox':
            if (p.ammo.bullets < MAX_AMMO.bullets) {
              p.ammo.bullets = Math.min(MAX_AMMO.bullets, p.ammo.bullets + 50);
              picked = true;
            }
            break;
          case 'shells':
            if (p.ammo.shells < MAX_AMMO.shells) {
              p.ammo.shells = Math.min(MAX_AMMO.shells, p.ammo.shells + 4);
              picked = true;
            }
            break;
          case 'shellbox':
            if (p.ammo.shells < MAX_AMMO.shells) {
              p.ammo.shells = Math.min(MAX_AMMO.shells, p.ammo.shells + 20);
              picked = true;
            }
            break;
          case 'rockets':
            if (p.ammo.rockets < MAX_AMMO.rockets) {
              p.ammo.rockets = Math.min(MAX_AMMO.rockets, p.ammo.rockets + 2);
              picked = true;
            }
            break;
          case 'rocketbox':
            if (p.ammo.rockets < MAX_AMMO.rockets) {
              p.ammo.rockets = Math.min(MAX_AMMO.rockets, p.ammo.rockets + 10);
              picked = true;
            }
            break;
          case 'key.red':
            p.keys.red = true;
            picked = true;
            break;
          case 'key.blue':
            p.keys.blue = true;
            picked = true;
            break;
          case 'gun.shotgun':
            p.weapons.shotgun = true;
            p.ammo.shells = Math.min(MAX_AMMO.shells, p.ammo.shells + 8);
            if (p.weapon === 'pistol') p.weapon = 'shotgun';
            picked = true;
            break;
          case 'gun.chaingun':
            p.weapons.chaingun = true;
            p.ammo.bullets = Math.min(MAX_AMMO.bullets, p.ammo.bullets + 40);
            p.weapon = 'chaingun';
            picked = true;
            break;
          case 'gun.launcher':
            p.weapons.launcher = true;
            p.ammo.rockets = Math.min(MAX_AMMO.rockets, p.ammo.rockets + 4);
            p.weapon = 'launcher';
            picked = true;
            break;
        }

        if (picked) {
          item.collected = true;
          state.score += 10;
          events.push({ type: 'pickup', kind: item.kind });
        }
      }
    }

    return events;
  }

  function score(state) {
    return state.score + state.kills * 25 + (state.won ? 500 : 0) - Math.floor(state.time);
  }

  // --- Save / Restore Validation
  function restore(data) {
    if (!data || data.version !== 1 || typeof data.seed !== 'string' ||
        !Array.isArray(data.tiles) || data.tiles.length !== SIZE * SIZE ||
        !data.player || !Array.isArray(data.monsters) || !Array.isArray(data.doors) ||
        !Array.isArray(data.items) || !Array.isArray(data.barrels)) {
      throw new Error('Saved run is not a valid Inkfire run.');
    }
    return JSON.parse(JSON.stringify(data));
  }

  // Export
  global.Inkfire = {
    SIZE, WALL, FLOOR, DOOR, DOOR_RED, DOOR_BLUE, EXIT, DIRS,
    MONSTERS, WEAPONS, MAX_AMMO,
    newGame, step, score, restore, tileAt, doorAt, isPassable, isSeeThrough, lineOfSight, distances, hashString, index
  };
})(typeof window !== 'undefined' ? window : globalThis);

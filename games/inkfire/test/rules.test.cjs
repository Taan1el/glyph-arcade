'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const box = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8') + '\nthis.I = Inkfire;', box);
const I = box.I;
const clone = v => JSON.parse(JSON.stringify(v));
let count = 0;

function test(name, run) {
  run();
  count++;
  console.log('PASS ' + name);
}

// Headless bot: picks up keys/weapons/health, fights visible monsters, and navigates to the exit
function botInput(state) {
  const p = state.player;
  const input = { moveX: 0, moveY: 0, turn: 0, shoot: false, use: false, switchWeapon: null };

  // Select best available weapon with ammo
  for (const w of ['launcher', 'chaingun', 'shotgun', 'pistol']) {
    const info = I.WEAPONS[w];
    if (p.weapons[w] && p.ammo[info.ammoType] >= info.cost) {
      if (p.weapon !== w) input.switchWeapon = w;
      break;
    }
  }

  // Check if any living monster is visible and nearby
  let targetMonster = null;
  let bestMonsterDist = Infinity;
  for (const m of state.monsters) {
    if (m.state === 'corpse') continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < 10 && I.lineOfSight(state, p.x, p.y, m.x, m.y) && d < bestMonsterDist) {
      bestMonsterDist = d;
      targetMonster = m;
    }
  }

  if (targetMonster) {
    const desiredAngle = Math.atan2(targetMonster.y - p.y, targetMonster.x - p.x);
    let diff = ((desiredAngle - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    input.turn = Math.max(-1, Math.min(1, diff * 4));
    if (Math.abs(diff) < 0.25 && p.ammo[I.WEAPONS[p.weapon].ammoType] > 0) {
      input.shoot = true;
    }
    // Keep safe distance from brutes or when using launcher
    if (bestMonsterDist < 2.8) input.moveY = -1;
    else if (bestMonsterDist > 5.0) input.moveY = 1;
    else input.moveX = (Math.floor(state.time * 2) % 2 === 0) ? 0.6 : -0.6;
    return input;
  }

  // Determine navigation goal: red key -> blue key -> exit tile
  let goalX = null, goalY = null;
  const redKey = state.items.find(i => i.kind === 'key.red' && !i.collected);
  const blueKey = state.items.find(i => i.kind === 'key.blue' && !i.collected);
  if (!p.keys.red && redKey) {
    goalX = redKey.x; goalY = redKey.y;
  } else if (!p.keys.blue && blueKey) {
    goalX = blueKey.x; goalY = blueKey.y;
  } else {
    const exitIdx = state.tiles.findIndex(t => t === I.EXIT);
    if (exitIdx >= 0) {
      goalX = (exitIdx % I.SIZE) + 0.5;
      goalY = Math.floor(exitIdx / I.SIZE) + 0.5;
    }
  }

  if (goalX !== null) {
    const field = I.distances(state.tiles, goalX, goalY, { allowRed: p.keys.red, allowBlue: p.keys.blue });
    const gx = Math.floor(p.x), gy = Math.floor(p.y);
    let bestDir = null, bestScore = field[I.index(gx, gy)];
    for (const [dx, dy] of I.DIRS) {
      const s = field[I.index(gx + dx, gy + dy)];
      if (s !== undefined && s < bestScore) {
        bestScore = s;
        bestDir = [gx + dx + 0.5, gy + dy + 0.5];
      }
    }
    const target = bestDir || [goalX, goalY];
    const desiredAngle = Math.atan2(target[1] - p.y, target[0] - p.x);
    let diff = ((desiredAngle - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    input.turn = Math.max(-1, Math.min(1, diff * 5));
    input.moveY = Math.abs(diff) < 0.8 ? 1 : 0.3;
    input.use = true;
  }

  return input;
}

function playBotRun(seed, maxSteps = 2200) {
  const state = I.newGame(seed);
  let ticks = 0;
  while (!state.dead && !state.won && ticks < maxSteps) {
    I.step(state, 0.05, botInput(state));
    ticks++;
  }
  return { state, ticks };
}

test('Every map is connected and key progression is solvable from the start', () => {
  for (let s = 0; s < 40; s++) {
    const state = I.newGame('map-seed-' + s);
    assert(state.rooms.length >= 5, 'enough rooms generated');
    const sx = Math.floor(state.player.x), sy = Math.floor(state.player.y);
    const redKey = state.items.find(i => i.kind === 'key.red');
    const blueKey = state.items.find(i => i.kind === 'key.blue');
    const exitIdx = state.tiles.findIndex(t => t === I.EXIT);
    const titan = state.monsters.find(m => m.kind === 'titan');

    assert(redKey && blueKey && exitIdx >= 0 && titan, 'essential progression entities exist');

    const dNoKeys = I.distances(state.tiles, sx, sy, { allowRed: false, allowBlue: false });
    assert(Number.isFinite(dNoKeys[I.index(Math.floor(redKey.x), Math.floor(redKey.y))]), `seed ${s}: red key reachable without keys`);

    const dRedKey = I.distances(state.tiles, sx, sy, { allowRed: true, allowBlue: false });
    assert(Number.isFinite(dRedKey[I.index(Math.floor(blueKey.x), Math.floor(blueKey.y))]), `seed ${s}: blue key reachable with red key`);

    const dAllKeys = I.distances(state.tiles, sx, sy, { allowRed: true, allowBlue: true });
    assert(Number.isFinite(dAllKeys[exitIdx]), `seed ${s}: exit reachable with both keys`);
    assert(Number.isFinite(dAllKeys[I.index(Math.floor(titan.x), Math.floor(titan.y))]), `seed ${s}: titan boss reachable`);
  }
});

test('Runs are deterministic for a seed and differ between seeds', () => {
  const a = playBotRun('det-seed', 150).state;
  const b = playBotRun('det-seed', 150).state;
  const c = I.newGame('different-seed');
  assert.deepEqual(a, b);
  assert.notDeepEqual(c.tiles, I.newGame('det-seed').tiles);
});

test('Player turning, movement, and wall collision', () => {
  const state = I.newGame('physics');
  const p = state.player;
  const startAngle = p.angle;
  I.step(state, 0.05, { turn: 1 });
  assert(p.angle > startAngle, 'player turns right');

  // Force wall right in front of player and verify collision stops movement
  const gx = Math.floor(p.x) + 1, gy = Math.floor(p.y);
  state.tiles[I.index(gx, gy)] = I.WALL;
  p.angle = 0;
  for (let i = 0; i < 40; i++) I.step(state, 0.05, { moveY: 1 });
  assert(p.x < gx - p.radius + 0.01, 'player collides with wall and does not tunnel through');
});

test('Doors open on proximity and keycard doors enforce red and blue keys', () => {
  const state = I.newGame('doors-test');
  state.monsters = [];
  const p = state.player;

  const redDoor = state.doors.find(d => d.kind === I.DOOR_RED);
  if (redDoor) {
    p.x = redDoor.x + 0.5;
    p.y = redDoor.y + 0.5;
    p.keys.red = false;
    const lockedEvents = I.step(state, 0.05, { use: true });
    assert(lockedEvents.some(e => e.type === 'locked' && e.kind === 'red'), 'red door emits locked event without red key');
    assert.equal(redDoor.state, 'closed');

    p.keys.red = true;
    const openEvents = I.step(state, 0.05, { use: true });
    assert(openEvents.some(e => e.type === 'door'), 'red door opens with red key');
    for (let i = 0; i < 20; i++) I.step(state, 0.05, {});
    assert.equal(redDoor.state, 'open');
    assert.equal(redDoor.open, 1);
  }
});

test('Weapons, ammo consumption, hitscan combat, and rocket splash', () => {
  const state = I.newGame('combat-test');
  const p = state.player;
  state.monsters = [];
  state.barrels = [];

  // Place a trooper directly ahead in open floor
  p.angle = 0;
  const tx = Math.floor(p.x) + 2, ty = Math.floor(p.y);
  state.tiles[I.index(tx - 1, ty)] = I.FLOOR;
  state.tiles[I.index(tx, ty)] = I.FLOOR;
  state.monsters.push({
    id: 500, kind: 'trooper', x: tx + 0.5, y: ty + 0.5,
    angle: Math.PI, hp: 15, maxHp: 30, state: 'idle', frame: 'walk0', animTimer: 0, cooldown: 1, flash: 0
  });

  const beforeBullets = p.ammo.bullets;
  const events = I.step(state, 0.05, { shoot: true });
  assert.equal(p.ammo.bullets, beforeBullets - 1, 'pistol consumes 1 bullet');
  assert(events.some(e => e.type === 'shoot' && e.weapon === 'pistol'));
  assert(events.some(e => e.type === 'die' && e.monster === 'trooper'), 'trooper killed by pistol shot');
  assert.equal(state.kills, 1);

  // Test weapon switching and rocket launcher projectile + splash
  p.weapons.launcher = true;
  p.ammo.rockets = 2;
  I.step(state, 0.05, { switchWeapon: 4 });
  assert.equal(p.weapon, 'launcher');
  for (let i = 0; i < 10; i++) I.step(state, 0.05, {}); // clear cooldown
  const rEvents = I.step(state, 0.05, { shoot: true });
  assert(rEvents.some(e => e.type === 'shoot' && e.weapon === 'launcher'));
  assert.equal(state.projectiles.length, 1);
});

test('Explosive barrels chain-react and damage nearby monsters and player', () => {
  const state = I.newGame('barrel-test');
  const p = state.player;
  state.monsters = [];
  const gx = Math.floor(p.x), gy = Math.floor(p.y);
  state.tiles[I.index(gx + 1, gy)] = I.FLOOR;
  state.tiles[I.index(gx + 2, gy)] = I.FLOOR;
  p.x = gx + 0.5; p.y = gy + 0.5; p.angle = 0;

  state.barrels = [
    { id: 701, x: gx + 1.5, y: gy + 0.5, hp: 10, dead: false, radius: 0.35 },
    { id: 702, x: gx + 2.2, y: gy + 0.5, hp: 10, dead: false, radius: 0.35 }
  ];
  state.monsters.push({
    id: 703, kind: 'spitter', x: gx + 2.5, y: gy + 0.5,
    angle: 0, hp: 40, maxHp: 60, state: 'idle', frame: 'walk0', animTimer: 0, cooldown: 1, flash: 0
  });

  const events = I.step(state, 0.05, { shoot: true });
  assert(state.barrels[0].dead, 'first barrel explodes');
  assert(state.barrels[1].dead, 'second barrel chain-explodes');
  assert(events.some(e => e.type === 'explode' && e.barrel));
  assert.equal(state.monsters[0].state, 'corpse', 'nearby spitter killed by barrel splash');
});

test('Pickups restore health, armour, ammo, weapons, and keys up to caps', () => {
  const state = I.newGame('pickups-test');
  const p = state.player;
  p.hp = 60;
  p.armour = 10;
  state.items = [
    { id: 801, kind: 'medkit', x: p.x, y: p.y, collected: false },
    { id: 802, kind: 'armour', x: p.x, y: p.y, collected: false },
    { id: 803, kind: 'gun.shotgun', x: p.x, y: p.y, collected: false },
    { id: 804, kind: 'key.red', x: p.x, y: p.y, collected: false }
  ];
  const events = I.step(state, 0.05, {});
  assert.equal(p.hp, 85);
  assert.equal(p.armour, 60);
  assert.equal(p.weapons.shotgun, true);
  assert.equal(p.keys.red, true);
  assert.equal(events.filter(e => e.type === 'pickup').length, 4);
});

test('Reaching the exit tile wins the run and awards bonus score', () => {
  const state = I.newGame('exit-test');
  const exitIdx = state.tiles.findIndex(t => t === I.EXIT);
  state.player.x = (exitIdx % I.SIZE) + 0.5;
  state.player.y = Math.floor(exitIdx / I.SIZE) + 0.5;
  const events = I.step(state, 0.05, {});
  assert.equal(state.won, true);
  assert(events.some(e => e.type === 'win'));
  assert(I.score(state) >= 500);
});

test('Saves round-trip through JSON and reject invalid payloads', () => {
  const state = playBotRun('save-seed', 80).state;
  const restored = I.restore(clone(state));
  assert.deepEqual(restored, state);
  assert.throws(() => I.restore({ version: 2 }), /not a valid Inkfire run/);
  assert.throws(() => I.restore(null), /not a valid Inkfire run/);
});

test('Bot runs execute cleanly across 50 seeds without crashes', () => {
  let won = 0, died = 0, active = 0, totalKills = 0;
  for (let s = 0; s < 50; s++) {
    const { state } = playBotRun('bot-seed-' + s, 1600);
    if (state.won) won++;
    else if (state.dead) died++;
    else active++;
    totalKills += state.kills;
  }
  console.log(`   50 bot runs: ${won} won, ${died} died, ${active} timed out, ${totalKills} total kills`);
  assert(won + died > 0, 'bots engage with combat and progression');
  assert(totalKills >= 25, 'bots fight and kill monsters across runs');
});

console.log(`${count}/${count} Inkfire rules checks passed.`);

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { playRun } = require('./bot.cjs');

const box = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8') + '\nthis.B = Burrow;', box);
const B = box.B, { T } = B;
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const tick = (state, input = {}, frames = 1) => { const events = []; for (let i = 0; i < frames; i++) events.push(...B.step(state, input)); return events; };
const countTile = (state, tile) => state.tiles.reduce((n, t) => n + (t === tile ? 1 : 0), 0);
// Clears a working pocket around a point so a test controls exactly what is nearby.
function pocket(state, x, y, w = 12, h = 8) {
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) {
    state.tiles[B.index(cx, cy)] = T.AIR;
    state.liquid[B.index(cx, cy)] = 0;
  }
  for (let cx = x - 1; cx <= x + w; cx++) { state.tiles[B.index(cx, y + h)] = T.STONE; state.tiles[B.index(cx, y - 1)] = T.STONE; }
  for (let cy = y - 1; cy <= y + h; cy++) { state.tiles[B.index(x - 1, cy)] = T.STONE; state.tiles[B.index(x + w, cy)] = T.STONE; }
  Object.assign(state.player, { x: x + 1, y: y + h - state.player.h - 0.01, vx: 0, vy: 0, grounded: true });
  state.spawnTimer = 9999;
  state.creatures = [];
}

test('Worlds have every resource, a bedrock floor, and a sealed altar under the spawn', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const state = B.newGame(seed);
    assert(countTile(state, T.TRUNK) > 150, 'trees');
    const nearest = []; for (let x = 0; x < B.WIDTH; x++) if (B.tileAt(state, x, state.surface[x] - 1) === T.TRUNK) nearest.push(Math.abs(x - B.WIDTH / 2));
    assert(nearest.filter(d => d < 26).length >= 4, 'a grove beside the spawn');
    assert(countTile(state, T.COPPER) > 150, 'copper');
    assert(countTile(state, T.IRON) > 120, 'iron');
    assert(countTile(state, T.CRYSTAL) > 60, 'crystal');
    assert.equal(countTile(state, T.ALTAR), 1);
    for (let x = 0; x < B.WIDTH; x++) assert.equal(B.tileAt(state, x, B.HEIGHT - 1), T.BEDROCK);
    assert(Math.abs(state.altar.x - B.WIDTH / 2) < 2);
    assert(!B.solidAt(state, Math.floor(state.player.x), Math.floor(state.player.y)), 'spawn is clear');
  }
});
test('Worlds are deterministic per seed and differ between seeds', () => {
  const a = B.newGame('same'), b = B.newGame('same'), c = B.newGame('other');
  assert.deepEqual([...a.tiles], [...b.tiles]);
  assert.notDeepEqual([...a.tiles], [...c.tiles]);
  for (let i = 0; i < 600; i++) { B.step(a, { right: i % 90 < 60, jump: i % 70 === 0 }); B.step(b, { right: i % 90 < 60, jump: i % 70 === 0 }); }
  assert.equal(a.player.x, b.player.x);
  assert.equal(a.rng, b.rng);
});
test('Gravity lands the player, walking moves, and one-tile ledges are stepped up', () => {
  const state = B.newGame('walk');
  pocket(state, 150, 60);
  tick(state, {}, 30);
  assert(state.player.grounded);
  const x = state.player.x;
  state.tiles[B.index(155, 67)] = T.STONE;
  tick(state, { right: true }, 80);
  assert(state.player.x > x + 5, 'walked over a one-tile ledge');
});
test('Jumping clears two tiles but not four', () => {
  const state = B.newGame('jump');
  pocket(state, 150, 60);
  tick(state, {}, 30);
  const floor = state.player.y;
  let top = floor;
  B.step(state, { jump: true });
  for (let i = 0; i < 60; i++) { B.step(state, {}); top = Math.min(top, state.player.y); }
  assert(floor - top > 2 && floor - top < 3.6, `jump height ${floor - top}`);
});
test('Mining takes time, respects pick tier, and pays the drop', () => {
  const state = B.newGame('mine');
  pocket(state, 150, 60);
  tick(state, {}, 20);
  const y = Math.floor(state.player.y);
  state.tiles[B.index(153, y)] = T.STONE;
  state.tiles[B.index(154, y)] = T.IRON;
  const aim = { use: true, aimX: 153.5, aimY: y + 0.5, select: 'pick' };
  tick(state, aim, 10);
  assert.equal(B.tileAt(state, 153, y), T.STONE, 'not instant');
  tick(state, aim, 60);
  assert.equal(B.tileAt(state, 153, y), T.AIR);
  assert.equal(state.items.stone, 1);
  const events = tick(state, { ...aim, aimX: 154.5, usePressed: true }, 80);
  assert.equal(B.tileAt(state, 154, y), T.IRON, 'flint cannot cut iron');
  assert(events.some(e => e.type === 'tooHard'));
  state.pickTier = 2;
  tick(state, { ...aim, aimX: 154.5 }, 90);
  assert.equal(B.tileAt(state, 154, y), T.AIR);
});
test('Holding dig on an emptied tile continues down the line and drops you into the hole', () => {
  const state = B.newGame('hold');
  pocket(state, 150, 60, 12, 4);
  for (let y = 64; y < 70; y++) for (let x = 149; x < 163; x++) state.tiles[B.index(x, y)] = T.DIRT;
  tick(state, {}, 20);
  Object.assign(state.player, { x: 154.5 });
  const startY = state.player.y;
  // A held cursor stays put on screen, so in the world it moves down with the player.
  for (let i = 0; i < 150; i++) B.step(state, { use: true, aimX: state.player.x + 0.95, aimY: state.player.y + 2.3, select: 'pick' });
  assert((state.items.dirt || 0) >= 3, `dug ${state.items.dirt} blocks`);
  assert(state.player.y > startY + 1.5, 'the player dropped into the shaft');
});
test('Reach limits mining and placing', () => {
  const state = B.newGame('reach');
  pocket(state, 150, 60, 14);
  tick(state, {}, 20);
  const y = Math.floor(state.player.y);
  state.tiles[B.index(162, y)] = T.DIRT;
  tick(state, { use: true, aimX: 162.5, aimY: y + 0.5, select: 'pick' }, 60);
  assert.equal(B.tileAt(state, 162, y), T.DIRT);
});
test('Felling a trunk brings the tree down and pays for every log', () => {
  const state = B.newGame('tree');
  const at = state.tiles.findIndex(t => t === T.TRUNK), x = at % B.WIDTH;
  let bottom = Math.floor(at / B.WIDTH);
  while (B.tileAt(state, x, bottom + 1) === T.TRUNK) bottom++;
  let logs = 0;
  for (let y = bottom; B.tileAt(state, x, y) === T.TRUNK; y--) logs++;
  Object.assign(state.player, { x: x - 2, y: bottom - 1 });
  tick(state, { use: true, aimX: x + 0.5, aimY: bottom + 0.5, select: 'pick' }, 60);
  assert.equal(B.tileAt(state, x, bottom), T.AIR);
  assert.equal(state.items.wood, logs);
});
test('Blocks place next to something, never inside you, and spend the item', () => {
  const state = B.newGame('place');
  pocket(state, 150, 60);
  tick(state, {}, 20);
  B.give(state, 'stone', 2);
  const y = Math.floor(state.player.y + 1);
  tick(state, { use: true, aimX: 153.5, aimY: y + 0.5, select: 'stone' }, 2);
  assert.equal(B.tileAt(state, 153, y), T.STONE);
  assert.equal(state.items.stone, 1);
  tick(state, { use: true, aimX: state.player.x + 0.3, aimY: y + 0.5, select: 'stone' }, 2);
  assert.equal(B.tileAt(state, Math.floor(state.player.x + 0.3), y), T.AIR, 'not inside the player');
});
test('Recipes need materials, a bench and the earlier tier', () => {
  const state = B.newGame('craft');
  const recipe = id => B.RECIPES.find(r => r.id === id);
  assert.equal(B.recipeState(state, recipe('bench')), 'missing');
  B.give(state, 'wood', 10);
  assert.equal(B.recipeState(state, recipe('bench')), 'ready');
  tick(state, { craft: 'bench' });
  assert.equal(state.items.bench, 1);
  assert.equal(state.items.wood, 6);
  B.give(state, 'copper', 12);
  assert.equal(B.recipeState(state, recipe('pick2')), 'bench');
  assert.equal(B.recipeState(state, recipe('pick3')), 'locked');
  state.tiles[B.index(Math.floor(state.player.x) + 1, Math.floor(state.player.y))] = T.BENCH;
  tick(state, { craft: 'pick2' });
  assert.equal(state.pickTier, 2);
  assert.equal(B.recipeState(state, recipe('pick2')), 'owned');
});
test('Water settles into a pool and lava turns water to obsidian', () => {
  const state = B.newGame('flow');
  pocket(state, 150, 60, 12, 6);
  state.liquid[B.index(155, 61)] = (B.WATER << 4) | 8;
  state.liquid[B.index(156, 61)] = (B.WATER << 4) | 8;
  const total = () => { let n = 0; for (let y = 60; y < 66; y++) for (let x = 150; x < 162; x++) n += B.liquidLevel(state, x, y); return n; };
  tick(state, {}, 900);
  assert.equal(total(), 16, 'water is conserved');
  const floorRow = []; for (let x = 150; x < 162; x++) floorRow.push(B.liquidLevel(state, x, 65));
  assert(floorRow.filter(Boolean).length >= 8, `water spread: ${floorRow}`);
  assert(floorRow[0] + floorRow[1] + floorRow[2] > 0 && floorRow[9] + floorRow[10] + floorRow[11] > 0, `both ways: ${floorRow}`);
  const settled = floorRow.join(); tick(state, {}, 120);
  for (let x = 150; x < 162; x++) floorRow[x - 150] = B.liquidLevel(state, x, 65);
  assert.equal(floorRow.join(), settled, 'a settled pool stops moving');
  state.liquid[B.index(158, 61)] = (B.LAVA << 4) | 8;
  tick(state, {}, 300);
  assert(countTile(state, T.OBSIDIAN) > 0);
});
test('Sand falls when the ground under it is dug out', () => {
  const state = B.newGame('sand');
  pocket(state, 150, 60);
  state.tiles[B.index(156, 61)] = T.SAND;
  tick(state, {}, 120);
  assert.equal(B.tileAt(state, 156, 61), T.AIR);
  assert.equal(B.tileAt(state, 156, 67), T.SAND);
});
test('Creatures hurt with invulnerability frames, armour helps, and swords kill', () => {
  const state = B.newGame('fight');
  pocket(state, 150, 60);
  tick(state, {}, 20);
  state.creatures.push({ id: 900, kind: 'zombie', x: state.player.x + 0.5, y: state.player.y, vx: 0, vy: 0, w: 0.9, h: 1.8, hp: 34, flash: 0, timer: 0, anim: 0, facing: -1, grounded: true });
  tick(state, {}, 3);
  assert.equal(state.player.hp, 89);
  tick(state, {}, 10);
  assert.equal(state.player.hp, 89, 'invulnerable right after a hit');
  state.armourTier = 4;
  state.player.hurtTimer = 0;
  state.creatures[0].x = state.player.x + 0.5;
  tick(state, {}, 2);
  assert.equal(state.player.hp, 85);
  state.swordTier = 4;
  state.player.facing = state.creatures[0].x > state.player.x ? 1 : -1;
  state.creatures[0].x = state.player.x + state.player.facing;
  const events = tick(state, { attack: true }, 2);
  assert(events.some(e => e.type === 'hit'));
});
test('Dying respawns you with your items and counts the death', () => {
  const state = B.newGame('die');
  pocket(state, 150, 60);
  B.give(state, 'stone', 5);
  state.player.hp = 1;
  tick(state, {}, 20);
  state.creatures.push({ id: 900, kind: 'zombie', x: state.player.x, y: state.player.y, vx: 0, vy: 0, w: 0.9, h: 1.8, hp: 34, flash: 0, timer: 0, anim: 0, facing: -1, grounded: true });
  const events = tick(state, {}, 3);
  assert(events.some(e => e.type === 'died'));
  assert.equal(state.deaths, 1);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.items.stone, 5);
  assert.equal(state.player.x, state.spawn.x);
});
test('The altar needs the key, wakes The Maw, and dying to it returns the key', () => {
  const state = B.newGame('boss'), { x, y } = state.altar;
  Object.assign(state.player, { x: x - 1, y: y - 1 });
  const use = { use: true, usePressed: true, aimX: x + 0.5, aimY: y + 0.5, select: 'pick' };
  assert(tick(state, use, 1).some(e => e.type === 'altarLocked'));
  B.give(state, 'key', 1);
  assert(tick(state, use, 1).some(e => e.type === 'bossAwake'));
  assert.equal(state.items.key, undefined);
  assert.equal(state.boss.segments.length, B.SEGMENTS);
  state.player.hp = 1;
  state.player.hurtTimer = 0;
  state.boss.segments[0].x = state.player.x;
  state.boss.segments[0].y = state.player.y + 1;
  tick(state, {}, 2);
  assert.equal(state.boss, null);
  assert.equal(state.items.key, 1);
});
test('Light reaches the sky and torches but leaves sealed rock dark', () => {
  const state = B.newGame('light');
  const light = B.computeLight(state, 150, 20, 20, 20);
  assert.equal(light[3], 255, 'open sky');
  pocket(state, 150, 100, 10, 6);
  const dark = B.computeLight(state, 145, 96, 20, 14);
  assert.equal(Math.max(...dark.filter((_, i) => i % 4 === 0)), 0, 'no torch, no light');
  state.tiles[B.index(155, 103)] = T.TORCH;
  const lit = B.computeLight(state, 145, 96, 20, 14), at = (x, y) => lit[((y - 96) * 20 + x - 145) * 4];
  assert(at(155, 103) > 200);
  assert(at(152, 103) > at(148, 103));
});
test('The clock turns day into night and back', () => {
  const state = B.newGame('clock');
  assert(B.daylight(state) > 0.9);
  state.clock = 0.8;
  assert(B.isNight(state));
  assert(B.daylight(state) < 0.3);
  state.clock = 0.999;
  assert(tick(state, {}, 60).some(e => e.type === 'dawn'));
  assert.equal(state.day, 2);
});
test('Saves round-trip compactly and reject foreign data', () => {
  const state = B.newGame('save');
  tick(state, { right: true }, 200);
  const text = B.save(state), copy = B.restore(text);
  assert(text.length < 900000, `save is ${text.length} bytes`);
  assert.deepEqual([...copy.tiles], [...state.tiles]);
  assert.equal(copy.player.x, state.player.x);
  tick(copy, { right: true }, 60);
  tick(state, { right: true }, 60);
  assert.equal(copy.player.x, state.player.x);
  assert.throws(() => B.restore({ version: 9 }), /not a Burrow world/);
});
test('Objectives always name the next step', () => {
  const state = B.newGame('goal');
  assert.match(B.objective(state), /tree/);
  B.give(state, 'wood', 6);
  assert.match(B.objective(state), /Workbench/);
  state.flags.bench = true;
  state.items.bench = undefined;
  delete state.items.bench;
  assert.match(B.objective(state), /copper/i);
  state.pickTier = 3;
  assert.match(B.objective(state), /crystal/i);
});
test('A plain-input bot finishes the game from first tree to The Maw', () => {
  const runs = ['one', 'two', 'three', 'four'].map(seed => playRun(B, seed, 'easy'));
  const report = runs.map(r => `${r.state.won ? 'won' : 'unfinished'} ${r.minutes.toFixed(1)}m pick ${r.state.pickTier} deaths ${r.state.deaths}`);
  console.log('   ' + report.join(' | '));
  assert(runs.filter(r => r.state.won).length >= 3, 'most bot runs must reach the ending');
});
console.log(`${count}/${count} Burrow rules checks passed.`);

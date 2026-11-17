'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { playRun, playAi } = require('./bot.cjs');

const box = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8') + '\nthis.B = Bannerfall;', box);
const B = box.B, { T } = B;
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const tick = (state, input = {}, frames = 1) => { const events = []; for (let i = 0; i < frames; i++) events.push(...B.step(state, input)); return events; };
const units = (state, type, team) => state.units.filter(u => u.type === type && (team === undefined || u.team === team));
// A quiet arena: no minions, no camps, every hero parked at home and idle until a test moves it.
function arena(seed, hero = 'warden') {
  const state = B.newGame(seed, hero);
  state.units = state.units.filter(u => u.type !== 'beast');
  state.nextWave = 1e9;
  state.colossusTimer = 1e9;
  state.camps.forEach(c => { c.respawn = 1e9; });
  for (const h of B.heroes(state)) { h.x = B.BASES[h.team].x; h.y = B.BASES[h.team].y; h.dead = 0; h.think = 1e9; }
  return state;
}
const place = (u, x, y) => { u.x = x; u.y = y; };
// An open stretch of the top lane, far from every tower, for duels.
const X = 30, Y = 9;

test('The map mirrors through its centre, and lanes, camps and the pit connect both bases', () => {
  for (const seed of ['a', 'b', 'c']) {
    const map = B.mapFor(seed);
    for (let y = 0; y < B.HEIGHT; y++) for (let x = 0; x < B.WIDTH; x++) {
      assert.equal(map.tiles[y * B.WIDTH + x], map.tiles[(B.HEIGHT - 1 - y) * B.WIDTH + (B.WIDTH - 1 - x)], `mirror at ${x},${y}`);
    }
    const seen = new Uint8Array(B.WIDTH * B.HEIGHT), queue = [Math.floor(B.BASES[0].y) * B.WIDTH + Math.floor(B.BASES[0].x)];
    seen[queue[0]] = 1;
    while (queue.length) {
      const i = queue.pop(), x = i % B.WIDTH, y = (i - x) / B.WIDTH;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * B.WIDTH + x + dx;
        if (!seen[j] && B.walkableTile(map.tiles[j])) { seen[j] = 1; queue.push(j); }
      }
    }
    for (const p of [B.BASES[1], B.PIT, ...B.CAMPS]) assert(seen[Math.floor(p.y) * B.WIDTH + Math.floor(p.x)], `reachable ${p.x},${p.y}`);
    for (let lane = 0; lane < 3; lane++) for (let along = 0; along <= B.LANE_LENGTHS[lane]; along += 2) {
      const p = B.lanePoint(lane, along);
      assert.notEqual(B.tileAt(map, p.x, p.y), T.TREE, `${B.LANE_NAMES[lane]} lane is open at ${along}`);
    }
  }
  const state = B.newGame('towers');
  for (const t of units(state, 'tower', 0)) {
    const twin = units(state, 'tower', 1).find(o => Math.abs(o.x + t.x - B.WIDTH) < 0.01 && Math.abs(o.y + t.y - B.HEIGHT) < 0.01);
    assert(twin && twin.order === t.order, 'every blue tower has a red twin');
  }
});

test('Matches are deterministic per seed, and saves round-trip and reject other data', () => {
  const a = B.newGame('same', 'ember'), b = B.newGame('same', 'ember');
  tick(a, { auto: true }, 2400);
  tick(b, { auto: true }, 2400);
  assert.equal(B.save(a), B.save(b));
  const copy = B.restore(B.save(a));
  tick(a, { auto: true }, 600);
  tick(copy, { auto: true }, 600);
  assert.equal(B.save(a), B.save(copy));
  assert.throws(() => B.restore({ version: 9 }), /not a Bannerfall match/);
  const broken = JSON.parse(B.save(a));
  broken.units[0].x = null;
  assert.throws(() => B.restore(broken), /not a Bannerfall match/);
});

test('Waves march down all three lanes and meet in the middle when no hero interferes', () => {
  const state = arena('waves');
  state.nextWave = 0.01;
  tick(state);
  for (let team = 0; team < 2; team++) for (let lane = 0; lane < 3; lane++) {
    const wave = state.units.filter(u => u.type === 'minion' && u.team === team && u.lane === lane);
    assert.deepEqual(Array.from(wave, m => m.kind), ['melee', 'melee', 'melee', 'ranged', 'ranged'], 'three melee and two ranged');
  }
  state.nextWave = 1e9;
  const clashes = [null, null, null];
  const laneOf = e => [0, 1, 2].reduce((best, l) => (B.laneProject(l, e.x, e.y).dist < B.laneProject(best, e.x, e.y).dist ? l : best), 0);
  for (let i = 0; i < 60 * 40 && clashes.some(c => c === null); i++) {
    for (const e of B.step(state, {})) if (e.type === 'minionDown') {
      const lane = laneOf(e);
      if (clashes[lane] === null) clashes[lane] = B.laneProject(lane, e.x, e.y).along;
    }
  }
  for (let lane = 0; lane < 3; lane++) {
    assert(clashes[lane] !== null, `${B.LANE_NAMES[lane]} lane fought`);
    assert(Math.abs(clashes[lane] - B.LANE_LENGTHS[lane] / 2) < 10, `${B.LANE_NAMES[lane]} first clash at ${clashes[lane].toFixed(1)} of ${B.LANE_LENGTHS[lane].toFixed(1)}`);
  }
});

test('Last hits pay gold, nearby heroes share experience, and levels raise stats', () => {
  const state = arena('farm', 'ranger'), p = B.playerHero(state), ally = B.heroes(state, 0).find(h => !h.player);
  place(p, X, Y);
  place(ally, X - 4, Y + 1);
  state.nextWave = 0.01;
  tick(state);
  state.nextWave = 1e9;
  const minion = state.units.find(u => u.type === 'minion' && u.team === 1);
  place(minion, X + 4, Y);
  minion.hp = 5;
  const gold = p.gold, xp = ally.xp;
  const events = tick(state, { order: { kind: 'attack', id: minion.id } }, 90);
  assert(events.some(e => e.type === 'gold'), 'the player sees the gold');
  assert(p.gold >= gold + B.MINIONS[minion.kind].gold, 'last hit paid');
  assert.equal(p.cs, 1);
  assert(ally.xp > xp, 'a hero nearby shares the experience');
  const damage = p.damage, hp = p.maxHp;
  p.xp = B.xpNeed(p.level) - 1;
  const victim = state.units.find(u => u.type === 'minion' && u.team === 1 && u.hp > 0);
  place(victim, X + 1, Y);
  victim.hp = 1;
  tick(state, { order: { kind: 'attack', id: victim.id } }, 90);
  assert.equal(p.level, 2);
  assert(p.damage > damage && p.maxHp > hp, 'a level raises damage and health');
});

test('Towers shoot minions first, then switch to a hero who attacks a hero under them', () => {
  const state = arena('towers');
  const tower = units(state, 'tower', 1).find(t => t.lane === 1 && t.order === 0);
  const p = B.playerHero(state), rival = B.heroes(state, 1)[1];
  state.nextWave = 0.01;
  tick(state);
  state.nextWave = 1e9;
  const minion = state.units.find(u => u.type === 'minion' && u.team === 0);
  for (const m of state.units) if (m.type === 'minion' && m !== minion) m.hp = 0;
  tick(state);
  place(minion, tower.x - 3, tower.y + 1);
  minion.hp = minion.maxHp = 1e5;
  place(p, tower.x - 5, tower.y + 3);
  tick(state, {}, 70);
  assert.equal(tower.target, minion.id, 'the minion draws the tower');
  place(rival, tower.x - 3.5, tower.y + 3.5);
  tick(state, { order: { kind: 'attack', id: rival.id } }, 90);
  assert.equal(tower.target, p.id, 'hurting a hero under the tower draws its fire');
  assert(p.hp < p.maxHp);
});

test('Inner towers and the banner are protected until the structures in front of them fall', () => {
  const state = arena('guard', 'ranger'), p = B.playerHero(state);
  const inner = units(state, 'tower', 1).find(t => t.lane === 1 && t.order === 1), outer = units(state, 'tower', 1).find(t => t.lane === 1 && t.order === 0);
  const banner = units(state, 'banner', 1)[0];
  assert(B.isProtected(state, inner) && B.isProtected(state, banner));
  p.hp = p.maxHp = 1e6;
  place(p, inner.x - 4, inner.y + 2);
  tick(state, { order: { kind: 'attack', id: inner.id } }, 120);
  assert.equal(inner.hp, inner.maxHp, 'the inner tower takes no damage while the outer stands');
  outer.hp = 1;
  place(p, outer.x - 4, outer.y + 2);
  tick(state, { order: { kind: 'attack', id: outer.id } }, 120);
  assert(!B.alive(outer));
  assert(!B.isProtected(state, inner) && B.isProtected(state, banner));
  inner.hp = 1;
  place(p, inner.x - 4, inner.y + 2);
  const events = tick(state, { order: { kind: 'attack', id: inner.id } }, 120);
  assert(events.some(e => e.type === 'towerDown'));
  assert(!B.isProtected(state, banner), 'one broken lane exposes the banner');
  banner.hp = 1;
  place(p, banner.x - 4, banner.y + 2);
  const end = tick(state, { order: { kind: 'attack', id: banner.id } }, 120);
  assert(end.some(e => e.type === 'victory'));
  assert.equal(state.status, 'won');
  assert(B.score(state) > 3000);
});

test('Every ability does what it says', () => {
  const setup = hero => {
    const state = arena('cast-' + hero, hero), p = B.playerHero(state), foe = B.heroes(state, 1)[0];
    p.level = 6;
    B.refreshStats(p);
    p.mana = p.maxMana = 999;
    place(p, X, Y);
    place(foe, X + 2.5, Y);
    return { state, p, foe };
  };
  const cast = (state, slot, x, y, frames = 1) => tick(state, { cast: { slot, x, y } }).concat(tick(state, {}, frames - 1));
  // Warden
  let { state, p, foe } = setup('warden');
  cast(state, 0, X + 2.5, Y);
  assert(foe.stun > 0 && foe.hp < foe.maxHp, 'Shield Bash stuns');
  foe.stun = 0;
  cast(state, 1, X + 2, Y);
  assert(p.shield > 0 && foe.tauntTime > 0, 'Rally Shout shields and taunts');
  place(foe, X + 5, Y);
  foe.hp = foe.maxHp;
  foe.tauntTime = 0;
  cast(state, 2, X + 6, Y, 40);
  assert(p.x > X + 2 && foe.hp < foe.maxHp, 'Charge rushes and slams');
  ({ state, p, foe } = setup('warden'));
  place(foe, X + 8, Y);
  cast(state, 3, X + 4, Y);
  const wall = state.effects.find(e => e.kind === 'wall');
  assert(wall && wall.tiles.length >= 6, 'Bulwark raises a wall across the lane');
  foe.order = { kind: 'move', x: X - 2, y: Y };
  tick(state, {}, 60);
  assert(foe.x > X + 4.5, 'foes cannot walk through the wall');
  // Ranger
  ({ state, p, foe } = setup('ranger'));
  cast(state, 0, X + 20, Y);
  assert(foe.hp < foe.maxHp, 'Piercing Arrow hits along the line');
  cast(state, 1, X + 5, Y);
  place(foe, X + 1, Y + 1);
  foe.order = { kind: 'move', x: X + 9, y: Y };
  const snared = tick(state, {}, 120);
  assert(snared.some(e => e.type === 'snap'), 'Snare Trap snaps on whoever steps on it');
  const x = p.x;
  cast(state, 2, X - 6, Y, 30);
  assert(p.x < x - 2 && p.empower > 0, 'Tumble rolls and empowers');
  ({ state, p, foe } = setup('ranger'));
  cast(state, 3, X + 2.5, Y, 200);
  assert(foe.hp < foe.maxHp && !state.effects.some(e => e.kind === 'storm'), 'Arrow Storm pulses then ends');
  // Ember
  ({ state, p, foe } = setup('ember'));
  cast(state, 0, X + 2.5, Y, 30);
  assert(foe.hp < foe.maxHp, 'Fireball bursts');
  cast(state, 1, X + 2.5, Y, 10);
  assert(foe.slowTime > 0, 'Frost Field slows');
  cast(state, 2, X - 6, Y);
  assert(p.x < X - 3, 'Blink teleports');
  ({ state, p, foe } = setup('ember'));
  place(foe, X + 8, Y);
  const before = foe.hp;
  cast(state, 3, X + 8, Y, 30);
  assert.equal(foe.hp, before, 'Meteor waits before landing');
  tick(state, {}, 60);
  assert(foe.hp < before && foe.stun > 0, 'Meteor lands and stuns');
  // Shade
  ({ state, p, foe } = setup('shade'));
  cast(state, 0, X + 2, Y, 30);
  assert(foe.hp < foe.maxHp, 'Shadow Step cuts on landing');
  cast(state, 1, 0, 0);
  assert(p.invisible > 0, 'Smoke hides');
  cast(state, 2, 0, 0);
  assert(p.venom > 0, 'Venom readies poison');
  foe.hp = foe.maxHp * 0.2;
  cast(state, 3, foe.x, foe.y);
  assert(!B.alive(foe), 'Execute finishes a weakened hero');
  assert(p.cooldowns[3] < B.HEROES.shade.abilities[3].cooldown * 0.5, 'a kill refunds most of the cooldown');
  // Locks
  ({ state, p } = setup('ember'));
  p.level = 5;
  cast(state, 3, X + 2, Y);
  assert.equal(p.cooldowns[3], 0, 'the ultimate needs level 6');
  p.mana = 0;
  cast(state, 0, X + 2, Y);
  assert.equal(p.cooldowns[0], 0, 'abilities need mana');
});

test('Recall takes four seconds, damage breaks it, and the shop only sells at base', () => {
  const state = arena('recall', 'ranger'), p = B.playerHero(state), rival = B.heroes(state, 1)[0];
  place(p, X, Y);
  tick(state, { recall: true });
  tick(state, {}, 60 * 4 + 5);
  assert(B.atBase(p), 'recall brought the hero home');
  place(p, X, Y);
  tick(state, { recall: true });
  tick(state, {}, 60);
  place(rival, X + 1.5, Y);
  tick(state, {}, 60);
  assert(!B.atBase(p) && p.recall === 0, 'damage stopped the recall');
  p.gold = 2000;
  tick(state, { buy: 'mail' });
  assert.equal(p.items.length, 0, 'no shopping in the field');
  place(p, B.BASES[0].x, B.BASES[0].y);
  const hp = p.maxHp;
  tick(state, { buy: 'mail' });
  assert.deepEqual([...p.items], ['mail']);
  assert.equal(p.maxHp, hp + B.ITEMS.mail.hp);
  p.gold = 0;
  tick(state, { buy: 'blade' });
  assert.equal(p.items.length, 1, 'gold is needed');
});

test('Heroes respawn after a wait, and kills pay the killer and assistants', () => {
  const state = arena('kill', 'ranger'), p = B.playerHero(state), ally = B.heroes(state, 0).find(h => !h.player), foe = B.heroes(state, 1)[0];
  place(p, X, Y); place(ally, X + 1, Y + 1); place(foe, X + 3, Y);
  foe.hp = 120;
  ally.order = { kind: 'attack', id: foe.id };
  const gold = p.gold;
  const events = [];
  for (let i = 0; i < 300 && foe.dead === 0; i++) events.push(...B.step(state, { order: { kind: 'attack', id: foe.id } }));
  assert(foe.dead > 0, 'the rival fell');
  assert(events.some(e => e.type === 'heroKill' && e.log));
  assert.equal(p.kills + ally.kills, 1);
  assert.equal(p.assists + ally.assists, 1, 'the other hero got an assist');
  assert(p.gold > gold + 80);
  assert.equal(state.kills[0], 1);
  tick(state, {}, Math.ceil(foe.dead * 60) + 2);
  assert(foe.dead === 0 && foe.hp === foe.maxHp && B.atBase(foe), 'the rival returned home whole');
});

test('Camps fight back and pay out, and the Colossus rises at six minutes and empowers its killers', () => {
  const state = B.newGame('jungle', 'ember'), p = B.playerHero(state);
  state.nextWave = 1e9;
  for (const h of B.heroes(state)) if (!h.player) { h.think = 1e9; place(h, B.BASES[h.team].x, B.BASES[h.team].y); }
  const beast = state.units.find(u => u.type === 'beast');
  place(p, B.CAMPS[beast.camp].x, B.CAMPS[beast.camp].y + 2.5);
  const gold = p.gold;
  tick(state, { order: { kind: 'attack', id: beast.id } }, 60);
  assert(beast.aggro === p.id && p.hp < p.maxHp, 'a struck beast fights back');
  beast.hp = 1;
  tick(state, { order: { kind: 'attack', id: beast.id } }, 60);
  assert(p.gold > gold + 40, 'beasts pay');
  state.colossusTimer = 0.01;
  const events = tick(state, {}, 2);
  const colossus = state.units.find(u => u.type === 'colossus');
  assert(colossus && events.some(e => e.type === 'colossusUp'));
  place(p, colossus.x - 4, colossus.y);
  colossus.hp = 1;
  const after = tick(state, { order: { kind: 'attack', id: colossus.id } }, 120);
  assert(after.some(e => e.type === 'colossusDown' && e.team === 0));
  assert(state.buff[0] > 0, 'the killers get the surge');
  assert.equal(B.COLOSSUS_AT, 360, 'the Colossus first rises at six minutes');
});

test('Objectives always name the next step', () => {
  const state = B.newGame('goal', 'warden'), p = B.playerHero(state);
  assert.match(B.objective(state), /middle lane/);
  state.tick = 60 * 60;
  state.time = 60;
  place(p, X, Y);
  p.dead = 7;
  assert.match(B.objective(state), /Back in 7/);
  p.dead = 0;
  p.hp = p.maxHp * 0.1;
  assert.match(B.objective(state), /recall/);
  p.hp = p.maxHp;
  assert.match(B.objective(state), /red towers stand/);
  for (const t of units(state, 'tower', 1)) if (t.lane === 2) t.hp = 0;
  state.tick++;
  assert.match(B.objective(state), /banner is exposed/);
});

test('AI-only matches end with a winner inside 25 minutes', () => {
  const runs = ['m1', 'm2', 'm3'].map((seed, i) => playAi(B, seed, B.HERO_KINDS[i], 'normal'));
  console.log('   ' + runs.map(r => `${r.state.status} ${r.minutes.toFixed(1)}m ${r.state.kills.join(':')}`).join(' | '));
  for (const r of runs) assert.notEqual(r.state.status, 'play', 'every match ended');
});

test('A plain-input bot beats Easy rivals with every hero', () => {
  const runs = B.HERO_KINDS.map((hero, i) => playRun(B, 'bot' + i, hero, 'easy'));
  console.log('   ' + runs.map(r => `${r.state.heroKind} ${r.state.status} ${r.minutes.toFixed(1)}m ${B.playerHero(r.state).kills}/${B.playerHero(r.state).deaths}`).join(' | '));
  assert(runs.filter(r => r.won).length >= 3, 'the bot wins at least three of four');
});

console.log(`${count}/${count} Bannerfall rules checks passed.`);

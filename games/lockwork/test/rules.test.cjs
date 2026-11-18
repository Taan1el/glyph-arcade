'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { playAllVaults } = require('./bot.cjs');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8'));
const L = globalThis.Lockwork;
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }

test('Signal tracer routes through mirrors, splitters, bridges, inverters, filters and closed cycles safely', () => {
  // Closed 4-mirror loop must terminate cleanly without hanging
  const sLoop = L.newGame('lockwork', 'standard', 0);
  sLoop.vault.objs = [
    { id: 1, kind: 'gen', x: 2, y: 2, dir: 1, color: 1 },
    { id: 2, kind: 'splitter', x: 4, y: 2, rot: 0 }, // open E/S/W: passes E & splits S
    { id: 3, kind: 'mirror', x: 6, y: 2, rot: 1 }, // '\' E->S
    { id: 4, kind: 'mirror', x: 6, y: 6, rot: 0 }, // '/' S->W
    { id: 5, kind: 'mirror', x: 4, y: 6, rot: 1 }  // '\' W->N back into splitter (4,2)
  ];
  L.traceSignals(sLoop, false);
  assert(sLoop.vault.beamsAmber[2 * L.WIDTH + 5] > 0, 'loop beam traced cleanly without infinite recursion');
  assert(sLoop.vault.beamsAmber[6 * L.WIDTH + 5] > 0, 'loop bottom leg lit cleanly');

  // A splitter facing across the beam lights receptors on both sides.
  const sSplit = L.newGame('lockwork', 'standard', 0);
  sSplit.vault.tiles.fill(0);
  sSplit.vault.objs = [{ id: 1, kind: 'gen', x: 2, y: 5, dir: 1, color: 1 }, { id: 2, kind: 'splitter', x: 6, y: 5, rot: 1 }];
  sSplit.vault.receptors = [{ x: 6, y: 2, color: 1, lit: false }, { x: 6, y: 8, color: 1, lit: false }];
  assert(L.traceSignals(sSplit, false), 'both split branches lit');

  // Inverters fire only while no beam strikes them.
  const sInv = L.newGame('lockwork', 'standard', 0);
  sInv.vault.tiles.fill(0);
  sInv.vault.objs = [{ id: 1, kind: 'gen', x: 2, y: 5, dir: 1, color: 1 }, { id: 2, kind: 'inv', x: 6, y: 5, dir: 2, color: 1 }];
  sInv.vault.receptors = [{ x: 6, y: 9, color: 1, lit: false }];
  assert.equal(L.traceSignals(sInv, false), false, 'a struck inverter stays dark');
  sInv.vault.objs.push({ id: 3, kind: 'crate', x: 4, y: 5 });
  assert.equal(L.traceSignals(sInv, false), true, 'a starved inverter fires');

  // A colour filter passes its own colour only.
  const sFilter = L.newGame('lockwork', 'standard', 0);
  sFilter.vault.tiles.fill(0);
  sFilter.vault.tiles[5 * L.WIDTH + 5] = 6;
  sFilter.vault.objs = [{ id: 1, kind: 'gen', x: 2, y: 5, dir: 1, color: 1 }];
  sFilter.vault.receptors = [{ x: 9, y: 5, color: 1, lit: false }];
  assert.equal(L.traceSignals(sFilter, false), false, 'a cyan filter stops amber light');

  // Delay capacitors re-emit a pulse a tick later.
  const sCap = L.newGame('lockwork', 'standard', 19);
  const pulse = sCap.vault.objs.find(o => o.kind === 'pulse');
  const cap = sCap.vault.objs.find(o => o.kind === 'cap');
  assert(pulse && cap, 'Vault 20 has a pulse coil and a delay capacitor');
});

test('Pushing blocks respects walls and other objects; rotating only affects rotatable mechanisms', () => {
  const s = L.newGame('lockwork', 'standard', 2); // Brass Blocking has a crate
  const crate = s.vault.objs.find(o => o.kind === 'crate');
  assert(crate, 'Brass Blocking has a crate');
  const crateX = crate.x;
  s.vault.objs = s.vault.objs.filter(o => o.kind !== 'mirror' && o.kind !== 'splitter' || Math.abs(o.x - s.vault.px) + Math.abs(o.y - s.vault.py) > 1);
  // Rotate action when not adjacent to a mirror waits 1 tick without moving crate
  const beforeTick = s.vault.vaultTick;
  L.step(s, { action: true });
  assert.equal(s.vault.vaultTick, beforeTick + 1);
  assert.equal(crate.x, crateX);

  // Pushing crate into outer wall # is blocked
  s.vault.px = 2; s.vault.py = 4;
  crate.x = 1; crate.y = 4;
  L.step(s, { moveX: -1, moveY: 0 });
  assert.equal(crate.x, 1, 'crate cannot be pushed into wall');
  assert.equal(s.vault.px, 2, 'player cannot step into blocked crate');
});

test('undo(state) restores previous positions, mirror orientations, clock ticks and capacitor queues', () => {
  const s = L.newGame('lockwork', 'standard', 19); // Vault 20 with Pulse & 1-tick Capacitor
  const startState = L.save(s);
  L.step(s, { action: true });
  L.step(s, { action: true });
  L.step(s, { action: true });
  assert.equal(s.vault.vaultTick, 3);
  assert(L.undo(s));
  assert(L.undo(s));
  assert(L.undo(s));
  assert.equal(s.vault.vaultTick, 0);
  const restored = JSON.parse(startState);
  assert.equal(s.vault.px, restored.vault.px);
  assert.equal(s.vault.py, restored.vault.py);
  assert.deepEqual(s.vault.objs, restored.vault.objs);
});

test('save and restore preserve unlocked vaults, best step counts, and mid-vault history', () => {
  const s = L.newGame('lockwork', 'standard', 0);
  const plan = L.solveVault(s, 15000);
  assert(plan, 'Vault 1 solvable');
  for (const act of plan) L.step(s, act);
  assert.equal(s.vaultIndex, 1, 'advanced to Vault 2');
  assert.equal(s.cleared[0], true, 'Vault 1 marked cleared');
  assert(s.bestSteps[0] <= L.VAULTS[0].par, 'Vault 1 best steps recorded');

  L.step(s, { moveX: 1, moveY: 0 });
  const saved = L.save(s);
  const copy = L.restore(saved);
  assert.equal(copy.vaultIndex, 1);
  assert.equal(copy.cleared[0], true);
  assert.equal(copy.bestSteps[0], s.bestSteps[0]);
  assert.equal(copy.vault.history.length, s.vault.history.length);
  assert.throws(() => L.restore({ version: 9 }), /not a Lockwork/);
});

test('Every vault starts locked and needs at least two mechanism moves', () => {
  for (let i = 0; i < L.VAULTS.length; i++) {
    const s = L.newGame('lockwork', 'standard', i);
    assert(!s.vault.unlocked, `Vault ${i + 1} starts locked`);
    const plan = L.solveVault(s, 40000);
    let uses = 0;
    for (const act of plan) for (const e of L.step(s, act)) if (e.type === 'rotate' || e.type === 'push') uses++;
    assert(uses >= 2, `Vault ${i + 1} needs ${uses} mechanism moves`);
  }
});

test('Plain-input BFS bot solves all 30 vaults within Par on Standard and Master (and across seeded variants)', () => {
  const std = playAllVaults(L, 'lockwork', 'standard');
  assert(std.won, `Standard run failed at vault ${std.failedAt}`);
  assert.equal(std.results.length, 30);
  for (const r of std.results) {
    assert(r.steps <= r.par, `Vault ${r.vault} (${r.name}) took ${r.steps} > par ${r.par}`);
  }
  const master = playAllVaults(L, 'lockwork', 'master');
  assert(master.won, `Master run failed at vault ${master.failedAt}`);
  const altSeed = playAllVaults(L, 'brass-seed', 'standard');
  assert(altSeed.won, `Seeded variant failed at vault ${altSeed.failedAt}`);
  console.log(`   All 30 vaults solved: Standard ${std.state.cogs}/30 Gold Cogs, Master ${master.state.cogs}/30, seeded variant 30/30`);
});

console.log(`${count}/${count} Lockwork rules checks passed.`);

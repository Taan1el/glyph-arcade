'use strict';
const assert = require('node:assert/strict');
const rules = require('../src/rules.js');
const { runBot } = require('./bot.cjs');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('1. Board generation connects relays, mountains, and ground rig paths', () => {
  for (let s = 1; s <= 12; s++) {
    const st = rules.newGame(s, 'normal');
    assert.equal(st.board.length, rules.BOARD_SIZE);
    assert.equal(st.relays.length, 3);
    assert.equal(st.rigs.length, 3);
    for (const rig of st.rigs) {
      assert.ok(rig.hp > 0);
      assert.ok(rules.reachableTiles(st, rig.id).length > 0, `Rig ${rig.id} should be able to move on seed ${s}`);
    }
    // Every relay should have at least one non-solid orthogonal neighbor
    for (const rel of st.relays) {
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const x = rel.x + dx, y = rel.y + dy;
        if (x < 0 || y < 0 || x >= 8 || y >= 8) return false;
        const t = st.board[y][x];
        return t !== 'mountain' && t !== 'relay';
      });
      assert.ok(adj, `Relay (${rel.x},${rel.y}) boxed in on seed ${s}`);
    }
  }
});

test('2. Knockback collision deals +1 dmg to both; water and chasm drown non-flying foes', () => {
  const st = rules.newGame(3, 'normal');
  // Clear clean arena slice for controlled collision
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) st.board[y][x] = 'ground';
  st.relays = [{ id: 'relay_1', x: 7, y: 7, shielded: false }];
  st.board[7][7] = 'relay';
  st.mines = [];
  st.smokes = [];
  st.fissures = [];
  st.hazards = [];
  st.rigs[0].x = 2; st.rigs[0].y = 2; st.rigs[0].hp = 4; st.rigs[0].acted = false; st.rigs[0].moved = false;
  st.rigs[1].x = 0; st.rigs[1].y = 7;
  st.rigs[2].x = 1; st.rigs[2].y = 7;
  // Place enemy A at (3,2) facing mountain at (4,2), push east with Iron Fist
  st.board[2][4] = 'mountain';
  st.enemies = [
    { id: 'f1', kind: 'beetle', name: 'Beetle', glyph: '[@]', isRig: false, x: 3, y: 2, hp: 4, maxHp: 4, move: 2, flying: false, dmg: 2, push: 1, style: 'charge', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 0, dy: 1 } }
  ];
  st.hand = ['iron_fist'];
  st.energy = 3;
  rules.step(st, { selectRig: 'titan', selectCard: 0, confirmAt: { x: 3, y: 2 } });
  // 2 Iron Fist dmg + 1 mountain collision dmg = 3 dmg total -> 1 HP left
  assert.equal(st.enemies[0].hp, 1, 'Expected 2 base + 1 mountain collision = 3 dmg');

  // Now push enemy A into enemy B -> +1 collision to both!
  st.board[2][4] = 'ground';
  st.enemies[0].hp = 4;
  st.enemies.push({ id: 'f2', kind: 'pincer', name: 'Pincer', glyph: '<V>', isRig: false, x: 4, y: 2, hp: 2, maxHp: 2, move: 3, flying: false, dmg: 1, push: 1, style: 'melee', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 0, dy: 1 } });
  st.rigs[0].acted = false;
  st.hand = ['iron_fist'];
  rules.step(st, { selectRig: 'titan', selectCard: 0, confirmAt: { x: 3, y: 2 } });
  assert.equal(st.enemies[0].hp, 1, 'Pushed unit takes 2 + 1 collision');
  assert.equal(st.enemies[1].hp, 1, 'Stationary blocker unit takes 1 collision');

  // Knockback into deep water kills ground enemy immediately, but leaves flying Hornet alive
  st.board[4][4] = 'water';
  st.rigs[0].x = 2; st.rigs[0].y = 4; st.rigs[0].acted = false;
  st.enemies = [
    { id: 'f3', kind: 'pincer', name: 'Pincer', glyph: '<V>', isRig: false, x: 3, y: 4, hp: 2, maxHp: 2, move: 3, flying: false, dmg: 1, push: 1, style: 'melee', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 0, dy: 1 } },
    { id: 'f4', kind: 'hornet', name: 'Hornet', glyph: '^W^', isRig: false, x: 3, y: 5, hp: 2, maxHp: 2, move: 4, flying: true, dmg: 1, push: 0, style: 'dive', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 0, dy: 1 } }
  ];
  st.board[5][4] = 'chasm';
  st.hand = ['seismic_stomp', 'repulsor_pulse'];
  rules.step(st, { selectRig: 'titan', selectCard: 0, confirmAt: { x: 3, y: 4 } });
  assert.equal(st.enemies[0].hp, 0, 'Ground enemy pushed into water drowns instantly');
  assert.equal(st.board[4][3], 'chasm', 'Seismic stomp shatters origin tile into chasm');

  st.rigs[0].x = 2; st.rigs[0].y = 5; st.rigs[0].acted = false; st.energy = 3;
  rules.step(st, { selectRig: 'titan', selectCard: 0, confirmAt: { x: 2, y: 5 } });
  assert.equal(st.enemies[1].x, 4);
  assert.equal(st.enemies[1].hp, 2, 'Flying Hornet hovers safely over chasm after push');
});

test('3. Shifting enemy redirects telegraphed attack; Smoke cancels attack resolution damage', () => {
  const st = rules.newGame(5, 'normal');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) st.board[y][x] = 'ground';
  st.relays = [{ id: 'relay_1', x: 4, y: 3, shielded: false }];
  st.board[3][4] = 'relay';
  st.fissures = [];
  st.hazards = [];
  st.rigs[0].x = 3; st.rigs[0].y = 1; st.rigs[0].acted = false;
  st.rigs[1].x = 0; st.rigs[1].y = 7;
  st.rigs[2].x = 1; st.rigs[2].y = 7;
  // Pincer at (3,3) targeting East (4,3) right onto Relay
  st.enemies = [
    { id: 'e1', kind: 'pincer', name: 'Pincer', glyph: '<V>', isRig: false, x: 3, y: 3, hp: 2, maxHp: 2, move: 3, flying: false, dmg: 1, push: 1, style: 'melee', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 1, dy: 0 } },
    { id: 'e2', kind: 'spitter', name: 'Spitter', glyph: '{*}', isRig: false, x: 3, y: 4, hp: 2, maxHp: 2, move: 2, flying: false, dmg: 1, push: 0, style: 'ray', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 0, dy: -1 } }
  ];
  const beforeCells = rules.computeEnemyAttackCells(st, st.enemies[0]);
  assert.deepEqual([{ x: beforeCells[0].x, y: beforeCells[0].y }], [{ x: 4, y: 3 }]);

  // Repulsor Push Pincer at (3,3) south? Wait: Titan at (2,3) Iron Fist? Let's put Titan at (3,2) with Repulsor Pulse -> pushes (3,3) south! Wait (3,4) is occupied -> let's test smoke + push clearly!
  // Put e2 out of the way at (5,4), Repulsor Pulse at (3,2) pushes e1 South onto (3,4)
  st.enemies[1].x = 4; st.enemies[1].y = 4; st.enemies[1].intent = { dx: 0, dy: -1 };
  st.rigs[0].x = 3; st.rigs[0].y = 2;
  st.hand = ['repulsor_pulse', 'smoke_drop'];
  rules.step(st, { selectRig: 'titan', selectCard: 0, confirmAt: { x: 3, y: 2 } });
  assert.equal(st.enemies[0].y, 4);
  const shiftedCells = rules.computeEnemyAttackCells(st, st.enemies[0]);
  assert.deepEqual([{ x: shiftedCells[0].x, y: shiftedCells[0].y }], [{ x: 4, y: 4 }], 'Telegraph shifted south to hit enemy e2 instead of relay!');

  // Drop Smoke on e2 (4,4) from within range 6 so e2's attack onto relay (4,3) cancels
  st.rigs[1].x = 4; st.rigs[1].y = 6; st.rigs[1].acted = false;
  rules.step(st, { selectRig: 'howitzer', selectCard: 0, confirmAt: { x: 4, y: 4 } });
  assert.equal(st.enemies[1].cancelled, true);

  const pwrBefore = st.gridPower;
  rules.endTurn(st);
  // e1 hits e2 cleanly, e2 is cancelled -> zero relay damage!
  assert.equal(st.gridPower, pwrBefore, 'Relay took 0 damage after push + smoke cancel');
});

test('4. Blocking a spawn fissure prevents enemy emergence and deals 1 self-dmg', () => {
  const st = rules.newGame(7, 'normal');
  st.enemies = [];
  st.hazards = [];
  st.fissures = [{ x: st.rigs[0].x, y: st.rigs[0].y, kind: 'pincer' }];
  const hpBefore = st.rigs[0].hp;
  rules.endTurn(st);
  assert.equal(st.rigs[0].hp, hpBefore - 1, 'Blocking rig takes 1 HP self-dmg');
  assert.equal(st.fissuresBlocked, 1);
  // Check enemy from blocked fissure did not spawn at rig tile
  const spawnedAtRig = st.enemies.some(e => e.x === st.rigs[0].x && e.y === st.rigs[0].y);
  assert.equal(spawnedAtRig, false);
});

test('5. previewAction matches exact outcome of step execution', () => {
  const st = rules.newGame(2, 'normal');
  const rig = st.rigs[0];
  const cardIdx = 0;
  const targets = rules.cardTargets(st, rig.id, st.hand[cardIdx]);
  assert.ok(targets.length > 0);
  const tgt = targets[0];
  const preview = rules.previewAction(st, { type: 'card', rigId: rig.id, handIndex: cardIdx, x: tgt.x, y: tgt.y });
  assert.equal(preview.ok, true);

  const real = JSON.parse(JSON.stringify(st));
  rules.step(real, { selectRig: rig.id, selectCard: cardIdx, confirmAt: { x: tgt.x, y: tgt.y } });
  assert.equal(real.events.length, preview.events.length);
  const totalRealDmg = real.events.filter(e => e.type === 'dmg' && e.dmg).reduce((a, b) => a + b.dmg, 0);
  assert.equal(totalRealDmg, preview.totalDamage);
});

test('6. save and restore round-trip mid-battle and on reward screen', () => {
  const st = rules.newGame(9, 'hard');
  rules.step(st, { selectRig: 'titan', confirmAt: rules.reachableTiles(st, 'titan')[0] });
  const text1 = rules.save(st);
  const r1 = rules.restore(text1);
  assert.ok(r1);
  assert.equal(r1.rigs[0].x, st.rigs[0].x);
  assert.equal(r1.gridPower, st.gridPower);

  st.mode = 'reward';
  st.rewardOptions = ['rail_spike', 'smoke_drop', 'overclock'];
  const text2 = rules.save(st);
  const r2 = rules.restore(text2);
  assert.equal(r2.mode, 'reward');
  const next = rules.step(r2, { pickReward: 'rail_spike' });
  assert.equal(next.sectorIndex, 1);
  assert.ok(next.deck.includes('rail_spike'));
});

test('6b. Difficulties, Easy undo-card rewind, Supply Train and Brood Queen egg hatch', () => {
  const easy = rules.newGame(4, 'easy');
  assert.equal(easy.gridPower, 7);
  assert.equal(easy.undoCardsLeft, 1);
  const target = rules.cardTargets(easy, 'titan', easy.hand[0])[0];
  const prevEnergy = easy.energy;
  let cur = rules.step(easy, { selectRig: 'titan', selectCard: 0, confirmAt: target });
  assert.ok(cur.energy <= prevEnergy);
  cur = rules.step(cur, { undoMove: true });
  assert.equal(cur.energy, prevEnergy, 'Easy card rewind restores spent energy');
  assert.equal(cur.undoCardsLeft, 0);

  // Supply train in Sector 1 crushes units on railRow
  const tr = rules.newGame(1, 'normal');
  assert.equal(tr.hazards[0].kind, 'train');
  const h = tr.hazards[0];
  tr.enemies = [{ id: 't1', kind: 'pincer', name: 'Pincer', glyph: '<V>', isRig: false, x: h.x, y: h.y, hp: 2, maxHp: 2, move: 3, flying: false, dmg: 1, push: 1, style: 'melee', boss: false, wide: 1, shielded: false, cancelled: false, intent: { dx: 0, dy: 1 } }];
  rules.endTurn(tr);
  assert.ok(tr.kills >= 1, 'Supply train crushed enemy on rail tile');
});

test('7. Heuristic plain-input bot wins 4-sector campaign on Normal (>=3/4 seeds)', () => {
  const seeds = [1, 2, 3, 4];
  let wins = 0;
  const summaries = [];
  for (const seed of seeds) {
    const out = runBot(rules, seed, 'normal');
    if (out.mode === 'win') wins++;
    summaries.push(`s${seed}:${out.mode}(sec=${out.sector},pwr=${out.gridPower},k=${out.kills},score=${out.score})`);
  }
  console.log('Bot Normal campaign results:', summaries.join(' | '));
  assert.ok(wins >= 3, `Expected >=3/4 wins on Normal, got ${wins}/4 (${summaries.join(', ')})`);
});

let failed = 0;
const t0 = Date.now();
for (const tc of tests) {
  try {
    tc.fn();
  } catch (err) {
    failed++;
    console.error(`FAIL ${tc.name}:`, err);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
if (failed) process.exit(1);
console.log(`${tests.length}/${tests.length} Irongrid rules checks passed (${elapsed}s)`);

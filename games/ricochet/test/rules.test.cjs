'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { playRun, playAi } = require('./bot.cjs');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8'));
const R = globalThis.Ricochet;
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const tick = (state, input = {}, frames = 1) => { const ev = []; for (let i = 0; i < frames; i++) ev.push(...R.step(state, input)); return ev; };

test('Deterministic simulation per seed and save/restore round-trip without drift', () => {
  const a = R.newGame('det-seed', 'spinner', 'normal');
  const b = R.newGame('det-seed', 'spinner', 'normal');
  const c = R.newGame('other-seed', 'spinner', 'normal');
  tick(a, { moveY: -0.6, throwHeld: true }, 20);
  tick(a, { moveY: -0.6, throwRelease: true }, 1);
  tick(a, {}, 90);
  tick(b, { moveY: -0.6, throwHeld: true }, 20);
  tick(b, { moveY: -0.6, throwRelease: true }, 1);
  tick(b, {}, 90);
  assert.equal(R.save(a), R.save(b));
  assert.notEqual(R.save(a), R.save(c));

  const restored = R.restore(R.save(a));
  tick(a, { moveY: 0.4 }, 120);
  tick(restored, { moveY: 0.4 }, 120);
  assert.equal(R.save(a), R.save(restored));
  assert.throws(() => R.restore({ version: 9 }), /not a Ricochet/);
});

test('Disc reflects off horizontal, vertical, and 45-degree corner walls and gains speed up to cap', () => {
  const state = R.newGame('walls', 'phantom', 'easy');
  state.holder = -1;
  state.players[0].throwLock = 10;
  state.players[1].throwLock = 10;
  state.disc = { x: 8, y: 1.5, vx: 12, vy: -18, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: true, parried: false, speed: Math.hypot(12, -18), prismCd: 0 };
  const s0 = state.disc.speed;
  const ev = tick(state, {}, 8);
  assert(ev.some(e => e.type === 'bank'), 'horizontal wall bounce recorded');
  assert(state.disc.vy > 0, 'disc reflected downward off top wall');
  assert(state.disc.bounces >= 1 && state.disc.speed > s0, 'bank shot increased speed');

  // 45-degree top-left corner wedge '/' reflects a left-up shot down-right
  state.disc = { x: 2.3, y: 2.3, vx: -18, vy: -18, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: true, parried: false, speed: 25.45, prismCd: 0 };
  const wedgeEv = tick(state, {}, 6);
  assert(wedgeEv.some(e => e.type === 'bank'), '45-degree corner wedge bounce recorded');
  assert(state.disc.vx > 0 && state.disc.vy > 0, 'diagonal wedge deflected velocity back into court');

  // High-speed cap & non-tunnelling check
  state.disc = { x: 10, y: 1.6, vx: 10, vy: -48, r: R.DISC_R, spin: 0, bounces: 2, owner: 0, charged: true, parried: false, speed: 49, prismCd: 0 };
  tick(state, {}, 5);
  assert(state.disc.y >= 1 + R.DISC_R && state.disc.y <= R.HEIGHT - 1 - R.DISC_R, 'fast disc never tunnels through wall');
  assert(state.disc.speed <= R.MAX_SPEED + 0.01, 'speed stays within MAX_SPEED cap');
});

test('Spin input curves disc trajectory smoothly without tunnelling', () => {
  const state = R.newGame('spin-test', 'spinner', 'easy');
  state.players[1].throwLock = 99;
  tick(state, { moveY: 1, spin: true }, 1);
  assert.equal(state.holder, -1, 'spin launched disc');
  assert(Math.abs(state.disc.spin) > 10, 'spinner archetype applies strong curve');
  const startVy = state.disc.vy;
  tick(state, {}, 18);
  assert.notEqual(Math.sign(state.disc.vy) * state.disc.vy, startVy, 'velocity direction curved during flight');
  assert(state.disc.y >= 1 + R.DISC_R && state.disc.y <= R.HEIGHT - 1 - R.DISC_R, 'curved disc stayed inside walls');
});

test('Catching, charging, overcharge fumble, and frame-window parry work as specified', () => {
  // Catch and charge -> launch
  const s1 = R.newGame('charge', 'striker', 'easy');
  tick(s1, { throwHeld: true }, 30);
  assert.equal(s1.holder, 0, 'still holding while charging under 1.6s');
  assert(s1.players[0].chargeTimer >= 0.45, 'charge timer accumulated');
  const launchEv = tick(s1, { throwRelease: true }, 1);
  assert(launchEv.some(e => e.type === 'throw' && e.charged), 'release threw a charged disc');

  // Full power at 1s brings a warning; still holding at 1.6s fumbles
  const s2 = R.newGame('fumble', 'striker', 'easy');
  const warnEv = tick(s2, { throwHeld: true }, 70);
  assert(warnEv.some(e => e.type === 'overcharge' && e.side === 0), 'full power warns before the fumble');
  assert(!warnEv.some(e => e.type === 'fumble'), 'no fumble yet at 1.17s');
  const fEv = tick(s2, { throwHeld: true }, 40);
  assert(fEv.some(e => e.type === 'fumble' && e.side === 0), 'holding throw past 1.6s fumbles the disc');
  assert.equal(s2.holder, -1);

  // Frame-window parry on incoming disc
  const s3 = R.newGame('parry', 'striker', 'easy');
  s3.holder = -1;
  s3.players[1].throwLock = 10;
  const p0 = s3.players[0];
  s3.disc = { x: p0.x + 1.4, y: p0.y, vx: -28, vy: 0, r: R.DISC_R, spin: 0, bounces: 0, owner: 1, charged: true, parried: false, speed: 28, prismCd: 0 };
  const pEv = tick(s3, { throwPressed: true }, 4);
  assert(pEv.some(e => e.type === 'parry' && e.side === 0), 'tapping throw within parry window triggers perfect parry');
  assert(s3.disc.vx > 32 && s3.disc.parried, 'parried disc fires back at +25% boosted speed');
});

test('Shields absorb normal hits, break two on 2-bounce banks, and open segments award 1 or 2 (bullseye) points', () => {
  const s = R.newGame('shields', 'striker', 'easy');
  s.holder = -1;
  s.players[0].throwLock = 10;
  s.players[1].throwLock = 10;

  // Normal hit breaks 1 shield and rebounds
  s.disc = { x: R.WIDTH - 1.5, y: 4, vx: 26, vy: 0, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: true, parried: false, speed: 26, prismCd: 0 };
  const ev1 = tick(s, {}, 3);
  assert(ev1.some(e => e.type === 'shield' && e.side === 1 && e.seg === 0), 'shield absorbed normal shot');
  assert.equal(s.shields[1][0], 0, 'top shield broke');
  assert.equal(s.shields[1][1], 2, 'adjacent middle shield still intact');
  assert(s.disc.vx < 0, 'disc rebounded back into play');

  // 2-bounce bank breaks two remaining shields (seg 1 and seg 2)
  s.disc = { x: R.WIDTH - 1.5, y: 8, vx: 32, vy: 0, r: R.DISC_R, spin: 0, bounces: 2, owner: 0, charged: true, parried: false, speed: 32, prismCd: 0 };
  const ev2 = tick(s, {}, 3);
  assert(ev2.some(e => e.type === 'shield' && e.broken === 2), '2-bounce bank broke two shields');
  assert.equal(s.shields[1][1], 0);
  assert.equal(s.shields[1][2], 0);

  // Scoring through open non-bullseye segment (seg 0, y=4) awards 1 point and resets shields
  s.disc = { x: R.WIDTH - 1.4, y: 4, vx: 28, vy: 0, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: true, parried: false, speed: 28, prismCd: 0 };
  const ev3 = tick(s, {}, 3);
  assert(ev3.some(e => e.type === 'goal' && e.scorer === 0 && e.points === 1 && !e.bullseye));
  assert.equal(s.points[0], 1);
  assert.deepEqual(s.shields[1], [2, 2, 2], 'shields reset after a goal');

  // Scoring into open bullseye pocket (y=8) awards 2 points
  s.shields[1][1] = 0;
  s.holder = -1;
  s.disc = { x: R.WIDTH - 1.4, y: 8, vx: 28, vy: 0, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: true, parried: false, speed: 28, prismCd: 0 };
  const ev4 = tick(s, {}, 3);
  assert(ev4.some(e => e.type === 'goal' && e.scorer === 0 && e.points === 2 && e.bullseye));
  assert.equal(s.points[0], 3);
});

test('Conveyor strips and rotating prism deflectors modify disc motion deterministically', () => {
  // Court 2 (index 2): Conveyor Court
  const cState = R.newGame('conv', 'striker', 'easy');
  cState.courtIndex = 2;
  cState.holder = -1;
  cState.players[0].throwLock = 10;
  cState.players[1].throwLock = 10;
  cState.disc = { x: 10, y: 2.0, vx: 10, vy: 0, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: false, parried: false, speed: 10, prismCd: 0 };
  tick(cState, {}, 12);
  assert(cState.disc.vx > 12, 'top conveyor strip accelerated disc rightward');

  // Court 3 (index 3): Prism Finals
  const pState = R.newGame('prism', 'striker', 'easy');
  pState.courtIndex = 3;
  pState.prisms = R.COURTS[3].prisms.map(p => ({ ...p }));
  pState.holder = -1;
  pState.players[0].throwLock = 10;
  pState.players[1].throwLock = 10;
  const angleBefore = pState.prisms[1].angle;
  pState.disc = { x: 12.6, y: 8, vx: 26, vy: 0, r: R.DISC_R, spin: 0, bounces: 0, owner: 0, charged: true, parried: false, speed: 26, prismCd: 0 };
  const pEv = tick(pState, {}, 6);
  assert(pEv.some(e => e.type === 'prism'), 'prism collision emitted event');
  assert.equal(pState.prisms[1].angle, (angleBefore + 1) % 4, 'prism rotated 45 degrees on impact');
});

test('AI-vs-AI rallies resolve and matches finish cleanly without infinite loops', () => {
  const r = playAi(R, 'ai-vs-ai', 'striker', 'normal', 10);
  assert.notEqual(r.state.status, 'play', `AI-vs-AI tournament ended (${r.state.status} in ${r.minutes.toFixed(1)}m)`);
});

test('Plain-input bot wins the 4-match tournament on Easy on at least 3 of 4 seeds within 12 minutes', () => {
  const seeds = ['s1', 's2', 's3', 's4'];
  const runs = seeds.map((s, i) => playRun(R, s, R.ARCHETYPE_KEYS[i % R.ARCHETYPE_KEYS.length], 'easy', 12));
  console.log('   ' + runs.map(r => `${r.state.archetype} ${r.state.status} c${r.state.courtIndex + 1} ${r.minutes.toFixed(1)}m score:${R.score(r.state)}`).join(' | '));
  const wins = runs.filter(r => r.won);
  assert(wins.length >= 3, `expected >=3 wins out of 4 seeds within 12m, got ${wins.length}`);
});

console.log(`${count}/${count} Ricochet rules checks passed.`);

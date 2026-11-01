'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const box = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8') + '\nthis.Wordfall = Wordfall;', box);
const W = box.Wordfall;
const plain = value => JSON.parse(JSON.stringify(value));

const checks = [];
const check = (name, run) => checks.push({ name, run });

function playBot(seed, difficulty) {
  const state = W.newRun(seed, difficulty);
  while (!state.over) W.step(state, 0.05, W.botInput(state));
  return state;
}
function land(state, glyph, lane = state.lane) {
  state.drops = [{ id: state.nextId++, lane, y: 0.999, glyph }];
  state.spawnTimer = 99;
  return W.step(state, 0.05);
}

check('Runs are deterministic for a seed and differ between seeds', () => {
  assert.deepEqual(plain(playBot('same', 'normal')), plain(playBot('same', 'normal')));
  assert.notEqual(W.newRun('one').rng, W.newRun('two').rng);
});

check('Catching the needed letter advances the word and scores', () => {
  const state = W.newRun('catch');
  const events = land(state, W.needed(state));
  assert.equal(state.progress, 1);
  assert.equal(state.points, 50);
  assert(events.some(e => e.type === 'catch'));
});

check('Catching a wrong letter costs a life and the combo', () => {
  const state = W.newRun('wrong');
  state.combo = 3;
  const wrong = W.needed(state) === 'A' ? 'B' : 'A';
  const lives = state.lives;
  land(state, wrong);
  assert.equal(state.lives, lives - 1);
  assert.equal(state.combo, 0);
  assert.equal(state.progress, 0);
});

check('A letter that lands in another lane does nothing', () => {
  const state = W.newRun('miss');
  const lives = state.lives;
  land(state, 'A', (state.lane + 1) % W.LANES);
  assert.equal(state.lives, lives);
  assert.equal(state.drops.length, 0);
});

check('Finishing a word scores by length and combo, then picks a new word', () => {
  const state = W.newRun('word');
  const first = state.word;
  state.combo = 1;
  while (state.word === first) land(state, W.needed(state));
  assert.equal(state.words, 1);
  assert.equal(state.combo, 2);
  assert.equal(state.progress, 0);
  assert.equal(state.points, first.length * 50 + first.length * 200);
});

check('The lane stays on the board and held keys repeat at a limited rate', () => {
  const state = W.newRun('lanes');
  for (let i = 0; i < 400; i++) W.step(state, 0.05, { left: true });
  assert.equal(state.lane, 0);
  const moved = W.newRun('rate');
  const start = moved.lane;
  for (let i = 0; i < 2; i++) W.step(moved, 0.05, { right: true });
  assert.equal(moved.lane, start + 1, 'a second frame inside the delay does not move again');
  W.step(moved, 0.05, { nudge: 1 });
  assert.equal(moved.lane, start + 2, 'a tap always moves one lane');
});

check('The needed letter always reaches the board', () => {
  const state = W.newRun('needed');
  for (let i = 0; i < 2000 && !state.over; i++) {
    W.step(state, 0.05);
    if (i > 40 && i % 40 === 0) assert(state.drops.some(d => d.glyph === W.needed(state)), 'needed letter on screen at tick ' + i);
  }
});

check('Time running out ends the run as a win with a life bonus', () => {
  const state = W.newRun('clock');
  state.time = W.DURATION - 0.01;
  state.points = 100;
  W.step(state, 0.05);
  assert(state.over && state.won);
  assert.equal(W.score(state), 100 + state.lives * 250);
  assert.equal(W.step(state, 0.05).length, 0, 'a finished run takes no more steps');
});

check('Losing the last life ends the run as a loss', () => {
  const state = W.newRun('lives');
  state.lives = 1;
  land(state, W.needed(state) === 'A' ? 'B' : 'A');
  assert(state.over && !state.won);
  assert.equal(W.score(state), state.points);
});

check('Difficulty changes lives and falling speed, and unknown values fall back', () => {
  assert(W.newRun('d', 'easy').lives > W.newRun('d', 'hard').lives);
  assert(W.DIFFICULTIES.easy.speed < W.DIFFICULTIES.hard.speed);
  assert.equal(W.newRun('d', 'nonsense').difficulty, 'normal');
});

check('Saves round-trip through JSON and reject invalid payloads', () => {
  const state = W.newRun('save');
  for (let i = 0; i < 100; i++) W.step(state, 0.05, W.botInput(state));
  assert.deepEqual(plain(W.restore(plain(state))), plain(state));
  assert.throws(() => W.restore(null));
  assert.throws(() => W.restore({ ...plain(state), word: 'NOTAWORD' }));
  assert.throws(() => W.restore({ ...plain(state), lane: 99 }));
});

check('Bots finish every run, and harder settings survive less often', () => {
  const mean = {}, alive = {};
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let total = 0, survived = 0;
    for (let s = 0; s < 30; s++) {
      const state = playBot('bot-' + s, difficulty);
      assert(state.over);
      assert(state.time <= W.DURATION);
      total += W.score(state);
      if (state.won) survived++;
    }
    mean[difficulty] = total / 30;
    alive[difficulty] = survived;
    console.log(`   ${difficulty}: mean score ${Math.round(mean[difficulty])}, survived ${survived}/30`);
  }
  assert(mean.easy > 0 && mean.normal > 0 && mean.hard > 0, 'bots score on every difficulty');
  assert(alive.easy > alive.normal && alive.normal > alive.hard, 'survival falls as difficulty rises');
});

let failed = 0;
for (const { name, run } of checks) {
  try {
    run();
    console.log('PASS ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n' + error.stack);
  }
}
console.log(`${checks.length - failed}/${checks.length} Wordfall rules checks passed.`);
if (failed) process.exit(1);

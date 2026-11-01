'use strict';
// Guards the difficulty curve with wide tolerances. Use `npm run balance` for the full 200-seed report.
const assert = require('node:assert/strict');
const { runInkfireBalance, runDelveBalance } = require('../tools/balance.cjs');

const SEEDS = 30;
const ink = runInkfireBalance(SEEDS, ['easy', 'normal', 'hard']);
const delve = runDelveBalance(SEEDS, ['normal']);

assert(ink.easy.winRate > ink.normal.winRate, 'Inkfire easy beats normal');
assert(ink.normal.winRate > ink.hard.winRate, 'Inkfire normal beats hard');
assert(ink.normal.winRate >= 10 && ink.normal.winRate <= 65, `Inkfire normal win rate ${ink.normal.winRate}%`);
assert(ink.normal.deathRate >= 25, `Inkfire normal death rate ${ink.normal.deathRate}%`);
assert(ink.normal.timeoutRate <= 15, `Inkfire normal timeout rate ${ink.normal.timeoutRate}%`);
assert(delve.normal.winRate >= 35 && delve.normal.winRate <= 95, `Delve normal win rate ${delve.normal.winRate}%`);
assert(delve.normal.timeoutRate <= 5, `Delve normal timeout rate ${delve.normal.timeoutRate}%`);
console.log(`PASS Balance guards (${SEEDS} seeds): Inkfire normal ${ink.normal.winRate}% wins, Delve normal ${delve.normal.winRate}% wins`);

'use strict';
// Runs 200 seeds per difficulty for Inkfire and Delve and prints win, death, and timeout metrics.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const box = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(root, 'games/delve/src/rules.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'games/inkfire/src/rules.js'), 'utf8') + '\n' +
  'this.Delve = Delve; this.Inkfire = Inkfire;',
  box
);
const { Delve, Inkfire } = box;

function runInkfireBalance(seeds = 200, difficulties = ['easy', 'normal', 'hard'], maxTicks = 2200) {
  const results = {};
  for (const diff of difficulties) {
    let wins = 0, deaths = 0, timeouts = 0, totalWinTime = 0, totalKills = 0;
    for (let s = 0; s < seeds; s++) {
      const state = Inkfire.newGame(`bal-ink-${s}`, diff);
      let ticks = 0;
      while (!state.dead && !state.won && ticks < maxTicks) {
        Inkfire.step(state, 0.05, Inkfire.botInput(state));
        ticks++;
      }
      if (state.won) {
        wins++;
        totalWinTime += state.time;
      } else if (state.dead) {
        deaths++;
      } else {
        timeouts++;
      }
      totalKills += state.kills;
    }
    results[diff] = {
      seeds,
      wins,
      deaths,
      timeouts,
      winRate: Number(((wins / seeds) * 100).toFixed(1)),
      deathRate: Number(((deaths / seeds) * 100).toFixed(1)),
      timeoutRate: Number(((timeouts / seeds) * 100).toFixed(1)),
      avgTimeToExit: wins ? Number((totalWinTime / wins).toFixed(1)) : 0,
      avgKills: Number((totalKills / seeds).toFixed(2))
    };
  }
  return results;
}

function runDelveBalance(seeds = 200, difficulties = ['easy', 'normal', 'hard'], maxTurns = 2500) {
  const results = {};
  for (const diff of difficulties) {
    let wins = 0, deaths = 0, timeouts = 0, totalWinTurns = 0, totalKills = 0, totalDepth = 0;
    for (let s = 0; s < seeds; s++) {
      const state = Delve.newRun(`bal-delve-${s}`, diff);
      let steps = 0;
      while (!state.dead && !state.won && steps < maxTurns) {
        Delve.act(state, Delve.botAction(state));
        steps++;
      }
      if (state.won) {
        wins++;
        totalWinTurns += state.turn;
      } else if (state.dead) {
        deaths++;
      } else {
        timeouts++;
      }
      totalKills += state.kills;
      totalDepth += state.depth;
    }
    results[diff] = {
      seeds,
      wins,
      deaths,
      timeouts,
      winRate: Number(((wins / seeds) * 100).toFixed(1)),
      deathRate: Number(((deaths / seeds) * 100).toFixed(1)),
      timeoutRate: Number(((timeouts / seeds) * 100).toFixed(1)),
      avgTurnsToExit: wins ? Number((totalWinTurns / wins).toFixed(1)) : 0,
      avgKills: Number((totalKills / seeds).toFixed(2)),
      avgDepth: Number((totalDepth / seeds).toFixed(2))
    };
  }
  return results;
}

if (require.main === module) {
  const seeds = Number(process.argv[2]) || 200;
  console.log(`=== INKFIRE BALANCE REPORT (${seeds} seeds / difficulty) ===`);
  const ink = runInkfireBalance(seeds);
  for (const [diff, r] of Object.entries(ink)) {
    console.log(
      `[${diff.toUpperCase().padEnd(6)}] win: ${r.winRate}% (${r.wins}/${r.seeds}) | ` +
      `death: ${r.deathRate}% (${r.deaths}/${r.seeds}) | ` +
      `timeout: ${r.timeoutRate}% (${r.timeouts}/${r.seeds}) | ` +
      `avg time to exit: ${r.avgTimeToExit}s | avg kills: ${r.avgKills}`
    );
  }

  console.log(`\n=== DELVE BALANCE REPORT (${seeds} seeds / difficulty) ===`);
  const dlv = runDelveBalance(seeds);
  for (const [diff, r] of Object.entries(dlv)) {
    console.log(
      `[${diff.toUpperCase().padEnd(6)}] win: ${r.winRate}% (${r.wins}/${r.seeds}) | ` +
      `death: ${r.deathRate}% (${r.deaths}/${r.seeds}) | ` +
      `timeout: ${r.timeoutRate}% (${r.timeouts}/${r.seeds}) | ` +
      `avg turns to exit: ${r.avgTurnsToExit} | avg kills: ${r.avgKills} | avg depth: ${r.avgDepth}`
    );
  }
}

module.exports = { runInkfireBalance, runDelveBalance };

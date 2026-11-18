'use strict';
// Plain-input solver bot for Lockwork: solves all 30 vaults via BFS through step(state, input).

function playAllVaults(L, seed = 'lockwork', difficulty = 'standard') {
  const state = L.newGame(seed, difficulty, 0);
  const results = [];
  while (state.status === 'play') {
    const vIdx = state.vaultIndex;
    const plan = L.solveVault(state, 60000);
    if (!plan) {
      return { state, won: false, results, failedAt: vIdx };
    }
    for (const input of plan) {
      L.step(state, input);
    }
    results.push({
      vault: vIdx + 1,
      name: L.VAULTS[vIdx].name,
      steps: plan.length,
      par: L.VAULTS[vIdx].par + L.DIFFICULTIES[difficulty].parSlack
    });
  }
  return { state, won: state.status === 'won', results };
}

module.exports = { playAllVaults };

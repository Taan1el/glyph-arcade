'use strict';
// Plain-input tactical bot for Irongrid.
// Plans rig moves and Command Card plays by scoring the deterministic Resolution Phase outcome.

function evalResolution(rules, candidateState) {
  var sim = JSON.parse(JSON.stringify(candidateState));
  rules.endTurn(sim);

  if (sim.mode === 'lose') return -1000000;
  if (sim.mode === 'win' || sim.mode === 'reward') {
    return 500000 + sim.gridPower * 3000 + sim.kills * 200;
  }

  var enemyHp = 0;
  var aliveEnemies = 0;
  for (var i = 0; i < sim.enemies.length; i++) {
    if (sim.enemies[i].hp > 0) {
      enemyHp += sim.enemies[i].hp;
      aliveEnemies++;
    }
  }
  var rigHp = 0;
  var aliveRigs = 0;
  for (var j = 0; j < sim.rigs.length; j++) {
    if (sim.rigs[j].hp > 0) {
      rigHp += sim.rigs[j].hp;
      aliveRigs++;
    }
  }

  var score = sim.gridPower * 2500
    + sim.kills * 320
    + sim.fissuresBlocked * 140
    + aliveRigs * 180
    + rigHp * 45
    - aliveEnemies * 180
    - enemyHp * 95;

  // Prefer keeping energy/cards ready or saving relays, lightly reward extra score
  score += candidateState.scoreTotal * 0.2;
  return score;
}

function chooseRewardInput(state) {
  var rank = ['smoke_drop', 'repair_nanites', 'rail_spike', 'overclock', 'seismic_stomp', 'mine_layer'];
  for (var i = 0; i < rank.length; i++) {
    if (state.rewardOptions.indexOf(rank[i]) >= 0) return { pickReward: rank[i] };
  }
  return { pickReward: state.rewardOptions[0] };
}

function playTurnStep(rules, state) {
  if (state.mode === 'reward') {
    return chooseRewardInput(state);
  }
  if (state.mode !== 'play') return null;

  var bestScore = evalResolution(rules, state);
  var bestSeq = null;

  // 1. Evaluate direct card plays from current positions
  var r, hi, cts, ci, simCard, sc;
  for (r = 0; r < state.rigs.length; r++) {
    var rig = state.rigs[r];
    if (rig.hp <= 0 || rig.acted) continue;
    for (hi = 0; hi < state.hand.length; hi++) {
      var cid = state.hand[hi];
      cts = rules.cardTargets(state, rig.id, cid);
      for (ci = 0; ci < cts.length; ci++) {
        simCard = JSON.parse(JSON.stringify(state));
        rules.step(simCard, { selectRig: rig.id, selectCard: hi, confirmAt: { x: cts[ci].x, y: cts[ci].y } });
        // Overclock gives energy + draw: evaluate conservatively as +90 value if energy < 2
        sc = evalResolution(rules, simCard) + (cid === 'overclock' ? 95 : 0);
        if (sc > bestScore + 1) {
          bestScore = sc;
          bestSeq = { selectRig: rig.id, selectCard: hi, confirmAt: { x: cts[ci].x, y: cts[ci].y } };
        }
      }
    }
  }

  // 2. Evaluate rig movement -> immediate resolution OR move -> card combo
  for (r = 0; r < state.rigs.length; r++) {
    var mRig = state.rigs[r];
    if (mRig.hp <= 0 || mRig.moved || mRig.webbed) continue;
    var moves = rules.reachableTiles(state, mRig.id);
    for (var mi = 0; mi < moves.length; mi++) {
      var mv = moves[mi];
      var simMv = JSON.parse(JSON.stringify(state));
      rules.step(simMv, { selectRig: mRig.id, confirmAt: { x: mv.x, y: mv.y } });

      var scMv = evalResolution(rules, simMv);
      if (scMv > bestScore + 1) {
        bestScore = scMv;
        bestSeq = { selectRig: mRig.id, confirmAt: { x: mv.x, y: mv.y } };
      }

      if (!mRig.acted && simMv.energy > 0) {
        for (hi = 0; hi < simMv.hand.length; hi++) {
          var mcid = simMv.hand[hi];
          if (mcid === 'overclock' || mcid === 'repair_nanites') continue;
          var mcts = rules.cardTargets(simMv, mRig.id, mcid);
          for (ci = 0; ci < mcts.length; ci++) {
            var tgt = mcts[ci];
            // Prune targets with nothing nearby to keep lookahead fast
            var hasUnit = !!rules.unitAt(simMv, tgt.x, tgt.y);
            var hasRel = !!rules.relayAt(simMv, tgt.x, tgt.y);
            var adjEnemy = false;
            if (!hasUnit && !hasRel) {
              for (var dx = -1; dx <= 1; dx++) {
                for (var dy = -1; dy <= 1; dy++) {
                  var nu = rules.unitAt(simMv, tgt.x + dx, tgt.y + dy);
                  if (nu && !nu.isRig) adjEnemy = true;
                }
              }
              if (!adjEnemy && mcid !== 'mine_layer') continue;
            }
            var simCombo = JSON.parse(JSON.stringify(simMv));
            rules.step(simCombo, { selectRig: mRig.id, selectCard: hi, confirmAt: { x: tgt.x, y: tgt.y } });
            var scCombo = evalResolution(rules, simCombo);
            if (scCombo > bestScore + 1) {
              bestScore = scCombo;
              bestSeq = { selectRig: mRig.id, confirmAt: { x: mv.x, y: mv.y } };
            }
          }
        }
      }
    }
  }

  return bestSeq || { endTurn: true };
}

function runBot(rules, seed, difficulty, maxSteps) {
  var state = rules.newGame(seed, difficulty || 'normal');
  var limit = maxSteps || 600;
  var steps = 0;
  while ((state.mode === 'play' || state.mode === 'reward') && steps < limit) {
    var inp = playTurnStep(rules, state);
    state = rules.step(state, inp);
    steps++;
  }
  return {
    mode: state.mode,
    sector: state.sectorIndex + 1,
    turn: state.turn,
    gridPower: state.gridPower,
    kills: state.kills,
    fissuresBlocked: state.fissuresBlocked,
    score: rules.score(state),
    steps: steps,
    state: state
  };
}

module.exports = {
  runBot: runBot,
  playTurnStep: playTurnStep
};

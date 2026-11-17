'use strict';
// A plain-input bot: plays the player's hero through step(state, input) with the same
// orders a person gives by clicking, pressing Q/W/E/R, B and buying from the shop.
// It only picks targets its team can currently see.

function createBot(B) {
  const memo = { think: 0, sight: new Uint8Array(B.WIDTH * B.HEIGHT) };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const input = function (state) {
    const out = {};
    const p = B.playerHero(state);
    memo.think -= B.STEP;
    if (p.dead > 0 || p.recall > 0 || memo.think > 0) return out;
    memo.think = 0.25;
    const seen = B.vision(state, 0, memo.sight);
    const visible = u => seen[Math.floor(u.y) * B.WIDTH + Math.floor(u.x)] === 2 && !(u.invisible > 0);
    const foes = state.units.filter(u => u.team === 1 && B.alive(u) && visible(u));
    const ratio = p.hp / p.maxHp;

    if (B.atBase(p, 1)) {
      const next = B.BUILDS[p.kind][p.items.length];
      if (next && p.gold >= B.ITEMS[next].cost) { out.buy = next; return out; }
      if (ratio < 0.9) { out.order = null; return out; }
    }
    const foeHeroes = foes.filter(u => u.type === 'hero' && u.dead === 0 && dist(u, p) < 9);
    if (ratio < 0.35) {
      if (!foes.some(u => (u.type === 'hero' || u.type === 'tower') && dist(u, p) < 8)) out.recall = true;
      else out.order = { kind: 'move', ...B.BASES[0] };
      return out;
    }
    const next = B.BUILDS[p.kind][p.items.length];
    if (next && p.gold >= B.ITEMS[next].cost + 400 && !foeHeroes.length && !B.atBase(p, 4)) { out.recall = true; return out; }

    const tower = foes.find(u => (u.type === 'tower' || u.type === 'banner') && dist(u, p) < u.range + u.r + 0.8);
    const shieldedByWave = tower && state.units.some(m => m.type === 'minion' && m.team === 0 && B.alive(m) && dist(m, tower) < tower.range);
    const lane = 1;

    const prey = foeHeroes.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const friendsNear = state.units.filter(u => u.type === 'hero' && u.team === 0 && u !== p && B.alive(u) && prey && dist(u, prey) < 9).length;
    const preyRatio = prey ? prey.hp / prey.maxHp : 1;
    if (prey && (preyRatio < ratio - 0.2 || preyRatio < 0.3 || friendsNear > foeHeroes.length - 1 + (preyRatio > 0.6 ? 1 : 0)) && (!tower || shieldedByWave && ratio > 0.6)) {
      out.order = { kind: 'attack', id: prey.id };
      castAt(p, prey, out);
      return out;
    }
    if (tower && !shieldedByWave) {
      const back = B.laneProject(lane, p.x, p.y).along - 5;
      out.order = { kind: 'move', ...B.lanePoint(lane, back) };
      return out;
    }
    const colossus = foes.find(u => u.type === 'colossus');
    const friends = state.units.filter(u => u.type === 'hero' && u.team === 0 && u !== p && B.alive(u) && colossus && dist(u, colossus) < 12);
    if (colossus && p.level >= 6 && ratio > 0.7 && friends.length >= 1) {
      out.order = { kind: 'attack', id: colossus.id };
      castAt(p, colossus, out);
      return out;
    }
    if (tower && shieldedByWave && !B.isProtected(state, tower)) { out.order = { kind: 'attack', id: tower.id }; return out; }
    const minions = foes.filter(u => u.type === 'minion' && dist(u, p) < p.range + 5).sort((a, b) => a.hp - b.hp);
    const cover = state.units.some(u => u.type === 'minion' && u.team === 0 && B.alive(u) && dist(u, p) < 7);
    if (minions.length >= 3 && !cover && ratio < 0.85) {
      out.order = { kind: 'move', ...B.lanePoint(lane, B.laneProject(lane, p.x, p.y).along - 6) };
      return out;
    }
    if (prey && p.mana > p.maxMana * 0.45 && !tower) castAt(p, prey, out, true);
    if (minions.length) {
      out.order = { kind: 'attack', id: (minions.find(m => m.hp <= p.damage) || minions[0]).id };
      return out;
    }
    // Follow the blue wave down the middle, a step behind its front.
    let front = null;
    for (const m of state.units) {
      if (m.type !== 'minion' || m.team !== 0 || m.lane !== lane || !B.alive(m)) continue;
      const along = B.laneProject(lane, m.x, m.y).along;
      if (!front || along > front) front = along;
    }
    const spot = front === null ? B.lanePoint(lane, 30) : B.lanePoint(lane, front - 2.5);
    if (dist(spot, p) > 1.2) out.order = { kind: 'move', ...spot };
    return out;
  };

  function castAt(p, target, out, poke = false) {
    const d = dist(p, target), hurt = target.hp / target.maxHp;
    const ready = slot => B.canCast(p, slot) && (!poke || (slot === 0 && p.kind !== 'warden' && p.kind !== 'shade'));
    const at = slot => { out.cast = { slot, x: target.x, y: target.y }; };
    if (p.kind === 'warden') {
      if (ready(0) && d < 2.6) at(0); else if (ready(2) && d > 2.5 && d < 6.5) at(2); else if (ready(1) && d < 4) at(1);
    } else if (p.kind === 'ranger') {
      if (ready(3) && d < 10 && target.type === 'hero') at(3); else if (ready(0) && d < 11) at(0); else if (ready(1) && d < 7) at(1);
    } else if (p.kind === 'ember') {
      if (ready(3) && d < 10.5 && target.type === 'hero') at(3); else if (ready(0) && d < 9) at(0); else if (ready(1) && d < 8) at(1);
    } else if (p.kind === 'shade') {
      if (ready(3) && d < 4.5 && hurt < 0.5 && target.type === 'hero') at(3); else if (ready(2) && d < 3) at(2); else if (ready(0) && d < 5) at(0);
    }
  }

  input.memo = memo;
  return input;
}

function playRun(B, seed, hero, difficulty = 'easy', limitMinutes = 25) {
  const state = B.newGame(seed, hero, difficulty);
  const bot = createBot(B);
  const limit = Math.round(limitMinutes * 60 / B.STEP);
  while (state.status === 'play' && state.tick < limit) B.step(state, bot(state));
  return { state, won: state.status === 'won', minutes: state.time / 60 };
}

function playAi(B, seed, hero, difficulty = 'normal', limitMinutes = 25) {
  const state = B.newGame(seed, hero, difficulty);
  const limit = Math.round(limitMinutes * 60 / B.STEP);
  while (state.status === 'play' && state.tick < limit) B.step(state, { auto: true });
  return { state, won: state.status === 'won', minutes: state.time / 60 };
}

module.exports = { createBot, playRun, playAi };

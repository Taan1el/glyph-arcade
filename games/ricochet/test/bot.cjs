'use strict';
// Plain-input bot for Ricochet: plays full 4-court tournaments using only player inputs.

function createBot(R) {
  const memo = { chargeTicks: 0, targetY: R.HEIGHT / 2, spinDir: 0, waitTicks: 0 };

  function predictY(disc, targetX) {
    if (disc.vx >= -0.5) return R.HEIGHT / 2;
    const t = Math.max(0, Math.min(1.2, (targetX - disc.x) / disc.vx));
    let y = disc.y + disc.vy * t;
    const lo = 1 + R.DISC_R, hi = R.HEIGHT - 1 - R.DISC_R;
    while (y < lo || y > hi) {
      if (y < lo) y = 2 * lo - y;
      if (y > hi) y = 2 * hi - y;
    }
    return y;
  }

  function pickTarget(state, p) {
    const shields = state.shields[1];
    const rival = state.players[1];
    const open = [0, 1, 2].filter(i => shields[i] === 0);
    const segCenter = i => (i === 1 ? 8 : i === 0 ? 3.8 : 12.2);
    // Prefer open gaps furthest from rival; otherwise shoot away from rival to break shields cleanly.
    const candidates = open.length ? open : [0, 1, 2];
    const sorted = candidates.slice().sort((a, b) => Math.abs(segCenter(b) - rival.y) - Math.abs(segCenter(a) - rival.y));
    const goalY = segCenter(sorted[0]);
    // Compute a clean 1-wall reflection target when aiming past the rival.
    const bankTop = 2 * 1.35 - goalY;
    const bankBot = 2 * (R.HEIGHT - 1.35) - goalY;
    const useBank = Math.abs(goalY - rival.y) < 3.5;
    const aimY = useBank ? (rival.y > 8 ? bankTop : bankBot) : goalY;
    return { goalY, aimY, spinDir: goalY < rival.y ? -0.75 : 0.75 };
  }

  return function botInput(state) {
    const out = { moveX: 0, moveY: 0, aimX: R.WIDTH - 1, aimY: R.HEIGHT / 2, throwHeld: false, throwRelease: false, spin: false, dash: false };
    const p = state.players[0], disc = state.disc;

    if (state.holder === 0) {
      if (memo.chargeTicks === 0) {
        const pick = pickTarget(state, p);
        memo.targetY = pick.aimY;
        memo.spinDir = pick.spinDir;
      }
      memo.chargeTicks++;
      out.aimX = R.WIDTH - 1;
      out.aimY = memo.targetY;
      if (memo.chargeTicks < 26) {
        out.throwHeld = true;
        const desiredPos = memo.targetY < 8 ? 11.5 : 4.5;
        out.moveY = Math.max(-1, Math.min(1, (desiredPos - p.y) * 0.4));
      } else {
        out.throwRelease = true;
        out.moveY = memo.spinDir;
        memo.chargeTicks = 0;
      }
      return out;
    }

    memo.chargeTicks = 0;
    let tx = 4.6, ty = R.HEIGHT / 2;
    if (disc.vx < -0.5) {
      tx = Math.max(2.2, Math.min(11, disc.x < 12 ? disc.x : 4.8));
      ty = predictY(disc, tx);
    } else if (disc.x < R.NET_X && Math.hypot(disc.vx, disc.vy) < 4) {
      tx = disc.x;
      ty = disc.y;
    } else if (state.holder === 1) {
      const openLeft = state.shields[0].indexOf(0);
      ty = openLeft >= 0 ? [4, 8, 12][openLeft] : R.HEIGHT / 2 + (state.players[1].y - R.HEIGHT / 2) * 0.35;
    }

    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 0.2) {
      out.moveX = dx / d;
      out.moveY = dy / d;
    }
    if (disc.vx < -10 && disc.x < R.NET_X + 2 && Math.abs(dy) > 1.8 && p.dashCd <= 0) {
      out.dash = true;
    }
    return out;
  };
}

function playRun(R, seed, archetype = 'striker', difficulty = 'easy', limitMinutes = 12) {
  const state = R.newGame(seed, archetype, difficulty);
  const bot = createBot(R);
  const limit = Math.round(limitMinutes * 60 / R.STEP);
  while (state.status === 'play' && state.tick < limit) R.step(state, bot(state));
  return { state, won: state.status === 'won', minutes: state.time / 60 };
}

function playAi(R, seed, archetype = 'striker', difficulty = 'normal', limitMinutes = 12) {
  const state = R.newGame(seed, archetype, difficulty);
  const limit = Math.round(limitMinutes * 60 / R.STEP);
  while (state.status === 'play' && state.tick < limit) R.step(state, { auto: true });
  return { state, won: state.status === 'won', minutes: state.time / 60 };
}

module.exports = { createBot, playRun, playAi };

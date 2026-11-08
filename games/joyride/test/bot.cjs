'use strict';
// A plain-input bot: plays Joyride through step(state, input) using only player keys.

function createBot(J) {
  const memo = {
    enterCooldown: 0,
    stuckFrames: 0,
    reverseFrames: 0,
    anchor: null
  };

  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  function nearestAvailablePhone(state, pos) {
    let best = null, bestDist = Infinity;
    for (const phone of state.payphones) {
      if (!J.availableJobForPhone(state, phone)) continue;
      const d = Math.hypot(phone.x - pos.x, phone.y - pos.y);
      if (d < bestDist) { bestDist = d; best = phone; }
    }
    return best;
  }

  function nearestDrivableCar(state, pos, minHp = 50) {
    let best = null, bestScore = Infinity;
    for (const c of state.cars) {
      if (c.wrecked || c.hp < minHp || c.fireTimer > 0 || c.punctured) continue;
      // Do not steal the active tail target car!
      if (state.activeJob && state.activeJob.type === 'tail' && c.id === state.activeJob.targetCarId) continue;
      const d = Math.hypot(c.x - pos.x, c.y - pos.y);
      const penalty = (c.driver === 'police' || c.kind === 'cruiser') ? 16 : 0;
      if (d + penalty < bestScore) { bestScore = d + penalty; best = c; }
    }
    return best;
  }

  function nextWaypointTowards(state, fromX, fromY, toX, toY) {
    const direct = Math.hypot(toX - fromX, toY - fromY);
    if (direct < 6) return { x: toX, y: toY };
    const path = J.findRoadPath(state, fromX, fromY, toX, toY);
    for (let i = 0; i < path.length; i++) {
      const wp = path[i];
      const d = Math.hypot(wp.x - fromX, wp.y - fromY);
      if (d <= 2.5) continue;
      if (i + 1 < path.length) {
        const next = path[i + 1];
        const segLen = Math.hypot(next.x - wp.x, next.y - wp.y);
        const distToNext = Math.hypot(next.x - fromX, next.y - fromY);
        if (distToNext < segLen) continue;
      }
      return wp;
    }
    return { x: toX, y: toY };
  }

  function chooseEvasionTarget(state, pos) {
    const police = state.cars.filter(c => !c.wrecked && c.driver === 'police');
    let best = state.intersections[0], bestScore = -Infinity;
    for (const n of state.intersections) {
      let minPoliceDist = 999;
      for (const cop of police) {
        minPoliceDist = Math.min(minPoliceDist, Math.hypot(n.x - cop.x, n.y - cop.y));
      }
      const circleDist = state.searchCircle ? Math.hypot(n.x - state.searchCircle.x, n.y - state.searchCircle.y) : 50;
      const score = minPoliceDist * 2.2 + circleDist;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return { x: best.x, y: best.y };
  }

  const input = function (state) {
    const out = { up: false, down: false, left: false, right: false, handbrake: false, enter: false, sprint: false, horn: false };
    memo.enterCooldown = Math.max(0, memo.enterCooldown - 1);

    const pCar = J.playerCar(state);
    const pos = J.playerPos(state);
    const job = state.activeJob;

    // Watchdog for getting wedged against a building or wreck
    if (!memo.anchor || Math.hypot(pos.x - memo.anchor.x, pos.y - memo.anchor.y) > 1.2) {
      memo.anchor = { x: pos.x, y: pos.y };
      memo.stuckFrames = 0;
      memo.unstuckCount = 0;
    } else {
      memo.stuckFrames++;
    }
    if (pCar && memo.stuckFrames > 32) {
      memo.reverseFrames = 42;
      memo.stuckFrames = 0;
      memo.unstuckCount = (memo.unstuckCount || 0) + 1;
    }

    let requiredCar = null;
    if (job && (job.type === 'delivery' || job.type === 'finale')) {
      requiredCar = state.cars.find(c => c.id === job.targetCarId) || null;
    }

    // 1. Bail out of any burning car, as the objective line tells a player to,
    //    and out of a non-mission car that is badly hurt
    if (pCar && (pCar.fireTimer > 0 || !requiredCar || pCar.id !== requiredCar.id)) {
      if (pCar.hp < 38 || pCar.fireTimer > 0 || pCar.punctured) {
        if (memo.enterCooldown === 0) {
          out.enter = true;
          memo.enterCooldown = 24;
          return out;
        }
      }
    }

    // 2. Switch into the required mission car when we arrive beside it
    if (requiredCar && pCar && pCar.id !== requiredCar.id) {
      if (Math.hypot(pos.x - requiredCar.x, pos.y - requiredCar.y) < 4.5 && memo.enterCooldown === 0) {
        if (Math.abs(pCar.speed) > 2.8) {
          out.down = true;
          out.handbrake = true;
          return out;
        }
        out.enter = true;
        memo.enterCooldown = 24;
        return out;
      }
    }

    // 3. On foot: answer nearby payphone if idle, or sprint toward the nearest car / required car
    if (!pCar) {
      const phone = !job ? nearestAvailablePhone(state, pos) : null;
      if (phone && Math.hypot(phone.x - pos.x, phone.y - pos.y) < 2.3 && memo.enterCooldown === 0) {
        out.enter = true;
        memo.enterCooldown = 24;
        return out;
      }

      let targetCar = requiredCar;
      const nearby = nearestDrivableCar(state, pos, 50);
      if (!targetCar || (nearby && Math.hypot(targetCar.x - pos.x, targetCar.y - pos.y) > 16 && Math.hypot(nearby.x - pos.x, nearby.y - pos.y) < 18)) {
        targetCar = nearby || targetCar;
      }

      if (targetCar && Math.hypot(targetCar.x - pos.x, targetCar.y - pos.y) < 2.6 && memo.enterCooldown === 0) {
        out.enter = true;
        memo.enterCooldown = 24;
        return out;
      }

      const footGoal = (phone && Math.hypot(phone.x - pos.x, phone.y - pos.y) < 10 && (!targetCar || Math.hypot(phone.x - pos.x, phone.y - pos.y) < Math.hypot(targetCar.x - pos.x, targetCar.y - pos.y)))
        ? phone
        : (targetCar || phone || state.intersections[0]);
      const wp = nextWaypointTowards(state, pos.x, pos.y, footGoal.x, footGoal.y);
      const dx = wp.x - pos.x, dy = wp.y - pos.y;
      if (Math.abs(dx) > 0.22) { if (dx > 0) out.right = true; else out.left = true; }
      if (Math.abs(dy) > 0.22) { if (dy > 0) out.down = true; else out.up = true; }
      out.sprint = true;
      return out;
    }

    // 4. Driving in a car: decide destination and speed policy
    let goal = null;
    let stopAtGoal = false;
    let ramMode = false;

    if (!job) {
      if (state.heat >= 2) {
        if (state.cash >= J.RESPRAY_COST && !J.canPoliceSeePlayer(state)) {
          goal = { x: state.respray.x, y: state.respray.y };
          stopAtGoal = true;
        } else {
          goal = chooseEvasionTarget(state, pos);
        }
      } else {
        const phone = nearestAvailablePhone(state, pos);
        if (phone) {
          goal = { x: phone.x, y: phone.y };
          stopAtGoal = true;
          if (Math.hypot(phone.x - pos.x, phone.y - pos.y) < 2.9 && Math.abs(pCar.speed) < 2.8 && memo.enterCooldown === 0) {
            out.enter = true;
            memo.enterCooldown = 24;
            return out;
          }
        }
      }
    } else if (job.type === 'delivery') {
      if (requiredCar && pCar.id !== requiredCar.id) {
        goal = { x: requiredCar.x, y: requiredCar.y };
        stopAtGoal = true;
      } else if (pCar.hp < job.minHp + 8 && state.cash >= J.RESPRAY_COST && !J.canPoliceSeePlayer(state)) {
        goal = { x: state.respray.x, y: state.respray.y };
        stopAtGoal = true;
      } else {
        goal = { x: job.drop.x, y: job.drop.y };
        stopAtGoal = true;
      }
    } else if (job.type === 'checkpoints') {
      goal = job.checkpoints[job.index] || job.checkpoints[0];
    } else if (job.type === 'getaway') {
      if (job.stage === 'pickup') {
        goal = { x: job.pickup.x, y: job.pickup.y };
        stopAtGoal = true;
      } else if (state.heat > 0) {
        if (state.cash >= J.RESPRAY_COST && !J.canPoliceSeePlayer(state)) {
          goal = { x: state.respray.x, y: state.respray.y };
          stopAtGoal = true;
        } else {
          goal = chooseEvasionTarget(state, pos);
        }
      } else {
        goal = { x: job.drop.x, y: job.drop.y };
        stopAtGoal = true;
      }
    } else if (job.type === 'tail') {
      const target = state.cars.find(c => c.id === job.targetCarId);
      if (target) {
        // Aim for a point 13 tiles behind the target car's heading so we never rear-end or spook it
        const followX = target.x - Math.cos(target.angle) * 13;
        const followY = target.y - Math.sin(target.angle) * 13;
        const distToTarget = Math.hypot(target.x - pos.x, target.y - pos.y);
        const wp = distToTarget > 18
          ? nextWaypointTowards(state, pos.x, pos.y, target.x, target.y)
          : nextWaypointTowards(state, pos.x, pos.y, followX, followY);
        const wantedAngle = Math.atan2(wp.y - pos.y, wp.x - pos.x);
        const angleDiff = wrapAngle(wantedAngle - pCar.angle);
        if (angleDiff < -0.08) out.left = true;
        else if (angleDiff > 0.08) out.right = true;

        if (distToTarget < job.minDist + 4.5) {
          if (pCar.speed > 0.5) { out.down = true; out.handbrake = true; }
          else out.down = true;
        } else if (distToTarget > 16) {
          out.up = true;
        } else {
          out.up = pCar.speed < 9.5;
        }
        return out;
      }
    } else if (job.type === 'wreck') {
      const rivals = job.rivalIds.map(id => state.cars.find(c => c.id === id)).filter(c => c && !c.wrecked);
      rivals.sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
      if (rivals[0]) {
        goal = { x: rivals[0].x, y: rivals[0].y };
        ramMode = true;
      }
    } else if (job.type === 'pickup') {
      const left = job.parcels.filter(p => !p.taken).sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
      if (left[0]) goal = { x: left[0].x, y: left[0].y };
    } else if (job.type === 'finale') {
      if (requiredCar && pCar.id !== requiredCar.id) {
        goal = { x: requiredCar.x, y: requiredCar.y };
        stopAtGoal = true;
      } else {
        goal = { x: job.drop.x, y: job.drop.y };
      }
    }

    if (!goal) goal = { x: state.intersections[0].x, y: state.intersections[0].y };

    if (memo.reverseFrames > 0) {
      memo.reverseFrames--;
      // Alternate between backing out and pulling forward if the rear is blocked
      const tryForward = (memo.unstuckCount || 0) % 2 === 0;
      if (tryForward) out.up = true;
      else out.down = true;
      if ((memo.unstuckCount || 0) % 3 === 0) out.left = true;
      else out.right = true;
      return out;
    }

    const distToGoal = Math.hypot(goal.x - pos.x, goal.y - pos.y);
    const wp = nextWaypointTowards(state, pos.x, pos.y, goal.x, goal.y);
    const wantedAngle = Math.atan2(wp.y - pos.y, wp.x - pos.x);
    const angleDiff = wrapAngle(wantedAngle - pCar.angle);

    if (angleDiff < -0.08) out.left = true;
    else if (angleDiff > 0.08) out.right = true;

    if (stopAtGoal && distToGoal < 3.1) {
      if (pCar.speed > 1.8) {
        out.down = true;
        out.handbrake = true;
      }
      return out;
    }

    const sharpTurn = Math.abs(angleDiff) > 0.85;
    if (sharpTurn && pCar.speed > 13 && !ramMode) {
      out.handbrake = Math.abs(angleDiff) > 1.35;
      out.down = !out.handbrake;
    } else {
      out.up = true;
    }

    return out;
  };

  input.memo = memo;
  return input;
}

function playRun(J, seed, difficulty = 'normal', limitMinutes = 45) {
  const state = J.newGame(seed, difficulty);
  const bot = createBot(J);
  const limit = Math.round(3600 * limitMinutes);
  let steps = 0;
  while (!state.won && steps < limit) {
    J.step(state, bot(state));
    steps++;
  }
  return { state, minutes: steps / 3600 };
}

module.exports = { createBot, playRun };

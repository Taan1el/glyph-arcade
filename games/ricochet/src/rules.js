/* Ricochet rules: pure 1v1 arcade disc court sport with 4 courts, 4 archetypes,
 * spin curves, bank multipliers, parries, goal shields and a 4-match tournament. */
(function (global) {
  'use strict';

  const WIDTH = 28;
  const HEIGHT = 16;
  const STEP = 1 / 60;
  const SUBSTEPS = 4;
  const NET_X = 14;
  const DISC_R = 0.35;
  const MAX_BOUNCES = 3;
  const MAX_SPEED = 48;
  const POINTS_TO_WIN_SET = 5;
  const SETS_TO_WIN_MATCH = 2;

  const COURTS = [
    { id: 'foundry', name: 'Foundry Court', note: 'Clean walls and angled corner wedges.', pillars: [], conveyors: false, prisms: [] },
    { id: 'pillars', name: 'Twin Pillar Court', note: 'Two mid-court bumpers deflect throws.', pillars: [{ x: 14, y: 4.5, r: 0.9 }, { x: 14, y: 11.5, r: 0.9 }], conveyors: false, prisms: [] },
    { id: 'conveyor', name: 'Conveyor Court', note: 'Side strips speed up players and discs.', pillars: [], conveyors: true, prisms: [] },
    { id: 'prism', name: 'Prism Finals', note: 'Rotating deflectors flip 45 degrees on impact.', pillars: [], conveyors: false, prisms: [{ x: 14, y: 4, r: 0.85, angle: 0 }, { x: 14, y: 8, r: 0.85, angle: 2 }, { x: 14, y: 12, r: 0.85, angle: 0 }] }
  ];

  const ARCHETYPES = {
    striker: { id: 'striker', name: 'Striker', letter: 'S', walk: 11.2, throwSpeed: 30, chargeBonus: 11, spinPower: 15, catchR: 0.85, dashDist: 3.4, dashCd: 1.2, parryWindow: 0.15, bankMult: 1.15, note: 'Fast straight throws and a wide parry window.' },
    spinner: { id: 'spinner', name: 'Spinner', letter: 'C', walk: 11.6, throwSpeed: 25.5, chargeBonus: 9.5, spinPower: 28, catchR: 1.0, dashDist: 3.8, dashCd: 1.2, parryWindow: 0.11, bankMult: 1.15, note: 'Sharp curve spin and wide catch reach.' },
    bastion: { id: 'bastion', name: 'Bastion', letter: 'B', walk: 9.8, throwSpeed: 27.5, chargeBonus: 10.5, spinPower: 14, catchR: 1.1, dashDist: 3.9, dashCd: 1.25, parryWindow: 0.12, bankMult: 1.15, heavyDash: true, note: 'Heavy frame; dash grabs critical discs cleanly.' },
    phantom: { id: 'phantom', name: 'Phantom', letter: 'P', walk: 13.4, throwSpeed: 23, chargeBonus: 9, spinPower: 18, catchR: 0.85, dashDist: 5.0, dashCd: 0.95, parryWindow: 0.11, bankMult: 1.22, note: 'Quickest dash and stronger bank-shot speedups.' }
  };
  const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

  const DIFFICULTIES = {
    easy: { label: 'Easy', reaction: 0.28, speedScale: 0.72, spinChance: 0.15, parryChance: 0, aimSmart: 0.25, predError: 2.2, dashChance: 0.15 },
    normal: { label: 'Normal', reaction: 0.16, speedScale: 0.95, spinChance: 0.55, parryChance: 0.22, aimSmart: 0.7, predError: 0.8, dashChance: 0.6 },
    hard: { label: 'Hard', reaction: 0.08, speedScale: 1.12, spinChance: 0.8, parryChance: 0.55, aimSmart: 0.95, predError: 0.15, dashChance: 1.0 }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function hash(seed) {
    let n = 2166136261;
    for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0;
  }
  function random(state) {
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    return state.rng / 4294967296;
  }

  function makePlayer(side, kind) {
    const spec = ARCHETYPES[kind] || ARCHETYPES.striker;
    return {
      side,
      kind: spec.id,
      x: side === 0 ? 5.5 : WIDTH - 5.5,
      y: HEIGHT / 2,
      vx: 0,
      vy: 0,
      r: 0.72,
      facing: side === 0 ? 1 : -1,
      dashTimer: 0,
      dashCd: 0,
      dashDx: 0,
      dashDy: 0,
      holdTimer: 0,
      chargeTimer: 0,
      charging: false,
      parryPrime: 0,
      justCaught: 0,
      stunTimer: 0,
      throwLock: 0,
      aimX: side === 0 ? 1 : -1,
      aimY: 0,
      aiDelay: 0,
      aiTargetX: side === 0 ? 5.5 : WIDTH - 5.5,
      aiTargetY: HEIGHT / 2,
      aiThrowAt: 0.55,
      aiSpinDir: 0
    };
  }

  function makeTournamentOrder(seed, playerKind) {
    const others = ARCHETYPE_KEYS.filter(k => k !== playerKind);
    const rot = hash(seed + ':opp') % others.length;
    const rotated = others.slice(rot).concat(others.slice(0, rot));
    return [...rotated, playerKind];
  }

  function loadCourt(state, index) {
    const spec = COURTS[index] || COURTS[0];
    state.courtIndex = index;
    state.sets = [0, 0];
    state.points = [0, 0];
    state.prisms = spec.prisms.map(p => ({ ...p }));
    resetShields(state);
    startRally(state, 0);
  }

  function resetShields(state) {
    state.shields = [[2, 2, 2], [2, 2, 2]];
  }

  function startRally(state, serveSide) {
    state.players[0].x = 5.5;
    state.players[0].y = HEIGHT / 2;
    state.players[0].vx = 0;
    state.players[0].vy = 0;
    state.players[0].dashTimer = 0;
    state.players[0].charging = false;
    state.players[0].chargeTimer = 0;
    state.players[0].stunTimer = 0;
    state.players[0].throwLock = 0;
    state.players[1].x = WIDTH - 5.5;
    state.players[1].y = HEIGHT / 2;
    state.players[1].vx = 0;
    state.players[1].vy = 0;
    state.players[1].dashTimer = 0;
    state.players[1].charging = false;
    state.players[1].chargeTimer = 0;
    state.players[1].stunTimer = 0;
    state.players[1].throwLock = 0;
    state.players[serveSide].holdTimer = 0;
    state.players[serveSide].aiThrowAt = 0.45 + random(state) * 0.25;
    state.players[serveSide].aiSpinDir = random(state) < 0.5 ? -1 : 1;
    state.holder = serveSide;
    state.rallyCooldown = 0.45;
    state.disc = {
      x: state.players[serveSide].x + (serveSide === 0 ? 0.9 : -0.9),
      y: state.players[serveSide].y,
      vx: 0,
      vy: 0,
      r: DISC_R,
      spin: 0,
      bounces: 0,
      owner: serveSide,
      charged: false,
      parried: false,
      speed: 0,
      prismCd: 0
    };
  }

  function newGame(seed = 'ricochet', archetype = 'striker', difficulty = 'normal') {
    seed = String(seed);
    if (!ARCHETYPES[archetype]) archetype = 'striker';
    if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
    const rivals = makeTournamentOrder(seed, archetype);
    const state = {
      version: 1,
      seed,
      archetype,
      difficulty,
      status: 'play',
      tick: 0,
      time: 0,
      endTime: 0,
      rng: hash(seed) || 1,
      rivals,
      courtIndex: 0,
      sets: [0, 0],
      points: [0, 0],
      shields: [[2, 2, 2], [2, 2, 2]],
      prisms: [],
      holder: 0,
      rallyCooldown: 0.45,
      matchPause: 0,
      players: [makePlayer(0, archetype), makePlayer(1, rivals[0])],
      disc: null,
      stats: { goals: 0, bullseyes: 0, shieldsBroken: 0, parries: 0, bankGoals: 0, bestRallyBounces: 0, setsWon: 0, setsLost: 0 }
    };
    loadCourt(state, 0);
    return state;
  }

  function segForY(y) {
    if (y >= 2 && y < 6) return 0;
    if (y >= 6 && y < 10) return 1;
    if (y >= 10 && y < 14) return 2;
    return -1;
  }

  function courtTileAt(state, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT) return 'WALL';
    if (ty === 0 || ty === HEIGHT - 1) return 'WALL_H';
    if ((tx === 1 && ty === 1) || (tx === WIDTH - 2 && ty === HEIGHT - 2)) return 'WEDGE_SLASH';
    if ((tx === 1 && ty === HEIGHT - 2) || (tx === WIDTH - 2 && ty === 1)) return 'WEDGE_BACK';
    if (tx === 0 || tx === WIDTH - 1) {
      if (ty === 1 || ty === HEIGHT - 2) return 'WALL_V';
      const side = tx === 0 ? 0 : 1, seg = segForY(ty + 0.5);
      if (seg >= 0) {
        const hp = state.shields[side][seg];
        if (hp > 0) return 'SHIELD_' + hp;
        return (ty === 7 || ty === 8) ? 'BULLSEYE' : 'GOAL';
      }
      return 'WALL_V';
    }
    const court = COURTS[state.courtIndex] || COURTS[0];
    if (court.pillars.some(p => Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < p.r)) return 'PILLAR';
    if (state.prisms.some(p => Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < p.r)) return 'PRISM';
    if (court.conveyors && tx >= 4 && tx <= WIDTH - 5) {
      if (ty === 1 || ty === 2) return 'CONVEYOR_E';
      if (ty === HEIGHT - 3 || ty === HEIGHT - 2) return 'CONVEYOR_W';
    }
    if (tx === NET_X - 1 || tx === NET_X) return 'NET';
    return 'FLOOR';
  }

  function clampPlayerPos(p) {
    const minX = p.side === 0 ? 1 + p.r : NET_X + 0.35 + p.r;
    const maxX = p.side === 0 ? NET_X - 0.35 - p.r : WIDTH - 1 - p.r;
    const minY = 1 + p.r;
    const maxY = HEIGHT - 1 - p.r;
    p.x = clamp(p.x, minX, maxX);
    p.y = clamp(p.y, minY, maxY);
  }

  function launchDisc(state, p, { charge = 0, spin = 0, parried = false, fumble = false, events }) {
    const spec = ARCHETYPES[p.kind];
    const dirSign = p.side === 0 ? 1 : -1;
    let ax = Number.isFinite(p.aimX) && p.aimX * dirSign > 0.1 ? p.aimX : dirSign;
    let ay = Number.isFinite(p.aimY) ? p.aimY : 0;
    const len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;
    // Limit throw elevation so throws always cross toward the opponent's half cleanly.
    if (ax * dirSign < 0.32) {
      ax = dirSign * 0.32;
      const sy = Math.sign(ay) || 1;
      ay = sy * Math.sqrt(1 - 0.32 * 0.32);
    }
    let speed = fumble ? 7 : spec.throwSpeed + clamp(charge, 0, 1) * spec.chargeBonus;
    if (parried) speed = Math.min(MAX_SPEED, Math.max(speed, (state.disc.speed || 0)) * 1.25);
    const disc = state.disc;
    disc.x = clamp(p.x + ax * (p.r + disc.r + 0.15), 1.4, WIDTH - 1.4);
    disc.y = clamp(p.y + ay * (p.r + disc.r + 0.15), 1.4, HEIGHT - 1.4);
    disc.vx = ax * speed;
    disc.vy = ay * speed;
    disc.speed = speed;
    disc.spin = fumble ? 0 : clamp(spin, -1, 1) * spec.spinPower;
    disc.bounces = 0;
    disc.owner = p.side;
    disc.charged = !fumble && (charge >= 0.35 || parried);
    disc.parried = parried;
    disc.fumble = fumble;
    state.holder = -1;
    p.holdTimer = 0;
    p.charging = false;
    p.chargeTimer = 0;
    p.throwLock = fumble ? 0.45 : 0.18;
    p.justCaught = 0;
    p.parryPrime = 0;
    if (parried) {
      if (p.side === 0) state.stats.parries++;
      events.push({ type: 'parry', side: p.side, x: p.x, y: p.y });
    } else if (fumble) {
      p.stunTimer = 0.4;
      events.push({ type: 'fumble', side: p.side, x: p.x, y: p.y });
    } else {
      events.push({ type: 'throw', side: p.side, spin: Math.abs(spin) > 0.2, charged: disc.charged, x: p.x, y: p.y });
    }
  }

  function stepPlayerControl(state, p, input, events) {
    const spec = ARCHETYPES[p.kind];
    p.dashCd = Math.max(0, p.dashCd - STEP);
    p.parryPrime = Math.max(0, p.parryPrime - STEP);
    p.justCaught = Math.max(0, p.justCaught - STEP);
    p.stunTimer = Math.max(0, p.stunTimer - STEP);
    p.throwLock = Math.max(0, p.throwLock - STEP);

    const mx = clamp(input.moveX || 0, -1, 1);
    const my = clamp(input.moveY || 0, -1, 1);
    const mag = Math.hypot(mx, my);
    const nx = mag > 1 ? mx / mag : mx;
    const ny = mag > 1 ? my / mag : my;

    if (p.stunTimer > 0) {
      p.vx *= 0.85;
      p.vy *= 0.85;
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      clampPlayerPos(p);
      return;
    }

    // Update aim from pointer/stick if supplied, otherwise steer with movement input.
    const dirSign = p.side === 0 ? 1 : -1;
    if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
      const dx = input.aimX - p.x, dy = input.aimY - p.y, ad = Math.hypot(dx, dy);
      if (ad > 0.2) {
        p.aimX = dx * dirSign > 0.05 ? dx / ad : dirSign;
        p.aimY = dy / ad;
      }
    } else if (Math.abs(ny) > 0.1) {
      p.aimX = dirSign * Math.sqrt(Math.max(0.25, 1 - ny * ny * 0.72));
      p.aimY = ny * 0.85;
    } else if (state.holder === p.side) {
      p.aimX = dirSign;
      p.aimY *= 0.85;
    }

    // Holding the disc: charge, throw, spin or overcharge fumble.
    if (state.holder === p.side) {
      p.holdTimer += STEP;
      p.vx = nx * spec.walk * 0.45;
      p.vy = ny * spec.walk * 0.45;
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      clampPlayerPos(p);

      const spinTap = Boolean(input.spin);
      const parryStrike = p.justCaught > 0 && (Boolean(input.throwPressed) || Boolean(input.throwRelease) || spinTap);
      if (parryStrike) {
        launchDisc(state, p, { charge: 0.8, spin: spinTap ? (ny || (p.y < HEIGHT / 2 ? 1 : -1)) : 0, parried: true, events });
        return;
      }
      if (input.throwHeld) {
        p.charging = true;
        p.chargeTimer += STEP;
        if (p.chargeTimer >= 1.25) {
          launchDisc(state, p, { fumble: true, events });
          return;
        }
      }
      if (spinTap || input.throwRelease || (p.charging && !input.throwHeld) || p.holdTimer >= 3.0) {
        const autoFumble = p.holdTimer >= 3.0 && !input.throwRelease && !spinTap;
        if (autoFumble) {
          launchDisc(state, p, { fumble: true, events });
          return;
        }
        const charge = clamp(p.chargeTimer, 0, 1);
        const curve = spinTap ? (Math.abs(ny) > 0.15 ? ny : (p.y < HEIGHT / 2 ? 0.9 : -0.9)) : ny * 0.75;
        launchDisc(state, p, { charge, spin: curve, parried: p.justCaught > 0, events });
        return;
      }
      state.disc.x = p.x + dirSign * 0.85;
      state.disc.y = p.y;
      return;
    }

    // Prime parry when pressing throw before catching.
    if (input.throwPressed || input.throwHeld || input.spin) {
      if (p.parryPrime <= 0 && !p._heldPrev) p.parryPrime = spec.parryWindow;
    }
    p._heldPrev = Boolean(input.throwHeld || input.spin);

    // Dash
    if (input.dash && p.dashCd <= 0 && p.dashTimer <= 0) {
      const dx = mag > 0.15 ? nx : dirSign;
      const dy = mag > 0.15 ? ny : 0;
      const dl = Math.hypot(dx, dy) || 1;
      p.dashDx = dx / dl;
      p.dashDy = dy / dl;
      p.dashTimer = 0.16;
      p.dashCd = spec.dashCd;
      events.push({ type: 'dash', side: p.side, x: p.x, y: p.y });
    }

    if (p.dashTimer > 0) {
      p.dashTimer -= STEP;
      const dashSpeed = spec.dashDist / 0.16;
      p.vx = p.dashDx * dashSpeed;
      p.vy = p.dashDy * dashSpeed;
    } else {
      p.vx = nx * spec.walk;
      p.vy = ny * spec.walk;
      // Conveyor floor boost
      const court = COURTS[state.courtIndex];
      if (court.conveyors && p.x >= 4 && p.x <= WIDTH - 5) {
        if (p.y >= 1 && p.y < 3) p.vx += 4.5;
        else if (p.y >= HEIGHT - 3 && p.y < HEIGHT - 1) p.vx -= 4.5;
      }
    }

    p.x += p.vx * STEP;
    p.y += p.vy * STEP;
    clampPlayerPos(p);
  }

  function aiInput(state, p) {
    const brain = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
    const disc = state.disc;
    const out = { moveX: 0, moveY: 0, throwHeld: false, throwRelease: false, spin: false, dash: false };

    if (state.holder === p.side) {
      p.aiThrowAt -= STEP;
      // Pick target Y on player endzone: aim at open or fragile shields based on difficulty.
      if (p.holdTimer < 0.05) {
        const oppShields = state.shields[0];
        const openSegs = [0, 1, 2].filter(i => oppShields[i] === 0);
        const seg = openSegs.length && random(state) < brain.aimSmart
          ? openSegs[Math.floor(random(state) * openSegs.length)]
          : Math.floor(random(state) * 3);
        const segCenter = [4, 8, 12][seg];
        const bankOffset = random(state) < brain.aimSmart * 0.4 ? (seg === 0 ? -9 : 9) : 0;
        p.aiTargetY = segCenter + bankOffset + (random(state) - 0.5) * 1.4;
        p.aiSpinDir = random(state) < brain.spinChance ? (random(state) < 0.5 ? -1 : 1) : 0;
      }
      out.aimX = 1;
      out.aimY = p.aiTargetY;
      out.moveY = clamp((p.aiTargetY - p.y) * 0.35, -1, 1);
      if (p.aiThrowAt > 0) {
        out.throwHeld = true;
      } else {
        out.throwRelease = true;
        if (p.aiSpinDir !== 0) {
          out.spin = true;
          out.moveY = p.aiSpinDir;
        }
      }
      return out;
    }

    p.aiDelay -= STEP;
    if (p.aiDelay <= 0) {
      p.aiDelay = brain.reaction * (0.8 + random(state) * 0.4);
      const comingHere = disc.vx > 1;
      if (comingHere) {
        // Predict disc intersection near rival defensive line.
        const guardX = clamp(WIDTH - 4.2, NET_X + 1.5, WIDTH - 2);
        const tToGuard = clamp((guardX - disc.x) / Math.max(2, disc.vx), 0, 0.9);
        let predY = disc.y + disc.vy * tToGuard;
        while (predY < 1.3 || predY > HEIGHT - 1.3) {
          if (predY < 1.3) predY = 2.6 - predY;
          if (predY > HEIGHT - 1.3) predY = 2 * (HEIGHT - 1.3) - predY;
        }
        p.aiTargetX = clamp(disc.x > NET_X + 1 && Math.abs(disc.vx) < 12 ? disc.x : guardX, NET_X + 1.5, WIDTH - 2);
        p.aiTargetY = clamp(predY + (random(state) - 0.5) * 2 * (brain.predError || 0), 2, HEIGHT - 2);
      } else {
        // Guard open gaps on Hard, otherwise stay centred.
        const openSeg = state.shields[1].indexOf(0);
        p.aiTargetX = WIDTH - 5.0;
        p.aiTargetY = openSeg >= 0 && random(state) < brain.aimSmart ? [4, 8, 12][openSeg] : HEIGHT / 2 + (disc.y - HEIGHT / 2) * 0.35;
      }
    }

    const dx = p.aiTargetX - p.x, dy = p.aiTargetY - p.y, d = Math.hypot(dx, dy);
    if (d > 0.25) {
      out.moveX = clamp(dx / d * brain.speedScale, -1, 1);
      out.moveY = clamp(dy / d * brain.speedScale, -1, 1);
    }
    if (disc.vx > 12 && disc.x > NET_X + 1 && d > 2.2 && Math.abs(disc.y - p.y) > 2.2 && p.dashCd <= 0 && random(state) < (brain.dashChance ?? 0.7)) {
      out.dash = true;
    }
    if (disc.vx > 8 && disc.bounces === 0 && Math.hypot(disc.x - p.x, disc.y - p.y) < 2.2 && random(state) < brain.parryChance) {
      out.throwPressed = true;
    }
    return out;
  }

  function reflectWall(disc, nx, ny, mult) {
    const dot = disc.vx * nx + disc.vy * ny;
    if (dot >= 0) return false;
    disc.vx -= 2 * dot * nx;
    disc.vy -= 2 * dot * ny;
    if (disc.bounces < MAX_BOUNCES) {
      disc.bounces++;
      const spd = Math.min(MAX_SPEED, Math.hypot(disc.vx, disc.vy) * mult);
      const cur = Math.hypot(disc.vx, disc.vy) || 1;
      disc.vx = disc.vx / cur * spd;
      disc.vy = disc.vy / cur * spd;
      disc.speed = spd;
    }
    return true;
  }

  function handleEndzoneHit(state, side, events) {
    const disc = state.disc;
    const seg = segForY(disc.y);
    if (seg < 0) {
      reflectWall(disc, side === 0 ? 1 : -1, 0, 1.0);
      disc.x = side === 0 ? 1 + disc.r + 0.02 : WIDTH - 1 - disc.r - 0.02;
      return false;
    }
    if (state.shields[side][seg] > 0) {
      const dmg = (disc.fumble && disc.speed < 14) ? 1 : 2;
      state.shields[side][seg] = Math.max(0, state.shields[side][seg] - dmg);
      let brokenCount = state.shields[side][seg] === 0 ? 1 : 0;
      if (disc.bounces >= 2) {
        // 2-bounce bank shot breaks two shields when another shield stands.
        const order = [0, 1, 2].filter(i => i !== seg && state.shields[side][i] > 0)
          .sort((a, b) => Math.abs(a - seg) - Math.abs(b - seg));
        if (order.length) {
          state.shields[side][order[0]] = 0;
          brokenCount++;
        }
      }
      if (side === 1) state.stats.shieldsBroken += brokenCount;
      disc.x = side === 0 ? 1 + disc.r + 0.04 : WIDTH - 1 - disc.r - 0.04;
      disc.vx = (side === 0 ? 1 : -1) * Math.max(12, Math.abs(disc.vx) * 0.85);
      disc.bounces = 0;
      disc.spin *= 0.5;
      events.push({ type: 'shield', side, seg, broken: brokenCount, x: disc.x, y: disc.y });
      return false;
    }
    // Open segment! Wait until disc clears threshold slightly for clean visual goal.
    const scoredBy = 1 - side;
    const bullseye = disc.y >= 7 && disc.y <= 9;
    const pts = bullseye ? 2 : 1;
    state.points[scoredBy] += pts;
    if (scoredBy === 0) {
      state.stats.goals++;
      if (bullseye) state.stats.bullseyes++;
      if (disc.bounces > 0) state.stats.bankGoals++;
    }
    events.push({ type: 'goal', scorer: scoredBy, points: pts, bullseye, x: disc.x, y: disc.y });
    if (state.points[scoredBy] >= POINTS_TO_WIN_SET) {
      state.sets[scoredBy]++;
      if (scoredBy === 0) state.stats.setsWon++;
      else state.stats.setsLost++;
      events.push({ type: 'set', winner: scoredBy, sets: state.sets.slice() });
      if (state.sets[scoredBy] >= SETS_TO_WIN_MATCH) {
        if (scoredBy === 0) {
          if (state.courtIndex + 1 < COURTS.length) {
            const nextCourt = state.courtIndex + 1;
            events.push({ type: 'matchWon', court: state.courtIndex, nextCourt });
            state.players[1] = makePlayer(1, state.rivals[nextCourt]);
            loadCourt(state, nextCourt);
            state.matchPause = 1.1;
          } else {
            state.status = 'won';
            state.endTime = state.time;
            events.push({ type: 'victory' });
          }
        } else {
          state.status = 'lost';
          state.endTime = state.time;
          events.push({ type: 'defeat' });
        }
        return true;
      }
      state.points = [0, 0];
    }
    resetShields(state);
    startRally(state, side);
    return true;
  }

  function stepDisc(state, events) {
    const disc = state.disc;
    if (state.holder >= 0) return;
    disc.prismCd = Math.max(0, disc.prismCd - STEP);
    const court = COURTS[state.courtIndex];
    const ownerSpec = ARCHETYPES[state.players[disc.owner]?.kind] || ARCHETYPES.striker;
    const mult = ownerSpec.bankMult;
    const subDt = STEP / SUBSTEPS;

    for (let s = 0; s < SUBSTEPS; s++) {
      // Curve spin perpendicular to velocity
      if (Math.abs(disc.spin) > 0.01) {
        const spd = Math.hypot(disc.vx, disc.vy) || 1;
        disc.vx += (-disc.vy / spd) * disc.spin * subDt;
        disc.vy += (disc.vx / spd) * disc.spin * subDt;
        const nSpd = Math.hypot(disc.vx, disc.vy) || 1;
        const targetSpd = Math.min(MAX_SPEED, spd);
        disc.vx = disc.vx / nSpd * targetSpd;
        disc.vy = disc.vy / nSpd * targetSpd;
      }
      // Conveyor acceleration
      if (court.conveyors && disc.x >= 4 && disc.x <= WIDTH - 5) {
        if (disc.y >= 1 && disc.y < 3) disc.vx = clamp(disc.vx + 14 * subDt, -MAX_SPEED, MAX_SPEED);
        else if (disc.y >= HEIGHT - 3 && disc.y < HEIGHT - 1) disc.vx = clamp(disc.vx - 14 * subDt, -MAX_SPEED, MAX_SPEED);
      }

      disc.x += disc.vx * subDt;
      disc.y += disc.vy * subDt;
      disc.speed = Math.hypot(disc.vx, disc.vy);

      // Top and bottom walls
      if (disc.y - disc.r < 1) {
        disc.y = 1 + disc.r;
        if (reflectWall(disc, 0, 1, mult)) events.push({ type: 'bank', bounces: disc.bounces, x: disc.x, y: disc.y });
      } else if (disc.y + disc.r > HEIGHT - 1) {
        disc.y = HEIGHT - 1 - disc.r;
        if (reflectWall(disc, 0, -1, mult)) events.push({ type: 'bank', bounces: disc.bounces, x: disc.x, y: disc.y });
      }

      // 45-degree corner wedges: (x-1)+(y-1)>=1, (x-1)+(15-y)>=1, (27-x)+(y-1)>=1, (27-x)+(15-y)>=1
      const invS2 = Math.SQRT1_2;
      const wedges = [
        [1, 1, invS2, invS2],
        [1, HEIGHT - 1, invS2, -invS2],
        [WIDTH - 1, 1, -invS2, invS2],
        [WIDTH - 1, HEIGHT - 1, -invS2, -invS2]
      ];
      for (const [wx, wy, nx, ny] of wedges) {
        const distPlane = (disc.x - wx) * nx + (disc.y - wy) * ny - invS2;
        if (distPlane < disc.r) {
          const push = disc.r - distPlane;
          disc.x += nx * push;
          disc.y += ny * push;
          if (reflectWall(disc, nx, ny, mult)) events.push({ type: 'bank', bounces: disc.bounces, x: disc.x, y: disc.y });
        }
      }

      // Mid-court pillars
      for (const pil of court.pillars) {
        const dx = disc.x - pil.x, dy = disc.y - pil.y, d = Math.hypot(dx, dy);
        if (d < pil.r + disc.r && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          disc.x = pil.x + nx * (pil.r + disc.r + 0.02);
          disc.y = pil.y + ny * (pil.r + disc.r + 0.02);
          if (reflectWall(disc, nx, ny, mult)) events.push({ type: 'bank', bounces: disc.bounces, x: disc.x, y: disc.y });
        }
      }

      // Rotating diagonal prisms (normals cycle 45 deg: 0='/', 1='-', 2='\', 3='|')
      for (const pr of state.prisms) {
        const dx = disc.x - pr.x, dy = disc.y - pr.y, d = Math.hypot(dx, dy);
        if (d < pr.r + disc.r && d > 0.001 && disc.prismCd <= 0) {
          const radX = dx / d, radY = dy / d;
          const a = pr.angle * (Math.PI / 4);
          let nx = -Math.sin(a), ny = Math.cos(a);
          if (nx * disc.vx + ny * disc.vy > 0) { nx = -nx; ny = -ny; }
          disc.x = pr.x + radX * (pr.r + disc.r + 0.04);
          disc.y = pr.y + radY * (pr.r + disc.r + 0.04);
          if (reflectWall(disc, nx, ny, mult)) {
            pr.angle = (pr.angle + 1) % 4;
            disc.prismCd = 0.07;
            events.push({ type: 'prism', bounces: disc.bounces, x: pr.x, y: pr.y });
          }
        }
      }

      if (disc.bounces > state.stats.bestRallyBounces) state.stats.bestRallyBounces = disc.bounces;

      // Player & Rival catch checks
      for (const p of state.players) {
        if (p.throwLock > 0 || p.stunTimer > 0) continue;
        const pSpec = ARCHETYPES[p.kind];
        const reach = pSpec.catchR + (p.dashTimer > 0 ? 0.45 : 0);
        if (Math.hypot(disc.x - p.x, disc.y - p.y) <= reach + disc.r) {
          if (disc.parried && disc.bounces === 0 && disc.owner !== p.side && p.dashTimer <= 0 && p.parryPrime <= 0 && !pSpec.heavyDash) {
            // Normal un-dashed catch against a parried rocket still catches cleanly if not critical, or grabs with stun; keep catching reliable!
          }
          state.holder = p.side;
          p.holdTimer = 0;
          p.charging = false;
          p.chargeTimer = 0;
          p.dashTimer = 0;
          p.justCaught = p.parryPrime > 0 ? pSpec.parryWindow : pSpec.parryWindow;
          const parriedOnArrival = p.parryPrime > 0;
          events.push({ type: 'catch', side: p.side, bounces: disc.bounces, x: p.x, y: p.y });
          if (parriedOnArrival) {
            launchDisc(state, p, { charge: 0.8, spin: 0, parried: true, events });
          } else {
            disc.vx = 0;
            disc.vy = 0;
            disc.spin = 0;
            disc.x = p.x + (p.side === 0 ? 0.85 : -0.85);
            disc.y = p.y;
          }
          return;
        }
      }

      // Endzone shields & goals
      if (disc.x - disc.r <= 1.0 && disc.vx < 0) {
        if (handleEndzoneHit(state, 0, events)) return;
      } else if (disc.x + disc.r >= WIDTH - 1.0 && disc.vx > 0) {
        if (handleEndzoneHit(state, 1, events)) return;
      }
    }

    // Gentle friction only on very slow fumbles; otherwise keep rally momentum brisk.
    if (disc.fumble && disc.speed > 0.1) {
      disc.vx *= 0.96;
      disc.vy *= 0.96;
    } else if (Math.abs(disc.vx) < 4.5 && state.holder < 0) {
      // Prevent vertical infinite wall bounces at near-zero horizontal speed.
      const nudge = disc.x < NET_X ? 1 : -1;
      disc.vx += nudge * 12 * STEP;
    }
  }

  function step(state, input = {}) {
    const events = [];
    if (state.status !== 'play') return events;
    state.tick++;
    state.time = state.tick * STEP;
    if (state.matchPause > 0) state.matchPause = Math.max(0, state.matchPause - STEP);
    if (state.rallyCooldown > 0) {
      state.rallyCooldown = Math.max(0, state.rallyCooldown - STEP);
    }

    const p0 = state.players[0], p1 = state.players[1];
    const p0Input = input.auto ? aiInput({ ...state, difficulty: 'normal' }, p0) : input;
    const p1Input = aiInput(state, p1);
    stepPlayerControl(state, p0, p0Input, events);
    stepPlayerControl(state, p1, p1Input, events);
    stepDisc(state, events);
    return events;
  }

  function objective(state) {
    if (state.status === 'won') return 'Tournament champion! All four courts conquered.';
    if (state.status === 'lost') return 'Match lost. Press New run for a rematch.';
    const court = COURTS[state.courtIndex];
    const rival = ARCHETYPES[state.players[1].kind];
    if (state.holder === 0) {
      return state.players[0].charging ? 'Release to fire! Move up/down to aim or curve.' : 'You have the disc! Hold Throw to charge, or Spin to curve around ' + rival.name + '.';
    }
    const open = state.shields[1].filter(s => s === 0).length;
    if (open > 0) return `${court.name}: ${open} rival shield${open > 1 ? 's' : ''} down — aim for the open gap!`;
    return `${court.name} vs ${rival.name}: bank off walls to shatter shields, then score.`;
  }

  function score(state) {
    const courtBonus = state.courtIndex * 1000 + (state.status === 'won' ? 2500 : 0);
    const timeBonus = state.status === 'won' ? Math.max(0, Math.round((720 - (state.endTime || state.time)) * 4)) : 0;
    const s = state.stats;
    return Math.max(0, Math.round(courtBonus + timeBonus + s.goals * 150 + s.bullseyes * 120 + s.shieldsBroken * 40 + s.parries * 80 + s.bankGoals * 100 - s.setsLost * 100));
  }

  function save(state) {
    return JSON.stringify(state);
  }

  function restore(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(text));
    const ok = data && data.version === 1 && typeof data.seed === 'string' && ARCHETYPES[data.archetype] && DIFFICULTIES[data.difficulty] &&
      Array.isArray(data.players) && data.players.length === 2 && data.disc && Array.isArray(data.shields) && Number.isSafeInteger(data.tick);
    if (!ok) throw new Error('Saved match is not a Ricochet tournament.');
    return data;
  }

  function aimVector(state, side = 0) {
    const p = state.players[side];
    const dirSign = side === 0 ? 1 : -1;
    let ax = Number.isFinite(p.aimX) && p.aimX * dirSign > 0.1 ? p.aimX : dirSign;
    let ay = Number.isFinite(p.aimY) ? p.aimY : 0;
    const len = Math.hypot(ax, ay) || 1;
    ax /= len;
    ay /= len;
    if (ax * dirSign < 0.32) {
      ax = dirSign * 0.32;
      ay = (Math.sign(ay) || 1) * Math.sqrt(1 - 0.32 * 0.32);
    }
    return { x: ax, y: ay };
  }

  global.Ricochet = {
    WIDTH, HEIGHT, STEP, NET_X, DISC_R, MAX_BOUNCES, MAX_SPEED, POINTS_TO_WIN_SET, SETS_TO_WIN_MATCH,
    COURTS, ARCHETYPES, ARCHETYPE_KEYS, DIFFICULTIES,
    newGame, step, courtTileAt, aimVector, objective, score, save, restore
  };
})(typeof window !== 'undefined' ? window : globalThis);

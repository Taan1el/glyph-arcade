/* Joyride rules: a seeded 160x160 driving town with four districts, traffic lights,
 * cars with grip and drift, pedestrians, police heat, 12 payphone jobs and an armoured-van finale. */
(function (global) {
  'use strict';

  const WIDTH = 160, HEIGHT = 160, STEP = 1 / 60, DAY_LENGTH = 240, NIGHT_START = 0.58;
  const MAX_TRAFFIC = 34, MAX_PEDS = 42, RESPRAY_COST = 500;

  const T = {
    WATER: 0, GRASS: 1, PAVEMENT: 2, PLAZA: 3, ROAD: 4, AVENUE: 5, INTERSECTION: 6, BRIDGE: 7,
    BUILDING: 8, CONTAINER: 9, CRANE: 10, RAMP: 11, PAYPHONE: 12, RESPRAY: 13, GARAGE: 14,
    HOSPITAL: 15, POLICE: 16, FREIGHTER: 17
  };
  const SOLID = new Set([T.BUILDING, T.CONTAINER, T.CRANE]);
  const ROAD_TILES = new Set([T.ROAD, T.AVENUE, T.INTERSECTION, T.BRIDGE, T.RAMP, T.RESPRAY, T.GARAGE, T.FREIGHTER]);

  const DIST = { HEIGHTS: 0, STRIP: 1, OLD_TOWN: 2, DOCKS: 3 };
  const DISTRICTS = [
    { id: 'heights', code: 0, name: 'Heights' },
    { id: 'strip', code: 1, name: 'The Strip' },
    { id: 'old_town', code: 2, name: 'Old Town' },
    { id: 'docks', code: 3, name: 'Docks' }
  ];

  const CARS = {
    compact:  { name: 'Compact',        speed: 19, accel: 26, brake: 30, turn: 3.5, grip: 8.5, driftGrip: 2.3, mass: 0.85, tough: 0.85, w: 1.5, h: 1.5, glyph: 'C', colour: 'c' },
    sedan:    { name: 'Sedan',          speed: 22, accel: 24, brake: 28, turn: 3.0, grip: 7.5, driftGrip: 2.0, mass: 1.0,  tough: 1.0,  w: 1.6, h: 1.6, glyph: 'S', colour: 'w' },
    van:      { name: 'Van',            speed: 17, accel: 19, brake: 25, turn: 2.5, grip: 7.0, driftGrip: 1.8, mass: 1.45, tough: 1.45, w: 1.7, h: 1.7, glyph: 'V', colour: 'm' },
    sports:   { name: 'Sports',         speed: 28, accel: 34, brake: 32, turn: 3.3, grip: 5.8, driftGrip: 1.5, mass: 0.95, tough: 0.9,  w: 1.6, h: 1.6, glyph: 'Z', colour: 'r' },
    taxi:     { name: 'Taxi',           speed: 23, accel: 26, brake: 29, turn: 3.1, grip: 7.6, driftGrip: 2.0, mass: 1.0,  tough: 1.05, w: 1.6, h: 1.6, glyph: 'T', colour: 'y' },
    cruiser:  { name: 'Police Cruiser', speed: 26, accel: 31, brake: 31, turn: 3.2, grip: 7.8, driftGrip: 2.1, mass: 1.15, tough: 1.2,  w: 1.6, h: 1.6, glyph: 'P', colour: 'b', police: true },
    armoured: { name: 'Armoured Van',   speed: 20, accel: 23, brake: 28, turn: 2.6, grip: 7.4, driftGrip: 1.9, mass: 2.1,  tough: 2.4,  w: 1.8, h: 1.8, glyph: 'A', colour: 'G', heavy: true }
  };
  const TRAFFIC_KINDS = ['compact', 'sedan', 'sedan', 'van', 'sports', 'taxi'];

  const CONTACTS = [
    { id: 'sal', name: 'Sal at the Docks', district: DIST.OLD_TOWN },
    { id: 'vee', name: 'Vee on The Strip', district: DIST.STRIP },
    { id: 'bishop', name: 'Bishop in Heights', district: DIST.HEIGHTS }
  ];

  const JOBS = [
    // Contact 0: Sal (Old Town / Docks)
    { id: 'sal_1', contact: 0, type: 'delivery', title: 'Warm Wheels', carKind: 'compact', minHp: 65, payout: 400,
      brief: 'Pick up the parked Compact and bring it to Sal\'s lockup in at least 65% shape.' },
    { id: 'sal_2', contact: 0, type: 'checkpoints', title: 'Alley Dash', count: 4, timeLimit: 75, payout: 550,
      brief: 'Hit all 4 Old Town markers before the clock runs dry.' },
    { id: 'sal_3', contact: 0, type: 'wreck', title: 'Scrap Quota', count: 2, payout: 700,
      brief: 'Ram and wreck 2 rival vans patrolling the district.' },
    { id: 'sal_4', contact: 0, type: 'getaway', title: 'Brickwork Break', stars: 3, payout: 900,
      brief: 'Collect the crew at the plaza, shake 3 stars of heat, and drop them at the safe house.' },
    // Contact 1: Vee (The Strip)
    { id: 'vee_1', contact: 1, type: 'pickup', title: 'Neon Courier', count: 4, timeLimit: 85, payout: 800,
      brief: 'Scoop up 4 drop parcels across The Strip before time runs out.' },
    { id: 'vee_2', contact: 1, type: 'tail', title: 'Quiet Shadow', duration: 16, minDist: 5, maxDist: 28, payout: 950,
      brief: 'Tail the mark\'s Sedan across town without getting too close or losing sight.' },
    { id: 'vee_3', contact: 1, type: 'delivery', title: 'Velvet Valet', carKind: 'sports', minHp: 75, payout: 1100,
      brief: 'Deliver the prized Sports coupe to the casino bay with at least 75% health.' },
    { id: 'vee_4', contact: 1, type: 'checkpoints', title: 'Midnight Circuit', count: 5, timeLimit: 85, payout: 1300,
      brief: 'Blast through 5 checkpoints across The Strip and Heights.' },
    // Contact 2: Bishop (Heights)
    { id: 'bishop_1', contact: 2, type: 'wreck', title: 'Clean Sweep', count: 3, payout: 1400,
      brief: 'Track down and wreck 3 rival couriers.' },
    { id: 'bishop_2', contact: 2, type: 'tail', title: 'Bridge Watch', duration: 18, minDist: 5, maxDist: 28, payout: 1600,
      brief: 'Follow the inspector\'s car until they reach their meeting spot.' },
    { id: 'bishop_3', contact: 2, type: 'pickup', title: 'Parkland Drop', count: 5, timeLimit: 95, payout: 1850,
      brief: 'Collect 5 briefcases around Heights before the deadline.' },
    { id: 'bishop_4', contact: 2, type: 'getaway', title: 'High Road Out', stars: 3, payout: 2200,
      brief: 'Pick up Bishop\'s team, lose 3 stars of police heat, and reach the hideout.' },
    // Finale (13th job)
    { id: 'finale', contact: 2, type: 'finale', title: 'The Freighter Heist', stars: 5, payout: 5000,
      brief: 'Steal the Armoured Van, survive 5 stars of heat, and drive it onto the Docks freighter.' }
  ];

  const DIFFICULTIES = {
    easy:   { label: 'Easy',   damage: 0.65, heatCool: 1.35, policeAggro: 0.75, timeBonus: 1.3 },
    normal: { label: 'Normal', damage: 1.0,  heatCool: 1.0,  policeAggro: 1.0,  timeBonus: 1.0 },
    hard:   { label: 'Hard',   damage: 1.35, heatCool: 0.78, policeAggro: 1.25, timeBonus: 0.85 }
  };

  const index = (x, y) => y * WIDTH + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function random(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const noiseHash = (seed, x, y) => {
    let h = Math.imul(x * 73856093 ^ y * 19349663 ^ seed, 16777619);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // --- Town generation
  function districtAt(state, x, y) {
    if (!inBounds(x, y)) return DIST.DOCKS;
    return state.districts ? state.districts[index(x, y)] : (y < 80 ? (x < 80 ? DIST.HEIGHTS : DIST.STRIP) : (x < 80 ? DIST.OLD_TOWN : DIST.DOCKS));
  }
  const tileAt = (state, x, y) => inBounds(x, y) ? state.tiles[index(x, y)] : T.WATER;
  const solidAt = (state, x, y) => !inBounds(x, y) || SOLID.has(state.tiles[index(x, y)]);
  const roadAt = (state, x, y) => inBounds(x, y) && ROAD_TILES.has(state.tiles[index(x, y)]);

  function generateTown(state) {
    const seed = hashString(state.seed + '|town'), gen = { rng: seed };
    const tiles = new Uint8Array(WIDTH * HEIGHT);
    const districts = new Uint8Array(WIDTH * HEIGHT);
    const roofStyle = new Uint8Array(WIDTH * HEIGHT);

    // Irregular grid lines: 7 vertical & 7 horizontal roads (avenues at indices 1, 3, 5)
    const baseX = [14, 36, 58, 80, 102, 124, 144];
    const baseY = [14, 36, 58, 80, 102, 124, 144];
    const vRoads = baseX.map((bx, i) => {
      const jit = i === 0 || i === 6 ? 0 : Math.floor((random(gen) - 0.5) * 5);
      const x = bx + jit, avenue = i === 1 || i === 3 || i === 5;
      return { x, w: avenue ? 4 : 2, avenue, idx: i };
    });
    const hRoads = baseY.map((by, i) => {
      const jit = i === 0 || i === 6 ? 0 : Math.floor((random(gen) - 0.5) * 5);
      const y = by + jit, avenue = i === 1 || i === 3 || i === 5;
      return { y, w: avenue ? 4 : 2, avenue, idx: i };
    });

    const splitX = vRoads[3].x + 2, splitY = hRoads[3].y + 2;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const i = index(x, y);
      districts[i] = y < splitY ? (x < splitX ? DIST.HEIGHTS : DIST.STRIP) : (x < splitX ? DIST.OLD_TOWN : DIST.DOCKS);
      // Outer harbour rim is water
      if (x < 6 || y < 6 || x >= WIDTH - 6 || y >= HEIGHT - 6) {
        tiles[i] = T.WATER;
      } else {
        tiles[i] = T.PAVEMENT;
      }
    }

    // Channel in Heights (between vRoads[1] and vRoads[2], spanned by bridges on hRoads)
    const chanX0 = vRoads[1].x + 7, chanX1 = vRoads[2].x - 4;
    for (let y = 6; y < splitY - 4; y++) for (let x = chanX0; x <= chanX1; x++) {
      tiles[index(x, y)] = T.WATER;
    }
    // Harbour basin in SE Docks (south of hRoads[6] or east of vRoads[6])
    for (let y = hRoads[5].y + 8; y < HEIGHT - 6; y++) for (let x = vRoads[5].x + 8; x < WIDTH - 6; x++) {
      if (x > vRoads[6].x + 4 || y > hRoads[6].y + 4) tiles[index(x, y)] = T.WATER;
    }

    // Fill city blocks between roads
    for (let gy = 0; gy < hRoads.length - 1; gy++) {
      for (let gx = 0; gx < vRoads.length - 1; gx++) {
        const x0 = vRoads[gx].x + vRoads[gx].w + 1;
        const x1 = vRoads[gx + 1].x - 2;
        const y0 = hRoads[gy].y + hRoads[gy].w + 1;
        const y1 = hRoads[gy + 1].y - 2;
        if (x1 <= x0 + 2 || y1 <= y0 + 2) continue;
        const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
        const dist = districts[index(cx, cy)];
        const roll = random(gen);

        if (tiles[index(cx, cy)] === T.WATER) continue;

        if (dist === DIST.HEIGHTS && (roll < 0.38 || (gx === 0 && gy === 1))) {
          // Green park block
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (tiles[index(x, y)] !== T.WATER) tiles[index(x, y)] = T.GRASS;
          }
          continue;
        }
        if (dist === DIST.OLD_TOWN && roll < 0.28) {
          // Cobble plaza block
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            tiles[index(x, y)] = T.PLAZA;
          }
          continue;
        }
        if (dist === DIST.DOCKS && roll < 0.55) {
          // Container stacks and cranes with driveable yard lanes
          for (let y = y0 + 1; y <= y1 - 1; y += 3) {
            for (let x = x0 + 1; x <= x1 - 1; x++) {
              if ((x - x0) % 5 === 3) continue;
              tiles[index(x, y)] = (x + y) % 9 === 0 ? T.CRANE : T.CONTAINER;
              roofStyle[index(x, y)] = (x + y) % 3 + 1;
            }
          }
          continue;
        }

        // Standard building block, optionally split by an alley in Old Town or Strip
        const splitV = (dist === DIST.OLD_TOWN || dist === DIST.STRIP) && (x1 - x0 > 10) && random(gen) < 0.65;
        const splitH = (dist === DIST.OLD_TOWN) && (y1 - y0 > 10) && random(gen) < 0.5;
        const alleyX = Math.floor((x0 + x1) / 2), alleyY = Math.floor((y0 + y1) / 2);
        const style = 1 + Math.floor(random(gen) * 3);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (tiles[index(x, y)] === T.WATER) continue;
          if (splitV && Math.abs(x - alleyX) <= 0) { tiles[index(x, y)] = T.PAVEMENT; continue; }
          if (splitH && Math.abs(y - alleyY) <= 0) { tiles[index(x, y)] = T.PAVEMENT; continue; }
          tiles[index(x, y)] = T.BUILDING;
          roofStyle[index(x, y)] = style;
        }
      }
    }

    // Carve horizontal and vertical roads (and pavements along their edges)
    for (const hr of hRoads) {
      for (let x = vRoads[0].x - 1; x <= vRoads[vRoads.length - 1].x + vRoads[vRoads.length - 1].w; x++) {
        for (let dy = -1; dy <= hr.w; dy++) {
          const y = hr.y + dy;
          if (!inBounds(x, y)) continue;
          const i = index(x, y), wasWater = tiles[i] === T.WATER;
          if (dy === -1 || dy === hr.w) {
            if (!wasWater && !ROAD_TILES.has(tiles[i])) tiles[i] = T.PAVEMENT;
          } else {
            tiles[i] = wasWater ? T.BRIDGE : (hr.avenue ? T.AVENUE : T.ROAD);
          }
        }
      }
    }
    for (const vr of vRoads) {
      for (let y = hRoads[0].y - 1; y <= hRoads[hRoads.length - 1].y + hRoads[hRoads.length - 1].w; y++) {
        for (let dx = -1; dx <= vr.w; dx++) {
          const x = vr.x + dx;
          if (!inBounds(x, y)) continue;
          const i = index(x, y), wasWater = tiles[i] === T.WATER;
          if (dx === -1 || dx === vr.w) {
            if (!wasWater && !ROAD_TILES.has(tiles[i])) tiles[i] = T.PAVEMENT;
          } else {
            tiles[i] = wasWater ? T.BRIDGE : (vr.avenue ? T.AVENUE : T.ROAD);
          }
        }
      }
    }

    // Mark intersections and build the intersection graph
    const intersections = [];
    const nodeGrid = [];
    for (let gy = 0; gy < hRoads.length; gy++) {
      nodeGrid[gy] = [];
      for (let gx = 0; gx < vRoads.length; gx++) {
        const vr = vRoads[gx], hr = hRoads[gy];
        for (let dy = 0; dy < hr.w; dy++) for (let dx = 0; dx < vr.w; dx++) {
          tiles[index(vr.x + dx, hr.y + dy)] = T.INTERSECTION;
        }
        const id = intersections.length;
        const node = {
          id, gx, gy,
          x: vr.x + vr.w / 2,
          y: hr.y + hr.w / 2,
          rx: vr.x, ry: hr.y, rw: vr.w, rh: hr.w,
          phase: ((gx * 3 + gy * 5) % 12),
          edges: []
        };
        intersections.push(node);
        nodeGrid[gy][gx] = node;
      }
    }
    for (let gy = 0; gy < hRoads.length; gy++) {
      for (let gx = 0; gx < vRoads.length; gx++) {
        const n = nodeGrid[gy][gx];
        if (gx > 0) n.edges.push({ to: nodeGrid[gy][gx - 1].id, dir: 'W', dist: n.x - nodeGrid[gy][gx - 1].x });
        if (gx < vRoads.length - 1) n.edges.push({ to: nodeGrid[gy][gx + 1].id, dir: 'E', dist: nodeGrid[gy][gx + 1].x - n.x });
        if (gy > 0) n.edges.push({ to: nodeGrid[gy - 1][gx].id, dir: 'N', dist: n.y - nodeGrid[gy - 1][gx].y });
        if (gy < hRoads.length - 1) n.edges.push({ to: nodeGrid[gy + 1][gx].id, dir: 'S', dist: nodeGrid[gy + 1][gx].y - n.y });
      }
    }

    // Place special landmarks beside intersections so they are 100% road-connected
    const placeBeside = (gx, gy, tile, offsetX, offsetY) => {
      const n = nodeGrid[gy][gx];
      const tx = Math.floor(n.x + offsetX), ty = Math.floor(n.y + offsetY);
      // Clear the full rectangle between the intersection and the landmark so nothing blocks entry
      const minX = Math.min(n.rx, tx - 1), maxX = Math.max(n.rx + n.rw - 1, tx + 1);
      const minY = Math.min(n.ry, ty - 1), maxY = Math.max(n.ry + n.rh - 1, ty + 1);
      for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
        if (inBounds(cx, cy) && SOLID.has(tiles[index(cx, cy)])) tiles[index(cx, cy)] = T.PAVEMENT;
      }
      tiles[index(tx, ty)] = tile;
      return { x: tx + 0.5, y: ty + 0.5, tx, ty, nodeId: n.id };
    };

    const hospital = placeBeside(2, 1, T.HOSPITAL, 3, -3);
    const policeStation = placeBeside(4, 3, T.POLICE, 3, -3);
    const respray = placeBeside(3, 3, T.RESPRAY, -3, 3);
    const garage = placeBeside(2, 4, T.GARAGE, -3, -3);
    const freighter = placeBeside(6, 6, T.FREIGHTER, 1, 1);

    // 3 Payphones (one per contact: Old Town, The Strip, Heights)
    const payphones = [
      { ...placeBeside(1, 5, T.PAYPHONE, 2, -2), contact: 0, name: CONTACTS[0].name },
      { ...placeBeside(5, 1, T.PAYPHONE, -2, 2), contact: 1, name: CONTACTS[1].name },
      { ...placeBeside(1, 1, T.PAYPHONE, 2, 2), contact: 2, name: CONTACTS[2].name }
    ];

    // 5 Stunt ramps on straight road stretches
    const rampCoords = [
      [Math.floor((vRoads[1].x + vRoads[2].x) / 2), hRoads[1].y + 1, 0],
      [vRoads[5].x + 1, Math.floor((hRoads[1].y + hRoads[2].y) / 2), 1],
      [Math.floor((vRoads[2].x + vRoads[3].x) / 2), hRoads[5].y + 1, 2],
      [vRoads[1].x + 1, Math.floor((hRoads[3].y + hRoads[4].y) / 2), 3],
      [Math.floor((vRoads[4].x + vRoads[5].x) / 2), hRoads[4].y + 1, 4]
    ];
    const ramps = rampCoords.map(([rx, ry, id]) => {
      tiles[index(rx, ry)] = T.RAMP;
      return { id, x: rx + 0.5, y: ry + 0.5, tx: rx, ty: ry, jumped: false };
    });

    // 10 Hidden packages on reachable pavements/parks/plazas
    const packageNodes = [
      [0, 0], [3, 0], [6, 0], [0, 3], [6, 2],
      [2, 2], [4, 2], [0, 6], [3, 5], [5, 5]
    ];
    const packages = packageNodes.map(([gx, gy], id) => {
      const n = nodeGrid[gy][gx];
      const px = Math.floor(n.x - 2.5), py = Math.floor(n.y - 2.5);
      if (SOLID.has(tiles[index(px, py)]) || tiles[index(px, py)] === T.WATER) tiles[index(px, py)] = T.PAVEMENT;
      return { id, x: px + 0.5, y: py + 0.5, collected: false };
    });

    Object.assign(state, {
      tiles, districts, roofStyle, vRoads, hRoads, intersections,
      hospital, policeStation, respray, garage, freighter,
      payphones, ramps, packages
    });
  }

  // Light state at an intersection: 'NS' green, 'NS_Y' yellow, 'EW' green, 'EW_Y' yellow
  function lightState(state, inter) {
    const cycle = (state.time * 0.8 + inter.phase) % 16;
    if (cycle < 6.5) return 'NS';
    if (cycle < 8.0) return 'NS_Y';
    if (cycle < 14.5) return 'EW';
    return 'EW_Y';
  }
  function isRedForHeading(state, inter, angle) {
    const light = lightState(state, inter);
    const ew = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
    if (ew) return light === 'NS' || light === 'NS_Y';
    return light === 'EW' || light === 'EW_Y';
  }

  function daylight(state) {
    const c = state.clock;
    if (c < 0.06) return 0.28 + (c / 0.06) * 0.72;
    if (c < NIGHT_START - 0.06) return 1;
    if (c < NIGHT_START + 0.04) return 1 - ((c - (NIGHT_START - 0.06)) / 0.1) * 0.78;
    if (c < 0.94) return 0.22;
    return 0.22 + ((c - 0.94) / 0.06) * 0.06;
  }
  const isNight = state => state.clock >= NIGHT_START;

  // --- Shortest path on intersection graph
  function nearestNode(state, x, y) {
    let best = state.intersections[0], bestDist = Infinity;
    for (const n of state.intersections) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
  }
  function findRoadPath(state, fromX, fromY, toX, toY) {
    const start = nearestNode(state, fromX, fromY), goal = nearestNode(state, toX, toY);
    if (start.id === goal.id) return [{ x: toX, y: toY }];
    if (!state._pathCache) state._pathCache = new Map();
    const key = (start.id << 8) | goal.id;
    const hit = state._pathCache.get(key);
    if (hit) {
      const out = hit.slice();
      out.push({ x: toX, y: toY });
      return out;
    }
    const dist = new Float64Array(state.intersections.length).fill(Infinity);
    const prev = new Int32Array(state.intersections.length).fill(-1);
    const used = new Uint8Array(state.intersections.length);
    dist[start.id] = 0;

    for (let step = 0; step < state.intersections.length; step++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < dist.length; i++) if (!used[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1 || u === goal.id) break;
      used[u] = 1;
      for (const edge of state.intersections[u].edges) {
        const alt = dist[u] + edge.dist;
        if (alt < dist[edge.to]) { dist[edge.to] = alt; prev[edge.to] = u; }
      }
    }
    const out = [];
    for (let at = goal.id; at !== -1; at = prev[at]) {
      const n = state.intersections[at];
      out.push({ x: n.x, y: n.y, nodeId: n.id });
    }
    out.reverse();
    state._pathCache.set(key, out.slice());
    out.push({ x: toX, y: toY });
    return out;
  }

  // --- Entities creation
  function makeCar(state, kind, x, y, angle = 0, extra = {}) {
    const spec = CARS[kind] || CARS.sedan;
    return {
      id: state.nextId++,
      kind, x, y, vx: 0, vy: 0, angle, speed: 0,
      hp: 100, maxHp: 100,
      occupied: false, driver: null,
      fireTimer: 0, wrecked: false, jumpTimer: 0, flash: 0, honkTimer: 0,
      w: spec.w, h: spec.h,
      ...extra
    };
  }

  function spawnInitialTownEntities(state) {
    // Park a couple of starter cars near player spawn (near contact 0 in Old Town)
    const p0 = state.payphones[0];
    const n0 = state.intersections[p0.nodeId];
    state.cars.push(makeCar(state, 'compact', n0.x - 3.5, n0.y + 0.5, 0, { parked: true }));
    state.cars.push(makeCar(state, 'sedan', n0.x + 4.5, n0.y - 0.5, Math.PI, { parked: true }));
    state.cars.push(makeCar(state, 'taxi', state.intersections[17].x + 3.5, state.intersections[17].y + 0.5, 0, { parked: true }));
    state.cars.push(makeCar(state, 'sports', state.intersections[12].x, state.intersections[12].y + 4, Math.PI / 2, { parked: true }));

    // Seed initial traffic and pedestrians
    for (let i = 0; i < 16; i++) spawnTrafficCar(state, true);
    for (let i = 0; i < 24; i++) spawnPedestrian(state, true);
  }

  function newGame(seed, difficulty = 'normal') {
    seed = String(seed || 'joyride').slice(0, 40);
    if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
    const state = {
      version: 1, seed, difficulty,
      rng: hashString(seed + '|run'),
      time: 0, clock: 0.22, day: 1, tick: 0, nextId: 1,
      rain: false, rainTimer: 45,
      player: {
        x: 0, y: 0, vx: 0, vy: 0, angle: 0,
        w: 0.8, h: 0.8, hp: 100, maxHp: 100,
        carId: null, hurtTimer: 0, anim: 0
      },
      cash: 250,
      heat: 0, heatTimer: 0, unseenTimer: 0,
      searchCircle: null,
      bustedCount: 0, wastedCount: 0, wrecksCount: 0,
      jobsDone: 0, unlockedJobs: [0, 4, 8], completedJobs: [],
      activeJob: null, taxiFare: null,
      storedCars: [],
      cars: [], peds: [], roadblocks: [], spikes: [], marks: [], explosions: [],
      won: false, endTime: 0
    };
    generateTown(state);
    const startPhone = state.payphones[0];
    state.player.x = startPhone.x + 1.5;
    state.player.y = startPhone.y + 1.2;
    spawnInitialTownEntities(state);
    return state;
  }

  // --- Queries & helpers
  function playerCar(state) {
    if (!state.player.carId) return null;
    return state.cars.find(c => c.id === state.player.carId) || null;
  }
  function playerPos(state) {
    const car = playerCar(state);
    return car ? { x: car.x, y: car.y } : { x: state.player.x, y: state.player.y };
  }
  function boxHitsSolid(state, x, y, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(state, tx, ty)) return true;
    }
    return false;
  }
  function hasLineOfSight(state, x0, y0, x1, y1, maxDist = 28) {
    const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
    if (dist > maxDist) return false;
    const steps = Math.ceil(dist * 1.5);
    for (let i = 1; i < steps; i++) {
      const tx = Math.floor(x0 + (dx * i) / steps), ty = Math.floor(y0 + (dy * i) / steps);
      if (solidAt(state, tx, ty)) return false;
    }
    return true;
  }

  // --- Heat & Crime
  function canPoliceSeePlayer(state) {
    const pos = playerPos(state);
    for (const c of state.cars) {
      if (!c.wrecked && c.driver === 'police' && hasLineOfSight(state, c.x, c.y, pos.x, pos.y, 26)) return true;
    }
    return false;
  }
  function witnessNear(state, x, y) {
    if (canPoliceSeePlayer(state)) return true;
    for (const ped of state.peds) {
      if (ped.downTimer <= 0 && Math.hypot(ped.x - x, ped.y - y) < 15) return true;
    }
    return false;
  }
  function addHeat(state, amount, reason, events, minStars = 0) {
    const before = state.heat;
    state.heat = clamp(Math.max(state.heat + amount, minStars), 0, 5);
    if (state.heat > 0) {
      const pos = playerPos(state);
      state.unseenTimer = 0;
      state.searchCircle = { x: pos.x, y: pos.y, r: 22 + state.heat * 5 };
    }
    if (state.heat !== before) {
      events.push({ type: 'heat', stars: state.heat, reason });
      ensurePoliceUnits(state);
    }
  }
  function setHeat(state, stars, reason, events) {
    state.heat = clamp(stars, 0, 5);
    const pos = playerPos(state);
    state.unseenTimer = 0;
    state.searchCircle = state.heat > 0 ? { x: pos.x, y: pos.y, r: 22 + state.heat * 5 } : null;
    events.push({ type: 'heat', stars: state.heat, reason });
    if (state.heat > 0) ensurePoliceUnits(state);
  }

  function ensurePoliceUnits(state) {
    if (state.heat <= 0) return;
    const pos = playerPos(state);
    const wantedUnits = state.heat === 1 ? 1 : state.heat <= 3 ? 2 : 3;
    const current = state.cars.filter(c => !c.wrecked && c.driver === 'police').length;
    for (let i = current; i < wantedUnits; i++) {
      const angle = random(state) * Math.PI * 2;
      const dist = 24 + random(state) * 10;
      const node = nearestNode(state, pos.x + Math.cos(angle) * dist, pos.y + Math.sin(angle) * dist);
      if (Math.hypot(node.x - pos.x, node.y - pos.y) < 12) continue;
      const kind = state.heat >= 5 && i === wantedUnits - 1 ? 'armoured' : 'cruiser';
      const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const h = headings[Math.floor(random(state) * 4)];
      state.cars.push(makeCar(state, kind, node.x, node.y, h, { driver: 'police', occupied: true }));
    }
    // 4+ stars: place a roadblock at an intersection ahead of the player
    if (state.heat >= 4 && state.roadblocks.length < 2) {
      const car = playerCar(state);
      const heading = car ? car.angle : state.player.angle;
      const ahead = nearestNode(state, pos.x + Math.cos(heading) * 24, pos.y + Math.sin(heading) * 24);
      if (Math.hypot(ahead.x - pos.x, ahead.y - pos.y) > 12) {
        state.roadblocks.push({ x: ahead.x, y: ahead.y, nodeId: ahead.id });
        const blocker = makeCar(state, 'cruiser', ahead.x, ahead.y, heading + Math.PI / 2, { driver: 'police', occupied: true, roadblock: true });
        state.cars.push(blocker);
        if (state.heat >= 5 && state.spikes.length < 2) {
          state.spikes.push({ x: ahead.x + Math.cos(heading + Math.PI / 2) * 1.6, y: ahead.y + Math.sin(heading + Math.PI / 2) * 1.6, r: 1.8 });
        }
      }
    }
  }

  function stepHeat(state, dt, events) {
    if (state.heat <= 0) {
      state.searchCircle = null;
      state.unseenTimer = 0;
      return;
    }
    const pos = playerPos(state);
    const seen = canPoliceSeePlayer(state);
    const inCircle = state.searchCircle && Math.hypot(pos.x - state.searchCircle.x, pos.y - state.searchCircle.y) <= state.searchCircle.r;
    if (seen) {
      state.unseenTimer = 0;
      state.searchCircle = { x: pos.x, y: pos.y, r: 22 + state.heat * 5 };
      ensurePoliceUnits(state);
    } else {
      const rate = (inCircle ? 0.45 : 1.15) * DIFFICULTIES[state.difficulty].heatCool;
      state.unseenTimer += dt * rate;
      const dropTime = 6.5;
      if (state.unseenTimer >= dropTime) {
        state.unseenTimer = 0;
        state.heat = Math.max(0, state.heat - 1);
        events.push({ type: 'heatCool', stars: state.heat });
        if (state.heat === 0) {
          state.searchCircle = null;
          state.roadblocks = [];
          state.spikes = [];
          for (const c of state.cars) if (c.driver === 'police') c.driver = 'traffic';
        } else {
          state.searchCircle.r = 22 + state.heat * 5;
        }
      }
    }
  }

  // --- Fail states: Wasted & Busted
  function failActiveJob(state, reason, events) {
    if (!state.activeJob) return;
    const job = state.activeJob;
    if (job.targetCarId) {
      state.cars = state.cars.filter(c => c.id !== job.targetCarId || c.id === state.player.carId);
    }
    if (job.rivalIds) {
      state.cars = state.cars.filter(c => !job.rivalIds.includes(c.id));
    }
    state.activeJob = null;
    events.push({ type: 'jobFailed', id: job.id, title: job.title, reason });
  }

  function triggerWasted(state, source, events) {
    state.wastedCount++;
    const fee = Math.floor(state.cash * 0.1);
    state.cash = Math.max(0, state.cash - fee);
    const car = playerCar(state);
    if (car) { car.occupied = false; car.driver = null; }
    state.player.carId = null;
    state.player.hp = state.player.maxHp;
    state.player.hurtTimer = 2.0;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.x = state.hospital.x;
    state.player.y = state.hospital.y + 1.2;
    state.heat = 0;
    state.unseenTimer = 0;
    state.searchCircle = null;
    state.roadblocks = [];
    state.spikes = [];
    state.taxiFare = null;
    for (const c of state.cars) if (c.driver === 'police') c.driver = 'traffic';
    if (state.activeJob) failActiveJob(state, 'Wasted', events);
    events.push({ type: 'wasted', fee, source });
  }

  function triggerBusted(state, events) {
    state.bustedCount++;
    const fee = Math.floor(state.cash * 0.1);
    state.cash = Math.max(0, state.cash - fee);
    const car = playerCar(state);
    if (car) {
      state.cars = state.cars.filter(c => c.id !== car.id);
    }
    state.player.carId = null;
    state.player.hp = state.player.maxHp;
    state.player.hurtTimer = 1.5;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.x = state.policeStation.x;
    state.player.y = state.policeStation.y + 1.2;
    state.heat = 0;
    state.unseenTimer = 0;
    state.searchCircle = null;
    state.roadblocks = [];
    state.spikes = [];
    state.taxiFare = null;
    for (const c of state.cars) if (c.driver === 'police') c.driver = 'traffic';
    if (state.activeJob) failActiveJob(state, 'Busted', events);
    events.push({ type: 'busted', fee });
  }

  function hurtPlayer(state, amount, source, events) {
    if (state.player.hurtTimer > 0 || state.won) return;
    const dealt = Math.max(1, Math.round(amount * DIFFICULTIES[state.difficulty].damage));
    state.player.hp -= dealt;
    state.player.hurtTimer = 0.6;
    events.push({ type: 'hurt', amount: dealt, source, x: state.player.x, y: state.player.y });
    if (state.player.hp <= 0) triggerWasted(state, source, events);
  }

  // --- Explosions & Car damage
  function damageCar(state, car, amount, source, events) {
    if (car.wrecked) return;
    const spec = CARS[car.kind] || CARS.sedan;
    const dealt = amount / spec.tough;
    car.hp = Math.max(0, car.hp - dealt);
    car.flash = 0.25;
    if (car.hp <= 0) {
      explodeCar(state, car, events);
    } else if (car.hp < 15 && car.fireTimer <= 0) {
      car.fireTimer = 3.2;
      events.push({ type: 'carFire', carId: car.id, x: car.x, y: car.y });
    }
  }

  function explodeCar(state, car, events) {
    if (car.wrecked) return;
    car.wrecked = true;
    car.hp = 0;
    car.fireTimer = 0;
    car.vx = 0;
    car.vy = 0;
    car.speed = 0;
    state.wrecksCount++;
    state.explosions.push({ x: car.x, y: car.y, timer: 0.45 });
    events.push({ type: 'explosion', carId: car.id, kind: car.kind, x: car.x, y: car.y });

    // If player is inside, they are wasted
    if (state.player.carId === car.id) {
      car.occupied = false;
      car.driver = null;
      triggerWasted(state, 'car explosion', events);
      return;
    }
    car.occupied = false;
    car.driver = null;

    // Blast hurts nearby cars, peds, and on-foot player
    const blastRadius = 5.5;
    if (!state.player.carId) {
      const pd = Math.hypot(state.player.x - car.x, state.player.y - car.y);
      if (pd < blastRadius) hurtPlayer(state, Math.round((1 - pd / blastRadius) * 85), 'explosion', events);
    }
    for (const other of state.cars) {
      if (other.id !== car.id && !other.wrecked) {
        const d = Math.hypot(other.x - car.x, other.y - car.y);
        if (d < blastRadius) damageCar(state, other, (1 - d / blastRadius) * 90, 'explosion', events);
      }
    }
    for (const ped of state.peds) {
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < blastRadius + 2) {
        ped.downTimer = 3.5;
        ped.panicTimer = 8;
      }
    }
  }

  // --- Player & Car Interactions (Enter/Exit/Payphone)
  function interact(state, events) {
    const p = state.player;
    const car = playerCar(state);

    // If currently in a car: leave the car (or answer a payphone if stopped right next to one)
    if (car) {
      const phone = state.payphones.find(ph => Math.hypot(ph.x - car.x, ph.y - car.y) < 3.2);
      if (phone && Math.abs(car.speed) < 3 && !state.activeJob) {
        if (tryStartPhoneJob(state, phone, events)) return;
      }
      // Step out to the side of the car
      const sideAngles = [car.angle - Math.PI / 2, car.angle + Math.PI / 2, car.angle + Math.PI];
      let exitX = car.x, exitY = car.y;
      for (const a of sideAngles) {
        const tx = car.x + Math.cos(a) * 1.7, ty = car.y + Math.sin(a) * 1.7;
        if (!boxHitsSolid(state, tx, ty, 0.38)) { exitX = tx; exitY = ty; break; }
      }
      car.occupied = false;
      car.driver = null;
      p.carId = null;
      p.x = exitX;
      p.y = exitY;
      p.vx = car.vx * 0.25;
      p.vy = car.vy * 0.25;
      state.taxiFare = null;
      events.push({ type: 'exitCar', kind: car.kind, x: p.x, y: p.y });
      return;
    }

    // On foot: check ringing payphone first
    const phone = state.payphones.find(ph => Math.hypot(ph.x - p.x, ph.y - p.y) < 2.6);
    if (phone && !state.activeJob) {
      if (tryStartPhoneJob(state, phone, events)) return;
    }

    // Otherwise enter the nearest non-wrecked car within reach
    let bestCar = null, bestDist = 3.0;
    for (const c of state.cars) {
      if (c.wrecked) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestDist) { bestDist = d; bestCar = c; }
    }
    if (!bestCar) return;

    const wasOccupied = bestCar.occupied && bestCar.driver && bestCar.driver !== 'player';
    const wasPolice = bestCar.driver === 'police' || bestCar.kind === 'cruiser';
    bestCar.occupied = true;
    bestCar.driver = 'player';
    bestCar.parked = false;
    p.carId = bestCar.id;
    p.x = bestCar.x;
    p.y = bestCar.y;

    if (wasOccupied) {
      // Pull the driver out onto the pavement
      const ejectAngle = bestCar.angle - Math.PI / 2;
      state.peds.push({
        id: state.nextId++,
        x: bestCar.x + Math.cos(ejectAngle) * 1.5,
        y: bestCar.y + Math.sin(ejectAngle) * 1.5,
        vx: 0, vy: 0, angle: ejectAngle,
        downTimer: 1.8, panicTimer: 6.0, colour: 'o'
      });
      events.push({ type: 'carjack', kind: bestCar.kind, x: bestCar.x, y: bestCar.y });
      if (wasPolice) {
        addHeat(state, 1, 'stole a police cruiser', events);
      } else if (witnessNear(state, bestCar.x, bestCar.y)) {
        addHeat(state, 1, 'carjacking in view', events);
      }
    } else if (wasPolice) {
      addHeat(state, 1, 'stole a police cruiser', events);
      events.push({ type: 'enterCar', kind: bestCar.kind, x: bestCar.x, y: bestCar.y });
    } else {
      events.push({ type: 'enterCar', kind: bestCar.kind, x: bestCar.x, y: bestCar.y });
    }
  }

  // --- Driving and On-Foot Physics
  function stepCarPhysics(state, car, controls, dt, events) {
    const spec = CARS[car.kind] || CARS.sedan;
    const isPlayer = car.driver === 'player';

    if (car.fireTimer > 0) {
      car.fireTimer -= dt;
      if (car.fireTimer <= 0) {
        explodeCar(state, car, events);
        return;
      }
    }
    car.flash = Math.max(0, car.flash - dt);
    car.honkTimer = Math.max(0, car.honkTimer - dt);
    if (car.jumpTimer > 0) car.jumpTimer = Math.max(0, car.jumpTimer - dt);

    const tile = tileAt(state, Math.floor(car.x), Math.floor(car.y));
    if (tile === T.WATER && car.jumpTimer <= 0) {
      // Water drowns the car
      car.wrecked = true;
      car.hp = 0;
      car.vx = 0;
      car.vy = 0;
      car.speed = 0;
      if (isPlayer) {
        car.occupied = false;
        car.driver = null;
        state.player.carId = null;
        state.player.x = car.x;
        state.player.y = car.y;
        events.push({ type: 'carSunk', kind: car.kind, x: car.x, y: car.y });
      }
      return;
    }

    const fwdX = Math.cos(car.angle), fwdY = Math.sin(car.angle);
    const rightX = -fwdY, rightY = fwdX;
    let fwdSpeed = car.vx * fwdX + car.vy * fwdY;
    let latSpeed = car.vx * rightX + car.vy * rightY;

    // Surface modifiers: parks, pavements and plazas slow you down; rain lowers grip
    const offRoad = tile === T.GRASS || tile === T.PAVEMENT || tile === T.PLAZA;
    const surfaceSpeedMult = offRoad ? (tile === T.GRASS ? 0.72 : 0.85) : 1.0;
    const rainGripMult = state.rain ? 0.76 : 1.0;
    const punctured = car.punctured ? 0.55 : 1.0;

    const maxFwd = spec.speed * surfaceSpeedMult * punctured;
    const maxRev = -spec.speed * 0.42 * surfaceSpeedMult;

    if (controls.up) {
      if (fwdSpeed < 0) fwdSpeed = Math.min(0, fwdSpeed + spec.brake * dt);
      else fwdSpeed = Math.min(maxFwd, fwdSpeed + spec.accel * dt);
    } else if (controls.down) {
      if (fwdSpeed > 0.8) fwdSpeed = Math.max(0, fwdSpeed - spec.brake * dt);
      else fwdSpeed = Math.max(maxRev, fwdSpeed - spec.accel * 0.65 * dt);
    } else {
      const drag = offRoad ? 9.5 : 4.2;
      if (Math.abs(fwdSpeed) <= drag * dt) fwdSpeed = 0;
      else fwdSpeed -= Math.sign(fwdSpeed) * drag * dt;
    }

    if (controls.handbrake) {
      const hbBrake = spec.brake * 0.58 * dt;
      if (Math.abs(fwdSpeed) <= hbBrake) fwdSpeed = 0;
      else fwdSpeed -= Math.sign(fwdSpeed) * hbBrake;
    }

    // Steering weakens at high speed; handbrake boosts turn rate to kick the tail out
    const steerInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const absSpeed = Math.hypot(fwdSpeed, latSpeed);
    if (steerInput !== 0 && absSpeed > 0.35) {
      const speedRatio = clamp(absSpeed / spec.speed, 0, 1);
      const lowSpeedRamp = clamp(absSpeed / 2.8, 0.25, 1);
      const highSpeedWeaken = 1 - speedRatio * 0.38;
      const driftBoost = controls.handbrake ? 1.28 : 1.0;
      const dirSign = fwdSpeed >= -0.2 ? 1 : -1;
      const turnDelta = steerInput * dirSign * spec.turn * lowSpeedRamp * highSpeedWeaken * driftBoost * dt;
      car.angle = wrapAngle(car.angle + turnDelta);
      if (controls.handbrake && absSpeed > 6) {
        latSpeed -= steerInput * dirSign * 3.8 * dt;
      }
    }

    // Recompute vectors with updated angle and damp lateral slip by grip
    const nfX = Math.cos(car.angle), nfY = Math.sin(car.angle);
    const nrX = -nfY, nrY = nfX;
    const grip = (controls.handbrake ? spec.driftGrip : spec.grip) * rainGripMult * punctured;
    latSpeed *= Math.max(0, 1 - grip * dt);

    car.vx = nfX * fwdSpeed + nrX * latSpeed;
    car.vy = nfY * fwdSpeed + nrY * latSpeed;
    car.speed = fwdSpeed;

    // Lay tyre marks when sliding or braking hard
    if ((controls.handbrake && absSpeed > 5) || Math.abs(latSpeed) > 3.2) {
      if (state.tick % 2 === 0) {
        state.marks.push({ x: car.x - nfX * 0.6, y: car.y - nfY * 0.6, life: 7.0 });
        if (state.marks.length > 90) state.marks.shift();
      }
      if (isPlayer && state.tick % 10 === 0) events.push({ type: 'skid', x: car.x, y: car.y });
    }

    // Move and collide with solid buildings (sliding gently along walls on glancing hits)
    const r = 0.64;
    const steps = Math.max(1, Math.ceil((Math.hypot(car.vx, car.vy) * dt) / 0.35));
    const sdt = dt / steps;
    let hitWall = false, impactSpeed = 0;

    for (let i = 0; i < steps; i++) {
      const nx = car.x + car.vx * sdt;
      if (!boxHitsSolid(state, nx, car.y, r) && nx > 1 && nx < WIDTH - 1) {
        car.x = nx;
      } else {
        hitWall = true;
        impactSpeed = Math.max(impactSpeed, Math.abs(car.vx));
        car.vx *= -0.25;
        if (Math.abs(car.vy) > 0.2) {
          car.angle = wrapAngle(car.angle + wrapAngle(Math.atan2(car.vy, 0) - car.angle) * 0.14);
        } else if (controls.left !== controls.right) {
          car.angle = wrapAngle(car.angle + ((controls.right ? 1 : -1) * spec.turn * sdt * 0.75));
        }
      }
      const ny = car.y + car.vy * sdt;
      if (!boxHitsSolid(state, car.x, ny, r) && ny > 1 && ny < HEIGHT - 1) {
        car.y = ny;
      } else {
        hitWall = true;
        impactSpeed = Math.max(impactSpeed, Math.abs(car.vy));
        car.vy *= -0.25;
        if (Math.abs(car.vx) > 0.2) {
          car.angle = wrapAngle(car.angle + wrapAngle(Math.atan2(0, car.vx) - car.angle) * 0.14);
        } else if (controls.left !== controls.right) {
          car.angle = wrapAngle(car.angle + ((controls.right ? 1 : -1) * spec.turn * sdt * 0.75));
        }
      }
    }

    if (hitWall && impactSpeed > 6.5) {
      const dmg = (impactSpeed - 5.5) * 0.95;
      damageCar(state, car, dmg, 'building', events);
      if (isPlayer) events.push({ type: 'crash', speed: impactSpeed, x: car.x, y: car.y });
    }

    // Stunt ramps
    if (isPlayer) {
      for (const ramp of state.ramps) {
        if (Math.hypot(car.x - ramp.x, car.y - ramp.y) < 1.25 && absSpeed > 15 && car.jumpTimer <= 0) {
          car.jumpTimer = 0.85;
          car.vx *= 1.18;
          car.vy *= 1.18;
          const firstTime = !ramp.jumped;
          ramp.jumped = true;
          const bonus = firstTime ? 300 : 75;
          state.cash += bonus;
          events.push({ type: 'stunt', id: ramp.id, bonus, firstTime, x: car.x, y: car.y });
        }
      }
      // Spike strips puncture player tyres
      for (const sp of state.spikes) {
        if (!car.punctured && Math.hypot(car.x - sp.x, car.y - sp.y) < sp.r) {
          car.punctured = true;
          events.push({ type: 'spikesHit', x: car.x, y: car.y });
        }
      }
    }
  }

  function stepPlayerOnFoot(state, input, dt, events) {
    const p = state.player;
    const tile = tileAt(state, Math.floor(p.x), Math.floor(p.y));
    const inWater = tile === T.WATER;
    const baseSpeed = inWater ? 3.2 : (input.sprint ? 9.2 : 5.8);

    const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      const ux = mx / mag, uy = my / mag;
      p.vx = ux * baseSpeed;
      p.vy = uy * baseSpeed;
      p.angle = Math.atan2(uy, ux);
      p.anim += mag * dt * (input.sprint ? 9 : 6);
    } else {
      p.vx *= 0.6;
      p.vy *= 0.6;
    }

    const r = 0.36;
    const nx = p.x + p.vx * dt;
    if (!boxHitsSolid(state, nx, p.y, r) && nx > 1 && nx < WIDTH - 1) p.x = nx;
    else p.vx = 0;

    const ny = p.y + p.vy * dt;
    if (!boxHitsSolid(state, p.x, ny, r) && ny > 1 && ny < HEIGHT - 1) p.y = ny;
    else p.vy = 0;

    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  }

  // --- Car-to-Car & Car-to-Pedestrian Collisions
  function resolveCollisions(state, events) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (a.jumpTimer > 0.1 || b.jumpTimer > 0.1) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
        const minDist = 1.38;
        if (dist >= minDist || dist === 0) continue;

        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        const specA = CARS[a.kind] || CARS.sedan, specB = CARS[b.kind] || CARS.sedan;
        const totalMass = specA.mass + specB.mass;
        const shareA = a.wrecked ? 0 : specB.mass / totalMass;
        const shareB = b.wrecked ? 0 : specA.mass / totalMass;

        if (!boxHitsSolid(state, a.x - nx * overlap * shareA, a.y - ny * overlap * shareA, 0.65)) {
          a.x -= nx * overlap * shareA;
          a.y -= ny * overlap * shareA;
        }
        if (!boxHitsSolid(state, b.x + nx * overlap * shareB, b.y + ny * overlap * shareB, 0.65)) {
          b.x += nx * overlap * shareB;
          b.y += ny * overlap * shareB;
        }

        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const sepVel = rvx * nx + rvy * ny;
        if (sepVel < 0) {
          const impulse = -(1.32 * sepVel) / (1 / specA.mass + 1 / specB.mass);
          if (!a.wrecked) { a.vx -= (impulse / specA.mass) * nx; a.vy -= (impulse / specA.mass) * ny; }
          if (!b.wrecked) { b.vx += (impulse / specB.mass) * nx; b.vy += (impulse / specB.mass) * ny; }

        const impact = -sepVel;
        if (impact > 5.0) {
          let multA = specB.mass / specA.mass;
          let multB = specA.mass / specB.mass;
          // Intentionally ramming a rival or target car deals heavier damage to the target than to the ramming bumper
          if (a.driver === 'player' && b.missionImportant) { multB *= 2.4; multA *= 0.42; }
          if (b.driver === 'player' && a.missionImportant) { multA *= 2.4; multB *= 0.42; }
          damageCar(state, a, (impact - 4.0) * 1.15 * multA, b.kind, events);
          damageCar(state, b, (impact - 4.0) * 1.15 * multB, a.kind, events);
          if (a.driver === 'player' || b.driver === 'player') {
            events.push({ type: 'crash', speed: impact, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            const other = a.driver === 'player' ? b : a;
            if (other.driver === 'police' && impact > 7.5) {
              addHeat(state, 1, 'rammed police cruiser', events);
            }
          }
        }
        }
      }
    }

    // Moving cars vs pedestrians and on-foot player
    for (const car of cars) {
      if (car.wrecked || car.jumpTimer > 0.1) continue;
      const speed = Math.hypot(car.vx, car.vy);
      if (speed < 2.2) continue;

      for (const ped of state.peds) {
        if (ped.downTimer > 0) continue;
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (d < 1.05) {
          ped.downTimer = 2.6;
          ped.panicTimer = 7.0;
          const pushAngle = Math.atan2(ped.y - car.y, ped.x - car.x);
          const nx = ped.x + Math.cos(pushAngle) * 0.9, ny = ped.y + Math.sin(pushAngle) * 0.9;
          if (!boxHitsSolid(state, nx, ny, 0.35)) { ped.x = nx; ped.y = ny; }
          if (car.driver === 'player') {
            events.push({ type: 'pedBump', x: ped.x, y: ped.y });
            if (witnessNear(state, ped.x, ped.y)) addHeat(state, 1, 'hit a pedestrian', events);
          }
        }
      }

      if (!state.player.carId && car.driver !== 'player') {
        const d = Math.hypot(state.player.x - car.x, state.player.y - car.y);
        if (d < 1.05) {
          hurtPlayer(state, Math.round(speed * 1.8), car.driver === 'police' ? 'police cruiser' : 'traffic', events);
        }
      }
    }
  }

  // --- Traffic, Police & Pedestrian AI
  function laneOffsetForHeading(state, x, y, angle) {
    const t = tileAt(state, Math.floor(x), Math.floor(y));
    const wide = t === T.AVENUE;
    return wide ? 0.9 : 0.48;
  }

  function spawnTrafficCar(state, anywhere = false) {
    if (state.cars.length >= MAX_TRAFFIC) return;
    const pos = playerPos(state);
    for (let tries = 0; tries < 10; tries++) {
      const node = state.intersections[Math.floor(random(state) * state.intersections.length)];
      const edge = node.edges[Math.floor(random(state) * node.edges.length)];
      const target = state.intersections[edge.to];
      const frac = 0.25 + random(state) * 0.5;
      const x = node.x + (target.x - node.x) * frac;
      const y = node.y + (target.y - node.y) * frac;
      const dist = Math.hypot(x - pos.x, y - pos.y);
      if (!anywhere && (dist < 22 || dist > 58)) continue;
      if (state.cars.some(c => Math.hypot(c.x - x, c.y - y) < 4.5)) continue;
      const angle = Math.atan2(target.y - node.y, target.x - node.x);
      const rightX = -Math.sin(angle), rightY = Math.cos(angle);
      const kind = random(state) < 0.07 ? 'cruiser' : TRAFFIC_KINDS[Math.floor(random(state) * TRAFFIC_KINDS.length)];
      const car = makeCar(state, kind, x + rightX * 0.55, y + rightY * 0.55, angle, {
        driver: 'traffic',
        occupied: true,
        fromNode: node.id,
        toNode: target.id
      });
      state.cars.push(car);
      return;
    }
  }

  function stepTrafficAndPolice(state, dt, events) {
    const pos = playerPos(state);
    const pCar = playerCar(state);

    // Spawn/despawn distant ambient cars
    if (state.tick % 30 === 0) spawnTrafficCar(state, false);
    state.cars = state.cars.filter(c => {
      if (c.id === state.player.carId || c.missionImportant) return true;
      const d = Math.hypot(c.x - pos.x, c.y - pos.y);
      return d < 68;
    });

    let boxingPolice = 0;
    let closeCop = false;
    for (const car of state.cars) {
      if (car.wrecked || car.driver === 'player' || !car.occupied) continue;

      if (car.driver === 'police' && state.heat > 0) {
        if (car.roadblock && Math.hypot(car.x - pos.x, car.y - pos.y) > 9) {
          stepCarPhysics(state, car, { handbrake: true }, dt, events);
          continue;
        }
        car.roadblock = false;
        const dx = pos.x - car.x, dy = pos.y - car.y, dist = Math.hypot(dx, dy);
        let goalX = pos.x, goalY = pos.y;
        if (dist > 16) {
          const path = findRoadPath(state, car.x, car.y, pos.x, pos.y);
          const wp = path[Math.min(1, path.length - 1)];
          goalX = wp.x; goalY = wp.y;
        } else if (state.heat >= 2 && pCar) {
          goalX = pos.x + pCar.vx * 0.35;
          goalY = pos.y + pCar.vy * 0.35;
        }
        const wantedAngle = Math.atan2(goalY - car.y, goalX - car.x);
        const diff = wrapAngle(wantedAngle - car.angle);
        const closeBox = dist < 2.2 && (!pCar || Math.abs(pCar.speed) < 3.0);
        const controls = {
          up: !closeBox && dist > 1.2,
          down: closeBox && car.speed > 1.5,
          left: diff < -0.1,
          right: diff > 0.1,
          handbrake: (Math.abs(diff) > 1.3 && Math.abs(car.speed) > 10) || closeBox
        };
        stepCarPhysics(state, car, controls, dt, events);

        if (dist < 3.4) {
          boxingPolice++;
          if (!pCar && dist < 2.2 && Math.hypot(state.player.vx, state.player.vy) < 4.8) closeCop = true;
          else if (pCar && Math.abs(pCar.speed) < 3.5) closeCop = true;
        }
        continue;
      }

      // Mission tail car or rival car or regular traffic
      const toNode = state.intersections[car.toNode ?? 0] || nearestNode(state, car.x, car.y);
      const fromNode = state.intersections[car.fromNode ?? 0] || toNode;
      const roadAngle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
      const rightX = -Math.sin(roadAngle), rightY = Math.cos(roadAngle);
      const laneOff = laneOffsetForHeading(state, car.x, car.y, roadAngle);
      const targetX = toNode.x + rightX * laneOff;
      const targetY = toNode.y + rightY * laneOff;
      const distToNode = Math.hypot(toNode.x - car.x, toNode.y - car.y);

      if (distToNode < 2.6) {
        car.fromNode = toNode.id;
        if (car.route && car.route.length) {
          car.toNode = car.route.shift();
        } else {
          const choices = toNode.edges.filter(e => e.to !== fromNode.id);
          const pick = (choices.length ? choices : toNode.edges)[Math.floor(random(state) * (choices.length || toNode.edges.length))];
          car.toNode = pick.to;
        }
      }

      // Check red light at upcoming intersection
      const redLight = !car.panic && distToNode >= 2.2 && distToNode < 5.5 && isRedForHeading(state, toNode, car.angle);
      // Check car or player ahead in lane
      let blockedAhead = false;
      const fwdX = Math.cos(car.angle), fwdY = Math.sin(car.angle);
      for (const other of state.cars) {
        if (other.id === car.id) continue;
        const odx = other.x - car.x, ody = other.y - car.y;
        const ahead = odx * fwdX + ody * fwdY;
        const side = Math.abs(-odx * fwdY + ody * fwdX);
        if (ahead > 0.8 && ahead < 4.4 && side < 1.35) { blockedAhead = true; break; }
      }
      if (!blockedAhead && !state.player.carId) {
        const pdx = state.player.x - car.x, pdy = state.player.y - car.y;
        const ahead = pdx * fwdX + pdy * fwdY, side = Math.abs(-pdx * fwdY + pdy * fwdX);
        if (ahead > 0.6 && ahead < 3.8 && side < 1.2) blockedAhead = true;
      }

      if (blockedAhead && car.honkTimer <= 0 && random(state) < 0.02) {
        car.honkTimer = 2.5;
        if (Math.hypot(car.x - pos.x, car.y - pos.y) < 18) events.push({ type: 'horn', x: car.x, y: car.y });
      }

      const wantedAngle = Math.atan2(targetY - car.y, targetX - car.x);
      const diff = wrapAngle(wantedAngle - car.angle);
      const cruiseCap = car.panic ? 18 : (car.cruiseSpeed || 11.5);
      const stopNow = redLight || blockedAhead;
      const controls = {
        up: !stopNow && car.speed < cruiseCap,
        down: stopNow && car.speed > 0.4,
        left: diff < -0.07,
        right: diff > 0.07,
        handbrake: stopNow && car.speed > 6
      };
      stepCarPhysics(state, car, controls, dt, events);
    }

    if (state.heat > 0 && closeCop) {
      state.bustTimer = (state.bustTimer || 0) + dt * (boxingPolice >= 2 ? 1.45 : 1.0);
      if (state.bustTimer >= 1.1) {
        state.bustTimer = 0;
        triggerBusted(state, events);
      }
    } else {
      state.bustTimer = Math.max(0, (state.bustTimer || 0) - dt);
    }
  }

  function spawnPedestrian(state, anywhere = false) {
    if (state.peds.length >= MAX_PEDS) return;
    const pos = playerPos(state);
    const colours = ['s', 'c', 'y', 'p', 'g', 'o', 'w'];
    for (let tries = 0; tries < 12; tries++) {
      const x = 10 + Math.floor(random(state) * (WIDTH - 20));
      const y = 10 + Math.floor(random(state) * (HEIGHT - 20));
      const t = tileAt(state, x, y);
      if (t !== T.PAVEMENT && t !== T.PLAZA && t !== T.GRASS) continue;
      const d = Math.hypot(x - pos.x, y - pos.y);
      if (!anywhere && (d < 16 || d > 44)) continue;
      state.peds.push({
        id: state.nextId++,
        x: x + 0.5, y: y + 0.5,
        vx: 0, vy: 0,
        angle: (Math.floor(random(state) * 4) * Math.PI) / 2,
        downTimer: 0, panicTimer: 0,
        colour: colours[Math.floor(random(state) * colours.length)]
      });
      return;
    }
  }

  function stepPedestrians(state, dt) {
    const pos = playerPos(state);
    if (state.tick % 40 === 0) spawnPedestrian(state, false);
    state.peds = state.peds.filter(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 52);

    const pCar = playerCar(state);
    const fastCarNear = pCar && Math.abs(pCar.speed) > 13;

    for (const ped of state.peds) {
      if (ped.downTimer > 0) {
        ped.downTimer = Math.max(0, ped.downTimer - dt);
        continue;
      }
      if (fastCarNear && Math.hypot(ped.x - pCar.x, ped.y - pCar.y) < 4.5) {
        ped.panicTimer = 4.0;
        ped.angle = Math.atan2(ped.y - pCar.y, ped.x - pCar.x);
      }
      if (ped.panicTimer > 0) ped.panicTimer = Math.max(0, ped.panicTimer - dt);

      const speed = ped.panicTimer > 0 ? 4.4 : 2.1;
      const nx = ped.x + Math.cos(ped.angle) * speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * speed * dt;
      const nt = tileAt(state, Math.floor(nx), Math.floor(ny));

      // Pedestrians stick to pavements/plazas/parks unless crossing at a green light or panicking
      let allowStep = !solidAt(state, Math.floor(nx), Math.floor(ny)) && nt !== T.WATER;
      if (allowStep && ROAD_TILES.has(nt) && ped.panicTimer <= 0) {
        const inter = nearestNode(state, nx, ny);
        if (Math.hypot(inter.x - nx, inter.y - ny) > 3.8 || !isRedForHeading(state, inter, ped.angle + Math.PI / 2)) {
          allowStep = false;
        }
      }
      if (allowStep) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.angle = wrapAngle(ped.angle + (random(state) < 0.5 ? Math.PI / 2 : -Math.PI / 2));
      }
    }
  }

  // --- Services: Respray, Garage, Packages, Taxi Fares
  function stepServicesAndSideActivities(state, dt, events) {
    const pos = playerPos(state);
    const car = playerCar(state);

    // Hidden packages (?)
    for (const pkg of state.packages) {
      if (!pkg.collected && Math.hypot(pos.x - pkg.x, pos.y - pkg.y) < 1.6) {
        pkg.collected = true;
        const found = state.packages.filter(p => p.collected).length;
        const reward = found === state.packages.length ? 1000 : 250;
        state.cash += reward;
        events.push({ type: 'package', found, total: state.packages.length, reward, x: pkg.x, y: pkg.y });
      }
    }

    // Respray shop: repairs car and clears heat for $500 if no police cruiser sees you
    if (car && Math.hypot(car.x - state.respray.x, car.y - state.respray.y) < 2.1 && Math.abs(car.speed) < 6) {
      state.resprayCooldown = Math.max(0, (state.resprayCooldown || 0) - dt);
      if (state.resprayCooldown <= 0 && (state.heat > 0 || car.hp < 95 || car.punctured)) {
        if (canPoliceSeePlayer(state)) {
          state.resprayCooldown = 2.0;
          events.push({ type: 'resprayBlocked', reason: 'Police have eyes on you!' });
        } else if (state.cash < RESPRAY_COST) {
          state.resprayCooldown = 2.0;
          events.push({ type: 'resprayBlocked', reason: 'Need $500 for a respray.' });
        } else {
          state.cash -= RESPRAY_COST;
          car.hp = car.maxHp;
          car.fireTimer = 0;
          car.punctured = false;
          state.heat = 0;
          state.unseenTimer = 0;
          state.searchCircle = null;
          state.roadblocks = [];
          state.spikes = [];
          for (const c of state.cars) if (c.driver === 'police') c.driver = 'traffic';
          state.resprayCooldown = 3.0;
          events.push({ type: 'respray', cost: RESPRAY_COST, x: car.x, y: car.y });
        }
      }
    } else {
      state.resprayCooldown = 0;
    }

    // Garage: stores up to 3 cars and repairs parked cars
    if (car && Math.hypot(car.x - state.garage.x, car.y - state.garage.y) < 2.2 && Math.abs(car.speed) < 3) {
      if (!state.garageTouched) {
        state.garageTouched = true;
        car.hp = car.maxHp;
        car.punctured = false;
        if (!state.storedCars.includes(car.kind) && state.storedCars.length < 3) {
          state.storedCars.push(car.kind);
          events.push({ type: 'garageSaved', kind: car.kind, stored: state.storedCars.slice() });
        }
      }
    } else {
      state.garageTouched = false;
    }

    // Taxi side activity when driving a Taxi with no active story job
    if (car && car.kind === 'taxi' && !state.activeJob) {
      if (!state.taxiFare) {
        const dest = state.intersections[Math.floor(random(state) * state.intersections.length)];
        if (Math.hypot(dest.x - car.x, dest.y - car.y) > 35) {
          state.taxiFare = { x: dest.x, y: dest.y, timer: 45, maxTime: 45 };
          events.push({ type: 'taxiStart', x: dest.x, y: dest.y });
        }
      } else {
        state.taxiFare.timer -= dt;
        if (Math.hypot(car.x - state.taxiFare.x, car.y - state.taxiFare.y) < 3.2 && Math.abs(car.speed) < 5) {
          const tip = Math.max(0, Math.round(state.taxiFare.timer * 4));
          const payout = 150 + tip;
          state.cash += payout;
          events.push({ type: 'taxiDone', payout, tip });
          state.taxiFare = null;
        } else if (state.taxiFare.timer <= 0) {
          state.taxiFare = null;
          events.push({ type: 'taxiExpired' });
        }
      }
    } else if (!car || car.kind !== 'taxi' || state.activeJob) {
      state.taxiFare = null;
    }
  }

  // --- Jobs (12 + Finale)
  function availableJobForPhone(state, phone) {
    if (state.activeJob || state.won) return null;
    // Check if the finale is unlocked (all 12 contact jobs completed)
    if (state.completedJobs.length >= 12 && !state.completedJobs.includes('finale')) {
      return phone.contact === 2 ? JOBS[12] : null;
    }
    for (let i = 0; i < 12; i++) {
      const job = JOBS[i];
      if (job.contact !== phone.contact) continue;
      if (state.completedJobs.includes(job.id)) continue;
      // First job of each contact is available from the start, or previous job of that contact is done
      if (i % 4 === 0 || state.completedJobs.includes(JOBS[i - 1].id)) return job;
      return null;
    }
    return null;
  }

  function pickDistrictNodes(state, distCode, count, awayFrom) {
    const pool = state.intersections.filter(n =>
      districtAt(state, Math.floor(n.x), Math.floor(n.y)) === distCode &&
      (!awayFrom || Math.hypot(n.x - awayFrom.x, n.y - awayFrom.y) > 16)
    );
    const source = pool.length >= count ? pool : state.intersections.filter(n => !awayFrom || Math.hypot(n.x - awayFrom.x, n.y - awayFrom.y) > 16);
    const chosen = [];
    const copy = source.slice();
    while (chosen.length < count && copy.length) {
      const idx = Math.floor(random(state) * copy.length);
      chosen.push(copy.splice(idx, 1)[0]);
    }
    return chosen;
  }

  function tryStartPhoneJob(state, phone, events) {
    const spec = availableJobForPhone(state, phone);
    if (!spec) return false;
    startJob(state, spec, phone, events);
    return true;
  }

  function startJob(state, spec, origin, events) {
    const timeMult = DIFFICULTIES[state.difficulty].timeBonus;
    const job = {
      id: spec.id,
      contact: spec.contact,
      type: spec.type,
      title: spec.title,
      brief: spec.brief,
      payout: spec.payout,
      stage: 'active'
    };

    if (spec.type === 'delivery') {
      const nodes = pickDistrictNodes(state, CONTACTS[spec.contact].district, 2, origin);
      const pickNode = nodes[0] || state.intersections[10];
      const dropNode = state.intersections[state.intersections.length - 1 - pickNode.id] || nodes[1];
      const car = makeCar(state, spec.carKind, pickNode.x + 2, pickNode.y, 0, { missionImportant: true, parked: true });
      state.cars.push(car);
      job.targetCarId = car.id;
      job.minHp = spec.minHp;
      job.drop = { x: dropNode.x, y: dropNode.y };
    } else if (spec.type === 'checkpoints') {
      const nodes = pickDistrictNodes(state, CONTACTS[spec.contact].district, spec.count, origin);
      job.checkpoints = nodes.map(n => ({ x: n.x, y: n.y }));
      job.index = 0;
      job.timer = Math.round(spec.timeLimit * timeMult);
    } else if (spec.type === 'getaway') {
      const nodes = pickDistrictNodes(state, CONTACTS[spec.contact].district, 2, origin);
      const pickup = nodes[0] || state.intersections[18];
      const drop = state.intersections[state.intersections.length - 1 - pickup.id] || nodes[1];
      job.pickup = { x: pickup.x, y: pickup.y };
      job.drop = { x: drop.x, y: drop.y };
      job.stars = spec.stars;
      job.stage = 'pickup';
    } else if (spec.type === 'tail') {
      const candidates = pickDistrictNodes(state, CONTACTS[spec.contact].district, 1, origin);
      const startNode = candidates[0] || nearestNode(state, origin.x + 18, origin.y);
      const destNode = state.intersections[(startNode.id + 24) % state.intersections.length];
      const path = findRoadPath(state, startNode.x, startNode.y, destNode.x, destNode.y);
      const route = path.filter(p => p.nodeId !== undefined).map(p => p.nodeId);
      const targetCar = makeCar(state, 'sedan', startNode.x, startNode.y, 0, {
        driver: 'traffic', occupied: true, missionImportant: true,
        fromNode: startNode.id, toNode: route[1] ?? startNode.edges[0].to,
        route: route.slice(2), cruiseSpeed: 10.5
      });
      state.cars.push(targetCar);
      job.targetCarId = targetCar.id;
      job.progress = 0;
      job.duration = spec.duration;
      job.minDist = spec.minDist;
      job.maxDist = spec.maxDist;
      job.spookTimer = 0;
      job.engaged = false;
    } else if (spec.type === 'wreck') {
      const nodes = pickDistrictNodes(state, CONTACTS[spec.contact].district, spec.count, origin);
      job.rivalIds = nodes.map(n => {
        const c = makeCar(state, 'van', n.x, n.y, 0, {
          driver: 'traffic', occupied: true, missionImportant: true,
          fromNode: n.id, toNode: n.edges[0].to, cruiseSpeed: 10
        });
        state.cars.push(c);
        return c.id;
      });
      job.total = job.rivalIds.length;
    } else if (spec.type === 'pickup') {
      const nodes = pickDistrictNodes(state, CONTACTS[spec.contact].district, spec.count, origin);
      job.parcels = nodes.map(n => ({ x: n.x, y: n.y, taken: false }));
      job.timer = Math.round(spec.timeLimit * timeMult);
    } else if (spec.type === 'finale') {
      const bankNode = state.intersections[8];
      const van = makeCar(state, 'armoured', bankNode.x + 2, bankNode.y, 0, { missionImportant: true, parked: true });
      state.cars.push(van);
      job.targetCarId = van.id;
      job.drop = { x: state.freighter.x, y: state.freighter.y };
      job.stars = 5;
      job.stage = 'steal';
    }

    state.activeJob = job;
    events.push({ type: 'jobStarted', id: job.id, title: job.title, brief: job.brief });
  }

  function completeJob(state, job, events) {
    state.activeJob = null;
    if (!state.completedJobs.includes(job.id)) state.completedJobs.push(job.id);
    state.jobsDone = state.completedJobs.length;
    state.cash += job.payout;
    events.push({ type: 'jobCompleted', id: job.id, title: job.title, payout: job.payout });
    if (job.id === 'finale') {
      state.won = true;
      state.endTime = state.time;
      state.heat = 0;
      state.searchCircle = null;
      events.push({ type: 'victory', cash: state.cash, time: state.endTime });
    }
  }

  function stepActiveJob(state, dt, events) {
    const job = state.activeJob;
    if (!job) return;
    const pos = playerPos(state);
    const pCar = playerCar(state);

    if (job.type === 'delivery') {
      const target = state.cars.find(c => c.id === job.targetCarId);
      if (!target || target.wrecked) {
        failActiveJob(state, 'The delivery car was wrecked.', events);
        return;
      }
      if (state.player.carId === target.id && Math.hypot(target.x - job.drop.x, target.y - job.drop.y) < 3.4 && Math.abs(target.speed) < 5) {
        if (target.hp < job.minHp) {
          events.push({ type: 'jobHint', text: `Repair at the Respray Shop first (${Math.ceil(target.hp)}% / ${job.minHp}%).` });
        } else {
          target.missionImportant = false;
          completeJob(state, job, events);
        }
      }
    } else if (job.type === 'checkpoints') {
      job.timer -= dt;
      if (job.timer <= 0) {
        failActiveJob(state, 'Out of time.', events);
        return;
      }
      const cp = job.checkpoints[job.index];
      if (Math.hypot(pos.x - cp.x, pos.y - cp.y) < 3.6) {
        job.index++;
        events.push({ type: 'checkpoint', index: job.index, total: job.checkpoints.length, x: cp.x, y: cp.y });
        if (job.index >= job.checkpoints.length) completeJob(state, job, events);
      }
    } else if (job.type === 'getaway') {
      if (job.stage === 'pickup') {
        if (pCar && Math.hypot(pCar.x - job.pickup.x, pCar.y - job.pickup.y) < 3.6 && Math.abs(pCar.speed) < 5) {
          job.stage = 'escape';
          setHeat(state, job.stars, 'getaway crew aboard', events);
          events.push({ type: 'crewPickedUp', x: pCar.x, y: pCar.y });
        }
      } else if (job.stage === 'escape') {
        if (state.heat === 0 && Math.hypot(pos.x - job.drop.x, pos.y - job.drop.y) < 3.6 && (!pCar || Math.abs(pCar.speed) < 5)) {
          completeJob(state, job, events);
        }
      }
    } else if (job.type === 'tail') {
      const target = state.cars.find(c => c.id === job.targetCarId);
      if (!target || target.wrecked) {
        failActiveJob(state, 'The target car was destroyed.', events);
        return;
      }
      const d = Math.hypot(pos.x - target.x, pos.y - target.y);
      if (d <= job.maxDist) job.engaged = true;
      if (job.engaged && d > job.maxDist + 14) {
        failActiveJob(state, 'Lost sight of the target.', events);
        return;
      }
      if (d < job.minDist) {
        job.spookTimer += dt;
        if (job.spookTimer > 3.2) {
          failActiveJob(state, 'Got too close and spooked the target.', events);
          return;
        }
      } else {
        job.spookTimer = Math.max(0, job.spookTimer - dt);
        if (d <= job.maxDist) job.progress += dt;
      }
      if (job.progress >= job.duration) {
        target.missionImportant = false;
        completeJob(state, job, events);
      }
    } else if (job.type === 'wreck') {
      const alive = job.rivalIds.filter(id => {
        const c = state.cars.find(car => car.id === id);
        return c && !c.wrecked;
      });
      job.remaining = alive.length;
      if (alive.length === 0) completeJob(state, job, events);
    } else if (job.type === 'pickup') {
      job.timer -= dt;
      if (job.timer <= 0) {
        failActiveJob(state, 'Out of time.', events);
        return;
      }
      for (const parcel of job.parcels) {
        if (!parcel.taken && Math.hypot(pos.x - parcel.x, pos.y - parcel.y) < 3.2) {
          parcel.taken = true;
          events.push({ type: 'parcelPicked', x: parcel.x, y: parcel.y });
        }
      }
      if (job.parcels.every(p => p.taken)) completeJob(state, job, events);
    } else if (job.type === 'finale') {
      const van = state.cars.find(c => c.id === job.targetCarId);
      if (!van || van.wrecked) {
        failActiveJob(state, 'The Armoured Van was destroyed.', events);
        return;
      }
      if (job.stage === 'steal' && state.player.carId === van.id) {
        job.stage = 'deliver';
        setHeat(state, 5, 'stole the Armoured Van', events);
      }
      if (job.stage === 'deliver' && state.player.carId === van.id && Math.hypot(van.x - job.drop.x, van.y - job.drop.y) < 4.0) {
        completeJob(state, job, events);
      }
    }
  }

  // --- Objective helper: always names the clear next step
  function objectiveTarget(state) {
    const job = state.activeJob;
    if (!job) {
      for (const phone of state.payphones) {
        const next = availableJobForPhone(state, phone);
        if (next) return { x: phone.x, y: phone.y, label: `${phone.name} (${next.title})` };
      }
      return null;
    }
    if (job.type === 'delivery') {
      const car = state.cars.find(c => c.id === job.targetCarId);
      if (car && state.player.carId !== car.id) return { x: car.x, y: car.y, label: `Pick up the ${CARS[car.kind].name}` };
      if (car && car.hp < job.minHp) return { x: state.respray.x, y: state.respray.y, label: `Repair at Respray (${Math.ceil(car.hp)}%/${job.minHp}%)` };
      return { x: job.drop.x, y: job.drop.y, label: 'Deliver the car to the drop point' };
    }
    if (job.type === 'checkpoints') {
      const cp = job.checkpoints[job.index] || job.checkpoints[0];
      return { x: cp.x, y: cp.y, label: `Checkpoint ${job.index + 1}/${job.checkpoints.length} (${Math.ceil(job.timer)}s)` };
    }
    if (job.type === 'getaway') {
      if (job.stage === 'pickup') return { x: job.pickup.x, y: job.pickup.y, label: 'Pick up the crew in a car' };
      if (state.heat > 0) return { x: state.respray.x, y: state.respray.y, label: 'Lose the police heat (hide or Respray $500)' };
      return { x: job.drop.x, y: job.drop.y, label: 'Drop the crew at the safe house' };
    }
    if (job.type === 'tail') {
      const target = state.cars.find(c => c.id === job.targetCarId);
      const pct = Math.min(100, Math.floor((job.progress / job.duration) * 100));
      return target ? { x: target.x, y: target.y, label: `Tail target (${pct}%) — keep 6-25 tiles back` } : null;
    }
    if (job.type === 'wreck') {
      const targets = job.rivalIds.map(id => state.cars.find(c => c.id === id)).filter(c => c && !c.wrecked);
      const pos = playerPos(state);
      targets.sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
      const t = targets[0];
      return t ? { x: t.x, y: t.y, label: `Wreck rival vans (${targets.length} left)` } : null;
    }
    if (job.type === 'pickup') {
      const pos = playerPos(state);
      const left = job.parcels.filter(p => !p.taken).sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
      const p = left[0];
      return p ? { x: p.x, y: p.y, label: `Collect parcels (${left.length} left, ${Math.ceil(job.timer)}s)` } : null;
    }
    if (job.type === 'finale') {
      const van = state.cars.find(c => c.id === job.targetCarId);
      if (van && state.player.carId !== van.id) return { x: van.x, y: van.y, label: 'Steal the Armoured Van in Heights' };
      return { x: job.drop.x, y: job.drop.y, label: 'Drive the Armoured Van onto the Docks freighter!' };
    }
    return null;
  }

  function objective(state) {
    if (state.won) return 'The Armoured Van is aboard the freighter. The town is yours.';
    const target = objectiveTarget(state);
    if (state.activeJob && target) return `${state.activeJob.title}: ${target.label}`;
    if (state.taxiFare) return `Taxi fare: drop passenger at marker (${Math.ceil(state.taxiFare.timer)}s)`;
    if (target) return `Answer payphone ($): ${target.label}`;
    return 'Explore the town, run taxi fares, or jump stunt ramps.';
  }

  // --- Main step. input: { up, down, left, right, handbrake, enter, sprint, horn }
  function step(state, input = {}) {
    const events = [];
    if (state.won) return events;
    const dt = STEP;
    state.tick++;
    state.time += dt;
    state.clock += dt / DAY_LENGTH;
    if (state.clock >= 1) {
      state.clock -= 1;
      state.day++;
      events.push({ type: 'dawn', day: state.day });
    }

    // Weather toggle
    state.rainTimer -= dt;
    if (state.rainTimer <= 0) {
      state.rain = random(state) < 0.25;
      state.rainTimer = 40 + random(state) * 50;
    }

    if (input.enter && !state.lastEnter) {
      interact(state, events);
    }
    state.lastEnter = Boolean(input.enter);

    const car = playerCar(state);
    if (car) {
      if (input.horn && car.honkTimer <= 0) {
        car.honkTimer = 0.6;
        events.push({ type: 'horn', x: car.x, y: car.y, player: true });
      }
      stepCarPhysics(state, car, input, dt, events);
      state.player.x = car.x;
      state.player.y = car.y;
      state.player.angle = car.angle;
      state.player.hurtTimer = Math.max(0, state.player.hurtTimer - dt);
    } else {
      stepPlayerOnFoot(state, input, dt, events);
    }

    stepTrafficAndPolice(state, dt, events);
    stepPedestrians(state, dt);
    resolveCollisions(state, events);
    stepHeat(state, dt, events);
    stepServicesAndSideActivities(state, dt, events);
    stepActiveJob(state, dt, events);

    // Decay tyre marks, explosions, and clear old abandoned wrecks so streets stay passable
    for (const m of state.marks) m.life -= dt;
    state.marks = state.marks.filter(m => m.life > 0);
    for (const ex of state.explosions) ex.timer -= dt;
    state.explosions = state.explosions.filter(ex => ex.timer > 0);
    for (const c of state.cars) {
      if (c.wrecked) c.wreckTimer = (c.wreckTimer || 0) + dt;
    }
    state.cars = state.cars.filter(c => !c.wrecked || c.wreckTimer < 18);

    return events;
  }

  // --- Score & Saves
  function score(state) {
    const pkgCount = state.packages.filter(p => p.collected).length;
    const stuntsCount = state.ramps.filter(r => r.jumped).length;
    const base = state.cash + state.jobsDone * 400 + pkgCount * 200 + stuntsCount * 250 + state.wrecksCount * 40;
    const bonus = state.won ? Math.max(1000, 7000 - Math.floor((state.endTime || state.time) * 2)) : 0;
    return Math.max(0, base + bonus - (state.wastedCount + state.bustedCount) * 250);
  }

  const packBytes = bytes => {
    const out = [];
    for (let i = 0; i < bytes.length;) {
      let run = 1;
      while (i + run < bytes.length && bytes[i + run] === bytes[i] && run < 65535) run++;
      out.push(bytes[i], run);
      i += run;
    }
    return out;
  };
  const unpackBytes = (pairs, length) => {
    const bytes = new Uint8Array(length);
    let at = 0;
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      if (at + pairs[i + 1] > length) throw new Error('Saved town is the wrong size.');
      bytes.fill(pairs[i], at, at + pairs[i + 1]);
      at += pairs[i + 1];
    }
    if (at !== length) throw new Error('Saved town is the wrong size.');
    return bytes;
  };

  function save(state) {
    const { tiles, districts, roofStyle, ...rest } = state;
    return JSON.stringify({
      ...rest,
      tiles: packBytes(tiles),
      districts: packBytes(districts),
      roofStyle: packBytes(roofStyle)
    });
  }

  function restore(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || data.version !== 1 || typeof data.seed !== 'string' || !Array.isArray(data.tiles) || !data.player || !DIFFICULTIES[data.difficulty]) {
      throw new Error('Saved data is not a Joyride town.');
    }
    const size = WIDTH * HEIGHT;
    return {
      ...data,
      tiles: unpackBytes(data.tiles, size),
      districts: unpackBytes(data.districts, size),
      roofStyle: unpackBytes(data.roofStyle, size)
    };
  }

  global.Joyride = {
    WIDTH, HEIGHT, STEP, T, SOLID, ROAD_TILES, DIST, DISTRICTS, CARS, CONTACTS, JOBS, DIFFICULTIES, RESPRAY_COST,
    newGame, step, tileAt, roadAt, solidAt, districtAt, lightState, isRedForHeading, daylight, isNight,
    playerCar, playerPos, nearestNode, findRoadPath, availableJobForPhone, objectiveTarget, objective,
    score, save, restore, index, inBounds, makeCar, damageCar, addHeat, setHeat, canPoliceSeePlayer
  };
})(typeof window !== 'undefined' ? window : globalThis);

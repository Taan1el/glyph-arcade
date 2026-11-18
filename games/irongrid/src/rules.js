// Pure tactical turn-based grid and command-card rules for Irongrid.
// No DOM, timing, or audio calls; runs identically in Node tests and the browser.
(function (root) {
  'use strict';

  var BOARD_SIZE = 8;
  var TURNS_PER_BATTLE = 5;
  var HAND_SIZE = 4;
  var BASE_ENERGY = 3;
  var MAX_ENERGY = 6;

  var RIGS = {
    titan: { id: 'titan', name: 'Titan', glyph: '[T]', maxHp: 4, move: 3, flying: false, role: 'Vanguard' },
    howitzer: { id: 'howitzer', name: 'Howitzer', glyph: '[A]', maxHp: 3, move: 3, flying: false, role: 'Artillery' },
    aegis: { id: 'aegis', name: 'Aegis', glyph: '[S]', maxHp: 3, move: 4, flying: true, role: 'Support' }
  };
  var RIG_ORDER = ['titan', 'howitzer', 'aegis'];

  var CARDS = {
    iron_fist: {
      id: 'iron_fist', name: 'Iron Fist', cost: 1, tag: 'MELEE',
      desc: 'Strike 1 adjacent tile for 2 dmg and push 1 tile.'
    },
    mortar_shell: {
      id: 'mortar_shell', name: 'Mortar Shell', cost: 1, tag: 'ARC',
      desc: 'Hit tile (range 2-5) for 1 dmg and push 4 neighbors outward.'
    },
    grapple_hook: {
      id: 'grapple_hook', name: 'Grapple Hook', cost: 1, tag: 'PULL',
      desc: 'Line hook: pull target unit to rig, or zip rig to obstacle.'
    },
    aegis_dome: {
      id: 'aegis_dome', name: 'Aegis Dome', cost: 1, tag: 'SHIELD',
      desc: 'Place a bubble shield on any rig or Relay (blocks next hit).'
    },
    repulsor_pulse: {
      id: 'repulsor_pulse', name: 'Repulsor Pulse', cost: 1, tag: 'PULSE',
      desc: 'Push all 4 orthogonal neighbors outward 1 tile (0 dmg).'
    },
    swap_beacon: {
      id: 'swap_beacon', name: 'Swap Beacon', cost: 1, tag: 'SWAP',
      desc: 'Swap rig with any unit up to range 5.'
    },
    overclock: {
      id: 'overclock', name: 'Overclock', cost: 0, tag: 'BOOST',
      desc: 'Gain +2 Reactor Energy and draw 1 card.'
    },
    rail_spike: {
      id: 'rail_spike', name: 'Rail Spike', cost: 2, tag: 'LINE',
      desc: 'Fire straight piercing beam for 3 dmg to first target hit.'
    },
    smoke_drop: {
      id: 'smoke_drop', name: 'Smoke Drop', cost: 1, tag: 'CANCEL',
      desc: 'Blanket a tile (range 0-6) in smoke, cancelling enemy attack and web.'
    },
    repair_nanites: {
      id: 'repair_nanites', name: 'Repair Nanites', cost: 1, tag: 'HEAL',
      desc: 'Repair all standing rigs +2 HP and clear webbing.'
    },
    mine_layer: {
      id: 'mine_layer', name: 'Mine Layer', cost: 1, tag: 'TRAP',
      desc: 'Deploy a 3-dmg proximity mine [*] on a tile (range 1-4).'
    },
    seismic_stomp: {
      id: 'seismic_stomp', name: 'Seismic Stomp', cost: 1, tag: 'CRACK',
      desc: 'Push adjacent target 1 tile and shatter its origin into a chasm.'
    }
  };
  var CARD_IDS = Object.keys(CARDS);
  var DECK_START_IDS = [
    'iron_fist', 'repulsor_pulse', 'mortar_shell',
    'grapple_hook', 'aegis_dome', 'swap_beacon'
  ];

  var FOES = {
    pincer: { id: 'pincer', name: 'Pincer', glyph: '<V>', hp: 2, move: 3, flying: false, dmg: 1, push: 1, style: 'melee', boss: false },
    spitter: { id: 'spitter', name: 'Spitter', glyph: '{*}', hp: 2, move: 2, flying: false, dmg: 1, push: 0, style: 'ray', boss: false },
    beetle: { id: 'beetle', name: 'Beetle', glyph: '[@]', hp: 4, move: 2, flying: false, dmg: 2, push: 1, style: 'charge', boss: false },
    webber: { id: 'webber', name: 'Webber', glyph: '(&)', hp: 3, move: 3, flying: false, dmg: 2, push: 0, style: 'web', boss: false },
    hornet: { id: 'hornet', name: 'Hornet', glyph: '^W^', hp: 2, move: 4, flying: true, dmg: 1, push: 0, style: 'dive', boss: false },
    brood_queen: { id: 'brood_queen', name: 'Brood Queen', glyph: '/#\\', hp: 8, move: 2, flying: false, dmg: 2, push: 1, style: 'slam', boss: true, wide: 2 },
    egg: { id: 'egg', name: 'Hive Egg', glyph: '(*)', hp: 1, move: 0, flying: false, dmg: 0, push: 0, style: 'egg', boss: false }
  };

  var SECTORS = [
    { id: 'rust_flats', index: 1, name: 'Rust Flats', subtitle: 'Supply Train Track', hazard: 'train', relayCount: 3, boss: false, pool: ['pincer', 'spitter', 'beetle'] },
    { id: 'flooded_quarry', index: 2, name: 'Flooded Quarry', subtitle: 'Collapsing Dam Tiles', hazard: 'dam', relayCount: 3, boss: false, pool: ['pincer', 'spitter', 'webber', 'hornet'] },
    { id: 'storm_ridge', index: 3, name: 'Storm Ridge', subtitle: 'Lightning Strikes', hazard: 'lightning', relayCount: 3, boss: false, pool: ['pincer', 'beetle', 'webber', 'hornet', 'spitter'] },
    { id: 'hive_core', index: 4, name: 'The Hive Core', subtitle: 'Brood Queen Finale', hazard: 'queen', relayCount: 3, boss: true, pool: ['pincer', 'spitter', 'webber', 'hornet', 'beetle'] }
  ];

  var DIFFICULTIES = {
    easy: { id: 'easy', name: 'Easy', gridPower: 7, maxEnemies: 3, eliteFromSector: 99, undoCardsPerBattle: 1 },
    normal: { id: 'normal', name: 'Normal', gridPower: 6, maxEnemies: 4, eliteFromSector: 99, undoCardsPerBattle: 0 },
    hard: { id: 'hard', name: 'Hard', gridPower: 5, maxEnemies: 4, eliteFromSector: 2, undoCardsPerBattle: 0 }
  };

  var DIRS = [
    { dx: 1, dy: 0, name: 'east' },
    { dx: -1, dy: 0, name: 'west' },
    { dx: 0, dy: 1, name: 'south' },
    { dx: 0, dy: -1, name: 'north' }
  ];

  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function nextRand(state) {
    state.rngState = (state.rngState + 0x6d2b79f5) | 0;
    var t = Math.imul(state.rngState ^ (state.rngState >>> 15), 1 | state.rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randInt(state, n) {
    return Math.floor(nextRand(state) * n);
  }

  function shuffleWith(state, list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(state, i + 1);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
  }

  function tileAt(board, x, y) {
    if (!inBounds(x, y)) return 'mountain';
    return board[y][x];
  }

  function cloneState(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function unitWidth(u) {
    return (u && u.wide) ? u.wide : 1;
  }

  function cellsOf(u) {
    if (!u || u.hp <= 0) return [];
    if (u.wide === 2) return [{ x: u.x, y: u.y }, { x: u.x + 1, y: u.y }];
    return [{ x: u.x, y: u.y }];
  }

  function unitAt(state, x, y) {
    var i, j, cells;
    for (i = 0; i < state.rigs.length; i++) {
      if (state.rigs[i] && state.rigs[i].hp > 0 && state.rigs[i].x === x && state.rigs[i].y === y) return state.rigs[i];
    }
    for (i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (e.hp <= 0) continue;
      cells = cellsOf(e);
      for (j = 0; j < cells.length; j++) {
        if (cells[j].x === x && cells[j].y === y) return e;
      }
    }
    return null;
  }

  function relayAt(state, x, y) {
    for (var i = 0; i < state.relays.length; i++) {
      if (state.relays[i].x === x && state.relays[i].y === y) return state.relays[i];
    }
    return null;
  }

  function mineIndexAt(state, x, y) {
    for (var i = 0; i < state.mines.length; i++) {
      if (state.mines[i].x === x && state.mines[i].y === y) return i;
    }
    return -1;
  }

  function hasSmokeAt(state, x, y) {
    for (var i = 0; i < state.smokes.length; i++) {
      if (state.smokes[i].x === x && state.smokes[i].y === y) return true;
    }
    return false;
  }

  function fissureAt(state, x, y) {
    for (var i = 0; i < state.fissures.length; i++) {
      if (state.fissures[i].x === x && state.fissures[i].y === y) return state.fissures[i];
    }
    return null;
  }

  function isSolidTerrain(t) {
    return t === 'mountain' || t === 'relay';
  }

  function canOccupyCell(state, x, y, flying, ignoreUnitId) {
    if (!inBounds(x, y)) return false;
    var t = state.board[y][x];
    if (isSolidTerrain(t)) return false;
    if (!flying && (t === 'water' || t === 'chasm')) return false;
    var occ = unitAt(state, x, y);
    if (occ && occ.id !== ignoreUnitId) return false;
    return true;
  }

  function canUnitOccupy(state, u, x, y) {
    var w = unitWidth(u);
    for (var ox = 0; ox < w; ox++) {
      if (!canOccupyCell(state, x + ox, y, u.flying, u.id)) return false;
    }
    return true;
  }

  function isWalkableForEnemy(state, e, x, y) {
    return canUnitOccupy(state, e, x, y);
  }

  function manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function minDistToUnit(u, tx, ty) {
    var cells = cellsOf(u);
    var best = 99;
    for (var i = 0; i < cells.length; i++) {
      var d = manhattan(cells[i].x, cells[i].y, tx, ty);
      if (d < best) best = d;
    }
    return best;
  }

  function groundReachableCount(board, sx, sy) {
    var seen = {};
    var q = [{ x: sx, y: sy }];
    seen[sx + ',' + sy] = true;
    var count = 0;
    while (q.length) {
      var cur = q.shift();
      count++;
      for (var i = 0; i < DIRS.length; i++) {
        var nx = cur.x + DIRS[i].dx;
        var ny = cur.y + DIRS[i].dy;
        var k = nx + ',' + ny;
        if (!inBounds(nx, ny) || seen[k]) continue;
        var t = board[ny][nx];
        if (t === 'ground' || t === 'road' || t === 'cracked') {
          seen[k] = true;
          q.push({ x: nx, y: ny });
        }
      }
    }
    return { count: count, seen: seen };
  }

  function setupDeckForBattle(state) {
    var shuffled = shuffleWith(state, state.deck);
    state.drawPile = shuffled;
    state.discardPile = [];
    state.hand = [];
    drawCards(state, HAND_SIZE);
  }

  function drawCards(state, n) {
    for (var i = 0; i < n; i++) {
      if (state.hand.length >= 5) break;
      if (state.drawPile.length === 0 && state.discardPile.length > 0) {
        state.drawPile = shuffleWith(state, state.discardPile);
        state.discardPile = [];
      }
      if (state.drawPile.length === 0) break;
      state.hand.push(state.drawPile.shift());
    }
  }

  function findOpenSpot(state, cols, rows, flying) {
    var candidates = [];
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < cols.length; c++) {
        var x = cols[c], y = rows[r];
        if (canOccupyCell(state, x, y, flying, null) && !fissureAt(state, x, y)) {
          candidates.push({ x: x, y: y });
        }
      }
    }
    if (!candidates.length) return null;
    return candidates[randInt(state, candidates.length)];
  }

  function makeFoe(state, kind, x, y, sectorIndex) {
    var spec = FOES[kind];
    var diff = DIFFICULTIES[state.difficulty];
    var elite = !spec.boss && sectorIndex >= diff.eliteFromSector && randInt(state, 100) < 35;
    state.nextEnemyUid++;
    var maxHp = spec.hp + (elite ? 2 : 0);
    return {
      id: 'foe_' + state.nextEnemyUid,
      kind: kind,
      name: (elite ? 'Elite ' : '') + spec.name,
      glyph: spec.glyph,
      isRig: false,
      x: x,
      y: y,
      hp: maxHp,
      maxHp: maxHp,
      move: spec.move,
      flying: spec.flying,
      dmg: spec.dmg + (elite ? 1 : 0),
      push: spec.push,
      style: spec.style,
      boss: !!spec.boss,
      wide: spec.wide || 1,
      elite: elite,
      shielded: false,
      cancelled: false,
      intent: null
    };
  }

  function makeBattleBoard(state, sector) {
    var board, y, x, attempts = 0;
    while (attempts < 30) {
      attempts++;
      board = [];
      for (y = 0; y < BOARD_SIZE; y++) {
        var row = [];
        for (x = 0; x < BOARD_SIZE; x++) row.push('ground');
        board.push(row);
      }

      if (sector.id === 'rust_flats') {
        var railRow = 3 + (randInt(state, 2)); // row 3 or 4
        for (x = 0; x < BOARD_SIZE; x++) board[railRow][x] = 'road';
        state.railRow = railRow;
        state.trainPos = 0;
      } else {
        state.railRow = -1;
        state.trainPos = -1;
      }

      if (sector.id === 'flooded_quarry') {
        var canalY = 2 + randInt(state, 3);
        for (x = 1; x < 7; x++) {
          if (x === 3 || x === 4) board[canalY][x] = 'cracked';
          else if (x === 2 || x === 5) board[canalY][x] = 'water';
        }
        board[6][1] = 'water';
        board[6][2] = 'water';
        board[1][5] = 'water';
      } else if (sector.id === 'storm_ridge') {
        board[2][1] = 'chasm';
        board[5][6] = 'chasm';
        board[3][6] = 'cracked';
        board[4][1] = 'cracked';
      } else if (sector.id === 'hive_core') {
        board[3][0] = 'chasm';
        board[4][7] = 'chasm';
        board[5][2] = 'cracked';
        board[5][5] = 'cracked';
      } else {
        board[1][6] = 'water';
        board[6][5] = 'water';
      }

      // Place mountains avoiding railRow & outer edge clutter
      var mCount = 3 + randInt(state, 2);
      var mPlaced = 0, tries = 0;
      while (mPlaced < mCount && tries < 40) {
        tries++;
        mx = 1 + randInt(state, 6);
        my = 1 + randInt(state, 6);
        if (my === state.railRow || board[my][mx] !== 'ground') continue;
        if (sector.boss && my <= 2 && (mx === 3 || mx === 4 || mx === 5)) continue;
        board[my][mx] = 'mountain';
        mPlaced++;
      }

      // Place Relays on rows 5..7 or left/bottom safe cluster (avoiding railRow & edges 0,7)
      var relays = [];
      var rSlots = [
        { x: 1, y: 6 }, { x: 4, y: 6 }, { x: 6, y: 5 },
        { x: 2, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }
      ];
      var pickedSlots = shuffleWith(state, rSlots);
      for (var rIdx = 0; rIdx < pickedSlots.length && relays.length < sector.relayCount; rIdx++) {
        var rs = pickedSlots[rIdx];
        if (rs.y === state.railRow || board[rs.y][rs.x] !== 'ground') continue;
        board[rs.y][rs.x] = 'relay';
        relays.push({ id: 'relay_' + (relays.length + 1), x: rs.x, y: rs.y, shielded: false });
      }

      var mx, my;
      // Check connectivity across ground/road/cracked tiles
      var startGround = null;
      var totalWalk = 0;
      for (y = 0; y < BOARD_SIZE; y++) {
        for (x = 0; x < BOARD_SIZE; x++) {
          var cell = board[y][x];
          if (cell === 'ground' || cell === 'road' || cell === 'cracked') {
            totalWalk++;
            if (!startGround && y >= 3 && y <= 5) startGround = { x: x, y: y };
          }
        }
      }
      if (!startGround) continue;
      var reach = groundReachableCount(board, startGround.x, startGround.y);
      var relaysReachable = relays.length === sector.relayCount;
      for (var ri = 0; ri < relays.length; ri++) {
        var rel = relays[ri];
        var adjOk = false;
        for (var di = 0; di < DIRS.length; di++) {
          var ax = rel.x + DIRS[di].dx, ay = rel.y + DIRS[di].dy;
          if (reach.seen[ax + ',' + ay]) adjOk = true;
        }
        if (!adjOk) relaysReachable = false;
      }
      if (relaysReachable && reach.count >= Math.floor(totalWalk * 0.85)) {
        state.board = board;
        state.relays = relays;
        return;
      }
    }
    state.board = board;
    state.relays = relays || [];
  }

  function resetBattleEntities(state, sector) {
    state.enemies = [];
    state.fissures = [];
    state.mines = [];
    state.smokes = [];
    state.hazards = [];
    state.moveUndoStack = [];
    state.selectedRigId = 'titan';
    state.selectedCardIndex = -1;
    state.turn = 1;
    state.energy = BASE_ENERGY;
    state.events = [];
    state.undoCardsLeft = DIFFICULTIES[state.difficulty].undoCardsPerBattle;
    state.cardSnapshot = null;

    // Position the 3 rigs in the middle rows (rows 4..5, avoiding mountains/relays/water)
    var rigZones = [
      { cols: [1, 2, 3, 4], rows: [4, 5] },
      { cols: [3, 4, 5, 6], rows: [5, 4] },
      { cols: [0, 1, 2, 5, 6, 7], rows: [3, 4, 5] }
    ];
    for (var i = 0; i < RIG_ORDER.length; i++) {
      var rid = RIG_ORDER[i];
      var existing = state.rigs[i];
      var rSpec = RIGS[rid];
      var spot = findOpenSpot(state, rigZones[i].cols, rigZones[i].rows, rSpec.flying) ||
                 findOpenSpot(state, [0, 1, 2, 3, 4, 5, 6, 7], [3, 4, 5, 6, 2], rSpec.flying);
      var hp = existing ? rSpec.maxHp : rSpec.maxHp;
      state.rigs[i] = {
        id: rid,
        name: rSpec.name,
        glyph: rSpec.glyph,
        isRig: true,
        x: spot ? spot.x : i * 2 + 1,
        y: spot ? spot.y : 5,
        hp: hp,
        maxHp: rSpec.maxHp,
        move: rSpec.move,
        flying: rSpec.flying,
        shielded: false,
        webbed: false,
        moved: false,
        acted: false
      };
    }

    // Spawn initial enemies
    var initCount = sector.boss ? 2 : 3;
    if (state.difficulty === 'easy') initCount = Math.max(2, initCount - 1);

    if (sector.boss) {
      // Spawn Brood Queen in top center
      var qx = 3, qy = 1;
      for (var ty = 0; ty <= 2; ty++) {
        for (var tx = 2; tx <= 5; tx++) {
          if (state.board[ty][tx] === 'ground' && state.board[ty][tx + 1] === 'ground' &&
              !unitAt(state, tx, ty) && !unitAt(state, tx + 1, ty)) {
            qx = tx; qy = ty;
            ty = 9; break;
          }
        }
      }
      state.enemies.push(makeFoe(state, 'brood_queen', qx, qy, sector.index));
    }

    for (var eIdx = 0; eIdx < initCount; eIdx++) {
      var kind = sector.pool[randInt(state, sector.pool.length)];
      var fSpec = FOES[kind];
      var es = findOpenSpot(state, [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2], fSpec.flying) ||
               findOpenSpot(state, [0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 3], fSpec.flying);
      if (es) state.enemies.push(makeFoe(state, kind, es.x, es.y, sector.index));
    }

    setupDeckForBattle(state);
    startTurnSetup(state, true);
  }

  function buildSectorBattle(state, sectorIdx) {
    var sector = SECTORS[sectorIdx];
    state.sectorIndex = sectorIdx;
    state.mode = 'play';
    state.rewardOptions = [];
    makeBattleBoard(state, sector);
    resetBattleEntities(state, sector);
  }

  function updateWebbedStatus(state) {
    for (var i = 0; i < state.rigs.length; i++) {
      var rig = state.rigs[i];
      if (rig.hp <= 0) {
        rig.webbed = false;
        continue;
      }
      var stuck = false;
      for (var j = 0; j < state.enemies.length; j++) {
        var e = state.enemies[j];
        if (e.hp <= 0 || e.kind !== 'webber' || e.cancelled) continue;
        if (manhattan(rig.x, rig.y, e.x, e.y) === 1) {
          stuck = true;
          break;
        }
      }
      rig.webbed = stuck;
    }
  }

  function computeEnemyAttackCells(state, e) {
    if (!e || e.hp <= 0 || !e.intent || e.cancelled || e.kind === 'egg') return [];
    var cells = [];
    var dx = e.intent.dx;
    var dy = e.intent.dy;
    var sx = Math.sign(dx);
    var sy = Math.sign(dy);
    var i, cx, cy, t;

    if (e.style === 'melee' || e.style === 'web') {
      cx = e.x + dx;
      cy = e.y + dy;
      if (inBounds(cx, cy)) cells.push({ x: cx, y: cy, dmg: e.dmg, pushDx: e.style === 'melee' ? dx : 0, pushDy: e.style === 'melee' ? dy : 0 });
    } else if (e.style === 'ray') {
      for (i = 1; i <= 3; i++) {
        cx = e.x + sx * i;
        cy = e.y + sy * i;
        if (!inBounds(cx, cy)) break;
        cells.push({ x: cx, y: cy, dmg: e.dmg, pushDx: 0, pushDy: 0 });
        t = state.board[cy][cx];
        if (isSolidTerrain(t) || unitAt(state, cx, cy)) break;
      }
    } else if (e.style === 'charge') {
      for (i = 1; i <= 4; i++) {
        cx = e.x + sx * i;
        cy = e.y + sy * i;
        if (!inBounds(cx, cy)) break;
        t = state.board[cy][cx];
        var hitU = unitAt(state, cx, cy);
        if (isSolidTerrain(t) || hitU) {
          cells.push({ x: cx, y: cy, dmg: e.dmg, pushDx: sx, pushDy: sy, stopBeforeX: cx - sx, stopBeforeY: cy - sy });
          break;
        }
        if (!e.flying && (t === 'water' || t === 'chasm')) break;
        cells.push({ x: cx, y: cy, dmg: 0, pushDx: 0, pushDy: 0, pathOnly: true, stopBeforeX: cx, stopBeforeY: cy });
      }
    } else if (e.style === 'dive') {
      cx = e.x + dx;
      cy = e.y + dy;
      if (inBounds(cx, cy)) cells.push({ x: cx, y: cy, dmg: e.dmg, pushDx: 0, pushDy: 0 });
      var cx2 = e.x + sx * 2;
      var cy2 = e.y + sy * 2;
      if ((cx2 !== cx || cy2 !== cy) && inBounds(cx2, cy2)) {
        cells.push({ x: cx2, y: cy2, dmg: e.dmg, pushDx: 0, pushDy: 0 });
      }
    } else if (e.style === 'slam') {
      // 3-tile row slam in front of Brood Queen (across x-1..x+1 or x..x+2 at y + dy)
      var baseX = e.x;
      var ty = e.y + dy;
      for (var ox = -1; ox <= 1; ox++) {
        var tx = baseX + (ox < 0 ? 0 : ox) + (dx === 0 ? ox : 0);
        // If aiming north/south (dy != 0, dx == 0): hit x, x+1, and neighbor closest to target
        if (dy !== 0) tx = e.x + ox + (e.intent.rowShift || 0);
        else tx = e.x + dx + (ox === 0 ? 0 : 0);
        if (dy !== 0 && inBounds(tx, ty)) {
          cells.push({ x: tx, y: ty, dmg: e.dmg, pushDx: 0, pushDy: Math.sign(dy) });
        }
      }
      if (dy === 0 && sx !== 0) {
        var edgeX = sx > 0 ? e.x + 2 : e.x - 1;
        for (var oy = -1; oy <= 1; oy++) {
          if (inBounds(edgeX, e.y + oy)) cells.push({ x: edgeX, y: e.y + oy, dmg: e.dmg, pushDx: sx, pushDy: 0 });
        }
      }
    }
    return cells;
  }

  function findBfsReach(state, unit, maxSteps) {
    var dist = {};
    var parent = {};
    var startKey = unit.x + ',' + unit.y;
    dist[startKey] = 0;
    var q = [{ x: unit.x, y: unit.y }];
    var list = [];
    while (q.length) {
      var cur = q.shift();
      var ck = cur.x + ',' + cur.y;
      var cd = dist[ck];
      list.push({ x: cur.x, y: cur.y, dist: cd });
      if (cd >= maxSteps) continue;
      for (var i = 0; i < DIRS.length; i++) {
        var nx = cur.x + DIRS[i].dx;
        var ny = cur.y + DIRS[i].dy;
        var nk = nx + ',' + ny;
        if (dist[nk] !== undefined) continue;
        if (!canUnitOccupy(state, unit, nx, ny)) continue;
        // Rigs cannot step out of webbed state; enemy movement also stops on mines during move phase? Wait: enemies avoid mines if alternative exists
        dist[nk] = cd + 1;
        parent[nk] = ck;
        q.push({ x: nx, y: ny });
      }
    }
    return { dist: dist, list: list };
  }

  function chooseEnemyActionAndIntent(state, e) {
    if (e.hp <= 0 || e.kind === 'egg') {
      e.intent = null;
      return;
    }
    var targets = [];
    var i;
    for (i = 0; i < state.relays.length; i++) targets.push({ x: state.relays[i].x, y: state.relays[i].y, priority: 2 });
    for (i = 0; i < state.rigs.length; i++) {
      if (state.rigs[i].hp > 0) targets.push({ x: state.rigs[i].x, y: state.rigs[i].y, priority: e.kind === 'webber' ? 3 : 1.5 });
    }
    if (!targets.length) { e.intent = null; return; }

    var reach = findBfsReach(state, e, e.move);
    var bestScore = -1e9;
    var bestMove = { x: e.x, y: e.y };
    var bestIntent = null;

    for (var mi = 0; mi < reach.list.length; mi++) {
      var m = reach.list[mi];
      var minePen = mineIndexAt(state, m.x, m.y) >= 0 ? -40 : 0;
      var hazPen = 0;
      for (var hi = 0; hi < state.hazards.length; hi++) {
        if (state.hazards[hi].x === m.x && state.hazards[hi].y === m.y) hazPen -= 35;
      }

      for (var di = 0; di < DIRS.length; di++) {
        var dir = DIRS[di];
        var candIntent = { dx: dir.dx, dy: dir.dy, rowShift: 0 };
        var sc = minePen + hazPen - m.dist * 0.1;
        var hitsTarget = false;

        if (e.style === 'melee' || e.style === 'web') {
          var tx = m.x + dir.dx, ty = m.y + dir.dy;
          if (!inBounds(tx, ty)) continue;
          if (relayAt(state, tx, ty)) { sc += 25; hitsTarget = true; }
          else {
            var ru = unitAt(state, tx, ty);
            if (ru && ru.isRig) { sc += (e.style === 'web' ? 32 : 20); hitsTarget = true; }
          }
        } else if (e.style === 'ray') {
          for (var step = 1; step <= 3; step++) {
            var rx = m.x + dir.dx * step, ry = m.y + dir.dy * step;
            if (!inBounds(rx, ry)) break;
            if (relayAt(state, rx, ry)) { sc += 26 - step; hitsTarget = true; break; }
            var uo = unitAt(state, rx, ry);
            if (uo && uo.id !== e.id) {
              if (uo.isRig) { sc += 21 - step; hitsTarget = true; }
              else sc -= 6;
              break;
            }
            if (state.board[ry][rx] === 'mountain') break;
          }
        } else if (e.style === 'charge') {
          for (var cs = 1; cs <= 4; cs++) {
            var cx = m.x + dir.dx * cs, cy = m.y + dir.dy * cs;
            if (!inBounds(cx, cy)) break;
            if (relayAt(state, cx, cy)) { sc += 28 - cs * 0.5; hitsTarget = true; break; }
            var cu = unitAt(state, cx, cy);
            if (cu && cu.id !== e.id) {
              if (cu.isRig) { sc += 22 - cs * 0.5; hitsTarget = true; }
              else sc -= 6;
              break;
            }
            if (isSolidTerrain(state.board[cy][cx]) || state.board[cy][cx] === 'water' || state.board[cy][cx] === 'chasm') break;
          }
        } else if (e.style === 'dive') {
          var hx1 = m.x + dir.dx, hy1 = m.y + dir.dy;
          var hx2 = m.x + dir.dx * 2, hy2 = m.y + dir.dy * 2;
          var dPts = [{ x: hx1, y: hy1 }, { x: hx2, y: hy2 }];
          for (var pi = 0; pi < dPts.length; pi++) {
            if (!inBounds(dPts[pi].x, dPts[pi].y)) continue;
            if (relayAt(state, dPts[pi].x, dPts[pi].y)) { sc += 24; hitsTarget = true; }
            var du = unitAt(state, dPts[pi].x, dPts[pi].y);
            if (du && du.isRig) { sc += 19; hitsTarget = true; }
          }
        } else if (e.style === 'slam') {
          var sy = m.y + dir.dy;
          if (dir.dy !== 0 && inBounds(m.x, sy)) {
            for (var ox = -1; ox <= 1; ox++) {
              var sx = m.x + ox;
              if (!inBounds(sx, sy)) continue;
              if (relayAt(state, sx, sy)) { sc += 24; hitsTarget = true; }
              var su = unitAt(state, sx, sy);
              if (su && su.isRig) { sc += 18; hitsTarget = true; }
            }
          } else if (dir.dx !== 0) {
            var ex = dir.dx > 0 ? m.x + 2 : m.x - 1;
            if (inBounds(ex, m.y)) {
              for (var oy = -1; oy <= 1; oy++) {
                if (!inBounds(ex, m.y + oy)) continue;
                if (relayAt(state, ex, m.y + oy)) { sc += 24; hitsTarget = true; }
                var su2 = unitAt(state, ex, m.y + oy);
                if (su2 && su2.isRig) { sc += 18; hitsTarget = true; }
              }
            }
          }
        }

        if (!hitsTarget) {
          // Move closer to nearest target while facing toward it
          var nearest = 99;
          for (var ti = 0; ti < targets.length; ti++) {
            var td = manhattan(m.x, m.y, targets[ti].x, targets[ti].y);
            if (td < nearest) nearest = td;
          }
          sc -= nearest * 2;
        }
        // Slight noise tie-breaker
        sc += nextRand(state) * 0.05;
        if (sc > bestScore) {
          bestScore = sc;
          bestMove = m;
          bestIntent = candIntent;
        }
      }
    }

    e.x = bestMove.x;
    e.y = bestMove.y;
    e.intent = bestIntent;

    // Trigger mine if enemy stepped onto one
    var mIdx = mineIndexAt(state, e.x, e.y);
    if (mIdx >= 0 && !e.flying) {
      state.mines.splice(mIdx, 1);
      applyDamageToUnit(state, e, 3, 'Mine');
    }
    e.cancelled = hasSmokeAt(state, e.x, e.y);
  }

  function applyDamageToRelay(state, relay, dmg, sourceLabel, outEvents) {
    if (dmg <= 0) return;
    if (relay.shielded) {
      relay.shielded = false;
      if (outEvents) outEvents.push({ type: 'shield_break', x: relay.x, y: relay.y, target: 'Relay' });
      return;
    }
    state.gridPower = Math.max(0, state.gridPower - dmg);
    if (outEvents) outEvents.push({ type: 'relay_hit', x: relay.x, y: relay.y, dmg: dmg, source: sourceLabel || 'Impact' });
  }

  function applyDamageToUnit(state, unit, dmg, sourceLabel, outEvents) {
    if (!unit || unit.hp <= 0 || dmg <= 0) return false;
    if (unit.shielded) {
      unit.shielded = false;
      if (outEvents) outEvents.push({ type: 'shield_break', x: unit.x, y: unit.y, target: unit.name });
      return false;
    }
    unit.hp = Math.max(0, unit.hp - dmg);
    if (outEvents) outEvents.push({ type: 'dmg', x: unit.x, y: unit.y, target: unit.name, dmg: dmg, killed: unit.hp === 0, source: sourceLabel || '' });
    if (unit.hp === 0 && !unit.isRig) {
      state.kills++;
      state.scoreTotal += unit.boss ? 400 : (unit.elite ? 150 : 90);
      if (unit.kind === 'webber') updateWebbedStatus(state);
    }
    return unit.hp === 0;
  }

  function checkEnvironmentalDrown(state, unit, outEvents) {
    if (!unit || unit.hp <= 0 || unit.flying) return false;
    var cells = cellsOf(unit);
    var inLiquidOrPit = false;
    for (var i = 0; i < cells.length; i++) {
      var t = tileAt(state.board, cells[i].x, cells[i].y);
      if (t === 'water' || t === 'chasm') {
        inLiquidOrPit = true;
        break;
      }
    }
    if (!inLiquidOrPit) return false;
    // Wide Boss takes 2 dmg and slides back if partially overhanging; non-boss ground unit drowns/falls instantly!
    if (unit.boss && unit.hp > 2) {
      applyDamageToUnit(state, unit, 2, 'Chasm Edge', outEvents);
      return false;
    }
    unit.shielded = false;
    var wasEnemy = !unit.isRig;
    unit.hp = 0;
    if (outEvents) outEvents.push({ type: 'drown', x: unit.x, y: unit.y, target: unit.name });
    if (wasEnemy) {
      state.kills++;
      state.scoreTotal += unit.boss ? 400 : (unit.elite ? 150 : 110);
      if (unit.kind === 'webber') updateWebbedStatus(state);
    }
    return true;
  }

  function pushUnit(state, target, dx, dy, outEvents) {
    if (!target || target.hp <= 0) return;
    if (dx === 0 && dy === 0) return;
    var nx = target.x + dx;
    var ny = target.y + dy;
    var w = unitWidth(target);

    // Inspect destination cells for collisions
    var blockedByWall = false;
    var blockerUnit = null;
    var hitRelay = null;
    for (var ox = 0; ox < w; ox++) {
      var cx = nx + ox;
      var cy = ny;
      if (!inBounds(cx, cy)) {
        blockedByWall = true;
        break;
      }
      var t = state.board[cy][cx];
      if (t === 'mountain') {
        blockedByWall = true;
        break;
      }
      if (t === 'relay') {
        hitRelay = relayAt(state, cx, cy);
        blockedByWall = true;
        break;
      }
      var other = unitAt(state, cx, cy);
      if (other && other.id !== target.id) {
        blockerUnit = other;
        break;
      }
    }

    if (blockedByWall || blockerUnit) {
      applyDamageToUnit(state, target, 1, 'Collision', outEvents);
      if (blockerUnit) applyDamageToUnit(state, blockerUnit, 1, 'Collision', outEvents);
      if (hitRelay) applyDamageToRelay(state, hitRelay, 1, 'Collision', outEvents);
      if (outEvents) outEvents.push({ type: 'collision', x: target.x, y: target.y, dx: dx, dy: dy });
      return;
    }

    // Move unit cleanly
    target.x = nx;
    target.y = ny;
    if (outEvents) outEvents.push({ type: 'push', target: target.name, toX: nx, toY: ny, dx: dx, dy: dy });

    // Check hazards/water/chasm/mines at new tile
    checkEnvironmentalDrown(state, target, outEvents);
    if (target.hp > 0 && !target.flying) {
      for (var mx = 0; mx < w; mx++) {
        var mIdx = mineIndexAt(state, target.x + mx, target.y);
        if (mIdx >= 0) {
          state.mines.splice(mIdx, 1);
          applyDamageToUnit(state, target, 3, 'Mine', outEvents);
        }
      }
    }
    if (target.hp > 0 && !target.isRig && hasSmokeAt(state, target.x, target.y)) {
      target.cancelled = true;
    }
    updateWebbedStatus(state);
  }

  function crackOrCollapseTile(state, x, y, forcePit, outEvents) {
    if (!inBounds(x, y)) return;
    var t = state.board[y][x];
    if (t === 'mountain' || t === 'relay' || t === 'water' || t === 'chasm') return;
    if (forcePit || t === 'cracked') {
      state.board[y][x] = 'chasm';
      var u = unitAt(state, x, y);
      if (u && !u.flying) checkEnvironmentalDrown(state, u, outEvents);
    } else {
      state.board[y][x] = 'cracked';
    }
  }

  function startTurnSetup(state, skipSpawnMove) {
    var sector = SECTORS[state.sectorIndex];
    state.energy = BASE_ENERGY;
    state.smokes = [];
    state.moveUndoStack = [];
    state.cardSnapshot = null;

    var i;
    for (i = 0; i < state.rigs.length; i++) {
      state.rigs[i].moved = false;
      state.rigs[i].acted = false;
    }
    for (i = 0; i < state.enemies.length; i++) {
      state.enemies[i].cancelled = false;
    }

    // Environmental hazard telegraph for this turn
    state.hazards = [];
    if (sector.hazard === 'train' && state.railRow >= 0 && state.turn <= TURNS_PER_BATTLE) {
      var tx1 = (state.turn - 1) * 2;
      var tx2 = tx1 + 1;
      if (tx1 < BOARD_SIZE) state.hazards.push({ kind: 'train', x: tx1, y: state.railRow });
      if (tx2 < BOARD_SIZE) state.hazards.push({ kind: 'train', x: tx2, y: state.railRow });
      state.trainPos = tx1 - 2;
    } else if (sector.hazard === 'dam' && (state.turn === 2 || state.turn === 4)) {
      for (var dy = 0; dy < BOARD_SIZE; dy++) {
        for (var dx = 0; dx < BOARD_SIZE; dx++) {
          if (state.board[dy][dx] === 'cracked') state.hazards.push({ kind: 'collapse', x: dx, y: dy });
        }
      }
    } else if (sector.hazard === 'lightning') {
      var lCount = 0, tries = 0;
      while (lCount < 2 && tries < 30) {
        tries++;
        var lx = randInt(state, BOARD_SIZE);
        var ly = 1 + randInt(state, BOARD_SIZE - 2);
        var lt = state.board[ly][lx];
        if (lt === 'relay' || lt === 'mountain') continue;
        var dup = false;
        for (var li = 0; li < state.hazards.length; li++) if (state.hazards[li].x === lx && state.hazards[li].y === ly) dup = true;
        if (!dup) { state.hazards.push({ kind: 'lightning', x: lx, y: ly }); lCount++; }
      }
    } else if (sector.hazard === 'queen' && state.turn < TURNS_PER_BATTLE) {
      var qSpot = findOpenSpot(state, [1, 2, 3, 4, 5, 6], [2, 3, 4, 5], false);
      if (qSpot && state.board[qSpot.y][qSpot.x] === 'ground') {
        state.hazards.push({ kind: 'tremor', x: qSpot.x, y: qSpot.y });
      }
    }

    // Spawn fissures on turns 1..4 so player can block or prepare
    if (state.turn < TURNS_PER_BATTLE) {
      var fTarget = sector.boss ? 1 : (state.difficulty === 'easy' ? 1 : 2);
      for (var fi = 0; fi < fTarget; fi++) {
        var fKind = sector.pool[randInt(state, sector.pool.length)];
        var fSpot = findOpenSpot(state, [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3], false);
        if (fSpot && !relayAt(state, fSpot.x, fSpot.y)) {
          state.fissures.push({ x: fSpot.x, y: fSpot.y, kind: fKind });
        }
      }
    }

    // Enemy move + telegraph phase
    if (!skipSpawnMove || state.turn === 1) {
      for (i = 0; i < state.enemies.length; i++) {
        if (state.enemies[i].hp > 0) chooseEnemyActionAndIntent(state, state.enemies[i]);
      }
    }
    updateWebbedStatus(state);

    // Ensure hand has up to HAND_SIZE cards on turns > 1
    if (state.turn > 1) {
      while (state.hand.length) state.discardPile.push(state.hand.shift());
      drawCards(state, HAND_SIZE);
    }

    // Auto-select first standing rig and place cursor on it
    for (i = 0; i < state.rigs.length; i++) {
      if (state.rigs[i].hp > 0) {
        state.selectedRigId = state.rigs[i].id;
        state.cursorX = state.rigs[i].x;
        state.cursorY = state.rigs[i].y;
        break;
      }
    }
    state.selectedCardIndex = -1;
  }

  function selectNextReadyRig(state, allowAny) {
    var curIdx = -1;
    for (var i = 0; i < state.rigs.length; i++) {
      if (state.rigs[i].id === state.selectedRigId) curIdx = i;
    }
    for (var step = 1; step <= state.rigs.length; step++) {
      var r = state.rigs[(curIdx + step) % state.rigs.length];
      if (r.hp > 0 && ((!r.moved && !r.webbed) || !r.acted)) {
        state.selectedRigId = r.id;
        return r.id;
      }
    }
    if (allowAny) {
      for (var j = 0; j < state.rigs.length; j++) {
        if (state.rigs[j].hp > 0) { state.selectedRigId = state.rigs[j].id; return state.rigs[j].id; }
      }
    }
    return state.selectedRigId;
  }

  function reachableTiles(state, rigId) {
    var rig = null;
    for (var i = 0; i < state.rigs.length; i++) {
      if (state.rigs[i].id === rigId) rig = state.rigs[i];
    }
    if (!rig || rig.hp <= 0 || rig.moved || rig.webbed || state.mode !== 'play') return [];
    var reach = findBfsReach(state, rig, rig.move);
    var out = [];
    for (var j = 0; j < reach.list.length; j++) {
      if (reach.list[j].dist > 0) out.push({ x: reach.list[j].x, y: reach.list[j].y });
    }
    return out;
  }

  function cardTargets(state, rigId, cardId) {
    var rig = null;
    for (var i = 0; i < state.rigs.length; i++) {
      if (state.rigs[i].id === rigId) rig = state.rigs[i];
    }
    if (!rig || rig.hp <= 0 || rig.acted || state.mode !== 'play') return [];
    var card = CARDS[cardId];
    if (!card || state.energy < card.cost) return [];

    var targets = [];
    var x, y, d, tx, ty, i2;
    if (cardId === 'iron_fist' || cardId === 'seismic_stomp') {
      for (d = 0; d < DIRS.length; d++) {
        tx = rig.x + DIRS[d].dx; ty = rig.y + DIRS[d].dy;
        if (inBounds(tx, ty)) targets.push({ x: tx, y: ty });
      }
    } else if (cardId === 'mortar_shell') {
      for (y = 0; y < BOARD_SIZE; y++) {
        for (x = 0; x < BOARD_SIZE; x++) {
          var dist = manhattan(rig.x, rig.y, x, y);
          if (dist >= 2 && dist <= 5) targets.push({ x: x, y: y });
        }
      }
    } else if (cardId === 'grapple_hook' || cardId === 'rail_spike') {
      for (d = 0; d < DIRS.length; d++) {
        for (i2 = 1; i2 < BOARD_SIZE; i2++) {
          tx = rig.x + DIRS[d].dx * i2;
          ty = rig.y + DIRS[d].dy * i2;
          if (!inBounds(tx, ty)) break;
          var t = state.board[ty][tx];
          var u = unitAt(state, tx, ty);
          if (cardId === 'rail_spike') {
            targets.push({ x: tx, y: ty });
            if (isSolidTerrain(t) || u) break;
          } else {
            if (isSolidTerrain(t) || u) {
              targets.push({ x: tx, y: ty });
              break;
            }
          }
        }
      }
    } else if (cardId === 'aegis_dome') {
      for (y = 0; y < BOARD_SIZE; y++) {
        for (x = 0; x < BOARD_SIZE; x++) {
          if (manhattan(rig.x, rig.y, x, y) <= 4 && (unitAt(state, x, y) && unitAt(state, x, y).isRig || relayAt(state, x, y))) {
            targets.push({ x: x, y: y });
          }
        }
      }
    } else if (cardId === 'repulsor_pulse' || cardId === 'overclock' || cardId === 'repair_nanites') {
      targets.push({ x: rig.x, y: rig.y });
    } else if (cardId === 'swap_beacon') {
      for (y = 0; y < BOARD_SIZE; y++) {
        for (x = 0; x < BOARD_SIZE; x++) {
          var distS = manhattan(rig.x, rig.y, x, y);
          var su = unitAt(state, x, y);
          if (distS >= 1 && distS <= 5 && su && su.id !== rig.id && unitWidth(su) === 1) {
            targets.push({ x: x, y: y });
          }
        }
      }
    } else if (cardId === 'smoke_drop') {
      for (y = 0; y < BOARD_SIZE; y++) {
        for (x = 0; x < BOARD_SIZE; x++) {
          if (manhattan(rig.x, rig.y, x, y) <= 6) targets.push({ x: x, y: y });
        }
      }
    } else if (cardId === 'mine_layer') {
      for (y = 0; y < BOARD_SIZE; y++) {
        for (x = 0; x < BOARD_SIZE; x++) {
          var distM = manhattan(rig.x, rig.y, x, y);
          var mt = state.board[y][x];
          if (distM >= 1 && distM <= 4 && (mt === 'ground' || mt === 'road' || mt === 'cracked') && !unitAt(state, x, y) && mineIndexAt(state, x, y) < 0) {
            targets.push({ x: x, y: y });
          }
        }
      }
    }
    return targets;
  }

  function hasTargetInList(list, x, y) {
    for (var i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return true;
    return false;
  }

  function executeCardOnState(state, rigId, handIdx, tx, ty, outEvents) {
    var rig = null;
    for (var i = 0; i < state.rigs.length; i++) if (state.rigs[i].id === rigId) rig = state.rigs[i];
    if (!rig || rig.hp <= 0 || rig.acted) return { ok: false, reason: 'Rig cannot act' };
    if (handIdx < 0 || handIdx >= state.hand.length) return { ok: false, reason: 'No card selected' };
    var cardId = state.hand[handIdx];
    var card = CARDS[cardId];
    if (!card || state.energy < card.cost) return { ok: false, reason: 'Not enough Reactor Energy' };

    var legal = cardTargets(state, rigId, cardId);
    if (!hasTargetInList(legal, tx, ty)) return { ok: false, reason: 'Out of range or invalid target' };

    state.energy = Math.min(MAX_ENERGY, state.energy - card.cost);
    if (cardId !== 'overclock') rig.acted = true;
    state.hand.splice(handIdx, 1);
    state.discardPile.push(cardId);
    state.moveUndoStack = []; // Card play locks in prior rig movement cleanly

    var dx = Math.sign(tx - rig.x);
    var dy = Math.sign(ty - rig.y);
    var targetUnit, relay, d, nx, ny;

    if (cardId === 'iron_fist') {
      targetUnit = unitAt(state, tx, ty);
      if (targetUnit) {
        applyDamageToUnit(state, targetUnit, 2, 'Iron Fist', outEvents);
        if (targetUnit.hp > 0) pushUnit(state, targetUnit, dx, dy, outEvents);
      } else if ((relay = relayAt(state, tx, ty))) {
        applyDamageToRelay(state, relay, 1, 'Iron Fist', outEvents);
      }
    } else if (cardId === 'mortar_shell') {
      targetUnit = unitAt(state, tx, ty);
      if (targetUnit) applyDamageToUnit(state, targetUnit, 1, 'Mortar', outEvents);
      else if ((relay = relayAt(state, tx, ty))) applyDamageToRelay(state, relay, 1, 'Mortar', outEvents);
      else crackOrCollapseTile(state, tx, ty, false, outEvents);
      for (d = 0; d < DIRS.length; d++) {
        nx = tx + DIRS[d].dx; ny = ty + DIRS[d].dy;
        var nb = unitAt(state, nx, ny);
        if (nb) pushUnit(state, nb, DIRS[d].dx, DIRS[d].dy, outEvents);
      }
    } else if (cardId === 'grapple_hook') {
      targetUnit = unitAt(state, tx, ty);
      if (targetUnit && unitWidth(targetUnit) === 1) {
        // Pull target toward rig until 1 tile away from rig (or collision)
        var pullDx = -dx, pullDy = -dy;
        var steps = manhattan(rig.x, rig.y, targetUnit.x, targetUnit.y) - 1;
        for (var ps = 0; ps < steps && targetUnit.hp > 0; ps++) {
          var prevX = targetUnit.x, prevY = targetUnit.y;
          pushUnit(state, targetUnit, pullDx, pullDy, outEvents);
          if (targetUnit.x === prevX && targetUnit.y === prevY) break;
        }
      } else {
        // Hook solid mountain/relay/queen: pull rig adjacent to target along line
        var rigSteps = manhattan(rig.x, rig.y, tx, ty) - 1;
        for (var rs = 0; rs < rigSteps; rs++) {
          var rnx = rig.x + dx, rny = rig.y + dy;
          if (!canOccupyCell(state, rnx, rny, rig.flying, rig.id)) break;
          rig.x = rnx; rig.y = rny;
        }
        rig.webbed = false;
        updateWebbedStatus(state);
        if (outEvents) outEvents.push({ type: 'push', target: rig.name, toX: rig.x, toY: rig.y, dx: dx, dy: dy });
      }
    } else if (cardId === 'aegis_dome') {
      targetUnit = unitAt(state, tx, ty);
      if (targetUnit && targetUnit.isRig) {
        targetUnit.shielded = true;
        if (outEvents) outEvents.push({ type: 'shield', x: tx, y: ty, target: targetUnit.name });
      } else if ((relay = relayAt(state, tx, ty))) {
        relay.shielded = true;
        if (outEvents) outEvents.push({ type: 'shield', x: tx, y: ty, target: 'Relay' });
      }
    } else if (cardId === 'repulsor_pulse') {
      for (d = 0; d < DIRS.length; d++) {
        nx = rig.x + DIRS[d].dx; ny = rig.y + DIRS[d].dy;
        var pu = unitAt(state, nx, ny);
        if (pu) pushUnit(state, pu, DIRS[d].dx, DIRS[d].dy, outEvents);
      }
    } else if (cardId === 'swap_beacon') {
      targetUnit = unitAt(state, tx, ty);
      if (targetUnit && unitWidth(targetUnit) === 1) {
        var ox = rig.x, oy = rig.y;
        rig.x = targetUnit.x; rig.y = targetUnit.y;
        targetUnit.x = ox; targetUnit.y = oy;
        if (outEvents) outEvents.push({ type: 'swap', a: rig.name, b: targetUnit.name, x: rig.x, y: rig.y, tx: ox, ty: oy });
        checkEnvironmentalDrown(state, rig, outEvents);
        checkEnvironmentalDrown(state, targetUnit, outEvents);
        updateWebbedStatus(state);
      }
    } else if (cardId === 'overclock') {
      state.energy = Math.min(MAX_ENERGY, state.energy + 2);
      drawCards(state, 1);
      if (outEvents) outEvents.push({ type: 'overclock', energy: state.energy });
    } else if (cardId === 'rail_spike') {
      // Trace straight line from rig toward (tx, ty) hitting first unit/relay/mountain
      for (var step = 1; step < BOARD_SIZE; step++) {
        var rx = rig.x + dx * step, ry = rig.y + dy * step;
        if (!inBounds(rx, ry)) break;
        var ru = unitAt(state, rx, ry);
        if (ru) {
          applyDamageToUnit(state, ru, 3, 'Rail Spike', outEvents);
          break;
        }
        var rr = relayAt(state, rx, ry);
        if (rr) {
          applyDamageToRelay(state, rr, 1, 'Rail Spike', outEvents);
          break;
        }
        if (state.board[ry][rx] === 'mountain') {
          if (outEvents) outEvents.push({ type: 'dmg', x: rx, y: ry, target: 'Mountain', dmg: 0 });
          break;
        }
      }
    } else if (cardId === 'smoke_drop') {
      if (!hasSmokeAt(state, tx, ty)) state.smokes.push({ x: tx, y: ty });
      var su = unitAt(state, tx, ty);
      if (su && !su.isRig) {
        su.cancelled = true;
        updateWebbedStatus(state);
      } else if (su && su.isRig) {
        su.webbed = false;
      }
      if (outEvents) outEvents.push({ type: 'smoke', x: tx, y: ty });
    } else if (cardId === 'repair_nanites') {
      for (var ri = 0; ri < state.rigs.length; ri++) {
        var sr = state.rigs[ri];
        if (sr.hp > 0) {
          var heal = Math.min(2, sr.maxHp - sr.hp);
          sr.hp += heal;
          sr.webbed = false;
          if (heal > 0 && outEvents) outEvents.push({ type: 'heal', x: sr.x, y: sr.y, target: sr.name, heal: heal });
        }
      }
    } else if (cardId === 'mine_layer') {
      state.mines.push({ x: tx, y: ty });
      if (outEvents) outEvents.push({ type: 'mine_set', x: tx, y: ty });
    } else if (cardId === 'seismic_stomp') {
      targetUnit = unitAt(state, tx, ty);
      if (targetUnit) {
        applyDamageToUnit(state, targetUnit, 1, 'Seismic Stomp', outEvents);
        if (targetUnit.hp > 0) pushUnit(state, targetUnit, dx, dy, outEvents);
      }
      crackOrCollapseTile(state, tx, ty, true, outEvents);
    }

    return { ok: true, cardId: cardId };
  }

  function previewAction(state, action) {
    if (!action || state.mode !== 'play') return { ok: false, summary: 'Nothing selected', events: [] };
    var sim = cloneState(state);
    var events = [];
    if (action.type === 'move') {
      var legalMoves = reachableTiles(sim, action.rigId);
      if (!hasTargetInList(legalMoves, action.x, action.y)) return { ok: false, summary: 'Illegal move', events: [] };
      var mr = null;
      for (var i = 0; i < sim.rigs.length; i++) if (sim.rigs[i].id === action.rigId) mr = sim.rigs[i];
      mr.x = action.x; mr.y = action.y; mr.moved = true;
      var blocksFissure = !!fissureAt(sim, action.x, action.y);
      var msg = mr.name + ' moves to (' + action.x + ',' + action.y + ')';
      if (blocksFissure) msg += ' [BLOCK FISSURE: -1 HP]';
      return { ok: true, summary: msg, events: [{ type: 'move', x: action.x, y: action.y, blocksFissure: blocksFissure }], blocksFissure: blocksFissure, gridDamage: 0, kills: 0 };
    }
    if (action.type === 'card') {
      var res = executeCardOnState(sim, action.rigId, action.handIndex, action.x, action.y, events);
      if (!res.ok) return { ok: false, summary: res.reason, events: [] };
      var card = CARDS[res.cardId];
      var kills = 0, gridDmg = 0, collisions = 0, drowns = 0, pushed = 0, totalDmg = 0;
      for (var ei = 0; ei < events.length; ei++) {
        var ev = events[ei];
        if (ev.killed) kills++;
        if (ev.type === 'relay_hit') gridDmg += ev.dmg;
        if (ev.type === 'collision') collisions++;
        if (ev.type === 'drown') { drowns++; kills++; }
        if (ev.type === 'push') pushed++;
        if (ev.dmg && ev.type === 'dmg') totalDmg += ev.dmg;
      }
      var parts = [card.name];
      if (totalDmg > 0) parts.push(totalDmg + ' DMG');
      if (pushed > 0) parts.push('PUSH');
      if (collisions > 0) parts.push(collisions + ' COLLISION (+1)');
      if (drowns > 0) parts.push('DROWN KILL');
      else if (kills > 0) parts.push(kills + ' KILL');
      if (gridDmg > 0) parts.push('WARNING -' + gridDmg + ' PWR');
      if (parts.length === 1) parts.push('ready');
      return {
        ok: true,
        summary: parts.join(' · '),
        events: events,
        kills: kills,
        gridDamage: gridDmg,
        collisions: collisions,
        drowns: drowns,
        totalDamage: totalDmg
      };
    }
    return { ok: false, summary: '', events: [] };
  }

  function resolveEndTurn(state) {
    var outEvents = [];
    var sector = SECTORS[state.sectorIndex];
    var i, j, h;

    // 1. Environmental Hazards
    for (i = 0; i < state.hazards.length; i++) {
      h = state.hazards[i];
      if (h.kind === 'train') {
        var tu = unitAt(state, h.x, h.y);
        if (tu) {
          if (tu.shielded) { tu.shielded = false; outEvents.push({ type: 'shield_break', x: h.x, y: h.y, target: tu.name }); }
          else {
            applyDamageToUnit(state, tu, 99, 'Supply Train', outEvents);
          }
        }
      } else if (h.kind === 'collapse') {
        state.board[h.y][h.x] = 'water';
        var cu = unitAt(state, h.x, h.y);
        if (cu) checkEnvironmentalDrown(state, cu, outEvents);
      } else if (h.kind === 'lightning') {
        var lu = unitAt(state, h.x, h.y);
        if (lu) applyDamageToUnit(state, lu, 2, 'Lightning', outEvents);
        var lr = relayAt(state, h.x, h.y);
        if (lr) applyDamageToRelay(state, lr, 1, 'Lightning', outEvents);
        crackOrCollapseTile(state, h.x, h.y, false, outEvents);
      } else if (h.kind === 'tremor') {
        crackOrCollapseTile(state, h.x, h.y, true, outEvents);
      }
    }

    // Also any non-flying enemy sitting in water/chasm dies at resolution
    for (i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].hp > 0) checkEnvironmentalDrown(state, state.enemies[i], outEvents);
    }

    // 2. Surviving enemies execute their telegraphed attacks in order
    for (i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (e.hp <= 0) continue;
      if (e.kind === 'egg') {
        // Hatch egg into pincer
        e.kind = 'pincer';
        e.name = 'Pincer';
        e.glyph = FOES.pincer.glyph;
        e.hp = FOES.pincer.hp;
        e.maxHp = FOES.pincer.hp;
        e.move = FOES.pincer.move;
        e.dmg = FOES.pincer.dmg;
        e.push = FOES.pincer.push;
        e.style = FOES.pincer.style;
        outEvents.push({ type: 'hatch', x: e.x, y: e.y });
        continue;
      }
      if (e.cancelled || hasSmokeAt(state, e.x, e.y)) {
        outEvents.push({ type: 'cancelled', x: e.x, y: e.y, target: e.name });
        continue;
      }
      var cells = computeEnemyAttackCells(state, e);
      var finalChargePos = null;
      var hitSeenIds = {};
      for (j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (c.stopBeforeX !== undefined && !c.pathOnly) finalChargePos = { x: c.stopBeforeX, y: c.stopBeforeY };
        else if (c.pathOnly) finalChargePos = { x: c.stopBeforeX, y: c.stopBeforeY };
        if (c.dmg <= 0) continue;

        var rel = relayAt(state, c.x, c.y);
        if (rel) applyDamageToRelay(state, rel, c.dmg, e.name, outEvents);

        var targetU = unitAt(state, c.x, c.y);
        if (targetU && targetU.id !== e.id && !hitSeenIds[targetU.id]) {
          hitSeenIds[targetU.id] = true;
          applyDamageToUnit(state, targetU, c.dmg, e.name, outEvents);
          if (targetU.hp > 0 && (c.pushDx || c.pushDy)) {
            pushUnit(state, targetU, c.pushDx, c.pushDy, outEvents);
          }
        }
        // Cracked tiles hit by enemy slam/attacks collapse
        if (state.board[c.y][c.x] === 'cracked') {
          crackOrCollapseTile(state, c.x, c.y, true, outEvents);
        }
      }
      if (e.style === 'charge' && finalChargePos && canUnitOccupy(state, e, finalChargePos.x, finalChargePos.y)) {
        e.x = finalChargePos.x;
        e.y = finalChargePos.y;
      }
    }

    // Brood Queen boss spawns an Egg every turn if below cap and alive
    if (sector.boss) {
      for (i = 0; i < state.enemies.length; i++) {
        var q = state.enemies[i];
        if (q.boss && q.hp > 0 && (state.turn % 2 === 1)) {
          var eggSpots = [
            { x: q.x - 1, y: q.y + 1 }, { x: q.x + 2, y: q.y + 1 },
            { x: q.x, y: q.y + 1 }, { x: q.x + 1, y: q.y + 1 }
          ];
          for (var es = 0; es < eggSpots.length; es++) {
            var ep = eggSpots[es];
            if (canOccupyCell(state, ep.x, ep.y, false, null)) {
              state.enemies.push(makeFoe(state, 'egg', ep.x, ep.y, sector.index));
              outEvents.push({ type: 'egg_spawn', x: ep.x, y: ep.y });
              break;
            }
          }
        }
      }
    }

    // 3. Fissures erupt (or get blocked for 1 self-dmg)
    var maxActive = DIFFICULTIES[state.difficulty].maxEnemies;
    var aliveCount = 0;
    for (i = 0; i < state.enemies.length; i++) if (state.enemies[i].hp > 0) aliveCount++;

    for (i = 0; i < state.fissures.length; i++) {
      var fis = state.fissures[i];
      var blocker = unitAt(state, fis.x, fis.y);
      if (blocker) {
        applyDamageToUnit(state, blocker, 1, 'Fissure Block', outEvents);
        state.fissuresBlocked++;
        state.scoreTotal += 40;
        outEvents.push({ type: 'fissure_block', x: fis.x, y: fis.y, target: blocker.name });
      } else if (aliveCount < maxActive + (sector.boss ? 2 : 0)) {
        state.enemies.push(makeFoe(state, fis.kind, fis.x, fis.y, sector.index));
        aliveCount++;
        outEvents.push({ type: 'fissure_spawn', x: fis.x, y: fis.y, kind: fis.kind });
      }
    }
    state.fissures = [];

    // Clean dead non-boss foes out to keep array compact
    var livingEnemies = [];
    var queenAlive = false;
    for (i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].hp > 0) {
        livingEnemies.push(state.enemies[i]);
        if (state.enemies[i].boss) queenAlive = true;
      }
    }
    state.enemies = livingEnemies;

    // 4. Loss / Battle Win / Next Turn
    var aliveRigs = 0;
    for (i = 0; i < state.rigs.length; i++) if (state.rigs[i].hp > 0) aliveRigs++;

    state.events = outEvents;
    if (state.gridPower <= 0 || aliveRigs === 0) {
      state.mode = 'lose';
      return state;
    }

    var battleWon = (sector.boss && !queenAlive) || (state.turn >= TURNS_PER_BATTLE);
    if (battleWon) {
      state.scoreTotal += 250 + state.gridPower * 60;
      if (state.sectorIndex >= SECTORS.length - 1) {
        state.mode = 'win';
      } else {
        // Prepare 3 card draft options from unowned cards
        var pool = [];
        for (i = 0; i < CARD_IDS.length; i++) {
          if (state.deck.indexOf(CARD_IDS[i]) < 0) pool.push(CARD_IDS[i]);
        }
        pool = shuffleWith(state, pool);
        state.rewardOptions = pool.slice(0, 3);
        state.mode = 'reward';
      }
      return state;
    }

    state.turn++;
    startTurnSetup(state, false);
    return state;
  }

  function newGame(seed, difficulty) {
    var diffKey = DIFFICULTIES[difficulty] ? difficulty : 'normal';
    var diff = DIFFICULTIES[diffKey];
    var s = (seed === undefined || seed === null) ? 1 : (seed >>> 0) || 1;
    var init = mulberry32(s);
    var state = {
      seed: s,
      rngState: Math.floor(init() * 0xffffffff) | 0,
      difficulty: diffKey,
      mode: 'play',
      sectorIndex: 0,
      turn: 1,
      gridPower: diff.gridPower,
      maxGridPower: diff.gridPower,
      energy: BASE_ENERGY,
      deck: DECK_START_IDS.slice(),
      drawPile: [],
      discardPile: [],
      hand: [],
      rewardOptions: [],
      board: [],
      relays: [],
      rigs: [null, null, null],
      enemies: [],
      fissures: [],
      mines: [],
      smokes: [],
      hazards: [],
      railRow: -1,
      trainPos: -1,
      cursorX: 3,
      cursorY: 4,
      selectedRigId: 'titan',
      selectedCardIndex: -1,
      moveUndoStack: [],
      cardSnapshot: null,
      undoCardsLeft: diff.undoCardsPerBattle,
      events: [],
      kills: 0,
      fissuresBlocked: 0,
      scoreTotal: 0,
      nextEnemyUid: 0
    };
    buildSectorBattle(state, 0);
    return state;
  }

  function step(state, input) {
    if (!input) return state;

    if (state.mode === 'reward') {
      if (input.pickReward !== undefined && input.pickReward !== null) {
        return chooseReward(state, input.pickReward);
      }
      return state;
    }

    if (state.mode !== 'play') return state;

    if (input.cursorX !== undefined) state.cursorX = Math.max(0, Math.min(BOARD_SIZE - 1, input.cursorX | 0));
    if (input.cursorY !== undefined) state.cursorY = Math.max(0, Math.min(BOARD_SIZE - 1, input.cursorY | 0));
    if (input.moveCursor) {
      state.cursorX = Math.max(0, Math.min(BOARD_SIZE - 1, state.cursorX + (input.moveCursor.dx | 0)));
      state.cursorY = Math.max(0, Math.min(BOARD_SIZE - 1, state.cursorY + (input.moveCursor.dy | 0)));
    }

    if (input.cycleRig) {
      selectNextReadyRig(state, true);
      state.selectedCardIndex = -1;
    }

    if (input.selectRig) {
      for (var ri = 0; ri < state.rigs.length; ri++) {
        if (state.rigs[ri].id === input.selectRig && state.rigs[ri].hp > 0) {
          state.selectedRigId = input.selectRig;
          state.selectedCardIndex = -1;
          break;
        }
      }
    }

    if (input.selectCard !== undefined && input.selectCard !== null) {
      var idx = -1;
      if (typeof input.selectCard === 'number') {
        idx = input.selectCard;
      } else {
        idx = state.hand.indexOf(input.selectCard);
      }
      if (idx === -1) {
        state.selectedCardIndex = -1;
      } else if (idx >= 0 && idx < state.hand.length) {
        // Toggle off if already selected via same explicit input, unless confirming simultaneously
        state.selectedCardIndex = (state.selectedCardIndex === idx && !input.confirmAt && !input.confirm) ? -1 : idx;
      }
    }

    if (input.undoMove) {
      if (state.moveUndoStack.length > 0) {
        var mv = state.moveUndoStack.pop();
        for (var ui = 0; ui < state.rigs.length; ui++) {
          if (state.rigs[ui].id === mv.rigId) {
            state.rigs[ui].x = mv.x;
            state.rigs[ui].y = mv.y;
            state.rigs[ui].moved = false;
            state.selectedRigId = mv.rigId;
            break;
          }
        }
      } else if (state.undoCardsLeft > 0 && state.cardSnapshot) {
        var snap = JSON.parse(state.cardSnapshot);
        snap.undoCardsLeft = state.undoCardsLeft - 1;
        return snap;
      }
      return state;
    }

    if (input.endTurn) {
      return endTurn(state);
    }

    var ax = input.confirmAt ? input.confirmAt.x : (input.confirm ? state.cursorX : null);
    var ay = input.confirmAt ? input.confirmAt.y : (input.confirm ? state.cursorY : null);
    if (ax !== null && ay !== null && inBounds(ax, ay)) {
      state.cursorX = ax;
      state.cursorY = ay;

      // 1. If a card is selected, try playing it on (ax, ay) with selected rig (or ready rig if needed)
      if (state.selectedCardIndex >= 0 && state.selectedCardIndex < state.hand.length) {
        var cardId = state.hand[state.selectedCardIndex];
        var activeRig = null;
        for (var i = 0; i < state.rigs.length; i++) if (state.rigs[i].id === state.selectedRigId) activeRig = state.rigs[i];
        var candTargets = activeRig ? cardTargets(state, activeRig.id, cardId) : [];

        if (!hasTargetInList(candTargets, ax, ay)) {
          // Check if user clicked on a different ready rig that wants to cast, or clicked a different rig to select it without casting
          var clickedU = unitAt(state, ax, ay);
          if (clickedU && clickedU.isRig && !(activeRig && activeRig.id === clickedU.id && hasTargetInList(candTargets, ax, ay))) {
            state.selectedRigId = clickedU.id;
            return state;
          }
          return state;
        }

        if (state.undoCardsLeft > 0) state.cardSnapshot = JSON.stringify(state);
        var events = [];
        var res = executeCardOnState(state, activeRig.id, state.selectedCardIndex, ax, ay, events);
        if (res.ok) {
          state.events = events;
          state.selectedCardIndex = -1;
          // Auto-check Sector 4 Queen kill mid-turn!
          if (SECTORS[state.sectorIndex].boss) {
            var qAlive = false;
            for (var qi = 0; qi < state.enemies.length; qi++) if (state.enemies[qi].boss && state.enemies[qi].hp > 0) qAlive = true;
            if (!qAlive) {
              state.scoreTotal += 250 + state.gridPower * 60;
              state.mode = 'win';
              return state;
            }
          }
          selectNextReadyRig(state, true);
        }
        return state;
      }

      // 2. No card selected: check if (ax, ay) is a reachable move tile for selectedRigId
      var moveTiles = reachableTiles(state, state.selectedRigId);
      if (hasTargetInList(moveTiles, ax, ay)) {
        for (var mi = 0; mi < state.rigs.length; mi++) {
          var mr = state.rigs[mi];
          if (mr.id === state.selectedRigId) {
            state.moveUndoStack.push({ rigId: mr.id, x: mr.x, y: mr.y });
            mr.x = ax;
            mr.y = ay;
            mr.moved = true;
            state.events = [{ type: 'move', x: ax, y: ay, target: mr.name }];
            return state;
          }
        }
      }

      // 3. Otherwise if clicking a friendly rig, select it
      var clickedRig = unitAt(state, ax, ay);
      if (clickedRig && clickedRig.isRig) {
        state.selectedRigId = clickedRig.id;
        state.selectedCardIndex = -1;
      }
    }

    return state;
  }

  function endTurn(state) {
    if (state.mode !== 'play') return state;
    return resolveEndTurn(state);
  }

  function chooseReward(state, cardIdOrIndex) {
    if (state.mode !== 'reward') return state;
    var chosen = null;
    if (typeof cardIdOrIndex === 'number') {
      chosen = state.rewardOptions[cardIdOrIndex];
    } else if (state.rewardOptions.indexOf(cardIdOrIndex) >= 0) {
      chosen = cardIdOrIndex;
    }
    if (!chosen) chosen = state.rewardOptions[0];
    if (chosen && state.deck.indexOf(chosen) < 0) {
      state.deck.push(chosen);
    }
    // Restore rigs to full HP + +1 Grid Power between sectors (capped at maxGridPower)
    state.gridPower = Math.min(state.maxGridPower, state.gridPower + 1);
    buildSectorBattle(state, state.sectorIndex + 1);
    return state;
  }

  function legalActions(state) {
    if (state.mode === 'reward') {
      return state.rewardOptions.map(function (c) { return { type: 'reward', cardId: c }; });
    }
    if (state.mode !== 'play') return [];
    var out = [{ type: 'endTurn' }];
    for (var ri = 0; ri < state.rigs.length; ri++) {
      var r = state.rigs[ri];
      if (r.hp <= 0) continue;
      if (!r.moved && !r.webbed) {
        var mv = reachableTiles(state, r.id);
        for (var mi = 0; mi < mv.length; mi++) out.push({ type: 'move', rigId: r.id, x: mv[mi].x, y: mv[mi].y });
      }
      if (!r.acted) {
        for (var hi = 0; hi < state.hand.length; hi++) {
          var cts = cardTargets(state, r.id, state.hand[hi]);
          for (var ci = 0; ci < cts.length; ci++) {
            out.push({ type: 'card', rigId: r.id, handIndex: hi, cardId: state.hand[hi], x: cts[ci].x, y: cts[ci].y });
          }
        }
      }
    }
    return out;
  }

  function objective(state) {
    var sector = SECTORS[state.sectorIndex];
    if (state.mode === 'win') return 'All 4 sectors secured. The island grid stands.';
    if (state.mode === 'lose') return 'Grid Power collapsed in ' + sector.name + '.';
    if (state.mode === 'reward') return sector.name + ' cleared! Draft 1 new Command Card.';
    var alive = 0;
    for (var i = 0; i < state.enemies.length; i++) if (state.enemies[i].hp > 0) alive++;
    if (sector.boss) return 'Destroy Brood Queen or hold Turn ' + state.turn + '/' + TURNS_PER_BATTLE + ' (' + alive + ' foes).';
    return sector.name + ' (' + sector.subtitle + '): Hold ' + TURNS_PER_BATTLE + ' turns (' + alive + ' foes active).';
  }

  function score(state) {
    return state.scoreTotal + state.gridPower * 50 + state.kills * 25 + state.sectorIndex * 200;
  }

  function save(state) {
    return JSON.stringify(state);
  }

  function restore(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      var s = JSON.parse(text);
      if (!s || !Array.isArray(s.board) || s.board.length !== BOARD_SIZE || !Array.isArray(s.rigs)) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  var api = {
    BOARD_SIZE: BOARD_SIZE,
    TURNS_PER_BATTLE: TURNS_PER_BATTLE,
    RIGS: RIGS,
    CARDS: CARDS,
    DECK_START_IDS: DECK_START_IDS,
    FOES: FOES,
    SECTORS: SECTORS,
    DIFFICULTIES: DIFFICULTIES,
    newGame: newGame,
    step: step,
    previewAction: previewAction,
    endTurn: endTurn,
    chooseReward: chooseReward,
    objective: objective,
    score: score,
    save: save,
    restore: restore,
    reachableTiles: reachableTiles,
    cardTargets: cardTargets,
    legalActions: legalActions,
    computeEnemyAttackCells: computeEnemyAttackCells,
    cellsOf: cellsOf,
    unitAt: unitAt,
    relayAt: relayAt,
    fissureAt: fissureAt,
    hasSmokeAt: hasSmokeAt,
    mineIndexAt: mineIndexAt
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IrongridRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

'use strict';
// A plain-input bot: it plays Burrow through step() with the same fields a player's keys produce.
const FIND_RADIUS = 90, WOOD_STOCK = 40;

function createBot(B) {
  const { T } = B;
  const memo = { target: null, kind: null, skip: new Set() };

  function lavaNear(state, x, y) {
    for (let dy = -2; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (B.liquidKind(state, x + dx, y + dy) === B.LAVA) return true;
    return false;
  }

  function nearest(state, wanted, anyHeight = false) {
    const p = state.player, px = Math.floor(p.x), py = Math.floor(p.y);
    let best = null, score = Infinity;
    for (let y = Math.max(2, anyHeight ? py - 40 : py); y < B.HEIGHT - 2; y++) {
      for (let x = Math.max(2, px - FIND_RADIUS); x < Math.min(B.WIDTH - 2, px + FIND_RADIUS); x++) {
        if (state.tiles[B.index(x, y)] !== wanted || memo.skip.has(B.index(x, y)) || lavaNear(state, x, y)) continue;
        const d = Math.abs(x - px) + Math.abs(y - py) * 1.2;
        if (d < score) { score = d; best = { x, y }; }
      }
    }
    return best;
  }

  // What to fetch next: the first unfinished recipe's first missing material.
  const SOURCE = { wood: T.TRUNK, copper: T.COPPER, iron: T.IRON, crystal: T.CRYSTAL };
  const ORDER = ['pick2', 'sword2', 'armour2', 'pick3', 'sword3', 'armour3', 'pick4', 'sword4', 'armour4', 'key'];
  function goal(state) {
    if ((state.items.wood || 0) >= WOOD_STOCK) memo.stocked = true;
    if (!memo.stocked) return { tile: T.TRUNK };
    for (const id of ORDER) {
      const recipe = B.RECIPES.find(r => r.id === id), status = B.recipeState(state, recipe);
      if (status === 'owned') continue;
      if (status === 'ready' || status === 'bench') return null;
      for (const [item, amount] of Object.entries(recipe.cost)) {
        if ((state.items[item] || 0) < amount && SOURCE[item] !== undefined) return { tile: SOURCE[item] };
      }
      return null;
    }
    return { altar: true };
  }

  function craftNext(state) {
    if (state.items.bench || B.nearBench(state)) {
      for (const id of [...ORDER, 'potion']) {
        const recipe = B.RECIPES.find(r => r.id === id);
        if (B.recipeState(state, recipe) === 'ready') return id;
      }
    }
    return null;
  }

  function wantsBench(state) {
    const ready = id => {
      const recipe = B.RECIPES.find(r => r.id === id);
      return B.recipeState(state, recipe) === 'bench';
    };
    return ['pick2', 'pick3', 'pick4', 'sword2', 'sword3', 'sword4', 'armour2', 'armour3', 'armour4', 'key'].some(ready);
  }

  const input = function (state) {
    // A death means the current plan is lethal: forget it and pick another target.
    if (state.deaths !== memo.deaths) {
      memo.deaths = state.deaths;
      if (memo.target && !state.boss) memo.skip.add(B.index(memo.target.x, memo.target.y));
      memo.target = null;
      memo.dig = null;
    }
    const p = state.player, px = p.x + p.w / 2, py = p.y + p.h / 2, tx = Math.floor(px), feet = Math.floor(p.y + p.h - 0.01);
    const out = { left: false, right: false, up: false, down: false, jump: false, use: false, usePressed: false, attack: false, select: 'pick' };
    const food = ['potion', 'mushroom', 'berry'].find(id => state.items[id]);
    if (p.hp < 45 && food) { out.select = food; out.use = true; out.usePressed = true; out.aimX = px; out.aimY = py; }

    const foes = [...state.creatures.map(c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })), ...(state.boss ? state.boss.segments.slice(0, 6) : [])];
    const foe = foes.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))[0];
    if (foe && Math.hypot(foe.x - px, foe.y - py) < 4) {
      out.attack = true;
      // Only stop working for something that can really reach us.
      if (Math.abs(foe.y - py) < 2.2 && !state.boss) {
        if (foe.x > px) out.right = true; else out.left = true;
        if (!out.use) return out;
      }
    }
    if (state.boss) {
      const head = state.boss.segments[0];
      if (head.x > px) out.right = true; else out.left = true;
      if (Math.abs(head.y - py) > 2 && p.grounded) out.jump = true;
      out.attack = Math.hypot(head.x - px, head.y - py) < 6;
      return out;
    }

    const craft = craftNext(state);
    if (craft && B.recipeState(state, B.RECIPES.find(r => r.id === craft)) === 'ready') out.craft = craft;
    if (!state.items.bench && (state.items.wood || 0) >= 4) out.craft = out.craft || 'bench';
    if (state.items.bench && wantsBench(state)) {
      for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1]]) {
        const x = tx + dx, y = feet + dy;
        if (B.canPlace(state, x, y, T.BENCH)) { out.select = 'bench'; out.use = true; out.aimX = x + 0.5; out.aimY = y + 0.5; return out; }
      }
    }
    const want = goal(state);
    if (!want) return out;
    let target = memo.target;
    if (want.altar) target = state.altar;
    else if (!target || memo.kind !== want.tile || B.tileAt(state, target.x, target.y) !== want.tile) {
      target = nearest(state, want.tile, want.tile === T.TRUNK) || nearest(state, want.tile, true);
      // Cut trees at the base: it is in reach from the ground and fells the whole trunk.
      if (target && want.tile === T.TRUNK) while (B.tileAt(state, target.x, target.y + 1) === T.TRUNK) target = { x: target.x, y: target.y + 1 };
      memo.target = target;
      memo.kind = want.tile;
    }
    if (!target) { if (p.x < B.WIDTH / 2) out.right = true; else out.left = true; out.jump = p.grounded; return out; }

    // In mid-jump the reach changes every frame; on the ground or in water it holds still.
    const settled = p.grounded || p.climbing || B.liquidKind(state, tx, feet) !== 0;
    const aim = (x, y) => {
      // A tile this pick cannot cut blocks the route, so abandon the target behind it.
      const spec = B.HARDNESS[B.tileAt(state, x, y)];
      if (spec && spec[1] > state.pickTier) { memo.skip.add(B.index(target.x, target.y)); memo.target = null; memo.dig = null; return; }
      out.use = true; out.usePressed = true; out.aimX = x + 0.5; out.aimY = y + 0.5; memo.dig = { x, y };
    };
    // Commit to a block until it breaks: changing tiles resets mining progress.
    if (memo.dig) {
      const { x, y } = memo.dig, tile = B.tileAt(state, x, y), spec = B.HARDNESS[tile];
      if ((settled || y >= feet) && tile !== T.AIR && spec && spec[1] <= state.pickTier && Math.hypot(x + 0.5 - px, y + 0.5 - py) < B.REACH - 0.3) { aim(x, y); return out; }
      memo.dig = null;
    }
    const distance = Math.hypot(target.x + 0.5 - px, target.y + 0.5 - py);
    if (distance < 4.5 && (settled || target.y >= feet)) { aim(target.x, target.y); return out; }
    const dir = target.x + 0.5 > px + 0.6 ? 1 : target.x + 0.5 < px - 0.6 ? -1 : 0;
    const blocking = (x, y) => B.solidAt(state, x, y);
    // Watchdog: no movement and no new items means the terrain beat the plan, so force a way out.
    const haul = Object.values(state.items).reduce((sum, n) => sum + n, 0);
    if (!memo.anchor || Math.hypot(p.x - memo.anchor.x, p.y - memo.anchor.y) > 0.8 || haul !== memo.haul) {
      memo.anchor = { x: p.x, y: p.y };
      memo.haul = haul;
      memo.stall = 0;
    } else memo.stall = (memo.stall || 0) + 1;
    if (memo.stall > 600) {
      memo.skip.add(B.index(target.x, target.y));
      memo.target = null;
      memo.stall = 0;
    }
    if (memo.stall > 150 && target.y >= feet - 1) {
      const side = dir || (Math.floor(memo.stall / 90) % 2 ? 1 : -1), ahead = Math.floor(px + side * 0.9);
      if (side > 0) out.right = true; else out.left = true;
      for (let y = Math.floor(p.y) - 1; y <= feet; y++) if (blocking(ahead, y)) { aim(ahead, y); return out; }
      for (const x of [tx, ahead]) if (blocking(x, Math.floor(p.y) - 1)) { aim(x, Math.floor(p.y) - 1); return out; }
      out.jump = p.grounded;
      return out;
    }
    if (target.y > feet + 1 && Math.abs(target.x + 0.5 - px) < 3) {
      const under = [Math.floor(p.x), Math.floor(p.x + p.w - 0.01)].find(x => blocking(x, feet + 1));
      if (under !== undefined) aim(under, feet + 1);
      else if (B.liquidKind(state, tx, feet + 1) === B.LAVA) { out.right = true; out.jump = p.grounded; }
      return out;
    }
    // Above the target's level: pillar up by jumping and placing a block underfoot.
    if (target.y < feet - 1 && want.tile !== T.TRUNK && Math.abs(target.x + 0.5 - px) <= 3) {
      const filler = ['stone', 'dirt'].find(id => state.items[id]), top = Math.floor(p.y);
      const left = Math.floor(p.x), right = Math.floor(p.x + p.w - 0.01);
      // Clear headroom from the ground; once airborne the only job is placing the step.
      if (p.grounded) {
        for (const x of [left, right]) for (const y of [top - 1, top - 2, top - 3]) if (blocking(x, y)) { aim(x, y); return out; }
        out.jump = true;
        return out;
      }
      if (filler && p.vy > -2) {
        for (const x of [left, right]) {
          const y = Math.ceil(p.y + p.h);
          if (!blocking(x, y) && B.canPlace(state, x, y, T.STONE)) { out.select = filler; out.use = true; out.aimX = x + 0.5; out.aimY = y + 0.5; return out; }
        }
      }
      return out;
    }
    const below = target.y > feet;
    if (below && Math.abs(target.y - feet) >= Math.abs(target.x + 0.5 - px) - 1) {
      const under = [Math.floor(p.x), Math.floor(p.x + p.w - 0.01)].find(x => blocking(x, feet + 1));
      if (under !== undefined) { aim(under, feet + 1); return out; }
      if (B.liquidKind(state, tx, feet + 1) === B.LAVA) { out.right = true; out.jump = p.grounded; return out; }
      if (dir > 0) out.right = true; else if (dir < 0) out.left = true;
      return out;
    }
    if (dir === 0) { out.jump = p.grounded; return out; }
    if (dir > 0) out.right = true; else out.left = true;
    const ahead = Math.floor(px + dir * 0.9);
    for (let y = Math.floor(p.y); y <= feet; y++) if (blocking(ahead, y)) { aim(ahead, y); return out; }
    if (B.liquidKind(state, ahead, feet + 1) === B.LAVA) { const pit = [Math.floor(p.y)]; if (pit.length) { out.jump = p.grounded; } }
    return out;
  };
  input.memo = memo;
  return input;
}

function playRun(B, seed, difficulty, limitMinutes = 40) {
  const state = B.newGame(seed, difficulty), bot = createBot(B), limit = 3600 * limitMinutes;
  let steps = 0;
  while (!state.won && steps < limit) {
    B.step(state, bot(state));
    steps++;
  }
  return { state, minutes: steps / 3600 };
}

module.exports = { createBot, playRun };

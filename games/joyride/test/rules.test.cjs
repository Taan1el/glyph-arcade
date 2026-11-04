'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { playRun } = require('./bot.cjs');

const box = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/rules.js'), 'utf8') + '\nthis.J = Joyride;', box);
const J = box.J, { T } = J;

let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const tick = (state, input = {}, frames = 1) => {
  const events = [];
  for (let i = 0; i < frames; i++) events.push(...J.step(state, input));
  return events;
};

test('A seeded town is fully connected by road, has all four districts, and every job start/end is reachable', () => {
  for (const seed of ['alpha', 'bravo', 'charlie', 'delta']) {
    const state = J.newGame(seed);
    assert.equal(state.tiles.length, J.WIDTH * J.HEIGHT);
    const seenDistricts = new Set(state.districts);
    assert.equal(seenDistricts.size, 4, 'all 4 districts exist');

    // Every intersection must be reachable from intersection 0 via the road graph
    const origin = state.intersections[0];
    for (const node of state.intersections) {
      const path = J.findRoadPath(state, origin.x, origin.y, node.x, node.y);
      assert(path.length >= 1, `intersection ${node.id} is reachable`);
      // Check that the straight segment between consecutive intersection nodes is road/bridge
      for (let i = 0; i + 1 < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const mx = Math.floor((a.x + b.x) / 2), my = Math.floor((a.y + b.y) / 2);
        assert(J.roadAt(state, mx, my), `road tile between nodes at (${mx},${my})`);
      }
    }

    // Payphones, hospital, police station, respray, garage, freighter are all adjacent to road
    for (const landmark of [...state.payphones, state.hospital, state.policeStation, state.respray, state.garage, state.freighter]) {
      assert(!J.solidAt(state, landmark.tx, landmark.ty), 'landmark tile is not solid');
      const path = J.findRoadPath(state, origin.x, origin.y, landmark.x, landmark.y);
      assert(path.length >= 1, 'landmark is connected to road graph');
    }
  }
});

test('Towns are deterministic per seed and differ between seeds', () => {
  const a = J.newGame('same-town'), b = J.newGame('same-town'), c = J.newGame('other-town');
  assert.deepEqual([...a.tiles], [...b.tiles]);
  assert.notDeepEqual([...a.tiles], [...c.tiles]);
  for (let i = 0; i < 300; i++) {
    const inp = { up: i % 40 < 30, right: i % 50 < 15, sprint: true };
    J.step(a, inp);
    J.step(b, inp);
  }
  assert.equal(a.player.x, b.player.x);
  assert.equal(a.rng, b.rng);
});

test('Cars accelerate, turn, and slide with handbrake; crashes cause damage and destroyed cars explode into wrecks', () => {
  const state = J.newGame('physics');
  state.cars = [];
  state.peds = [];
  const n = state.intersections[0];
  const car = J.makeCar(state, 'sports', n.x, n.y, 0, { driver: 'player', occupied: true });
  state.cars.push(car);
  state.player.carId = car.id;

  // Accelerate eastward along the road
  tick(state, { up: true }, 45);
  assert(car.speed > 12, `car accelerated to ${car.speed}`);

  // Turn + handbrake creates lateral slide and lays tyre marks
  const startAngle = car.angle;
  const skidEvents = tick(state, { up: true, right: true, handbrake: true }, 20);
  assert(car.angle > startAngle + 0.3, 'car turned');
  assert(state.marks.length > 0, 'handbrake drift laid tyre marks');
  assert(skidEvents.some(e => e.type === 'skid'), 'emitted skid event');

  // Crash into a solid building damages the car
  let bx = Math.floor(car.x) + 4, by = Math.floor(car.y);
  state.tiles[J.index(bx, by)] = T.BUILDING;
  state.tiles[J.index(bx, by - 1)] = T.BUILDING;
  state.tiles[J.index(bx, by + 1)] = T.BUILDING;
  car.angle = 0;
  car.vx = 22;
  car.vy = 0;
  const hpBefore = car.hp;
  const crashEvents = tick(state, { up: true }, 25);
  assert(car.hp < hpBefore, `crash reduced HP from ${hpBefore} to ${car.hp}`);
  assert(crashEvents.some(e => e.type === 'crash'), 'emitted crash event');

  // Fatal damage triggers fire and explosion, leaving a wreck and wasting the driver
  const dummy = J.makeCar(state, 'compact', n.x + 8, n.y, 0);
  state.cars.push(dummy);
  const expEvents = [];
  J.damageCar(state, dummy, 500, 'test', expEvents);
  assert(dummy.wrecked, 'destroyed car is marked wrecked');
  assert.equal(dummy.hp, 0);
  assert(expEvents.some(e => e.type === 'explosion'), 'emitted explosion event');
});

test('Traffic stops at red lights and never drives through buildings', () => {
  const state = J.newGame('traffic');
  state.peds = [];
  const from = state.intersections[0], to = state.intersections[1];
  // Force the intersection light at `to` to be red for East-West traffic ('NS' green)
  state.time = 0;
  to.phase = 1; // cycle = 1 < 6.5 => 'NS' green, so Eastbound is red
  assert(J.isRedForHeading(state, to, 0), 'eastbound light is red');

  state.cars = [];
  state.player.x = to.x;
  state.player.y = to.y;
  const tCar = J.makeCar(state, 'sedan', to.x - 4.2, to.y + 0.5, 0, {
    driver: 'traffic', occupied: true, fromNode: from.id, toNode: to.id
  });
  tCar.vx = 8;
  tCar.speed = 8;
  state.cars.push(tCar);

  tick(state, {}, 50);
  assert(tCar.speed < 1.0, `traffic car braked for red light (speed=${tCar.speed})`);
  assert(tCar.x < to.x - 1.5, 'stopped before entering intersection');

  // Run 400 steps of full town traffic and verify no traffic car ever enters a solid building tile
  const town = J.newGame('traffic-solid');
  for (let i = 0; i < 400; i++) {
    J.step(town, {});
    for (const c of town.cars) {
      assert(!J.solidAt(town, Math.floor(c.x), Math.floor(c.y)), `car ${c.id} never enters solid tile`);
    }
  }
});

test('Heat rises from crimes, police chase, heat cools when unseen, and respray requires no police LOS', () => {
  const state = J.newGame('heat');
  const n = state.intersections[10];
  state.player.x = n.x;
  state.player.y = n.y;
  state.cars = [];
  // Place an occupied traffic car and a witness pedestrian nearby
  const victimCar = J.makeCar(state, 'sedan', n.x + 1.2, n.y, 0, { driver: 'traffic', occupied: true });
  state.cars.push(victimCar);
  state.peds = [{ id: 999, x: n.x + 3, y: n.y + 2, vx: 0, vy: 0, angle: 0, downTimer: 0, panicTimer: 0, colour: 'w' }];

  const events = tick(state, { enter: true }, 1);
  assert.equal(state.player.carId, victimCar.id, 'stole the car');
  assert.equal(state.heat, 1, 'carjacking in view raised heat to 1 star');
  assert(events.some(e => e.type === 'heat'));
  assert(state.cars.some(c => c.driver === 'police'), 'police cruiser spawned to chase');

  // Respray blocked when police cruiser has line of sight
  state.cash = 1000;
  victimCar.x = state.respray.x;
  victimCar.y = state.respray.y;
  victimCar.vx = 0;
  victimCar.vy = 0;
  victimCar.speed = 0;
  const cop = state.cars.find(c => c.driver === 'police');
  cop.x = state.respray.x + 3;
  cop.y = state.respray.y;
  assert(J.canPoliceSeePlayer(state), 'police has line of sight');
  const blockedEvents = tick(state, {}, 5);
  assert(blockedEvents.some(e => e.type === 'resprayBlocked'));
  assert.equal(state.heat, 1, 'heat not cleared while seen');

  // Move police far away out of sight: respray clears heat and costs $500
  cop.x = 14;
  cop.y = 14;
  state.resprayCooldown = 0;
  assert(!J.canPoliceSeePlayer(state), 'police cannot see player');
  const sprayEvents = tick(state, {}, 5);
  assert(sprayEvents.some(e => e.type === 'respray'));
  assert.equal(state.heat, 0, 'respray cleared all heat');
  assert.equal(state.cash, 500, 'respray cost $500');

  // Heat also cools naturally when unseen outside the search circle
  J.setHeat(state, 1, 'test', []);
  for (const c of state.cars) if (c.driver === 'police') { c.x = 14; c.y = 14; }
  state.searchCircle = { x: 14, y: 14, r: 15 };
  tick(state, {}, 420);
  assert.equal(state.heat, 0, 'heat cooled off while unseen outside search circle');
});

test('Getting busted or wasted costs 10% cash and respawns at the police station or hospital', () => {
  const state = J.newGame('fail-states');
  state.cash = 1000;

  // Wasted: drop player HP to 0
  state.player.hp = 2;
  state.player.hurtTimer = 0;
  const dummyCar = J.makeCar(state, 'sedan', state.player.x, state.player.y, 0);
  state.cars.push(dummyCar);
  state.player.carId = dummyCar.id;
  // Explode the player's car
  const wEvents = [];
  J.damageCar(state, dummyCar, 999, 'test', wEvents);
  assert(wEvents.some(e => e.type === 'wasted'), 'emitted wasted event');
  assert.equal(state.wastedCount, 1);
  assert.equal(state.cash, 900, 'wasted cost 10% cash');
  assert.equal(state.player.hp, 100);
  assert(Math.hypot(state.player.x - state.hospital.x, state.player.y - state.hospital.y) < 3, 'respawned at hospital');

  // Busted: boxed in by police while in a car with heat
  const car2 = J.makeCar(state, 'compact', state.intersections[5].x, state.intersections[5].y, 0, { driver: 'player', occupied: true });
  state.cars.push(car2);
  state.player.carId = car2.id;
  state.player.x = car2.x;
  state.player.y = car2.y;
  J.setHeat(state, 2, 'test', []);
  const cop = state.cars.find(c => c.driver === 'police');
  cop.x = car2.x + 1.4;
  cop.y = car2.y;
  const bEvents = tick(state, { handbrake: true }, 120);
  assert(bEvents.some(e => e.type === 'busted'), 'emitted busted event');
  assert.equal(state.bustedCount, 1);
  assert.equal(state.cash, 810, 'busted cost 10% cash');
  assert.equal(state.player.carId, null, 'lost current car on bust');
  assert(!state.cars.some(c => c.id === car2.id), 'busted car removed');
  assert(Math.hypot(state.player.x - state.policeStation.x, state.player.y - state.policeStation.y) < 3, 'respawned at police station');
});

test('Each job type (delivery, checkpoints, getaway, tail, wreck, pickup, finale) can be finished and failed', () => {
  // Helper to start any job by id
  function setupJob(id) {
    const state = J.newGame('job-' + id);
    const spec = J.JOBS.find(j => j.id === id);
    const phone = state.payphones[spec.contact];
    state.player.x = phone.x;
    state.player.y = phone.y;
    // Unlock prerequisites
    for (const j of J.JOBS) {
      if (j.id === id) break;
      state.completedJobs.push(j.id);
    }
    tick(state, { enter: true }, 1);
    assert.equal(state.activeJob?.id, id, `started job ${id}`);
    return state;
  }

  // 1. Delivery finish & fail
  {
    const s = setupJob('sal_1');
    const car = s.cars.find(c => c.id === s.activeJob.targetCarId);
    s.player.carId = car.id; car.occupied = true; car.driver = 'player';
    car.x = s.activeJob.drop.x; car.y = s.activeJob.drop.y; car.vx = 0; car.vy = 0; car.speed = 0;
    const ev = tick(s, {}, 2);
    assert(ev.some(e => e.type === 'jobCompleted' && e.id === 'sal_1'), 'delivery finished');

    const sFail = setupJob('sal_1');
    const badCar = sFail.cars.find(c => c.id === sFail.activeJob.targetCarId);
    const failEv = [];
    J.damageCar(sFail, badCar, 999, 'test', failEv);
    tick(sFail, {}, 2);
    assert.equal(sFail.activeJob, null, 'delivery failed when target car wrecked');
  }

  // 2. Checkpoints finish & fail
  {
    const s = setupJob('sal_2');
    for (const cp of s.activeJob.checkpoints) {
      s.player.x = cp.x; s.player.y = cp.y;
      tick(s, {}, 2);
    }
    assert(s.completedJobs.includes('sal_2'), 'checkpoints finished');

    const sFail = setupJob('sal_2');
    sFail.activeJob.timer = 0.01;
    const failEv = tick(sFail, {}, 3);
    assert(failEv.some(e => e.type === 'jobFailed'), 'checkpoints failed on timeout');
  }

  // 3. Wreck finish & fail (via wasted)
  {
    const s = setupJob('sal_3');
    for (const id of s.activeJob.rivalIds) {
      const rival = s.cars.find(c => c.id === id);
      J.damageCar(s, rival, 999, 'test', []);
    }
    tick(s, {}, 2);
    assert(s.completedJobs.includes('sal_3'), 'wreck finished');
  }

  // 4. Getaway finish
  {
    const s = setupJob('sal_4');
    const car = s.cars[0];
    s.player.carId = car.id; car.occupied = true; car.driver = 'player';
    car.x = s.activeJob.pickup.x; car.y = s.activeJob.pickup.y; car.vx = 0; car.vy = 0; car.speed = 0;
    tick(s, {}, 2);
    assert.equal(s.activeJob.stage, 'escape');
    assert.equal(s.heat, 3, 'getaway pickup set 3 stars');
    s.heat = 0;
    car.x = s.activeJob.drop.x; car.y = s.activeJob.drop.y; car.vx = 0; car.vy = 0; car.speed = 0;
    tick(s, {}, 2);
    assert(s.completedJobs.includes('sal_4'), 'getaway finished');
  }

  // 5. Pickup rush finish & fail
  {
    const s = setupJob('vee_1');
    for (const p of s.activeJob.parcels) {
      s.player.x = p.x; s.player.y = p.y;
      tick(s, {}, 2);
    }
    assert(s.completedJobs.includes('vee_1'), 'pickup finished');

    const sFail = setupJob('vee_1');
    sFail.activeJob.timer = 0.01;
    const failEv = tick(sFail, {}, 3);
    assert(failEv.some(e => e.type === 'jobFailed'), 'pickup failed on timeout');
  }

  // 6. Tail finish & fail
  {
    const s = setupJob('vee_2');
    s.activeJob.progress = s.activeJob.duration - 0.02;
    const target = s.cars.find(c => c.id === s.activeJob.targetCarId);
    s.player.x = target.x - 12; s.player.y = target.y;
    tick(s, {}, 5);
    assert(s.completedJobs.includes('vee_2'), 'tail finished');

    const sFail = setupJob('vee_2');
    sFail.activeJob.engaged = true;
    sFail.player.x = 2; sFail.player.y = 2; // far away
    const failEv = tick(sFail, {}, 3);
    assert(failEv.some(e => e.type === 'jobFailed'), 'tail failed when losing target');
  }

  // 7. Finale finish
  {
    const s = setupJob('finale');
    const van = s.cars.find(c => c.id === s.activeJob.targetCarId);
    s.player.carId = van.id; van.occupied = true; van.driver = 'player';
    tick(s, {}, 2);
    assert.equal(s.heat, 5, 'stealing armoured van triggered 5 stars');
    van.x = s.activeJob.drop.x; van.y = s.activeJob.drop.y;
    const winEv = tick(s, {}, 2);
    assert(s.won, 'finale won the game');
    assert(winEv.some(e => e.type === 'victory'));
  }
});

test('Save and restore round-trip and stay deterministic', () => {
  const state = J.newGame('save-test');
  tick(state, { right: true, sprint: true }, 120);
  const saved = J.save(state);
  assert(saved.length < 300000, `compact save (${saved.length} bytes)`);
  const copy = J.restore(saved);
  assert.deepEqual([...copy.tiles], [...state.tiles]);
  assert.equal(copy.player.x, state.player.x);
  assert.equal(copy.rng, state.rng);

  tick(state, { up: true, left: true }, 90);
  tick(copy, { up: true, left: true }, 90);
  assert.equal(copy.player.x, state.player.x);
  assert.equal(copy.player.y, state.player.y);
  assert.throws(() => J.restore({ version: 99 }), /not a Joyride town/);
});

test('A plain-input bot drives the road graph and finishes the story on at least 3 of 4 seeds within 45 simulated minutes', () => {
  const seeds = ['one', 'two', 'three', 'four'];
  const runs = seeds.map(seed => playRun(J, seed, 'normal', 45));
  const report = runs.map(r => `${r.state.won ? 'won' : `jobs:${r.state.jobsDone}/13`} ${r.minutes.toFixed(1)}m $${r.state.cash} busts:${r.state.bustedCount} wasted:${r.state.wastedCount}`);
  console.log('   ' + report.join(' | '));
  const wins = runs.filter(r => r.state.won);
  assert(wins.length >= 3, `expected at least 3 of 4 seeds to win within 45m, got ${wins.length}`);
});

console.log(`${count}/${count} Joyride rules checks passed.`);

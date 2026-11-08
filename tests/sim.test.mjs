import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, LEVELS } from '../src/scenarios.js';
import { createSim, angleTo } from '../src/sim.js';

const U9 = LEVELS.find((l) => l.id === 'U9');
const U11 = LEVELS.find((l) => l.id === 'U11');
const scn = (id) => SCENARIOS.find((s) => s.id === id);
const DT = 1 / 60;

function run(sim, seconds, input = {}) {
  for (let i = 0; i < seconds / DT && !sim.state.over; i++) sim.step(DT, input);
}
function waitPuck(sim, max = 6) {
  for (let i = 0; i < max / DT && sim.state.puck.owner !== sim.state.me && !sim.state.over; i++) sim.step(DT, {});
  assert.equal(sim.state.puck.owner, sim.state.me, 'le joueur doit recevoir la passe');
}
function runUntilOver(sim, max = 8) {
  for (let i = 0; i < max / DT && !sim.state.over; i++) sim.step(DT, {});
  return sim.state.over;
}

test('le joueur reçoit la passe du passeur', () => {
  for (const s of SCENARIOS) {
    const sim = createSim(s, U9, 'R');
    waitPuck(sim);
  }
});

test('passe au coéquipier démarqué : il la reçoit (u9-1)', () => {
  const sim = createSim(scn('u9-1'), U9, 'R', () => 0.5);
  waitPuck(sim);
  const mate = sim.state.actors.find((a) => a.num === 9);
  const info = sim.release(angleTo(sim.blade(sim.state.me), mate), 0.4);
  assert.equal(info.chosen.key, 'pass:9');
  assert.equal(info.grade, 2);
  for (let i = 0; i < 3 / DT && sim.state.puck.owner !== mate && !sim.state.over; i++) sim.step(DT, {});
  assert.equal(sim.state.puck.owner, mate);
});

test('2 contre 1 : la passe au n°19 mène à un but (u11-1)', () => {
  const sim = createSim(scn('u11-1'), U11, 'R', () => 0.5);
  waitPuck(sim);
  run(sim, 0.8); // le défenseur s'approche
  const mate = sim.state.actors.find((a) => a.num === 19);
  sim.release(angleTo(sim.blade(sim.state.me), mate), 0.5);
  const over = runUntilOver(sim);
  assert.equal(over?.type, 'goal', JSON.stringify(over));
});

test('tir dans un coin depuis l’enclave : but ; tir sur le gardien : arrêt (u9-3)', () => {
  const corner = createSim(scn('u9-3'), U9, 'R');
  waitPuck(corner);
  const info = corner.release(angleTo(corner.blade(corner.state.me), { x: 0.7, z: 26 }), 1);
  assert.ok(info.isShot);
  assert.equal(runUntilOver(corner)?.type, 'goal');

  const center = createSim(scn('u9-3'), U9, 'R');
  waitPuck(center);
  const g = center.state.goalie;
  center.release(angleTo(center.blade(center.state.me), { x: g.x, z: 26 }), 0.2);
  assert.equal(runUntilOver(center)?.type, 'save');
});

test('rester immobile avec le palet face au défenseur : il le prend (u9-1)', () => {
  const sim = createSim(scn('u9-1'), U9, 'R');
  waitPuck(sim);
  const over = runUntilOver(sim, 15);
  assert.equal(over?.type, 'stolen');
});

test('passe en revers : moins forte que le coup droit', () => {
  const mk = (hand) => {
    const sim = createSim(scn('u9-1'), U9, hand, () => 0.5);
    waitPuck(sim);
    const me = sim.state.me;
    // Passe à 60° sur la droite du joueur
    return sim.release(me.yaw - 1.05, 0.5);
  };
  const right = mk('R');
  const left = mk('L');
  assert.equal(right.backhand, false);
  assert.equal(left.backhand, true);
  assert.ok(left.speed < right.speed);
});

test('patiner : le doigt appuyé fait avancer, le glissement fait tourner', () => {
  const sim = createSim(scn('u9-2'), U9, 'R');
  const me = sim.state.me;
  const z0 = me.z;
  const yaw0 = me.yaw;
  run(sim, 1, { skate: true, turn: 0 });
  assert.ok(me.z > z0 + 2, 'le joueur avance vers le but');
  run(sim, 0.5, { skate: true, turn: 1 });
  assert.ok(me.yaw < yaw0 - 0.5, 'glisser à droite tourne à droite');
});

test('autant de joueurs droitiers que gauchers dans chaque équipe et sur la glace', async () => {
  const { DEFENSE_SCENARIOS } = await import('../src/scenarios.js');
  for (const s of [...SCENARIOS, ...DEFENSE_SCENARIOS]) {
    const sim = createSim(s, U9, 'R');
    const skaters = sim.state.actors.filter((a) => !a.goalie);
    const gap = (list) => Math.abs(list.filter((a) => a.hand === 'R').length - list.filter((a) => a.hand === 'L').length);
    for (const team of [true, false]) assert.ok(gap(skaters.filter((a) => a.team === team)) <= 1, `${s.id} équipe ${team}`);
    assert.ok(gap(skaters) <= 1, `${s.id} sur la glace`);
  }
});

test('rotation exponentielle : douce au début, demi-tour rapide pouce à fond', async () => {
  const { turnRate } = await import('../src/sim.js');
  assert.ok(turnRate(0.3) < 0.5, 'petit écart = rotation douce');
  assert.ok(turnRate(0.6) < turnRate(1) / 2.5, 'la rotation accélère fortement vers 90°');
  const sim = createSim(scn('u9-2'), U9, 'R');
  const yaw0 = sim.state.me.yaw;
  let t = 0;
  while (Math.abs(Math.atan2(Math.sin(sim.state.me.yaw - yaw0), Math.cos(sim.state.me.yaw - yaw0))) < Math.PI * 0.97 && t < 3) {
    sim.step(DT, { skate: true, turn: 1 });
    t += DT;
  }
  assert.ok(t < 1, `demi-tour en ${t.toFixed(2)} s`);
});

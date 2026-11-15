import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFENSE_SCENARIOS, LEVELS } from '../src/scenarios.js';
import { createSim, angleTo } from '../src/sim.js';

// 1 contre 1 en U9 : un seul attaquant, qui a le palet.
const scn = DEFENSE_SCENARIOS.find((d) => d.id === 'd-u9-1');
const U9 = LEVELS.find((l) => l.id === 'U9');

function setup({ carrier, me, yaw, speed = 0, carrierTo }) {
  const sim = createSim(scn, U9, 'R', () => 0.5);
  const st = sim.state;
  const c = st.puck.owner;
  Object.assign(c, carrier, { vx: 0, vz: 0 });
  if (carrierTo) c.to = carrierTo;
  Object.assign(st.me, me, { yaw, speed, head: 0 });
  return { sim, st, c };
}
const run = (sim, input, sec) => {
  for (let i = 0; i < sec * 60 && !sim.state.over; i++) sim.step(1 / 60, input);
  return sim.state.over;
};

test('Lever la crosse : tout près du porteur, il perd le palet et on le récupère', () => {
  const { sim, st, c } = setup({ carrier: { x: 0, z: -8 }, me: { x: 1.0, z: -8.3 }, yaw: angleTo({ x: 1, z: -8.3 }, { x: 0, z: -8 }) });
  const r = sim.stickLift();
  assert.equal(r.ok, true);
  assert.equal(st.puck.owner, null, 'le palet est libre');
  assert.ok(c.stunT > 0);
  const over = run(sim, { skate: true, throttle: 0.4 }, 2);
  assert.equal(over && over.type, 'recovered');
  assert.equal(over.how, 'lift');
});

test('Lever la crosse : trop loin, ça ne marche pas', () => {
  const { sim, st } = setup({ carrier: { x: 0, z: -8 }, me: { x: 4, z: -8 }, yaw: -Math.PI / 2 });
  const r = sim.stickLift();
  assert.equal(r.ok, false);
  assert.equal(r.why, 'far');
  assert.ok(st.puck.owner && !st.puck.owner.team);
});

test('Contact le long de la bande, de côté : on le coince et on récupère le palet (valorisé)', () => {
  // Le porteur longe la bande droite (x ≈ 12) vers notre but ; on arrive de l'intérieur, à son épaule
  // (de côté, un peu en arrière), à vitesse moyenne : épaule contre épaule.
  const me = { x: 10.4, z: -3.4 };
  const { sim } = setup({ carrier: { x: 12.1, z: -4 }, me, yaw: angleTo(me, { x: 12.1, z: -5.2 }), speed: 3, carrierTo: { x: 12.1, z: -20 } });
  const over = run(sim, { skate: true, throttle: 0.5 }, 3);
  assert.equal(over && over.type, 'recovered', JSON.stringify(over));
  assert.equal(over.how, 'pin');
});

test('Contact par derrière : pénalité', () => {
  // Le porteur file vers notre but (−z) ; on arrive dans son dos (depuis +z) pour le pousser.
  const { sim } = setup({ carrier: { x: 0, z: -6 }, me: { x: 0, z: -4.2 }, yaw: Math.PI, speed: 4.5, carrierTo: { x: 0, z: -20 } });
  const over = run(sim, { skate: true }, 2);
  assert.equal(over && over.type, 'penalty', JSON.stringify(over));
  assert.equal(over.kind, 'behind');
});

test('Charge à pleine vitesse en glace ouverte : pénalité', () => {
  const { sim } = setup({ carrier: { x: 0, z: -2 }, me: { x: 0, z: -6 }, yaw: 0, speed: 4.8, carrierTo: { x: 0, z: -20 } });
  const over = run(sim, { skate: true }, 2);
  assert.equal(over && over.type, 'penalty', JSON.stringify(over));
  assert.equal(over.kind, 'charge');
});

test('Les joueurs ne se traversent plus', () => {
  const { sim, st, c } = setup({ carrier: { x: 0, z: -2 }, me: { x: 0, z: -6 }, yaw: 0, speed: 1.5, carrierTo: { x: 0, z: -20 } });
  let minD = 9;
  for (let i = 0; i < 120 && !st.over; i++) {
    sim.step(1 / 60, { skate: true, throttle: 0.3 });
    minD = Math.min(minD, Math.hypot(st.me.x - c.x, st.me.z - c.z));
  }
  assert.ok(minD > 0.7, `distance mini ${minD.toFixed(2)}`);
});

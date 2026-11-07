import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFENSE_SCENARIOS, LEVELS } from '../src/scenarios.js';
import { createSim, angleTo, wrap } from '../src/sim.js';

const DT = 1 / 60;
const OWN = { x: 0, z: -26 };
const dn = (q) => Math.hypot(q.x - OWN.x, q.z - OWN.z);
const scn = (id) => DEFENSE_SCENARIOS.find((s) => s.id === id);
const level = (s) => LEVELS.find((l) => l.id === s.level);
const steer = (me, t, skate = true) => ({ skate, turn: Math.max(-1, Math.min(1, -wrap(angleTo(me, t) - me.yaw) * 2.5)) });

// Trois façons de défendre, pour vérifier que le jeu récompense la bonne.
const policies = {
  /** Va à la bonne place (en reculant si elle est derrière), freine à temps, attaque le palet une fois devant le porteur. */
  good: (s) => {
    const { me, puck: p } = s;
    const ideal = s.dutyNow?.ideal;
    const c = p.owner && !p.owner.team ? p.owner : null;
    if (s.scn.duty === 'goalside' && c && Math.hypot(c.x - me.x, c.z - me.z) < 2.5 && dn(me) < dn(c)) return steer(me, p);
    if (!p.owner && Math.hypot(p.x - me.x, p.z - me.z) < 6) return steer(me, p);
    if (!ideal) return { brake: true };
    const d = Math.hypot(ideal.x - me.x, ideal.z - me.z);
    // Freine (double tap) juste assez tôt pour s'arrêter à la bonne place.
    if (d < 0.6 + Math.max(0, me.speed) ** 2 / 20) return { brake: true };
    if (Math.abs(wrap(angleTo(me, ideal) - me.yaw)) > 2.2) {
      return { back: true, turn: Math.max(-1, Math.min(1, -wrap(angleTo(me, ideal) + Math.PI - me.yaw) * 2.5)) };
    }
    return steer(me, ideal);
  },
  /** Fonce sur le palet sans réfléchir. */
  chase: (s) => steer(s.me, s.puck),
  /** Ne bouge pas. */
  idle: () => ({ skate: false }),
};

function play(id, policy) {
  const s = scn(id);
  const sim = createSim(s, level(s), 'R');
  for (let i = 0; i < 40 / DT && !sim.state.over; i++) sim.step(DT, policies[policy](sim.state));
  const st = sim.state;
  return { st, over: st.over, ratio: st.dutyT ? st.dutyOkT / st.dutyT : 0, passes: st.events.filter((e) => e.type === 'oppPass').length };
}

test('chaque situation défensive se termine et commence avec le palet chez l’adversaire', () => {
  for (const s of DEFENSE_SCENARIOS) {
    const sim = createSim(s, level(s), 'R');
    assert.equal(sim.state.puck.owner.team, false, s.id);
    assert.ok(play(s.id, 'idle').over, s.id);
  }
});

test('1 contre 1 : aller au-devant du porteur et piquer le palet fonctionne', () => {
  const r = play('d-u9-1', 'good');
  assert.equal(r.over.type, 'recovered');
  assert.equal(r.over.how, 'poke');
  assert.ok(r.ratio > 0.8);
});

test('1 contre 1 : rester immobile ne récupère pas le palet', () => {
  assert.notEqual(play('d-u9-1', 'idle').over.type, 'recovered');
  assert.equal(play('d-u9-2', 'idle').over.type, 'goalAgainst');
});

test('impossible de piquer le palet par derrière', () => {
  const s = scn('d-u9-2');
  const sim = createSim(s, level(s), 'R');
  const st = sim.state;
  for (let i = 0; i < 20 / DT && !st.over; i++) {
    sim.step(DT, steer(st.me, st.puck));
    if (st.over?.how === 'poke') assert.ok(dn(st.me) <= dn(st.actors.find((a) => a.num === 17)) + 0.6, 'le joueur doit être revenu devant');
  }
});

test('foncer sur le porteur laisse l’attaquant seul : passe et but', () => {
  const r = play('d-u9-3', 'chase');
  assert.ok(r.passes >= 1);
  assert.equal(r.over.type, 'goalAgainst');
  const r2 = play('d-u11-1', 'chase');
  assert.ok(r2.passes >= 1);
  assert.equal(r2.over.type, 'goalAgainst');
});

test('bien marquer son joueur : bon placement et pas de but', () => {
  for (const id of ['d-u11-2', 'd-u13-3']) {
    const r = play(id, 'good');
    assert.ok(r.ratio >= 0.55, `${id} placement ${r.ratio}`);
    assert.notEqual(r.over.type, 'goalAgainst', id);
  }
});

test('lâcher l’écran : on glisse en ralentissant ; double tap : on freine net', () => {
  const s = scn('d-u9-2'); // l'attaquant est loin devant : rien n'interrompt l'action
  const glide = createSim(s, level(s), 'R');
  const brake = createSim(s, level(s), 'R');
  for (const sim of [glide, brake]) for (let i = 0; i < 1.5 / DT; i++) sim.step(DT, { skate: true });
  const v0 = glide.state.me.speed;
  glide.step(DT, {});
  brake.step(DT, { brake: true });
  for (let i = 0; i < 1 / DT; i++) {
    glide.step(DT, {});
    brake.step(DT, {});
  }
  assert.ok(glide.state.me.speed > v0 - 2 && glide.state.me.speed > 3, 'on glisse encore');
  assert.equal(glide.state.over, null);
  assert.equal(brake.state.me.speed, 0, 'arrêté net');
});

test('patiner à reculons', () => {
  const s = scn('d-u9-1');
  const sim = createSim(s, level(s), 'R');
  const z0 = sim.state.me.z;
  for (let i = 0; i < 1 / DT; i++) sim.step(DT, { back: true });
  assert.ok(sim.state.me.z < z0 - 1.5, 'le joueur recule vers son but en restant face au jeu');
});

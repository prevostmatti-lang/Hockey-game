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

test('2 contre 1 : la passe au n°19 mène souvent à un but (u11-1)', async () => {
  const { seededRandom } = await import('../src/generator.js');
  let goals = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const sim = createSim(scn('u11-1'), U11, 'R', seededRandom(seed));
    waitPuck(sim);
    run(sim, 0.8); // le défenseur s'approche
    const mate = sim.state.actors.find((a) => a.num === 19);
    sim.release(angleTo(sim.blade(sim.state.me), mate), 0.5);
    if (runUntilOver(sim)?.type === 'goal') goals += 1;
  }
  assert.ok(goals >= 8, `${goals} buts sur 20`);
});

test('tir dans une cible : verte (ouverte) = but, rouge (couverte) = arrêt (u9-3)', async () => {
  const { seededRandom } = await import('../src/generator.js');
  let openGoals = 0;
  let coveredSaves = 0;
  for (let seed = 1; seed <= 10; seed++) {
    for (const wantOpen of [true, false]) {
      const sim = createSim(scn('u9-3'), U9, 'R', seededRandom(seed));
      waitPuck(sim);
      const zones = sim.zones();
      const z = zones.find((x) => x.open === wantOpen);
      if (!z) continue;
      const info = sim.release(0, 0.6, { zone: z.id });
      assert.ok(info.isShot && info.zone === z.id);
      const over = runUntilOver(sim);
      if (wantOpen && over?.type === 'goal') openGoals += 1;
      if (!wantOpen && over?.type === 'save') coveredSaves += 1;
    }
  }
  assert.ok(openGoals >= 7, `cibles vertes : ${openGoals} buts sur 10`);
  assert.ok(coveredSaves >= 7, `cibles rouges : ${coveredSaves} arrêts sur 10`);
});

test('gardien en papillon près du but : le bas est fermé, les coins hauts sont ouverts', async () => {
  const { zoneStatus } = await import('../src/sim.js');
  const z = Object.fromEntries(zoneStatus({ x: 0, butterfly: true }).map((x) => [x.id, x.open]));
  assert.deepEqual(z, { HG: true, HD: true, BG: false, BD: false, J: false });
  const st = Object.fromEntries(zoneStatus({ x: 0, butterfly: false }).map((x) => [x.id, x.open]));
  assert.equal(st.J, true, 'debout : entre les jambières ouvert');
});

test('passe levée : elle passe au-dessus des crosses', async () => {
  const sim = createSim(scn('u9-1'), U9, 'R', () => 0.5);
  waitPuck(sim);
  const mate = sim.state.actors.find((a) => a.num === 9);
  const info = sim.release(angleTo(sim.blade(sim.state.me), mate), 0.5, { lifted: true });
  assert.ok(info.lifted);
  let maxY = 0;
  for (let i = 0; i < 30; i++) {
    sim.step(DT, {});
    maxY = Math.max(maxY, sim.state.puck.y);
  }
  assert.ok(maxY > 0.35, `hauteur max ${maxY.toFixed(2)} m`);
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
  // Passe vers la droite : revers pour un droitier (palette à droite, coup droit vers la gauche),
  // coup droit pour un gaucher.
  const right = mk('R');
  const left = mk('L');
  assert.equal(right.backhand, true);
  assert.equal(left.backhand, false);
  assert.ok(right.speed < left.speed);
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

test('rotation exponentielle : douce au début, demi-tour en moins de 2 s pouce à fond', async () => {
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
  assert.ok(t < 2, `demi-tour en ${t.toFixed(2)} s`);
});

test('la cage n’apparaît que pour un swipe vers le but, pas pour une passe', () => {
  for (const id of ['u9-3', 'u13-1', 'u11-1']) {
    const s = scn(id);
    const lv = { U9, U11 }[s.level] || U9;
    const sim = createSim(s, lv, 'R', () => 0.5);
    waitPuck(sim);
    const from = sim.blade(sim.state.me);
    assert.ok(sim.wouldShoot(angleTo(from, { x: 0, z: 26 })), `${id} : swipe vers le but = tir`);
    for (const m of sim.state.actors.filter((a) => a.team && a.role !== 'passer')) {
      assert.ok(!sim.wouldShoot(angleTo(from, m)), `${id} : swipe vers le n°${m.num} = passe`);
    }
    assert.ok(!sim.wouldShoot(angleTo(from, { x: 0, z: 26 }) + 0.6), `${id} : swipe à côté = pas de cage`);
  }
});

test('une-deux : passer puis se démarquer vers le but, le coéquipier rend le palet (u9-1)', () => {
  const sim = createSim(scn('u9-1'), U9, 'R', () => 0.5);
  waitPuck(sim);
  const st = sim.state;
  const mate = st.actors.find((a) => a.num === 9);
  sim.release(angleTo(sim.blade(st.me), mate), 0.4);
  // le joueur fonce vers le but, du côté libre
  let back = false;
  for (let i = 0; i < 6 / DT && !st.over; i++) {
    const tgt = { x: 2, z: 18 };
    const turn = Math.max(-1, Math.min(1, -Math.atan2(Math.sin(angleTo(st.me, tgt) - st.me.yaw), Math.cos(angleTo(st.me, tgt) - st.me.yaw)) * 2));
    sim.step(DT, { skate: true, turn });
    if (st.returned && st.puck.owner === st.me) {
      back = true;
      break;
    }
  }
  assert.ok(back, 'le n°9 a rendu le palet');
});

test('une-deux : si le joueur reste immobile et marqué, le coéquipier ne rend pas le palet', () => {
  const sim = createSim(scn('u9-1'), U9, 'R', () => 0.5);
  waitPuck(sim);
  const st = sim.state;
  const mate = st.actors.find((a) => a.num === 9);
  sim.release(angleTo(sim.blade(st.me), mate), 0.4);
  for (let i = 0; i < 1.5 / DT && !st.over; i++) sim.step(DT, {});
  assert.ok(!st.returned, 'pas de une-deux sans se démarquer');
});

test('changement de sens avant ↔ arrière quasi immédiat', () => {
  const sim = createSim(scn('u9-2'), U9, 'R');
  const me = sim.state.me;
  for (let i = 0; i < 1 / DT; i++) sim.step(DT, { back: true });
  assert.ok(me.speed < -2);
  let t = 0;
  while (me.speed < 0 && t < 2) {
    sim.step(DT, { skate: true });
    t += DT;
  }
  assert.ok(t < 0.3, `repart en avant en ${t.toFixed(2)} s`);
});

test('hors-jeu : les coéquipiers attendent le palet à la ligne bleue, et entrer avant lui est sifflé', async () => {
  const { SCENARIOS: ALL, DEFENSE_SCENARIOS } = await import('../src/scenarios.js');
  // Aucune situation ne démarre en hors-jeu à la décision (positions finales)
  for (const s of ALL) {
    if (s.me.z < 7.5) for (const t of s.teammates) assert.ok((t.to || t).z <= 7.5, `${s.id} : n°${t.num} hors-jeu`);
  }
  // Le joueur qui entre seul dans la zone avant le palet porté par un coéquipier : hors-jeu
  const sim = createSim(scn('u11-3'), U11, 'R', () => 0.5);
  waitPuck(sim);
  const mate = sim.state.actors.find((a) => a.num === 4);
  sim.release(angleTo(sim.blade(sim.state.me), mate), 0.4);
  for (let i = 0; i < 2 / DT && sim.state.puck.owner !== mate; i++) sim.step(DT, {});
  // je fonce dans la zone pendant que le n°4 a le palet en zone neutre
  sim.state.me.x = 0; sim.state.me.z = 10;
  Object.assign(sim.state.puck, { owner: null, x: -11, z: 6.5, vx: 0, vz: 6, team: true, releasedBy: mate, releaseT: sim.state.t, shot: false });
  for (let i = 0; i < 1 / DT && !sim.state.over; i++) sim.step(DT, {});
  assert.equal(sim.state.over?.type, 'offside');
  // En défense, les attaquants attendent que le porteur entre dans la zone
  const d = createSim(DEFENSE_SCENARIOS.find((x) => x.id === 'd-u11-1'), U11, 'R', () => 0.5);
  for (let i = 0; i < 6 / DT && !d.state.over; i++) d.step(DT, {});
  assert.notEqual(d.state.over?.type, 'offside');
});

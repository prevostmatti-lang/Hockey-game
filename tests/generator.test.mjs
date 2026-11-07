import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, DEFENSE_SCENARIOS, LEVELS } from '../src/scenarios.js';
import { makeVariant, seededRandom } from '../src/generator.js';
import { evaluate } from '../src/evaluate.js';
import { createSim } from '../src/sim.js';

test('les variantes d’attaque gardent la même meilleure option (200 tirages)', () => {
  const rand = seededRandom(42);
  for (let i = 0; i < 200; i++) {
    const base = SCENARIOS[i % SCENARIOS.length];
    const v = makeVariant(base, rand);
    assert.equal(evaluate(v).best.key, v.expect, `${base.id} → ${JSON.stringify(v)}`);
  }
});

test('les variantes changent vraiment la situation (miroir, numéros)', () => {
  const rand = seededRandom(7);
  const base = SCENARIOS[0];
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const v = makeVariant(base, rand);
    seen.add(`${Math.sign(v.me.x)}|${v.teammates[0].num}`);
  }
  assert.ok(seen.size >= 4, `trop peu de variété : ${[...seen]}`);
});

test('les variantes de défense restent jouables et cohérentes', () => {
  const rand = seededRandom(3);
  for (const base of DEFENSE_SCENARIOS) {
    const v = makeVariant(base, rand);
    const [kind, num] = v.duty.split(':');
    if (num) assert.ok(v.opponents.some((o) => o.num === Number(num)), `${v.id} : mission vers un joueur absent`);
    for (const t of v.teammates) if (t.mark != null) assert.ok(v.opponents.some((o) => o.num === t.mark), `${v.id} : marquage orphelin`);
    const sim = createSim(v, LEVELS[0], 'R');
    for (let k = 0; k < 600 && !sim.state.over; k++) sim.step(1 / 60, {});
    assert.ok(kind);
  }
});

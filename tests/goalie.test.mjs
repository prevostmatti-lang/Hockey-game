import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneStatus, rollGoalieStyle } from '../src/sim.js';
import { seededRandom } from '../src/generator.js';

const keeperFor = (from, style, extra = {}) => {
  // placement du gardien comme dans la simulation : sur la bissectrice, + son style (poteau proche)
  const d = Math.hypot(from.x, 26 - from.z) || 1;
  let x = (from.x / d) * 0.8;
  if (Math.abs(from.x) > 1) x += Math.sign(from.x) * style.cheat * Math.min(1, Math.abs(from.x) / 5);
  x = Math.max(-0.8, Math.min(0.8, x));
  return { x, z: 25.2, style, ...extra };
};

test('Gardien : les espaces ouverts changent d’une action à l’autre', () => {
  const rand = seededRandom(3);
  const patterns = new Set();
  for (let i = 0; i < 60; i++) {
    const st = rollGoalieStyle(rand);
    const z = zoneStatus(keeperFor({ x: 0, z: 16 }, st), { x: 0, z: 16 });
    const open = z.filter((o) => o.open).map((o) => o.id).join(',');
    assert.ok(open.length > 0, 'face au but, debout : au moins une cible ouverte');
    patterns.add(open);
  }
  assert.ok(patterns.size >= 6, `variété des espaces : ${patterns.size} combinaisons`);
});

test('Gardien : angles cohérents (tir de côté → le côté éloigné s’ouvre plus souvent)', () => {
  const rand = seededRandom(9);
  let near = 0;
  let far = 0;
  for (let i = 0; i < 200; i++) {
    const sgn = rand() < 0.5 ? -1 : 1;
    const from = { x: 6 * sgn, z: 15 };
    const z = zoneStatus(keeperFor(from, rollGoalieStyle(rand)), from);
    for (const o of z) {
      if (o.five) continue;
      if (Math.sign(o.x) === sgn) near += o.open;
      else far += o.open;
    }
  }
  assert.ok(far > near * 1.3, `côté éloigné ${far} / côté proche ${near}`);
});

test('Gardien collé au poteau (angle fermé) : côté proche fermé, haut éloigné ouvert', () => {
  const st = rollGoalieStyle(seededRandom(1));
  const from = { x: 7, z: 22 };
  const z = zoneStatus({ x: 0.75, z: 25.2, style: st, butterfly: true, post: 1 }, from);
  for (const o of z) if (!o.five && o.x > 0) assert.equal(o.open, false, o.id);
  assert.ok(z.some((o) => o.x < 0 && o.y > 0.5 && o.open), 'coin haut éloigné ouvert');
});

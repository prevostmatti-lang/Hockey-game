import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, DEFENSE_SCENARIOS } from '../src/scenarios.js';
import { buildSoutien, buildDuel, buildMarquage } from '../src/drills.js';
import { seededRandom } from '../src/generator.js';

test('« Lis le jeu » : chaque essai a une seule bonne réponse, bien distincte', () => {
  const rand = seededRandom(5);
  for (const lv of ['U9', 'U11', 'U13']) {
    const pool = SCENARIOS.filter((s) => s.level === lv);
    let ok = 0;
    for (let i = 0; i < 30; i++) {
      const s = buildSoutien(rand, pool);
      if (!s) continue;
      ok++;
      assert.equal(s.options.filter((o) => o.ok).length, 1);
      for (const a of s.options) for (const b of s.options) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 3);
      const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      // tu pars marqué : un défenseur est collé à toi
      assert.ok(s.scn.opponents.some((o) => !o.goalie && D(o, s.me) < 1.6), 'TOI part marqué');
      // la bonne place ne gêne pas un coéquipier, et il faut bouger pour l'atteindre
      const good = s.options.find((o) => o.ok);
      for (const t of s.scn.teammates) if (!t.goalie) assert.ok(D(good, t.to || t) > 4, 'bonne place loin des coéquipiers');
      assert.ok(D(good, s.me) >= 3.5);
      // le numéro du porteur est unique dans la scène
      assert.ok(![...s.scn.teammates, ...s.scn.opponents].some((p) => p.num === s.carrierNum));
    }
    assert.ok(ok >= 25, `${lv} : soutien trouvé ${ok}/30`);
    const d = buildDuel(rand);
    assert.equal(d.options.filter((o) => o.ok).length, 1);
  }
  const markPool = DEFENSE_SCENARIOS.filter((x) => String(x.duty).startsWith('mark'));
  for (let i = 0; i < 30; i++) {
    const m = buildMarquage(rand, markPool);
    assert.ok(m.opps.some((o) => o.num === m.answerNum), 'le joueur à surveiller existe');
  }
});

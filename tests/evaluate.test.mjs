import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, LEVELS } from '../src/scenarios.js';
import { evaluate, gradeDecision } from '../src/evaluate.js';

for (const scn of SCENARIOS) {
  test(`${scn.id} – la meilleure option est ${scn.expect}`, () => {
    const { best, options } = evaluate(scn);
    assert.equal(best.key, scn.expect, JSON.stringify(options.map((o) => [o.key, o.score, o.reason])));
    // La meilleure option doit se détacher nettement des autres.
    const second = options.filter((o) => o !== best).reduce((a, b) => Math.max(a, b.score), 0);
    assert.ok(best.score - second >= 10, `écart trop faible (${best.score} vs ${second})`);
  });
}

test('chaque catégorie a au moins 3 situations', () => {
  for (const l of LEVELS) assert.ok(SCENARIOS.filter((s) => s.level === l.id).length >= 3, l.id);
});

test('la note de décision', () => {
  const best = { score: 85 };
  assert.equal(gradeDecision({ score: 84 }, best), 2);
  assert.equal(gradeDecision({ score: 60 }, best), 1);
  assert.equal(gradeDecision({ score: 10 }, best), 0);
  assert.equal(gradeDecision({ type: 'timeout', score: 0 }, best), 0);
});

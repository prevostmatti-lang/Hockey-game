import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendar, weekOf, blockOf, isHoliday, sessionPlan, scaledLevel, PROGRAM_WEEKS } from '../src/program.js';
import { LEVELS } from '../src/scenarios.js';

test('le calendrier commence le lundi 9 novembre 2026 et finit fin avril 2027', () => {
  const cal = calendar();
  assert.equal(cal.length, PROGRAM_WEEKS);
  assert.equal(cal[0].start.toDateString(), new Date(2026, 10, 9).toDateString());
  const last = cal[cal.length - 1].start;
  assert.equal(last.getFullYear(), 2027);
  assert.equal(last.getMonth(), 3); // avril
});

test('les vacances de Noël sont libres, toutes les autres semaines ont un bloc', () => {
  assert.equal(weekOf(new Date(2026, 11, 24)), 7);
  assert.ok(isHoliday(7) && isHoliday(8));
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    if (!isHoliday(w)) assert.ok(blockOf(w), `semaine ${w} sans bloc`);
  }
  assert.equal(weekOf(new Date(2026, 10, 1)), 0);
});

test('chaque séance dure exactement 15 minutes', () => {
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    if (isHoliday(w)) continue;
    for (const l of ['A', 'B', 'C']) {
      const total = sessionPlan(w, l).segments.reduce((a, s) => a + s.seconds, 0);
      assert.equal(total, 15 * 60, `semaine ${w} ${l}`);
    }
  }
});

test('la difficulté augmente au fil des blocs', () => {
  const base = LEVELS[0];
  const easy = scaledLevel(base, 0);
  const hard = scaledLevel(base, 3);
  assert.ok(hard.time < easy.time);
  assert.ok(hard.presser > easy.presser);
  assert.ok(hard.assist < easy.assist);
  assert.ok(sessionPlan(22, 'A').segments[2].decisionTime < sessionPlan(1, 'A').segments[2].decisionTime);
});

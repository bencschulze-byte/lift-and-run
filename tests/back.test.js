import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateBack, backSummary } from '../src/engine/back.js';
import { createProgramDocument } from '../src/engine/defaults.js';

const session = (date, dayIndex, back) => ({ id: `${date}-${dayIndex}`, date, dayIndex, kind: 'lift', finishedAt: `${date}T18:00:00Z`, back });

test('a rating lands on the session and marks it edited', () => {
  const d = { ...createProgramDocument({ today: '2026-09-21' }), sessions: [session('2026-09-21', 0)] };
  const rated = rateBack(d, '2026-09-21-0', 'bit', new Date('2026-09-21T19:00:00Z'));
  assert.equal(rated.sessions[0].back, 'bit');
  assert.equal(rated.sessions[0].editedAt, '2026-09-21T19:00:00.000Z');
  assert.equal(d.sessions[0].back, undefined, 'the original is untouched');
  assert.equal(rateBack(rated, '2026-09-21-0', 'bit').sessions[0].back, null, 'tapping it again clears it');
});

test('the summary shows which workout tends to end sore', () => {
  const d = {
    ...createProgramDocument({ today: '2026-09-21' }),
    sessions: [
      session('2026-09-21', 0, 'fine'), session('2026-09-24', 3, 'sore'),
      session('2026-09-28', 0, 'fine'), session('2026-10-01', 3, 'bit'),
      session('2026-10-02', 4, 'fine'), session('2026-10-03', 5),
    ],
  };
  const s = backSummary(d);
  assert.equal(s.total, 5, 'unrated sessions are left out');
  assert.equal(s.sore, 2);
  assert.deepEqual(s.byWorkout[0], { name: 'Lower B', rated: 2, sore: 2 });
  assert.deepEqual(s.recent.map((r) => r.dayName), ['Mon', 'Thu', 'Mon', 'Thu', 'Fri']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftSeries } from '../src/ui/history.js';

const entry = (result, sets) => ({ exerciseId: 'bench-press', slotId: 'upperA-main', role: 'main', result, sets });

test('calibration days stay off the progress chart', () => {
  const doc = {
    deloads: [],
    sessions: [
      // The ramp went up to 205 to find the 5RM; work starts at 180.
      { id: 'a', date: '2026-09-15', exercises: [entry('calibration', [
        { weight: 135, reps: 5 }, { weight: 175, reps: 5 }, { weight: 205, reps: 5 },
      ])] },
      { id: 'b', date: '2026-09-22', exercises: [entry('success', [{ weight: 180, reps: 5 }, { weight: 180, reps: 5 }])] },
      { id: 'c', date: '2026-09-29', exercises: [entry('success', [{ weight: 185, reps: 5 }])] },
    ],
  };
  const points = liftSeries(doc, 'bench-press');
  assert.deepEqual(points.map((p) => p.date), ['2026-09-22', '2026-09-29']);
  assert.deepEqual(points.map((p) => p.weight), [180, 185], 'the line only ever shows working weight');
});

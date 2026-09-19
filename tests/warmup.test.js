import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampSets, restSecondsFor } from '../src/engine/warmup.js';
import { EXERCISE_BY_ID } from '../src/engine/defaults.js';

const lb = { barWeight: 45, plates: [45, 35, 25, 10, 5, 2.5], microplates: false };

test('main lift ramp: empty bar then 40/60/80 percent', () => {
  const sets = rampSets(135, EXERCISE_BY_ID['back-squat'], lb);
  assert.deepEqual(sets.map((s) => [s.weight, s.reps]), [
    [45, 5],
    [50, 3],
    [80, 2],
    [105, 1],
  ]);
  assert.ok(sets.every((s) => s.ramp && s.weight < 135));
});

test('secondary lift ramp is two sets: 50 and 75 percent', () => {
  const sets = rampSets(100, EXERCISE_BY_ID['romanian-deadlift'], lb);
  assert.deepEqual(sets.map((s) => [s.weight, s.reps]), [
    [50, 5],
    [75, 3],
  ]);
});

test('a working weight at the empty bar needs no ramp', () => {
  assert.deepEqual(rampSets(45, EXERCISE_BY_ID['back-squat'], lb), []);
});

test('accessories get no ramp', () => {
  assert.deepEqual(rampSets(50, EXERCISE_BY_ID['leg-curl'], lb), []);
});

test('chin-up ramp is bodyweight then half the belt load', () => {
  const sets = rampSets(25, EXERCISE_BY_ID['weighted-chinup'], lb);
  assert.deepEqual(sets.map((s) => [s.weight, s.reps]), [[0, 5], [12.5, 3]]);
  assert.deepEqual(rampSets(0, EXERCISE_BY_ID['weighted-chinup'], lb).map((s) => s.weight), [0]);
});

test('rest per role matches the time budget', () => {
  assert.equal(restSecondsFor('main'), 180);
  assert.equal(restSecondsFor('secondary'), 120);
  assert.equal(restSecondsFor('accessory'), 75);
});

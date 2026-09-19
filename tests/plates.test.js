import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plateBreakdown, roundDownToPlates, roundForLoadType, nextDumbbell,
  roundDownToDumbbell, smallestBarbellStep, smallestStep, DEFAULT_PLATES,
} from '../src/engine/plates.js';

const lb = { barWeight: 45, plates: DEFAULT_PLATES, microplates: false };
const micro = { ...lb, microplates: true };

test('plate breakdown per side', () => {
  assert.deepEqual(plateBreakdown(135, lb).perSide, [45], '135 = bar + one 45 per side');
  assert.deepEqual(plateBreakdown(225, lb).perSide, [45, 45]);
  assert.equal(plateBreakdown(225, lb).total, 225);
  assert.deepEqual(plateBreakdown(185, lb).perSide, [45, 25]);
  assert.deepEqual(plateBreakdown(95, lb).perSide, [25]);
});

test('the empty bar and anything under it is just the bar', () => {
  assert.equal(roundDownToPlates(45, lb), 45);
  assert.equal(roundDownToPlates(30, lb), 45);
  assert.deepEqual(plateBreakdown(45, lb).perSide, []);
});

test('rounding down to loadable weight', () => {
  // The spec's example: 0.875 x 135 = 118.125 -> 115 with the default plates.
  assert.equal(roundDownToPlates(135 * 0.875, lb), 115);
  assert.equal(roundDownToPlates(118.125, micro), 117.5);
  assert.equal(roundDownToPlates(137, lb), 135);
  assert.equal(roundDownToPlates(137, micro), 135);
  assert.equal(roundDownToPlates(138, micro), 137.5);
});

test('default plate set gives 5 lb granularity, microplates 2.5', () => {
  assert.equal(smallestBarbellStep(lb), 5);
  assert.equal(smallestBarbellStep(micro), 2.5);
});

test('dumbbell ladder', () => {
  assert.equal(roundDownToDumbbell(22, lb), 20);
  assert.equal(roundDownToDumbbell(4, lb), 5);
  assert.equal(nextDumbbell(20, lb), 25);
  assert.equal(nextDumbbell(100, lb), 100, 'caps at the top of the rack');
});

test('rounding respects the kind of load', () => {
  assert.equal(roundForLoadType(118.125, 'barbell', lb), 115);
  assert.equal(roundForLoadType(118.125, 'machine', lb), 115);
  assert.equal(roundForLoadType(22, 'dumbbell', lb), 20);
  assert.equal(roundForLoadType(6, 'belt', lb), 5);
  assert.equal(roundForLoadType(6, 'belt', micro), 5, 'belt takes 1.25 steps with microplates');
  assert.equal(roundForLoadType(7, 'belt', micro), 6.25);
  assert.equal(roundForLoadType(0, 'belt', lb), 0, 'bodyweight chin-ups are a valid prescription');
  assert.equal(roundForLoadType(50, 'bodyweight', lb), 0);
});

test('smallest step per load type', () => {
  assert.equal(smallestStep('barbell', lb), 5);
  assert.equal(smallestStep('barbell', micro), 2.5);
  assert.equal(smallestStep('belt', lb), 2.5);
  assert.equal(smallestStep('dumbbell', lb), 5);
  assert.equal(smallestStep('bodyweight', lb), 0);
});

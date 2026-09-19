import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startCalibration, applyFeedback, finishCalibration, nextSet, restSeconds,
  stopHere, suggestsPulldownSwap, MAX_RAMP_SETS,
} from '../src/engine/calibration.js';
import { EXERCISE_BY_ID } from '../src/engine/defaults.js';

const lb = { barWeight: 45, plates: [45, 35, 25, 10, 5, 2.5], microplates: false };
const squat = EXERCISE_BY_ID['back-squat'];

function run(exercise, feedbacks, settings = lb) {
  let state = startCalibration(exercise, settings);
  for (const f of feedbacks) state = applyFeedback(state, f, settings);
  return state;
}

test('the ramp starts at the lift start weight and adds the jump', () => {
  const state = run(squat, ['easy', 'easy']);
  assert.deepEqual(state.sets.map((s) => s.weight), [45, 65]);
  assert.equal(nextSet(state).weight, 85);
  assert.equal(nextSet(state).reps, 5);
});

test('RPE 8 halves the ramp jump, rounded to loadable weight', () => {
  const state = run(squat, ['easy', 'easy', 'hard']);
  assert.equal(state.jump, 10);
  assert.equal(nextSet(state).weight, 95);
  const again = applyFeedback(state, 'hard', lb);
  assert.equal(again.jump, 5, 'a second RPE 8 halves it again');
});

test('the jump never falls below one loadable step', () => {
  const ohp = EXERCISE_BY_ID['overhead-press'];
  let state = run(ohp, ['hard', 'hard', 'hard']);
  assert.equal(state.jump, 5, 'without microplates the bar moves in 5s');
});

test('rest is 2 min early and 3 min once the work gets hard', () => {
  assert.equal(restSeconds(startCalibration(squat, lb)), 120);
  assert.equal(restSeconds(run(squat, ['easy'])), 120);
  assert.equal(restSeconds(run(squat, ['moderate'])), 180);
});

test('near max stops the ramp and that weight is the 5RM', () => {
  const state = run(squat, ['easy', 'easy', 'moderate', 'nearmax']);
  assert.equal(state.done, true);
  const out = finishCalibration(state, squat, lb, new Date('2026-09-21T10:00:00Z'));
  assert.equal(out.fiveRM, 105);
  assert.equal(out.e1RM, 122.5);
  assert.equal(out.workingWeight, 90, '0.875 x 105 = 91.9 rounds down to 90');
  assert.equal(out.calibratedAt, '2026-09-21');
  assert.equal(out.capped, false);
});

test('a failed set means the previous completed weight is the 5RM', () => {
  const state = run(squat, ['easy', 'easy', 'hard', 'failed']);
  assert.equal(state.done, true);
  const out = finishCalibration(state, squat, lb);
  assert.equal(out.fiveRM, 85);
  assert.equal(out.workingWeight, 70, '0.875 x 85 = 74.4 rounds down to 70');
});

test('failing the very first set asks for a lighter start', () => {
  const state = run(squat, ['failed']);
  assert.equal(state.failedFirstSet, true);
  const out = finishCalibration(state, squat, lb);
  assert.equal(out.needsLighterStart, true);
  assert.equal(out.workingWeight, null);
});

test('eight ramp sets caps the calibration', () => {
  const state = run(squat, Array(MAX_RAMP_SETS).fill('easy'));
  assert.equal(state.sets.length, MAX_RAMP_SETS);
  assert.equal(state.done, true);
  assert.equal(state.capped, true);
  const out = finishCalibration(state, squat, lb);
  assert.equal(out.capped, true);
  assert.equal(out.fiveRM, 185, '45 + 7 jumps of 20');
});

test('stop here uses the last completed weight', () => {
  const state = stopHere(run(squat, ['easy', 'easy']));
  assert.equal(state.done, true);
  assert.equal(finishCalibration(state, squat, lb).fiveRM, 65);
});

test('calibrating a lift never mutates the state passed in', () => {
  const first = startCalibration(squat, lb);
  applyFeedback(first, 'easy', lb);
  assert.equal(first.sets.length, 0);
});

test('deadlift and chin-up use their own start weights and jumps', () => {
  const dl = run(EXERCISE_BY_ID['deadlift'], ['easy']);
  assert.equal(dl.sets[0].weight, 95);
  assert.equal(nextSet(dl).weight, 115);

  const chin = run(EXERCISE_BY_ID['weighted-chinup'], ['easy']);
  assert.equal(chin.sets[0].weight, 0, 'starts at bodyweight');
  assert.equal(nextSet(chin).weight, 5);
});

test('bodyweight chin-ups at RPE 9 suggest the lat pulldown swap', () => {
  const chin = EXERCISE_BY_ID['weighted-chinup'];
  assert.equal(suggestsPulldownSwap(run(chin, ['nearmax']), chin), true);
  assert.equal(suggestsPulldownSwap(run(chin, ['failed']), chin), true);
  assert.equal(suggestsPulldownSwap(run(chin, ['easy']), chin), false);
  assert.equal(suggestsPulldownSwap(run(squat, ['nearmax']), squat), false);
});

test('unilateral calibration is flagged as per leg', () => {
  const bss = EXERCISE_BY_ID['bulgarian-split-squat'];
  const state = startCalibration(bss, lb);
  assert.equal(nextSet(state).perLeg, true);
  assert.equal(nextSet(state).weight, 20);
  assert.equal(nextSet(applyFeedback(state, 'easy', lb)).weight, 30);
});

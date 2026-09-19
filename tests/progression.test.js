import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLift, nextPrescription, nextAccessoryPrescription, incrementFor,
  isScheduledDeloadWeek, isTriggeredDeloadWeek, isDeloadWeek, deloadWeekWeight,
  prescribedWeight,
} from '../src/engine/progression.js';
import { EXERCISE_BY_ID } from '../src/engine/defaults.js';
import { dayIndexFor, weekIndexFor, mondayOf } from '../src/engine/dates.js';

const lb = { barWeight: 45, plates: [45, 35, 25, 10, 5, 2.5], microplates: false };
const micro = { ...lb, microplates: true };
const squat = EXERCISE_BY_ID['back-squat'];

const sets = (...reps) => reps.map((r) => ({ reps: r }));

test('a session is a success only if every working set hit the reps', () => {
  const rx = { sets: 5, reps: 5 };
  assert.equal(evaluateLift(rx, sets(5, 5, 5, 5, 5)), 'success');
  assert.equal(evaluateLift(rx, sets(5, 5, 5, 5, 4)), 'fail');
  assert.equal(evaluateLift(rx, sets(5, 5, 5, 5)), 'fail', 'a missing set is a fail');
  assert.equal(evaluateLift(rx, sets(5, 5, 5, 5, 6)), 'success', 'extra reps are fine');
});

test('ramp sets do not count toward the working sets', () => {
  const logged = [{ reps: 5, ramp: true }, ...sets(5, 5, 5, 5, 5)];
  assert.equal(evaluateLift({ sets: 5, reps: 5 }, logged), 'success');
});

test('success adds the increment', () => {
  const next = nextPrescription({ current: 135, exercise: squat, failStreak: 0, result: 'success' }, lb);
  assert.deepEqual(next, { weight: 140, failStreak: 0, deloaded: false });
});

test('deadlift moves in 10s, overhead press in 2.5s with microplates', () => {
  assert.equal(incrementFor(EXERCISE_BY_ID['deadlift'], lb), 10);
  assert.equal(incrementFor(EXERCISE_BY_ID['overhead-press'], lb), 5);
  assert.equal(incrementFor(EXERCISE_BY_ID['overhead-press'], micro), 2.5);
  const ohp = nextPrescription(
    { current: 95, exercise: EXERCISE_BY_ID['overhead-press'], failStreak: 0, result: 'success' }, micro,
  );
  assert.equal(ohp.weight, 97.5);
});

test('fail repeats the weight and counts the streak; the third fail deloads 10 percent', () => {
  let state = { current: 135, exercise: squat, failStreak: 0, result: 'fail' };
  const first = nextPrescription(state, lb);
  assert.deepEqual(first, { weight: 135, failStreak: 1, deloaded: false });

  const second = nextPrescription({ ...state, failStreak: first.failStreak }, lb);
  assert.deepEqual(second, { weight: 135, failStreak: 2, deloaded: false });

  const third = nextPrescription({ ...state, failStreak: second.failStreak }, lb);
  assert.equal(third.deloaded, true);
  assert.equal(third.failStreak, 0, 'the streak resets after the deload');
  assert.equal(third.weight, 120, '0.9 x 135 = 121.5 rounds down to 120');
});

test('a success in the middle clears the streak', () => {
  const next = nextPrescription({ current: 135, exercise: squat, failStreak: 2, result: 'success' }, lb);
  assert.equal(next.failStreak, 0);
  assert.equal(next.weight, 140);
});

test('accessory double progression', () => {
  const legCurl = EXERCISE_BY_ID['leg-curl']; // 3 sets of 10-12, step 5
  assert.equal(nextAccessoryPrescription({ current: 60, exercise: legCurl, reps: [12, 12, 12] }, lb).weight, 65);
  assert.equal(nextAccessoryPrescription({ current: 60, exercise: legCurl, reps: [12, 12, 11] }, lb).weight, 60);
  const missed = nextAccessoryPrescription({ current: 60, exercise: legCurl, reps: [12, 10, 9] }, lb);
  assert.equal(missed.weight, 60);
  assert.equal(missed.missed, true);
});

test('dumbbell accessories step to the next dumbbell', () => {
  const raise = EXERCISE_BY_ID['db-lateral-raise'];
  assert.equal(nextAccessoryPrescription({ current: 15, exercise: raise, reps: [12, 12, 12] }, lb).weight, 20);
});

test('bodyweight accessories suggest adding weight instead of stepping', () => {
  const hlr = EXERCISE_BY_ID['hanging-leg-raise'];
  const out = nextAccessoryPrescription({ current: 0, exercise: hlr, reps: [12, 12, 12] }, lb);
  assert.equal(out.weight, 0);
  assert.equal(out.addWeightSuggested, true);
});

test('nordic curls use their own 5-8 rep range', () => {
  const nordic = EXERCISE_BY_ID['nordic-curl'];
  assert.equal(nextAccessoryPrescription({ current: 0, exercise: nordic, reps: [8, 8, 8] }, lb).addWeightSuggested, true);
  assert.equal(nextAccessoryPrescription({ current: 0, exercise: nordic, reps: [8, 8, 7] }, lb).addWeightSuggested, false);
});

test('Monday is day 1', () => {
  assert.equal(dayIndexFor('2026-09-21'), 0);
  assert.equal(dayIndexFor('2026-09-26'), 5);
  assert.equal(dayIndexFor('2026-09-27'), 6);
  assert.equal(mondayOf('2026-09-27'), '2026-09-21');
});

test('every 7th week from the program start is a deload week', () => {
  const start = '2026-09-21'; // a Monday
  assert.equal(weekIndexFor(start, '2026-09-27'), 0);
  for (let w = 0; w < 6; w++) {
    const day = `week ${w}`;
    assert.equal(isScheduledDeloadWeek(start, addWeeks(start, w)), false, day);
  }
  assert.equal(isScheduledDeloadWeek(start, addWeeks(start, 6)), true, 'the 7th week');
  assert.equal(isScheduledDeloadWeek(start, addWeeks(start, 7)), false);
  assert.equal(isScheduledDeloadWeek(start, addWeeks(start, 13)), true, 'and the 14th');
});

test('a mid-week date still resolves to its week', () => {
  const start = '2026-09-23'; // a Wednesday start
  assert.equal(isScheduledDeloadWeek(start, '2026-11-05'), true, 'Thursday of the 7th week');
});

test('two main-lift deloads inside 14 days force the next week to be a deload', () => {
  const deloads = [
    { date: '2026-10-05', exerciseId: 'back-squat', type: 'main' },
    { date: '2026-10-13', exerciseId: 'bench-press', type: 'main' },
  ];
  assert.equal(isTriggeredDeloadWeek(deloads, '2026-10-19'), true, 'the Monday after');
  assert.equal(isTriggeredDeloadWeek(deloads, '2026-10-23'), true, 'still that week');
  assert.equal(isTriggeredDeloadWeek(deloads, '2026-10-12'), false);
  assert.equal(isTriggeredDeloadWeek(deloads, '2026-10-26'), false, 'only one week');
});

test('the same lift deloading twice does not trigger a deload week', () => {
  const deloads = [
    { date: '2026-10-05', exerciseId: 'back-squat', type: 'main' },
    { date: '2026-10-13', exerciseId: 'back-squat', type: 'main' },
  ];
  assert.equal(isTriggeredDeloadWeek(deloads, '2026-10-19'), false);
});

test('deloads more than 14 days apart do not trigger', () => {
  const deloads = [
    { date: '2026-10-05', exerciseId: 'back-squat', type: 'main' },
    { date: '2026-10-25', exerciseId: 'bench-press', type: 'main' },
  ];
  assert.equal(isTriggeredDeloadWeek(deloads, '2026-11-02'), false);
});

test('the dev toggle forces a deload week', () => {
  const doc = { settings: { programStart: '2026-09-21', forceDeloadWeek: true }, deloads: [] };
  assert.equal(isDeloadWeek(doc, '2026-09-22'), true);
  doc.settings.forceDeloadWeek = false;
  assert.equal(isDeloadWeek(doc, '2026-09-22'), false);
});

test('deload week weight is 80 percent, rounded down', () => {
  assert.equal(deloadWeekWeight(135, squat, lb), 105, '0.8 x 135 = 108 rounds down to 105');
  assert.equal(deloadWeekWeight(225, squat, lb), 180);
});

test('a manual override wins over the stored working weight', () => {
  const state = { workingWeight: 135, manualOverride: 150 };
  assert.equal(prescribedWeight(state, squat, {}, lb), 150);
  assert.equal(prescribedWeight({ workingWeight: 135 }, squat, {}, lb), 135);
  assert.equal(prescribedWeight({}, squat, {}, lb), null);
  assert.equal(prescribedWeight(state, squat, { deload: true }, lb), 120);
});

function addWeeks(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

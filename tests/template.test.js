import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFor, planForDayIndex, weekOverview, BUDGET_MIN } from '../src/engine/template.js';
import { createProgramDocument } from '../src/engine/defaults.js';

const MON = '2026-09-21';
const TUE = '2026-09-22';
const WED = '2026-09-23';
const THU = '2026-09-24';
const FRI = '2026-09-25';
const SAT = '2026-09-26';
const SUN = '2026-09-27';

function doc(overrides = {}) {
  const d = createProgramDocument({ today: MON });
  return { ...d, ...overrides, settings: { ...d.settings, ...(overrides.settings ?? {}) } };
}

function calibrated(d, entries) {
  for (const [id, workingWeight] of Object.entries(entries)) {
    d.liftState[id] = { fiveRM: workingWeight / 0.875, workingWeight, failStreak: 0, calibratedAt: MON };
  }
  return d;
}

test('Monday is Lower A with four slots in order', () => {
  const plan = planFor(doc(), MON);
  assert.equal(plan.kind, 'lift');
  assert.equal(plan.name, 'Lower A');
  assert.deepEqual(plan.items.map((i) => i.exerciseId), [
    'back-squat', 'romanian-deadlift', 'leg-curl', 'standing-calf-raise',
  ]);
  assert.deepEqual(plan.items.map((i) => i.role), ['main', 'secondary', 'accessory', 'accessory']);
});

test('the rest of the week follows the template', () => {
  assert.equal(planFor(doc(), TUE).name, 'Upper A');
  assert.equal(planFor(doc(), WED).kind, 'z2');
  assert.equal(planFor(doc(), THU).name, 'Lower B');
  assert.equal(planFor(doc(), FRI).name, 'Upper B');
  assert.equal(planFor(doc(), SAT).kind, 'z5');
  assert.equal(planFor(doc(), SUN).kind, 'z2');
});

test('an uncalibrated lift asks for calibration and has no prescription', () => {
  const squat = planFor(doc(), MON).items[0];
  assert.equal(squat.needsCalibration, true);
  assert.equal(squat.weight, null);
  assert.deepEqual(squat.ramp, []);
});

test('a calibrated lift is prescribed with its ramp and plate math', () => {
  const d = calibrated(doc(), { 'back-squat': 135 });
  const squat = planFor(d, MON).items[0];
  assert.equal(squat.needsCalibration, false);
  assert.equal(squat.weight, 135);
  assert.deepEqual(squat.scheme, { sets: 5, reps: 5 });
  assert.deepEqual(squat.ramp.map((s) => s.weight), [45, 50, 80, 105]);
  assert.equal(squat.restSeconds, 180);
});

test('an accessory with no stored weight asks for a starting weight', () => {
  const plan = planFor(doc(), MON);
  const legCurl = plan.items[2];
  assert.equal(legCurl.needsStartingWeight, true);
  assert.deepEqual(legCurl.scheme, { sets: 3, repMin: 10, repMax: 12 });

  const hlr = planFor(doc(), THU).items[2];
  assert.equal(hlr.needsStartingWeight, false, 'bodyweight accessories do not');
});

test('swapping in another day keeps that day whole', () => {
  const plan = planForDayIndex(doc(), 3, MON);
  assert.equal(plan.name, 'Lower B');
  assert.equal(plan.swapped, true);
  assert.equal(plan.date, MON);
  assert.equal(plan.items[0].exerciseId, 'deadlift');
});

test('a stored swap survives into planFor', () => {
  const d = doc({ swaps: { [WED]: 0 } });
  const plan = planFor(d, WED);
  assert.equal(plan.name, 'Lower A');
  assert.equal(plan.swapped, true);
});

test('a missed day is simply missed: no catch-up', () => {
  const d = doc();
  // Nothing was logged Monday; Tuesday is still Upper A.
  assert.equal(planFor(d, TUE).name, 'Upper A');
});

test('Sunday can be a walk, Wednesday cannot', () => {
  const d = doc({ settings: { sundayWalk: true } });
  assert.equal(planFor(d, SUN).walk, true);
  assert.equal(planFor(d, WED).walk, false);
});

test('Saturday runs the current rung of the zone 5 ladder', () => {
  const d = doc({ cardioState: { z5Step: 2, z5WeeksAtStep: 0 } });
  const plan = planFor(d, SAT);
  assert.equal(plan.intervals, 6);
  assert.equal(plan.totalMinutes, 43);
});

test('a deload week drops every lift to 80 percent for 3x5', () => {
  const d = calibrated(doc({ settings: { forceDeloadWeek: true } }), {
    'back-squat': 135, 'romanian-deadlift': 100,
  });
  d.liftState['leg-curl'] = { workingWeight: 60 };
  const plan = planFor(d, MON);
  assert.equal(plan.deloadWeek, true);
  assert.equal(plan.items[0].weight, 105, '0.8 x 135 = 108 -> 105');
  assert.deepEqual(plan.items[0].scheme, { sets: 3, reps: 5 });
  assert.deepEqual(plan.items[1].scheme, { sets: 3, reps: 5 });
  assert.equal(plan.items[2].weight, 60, 'accessories keep their weight');
  assert.equal(plan.items[2].scheme.sets, 2, 'but drop to two sets');
});

test('a deload week turns Saturday into an easy 30 minutes', () => {
  const plan = planFor(doc({ settings: { forceDeloadWeek: true } }), SAT);
  assert.equal(plan.kind, 'z2');
  assert.equal(plan.duration, 30);
});

test('the lower days fit the 45 minute budget', () => {
  const d = calibrated(doc(), {
    'back-squat': 225, 'romanian-deadlift': 185, deadlift: 315, 'front-squat': 165,
  });
  const lowerA = planFor(d, MON);
  const lowerB = planFor(d, THU);
  assert.ok(lowerA.estimate.total <= BUDGET_MIN, `Lower A is ${lowerA.estimate.total} min`);
  assert.ok(lowerA.estimate.total >= 38, 'and is not suspiciously short');
  assert.ok(lowerB.estimate.total <= BUDGET_MIN, `Lower B is ${lowerB.estimate.total} min`);
  assert.equal(lowerA.overBudget, false);
});

test('a 5x5 secondary pushes the day past 45 min, which the plan flags', () => {
  const d = calibrated(doc(), { 'bench-press': 185, 'barbell-row': 135 });
  const upperA = planFor(d, TUE);
  assert.equal(upperA.overBudget, true, `Upper A is ${upperA.estimate.total} min`);
  assert.ok(upperA.estimate.total < 50, 'but not wildly over');
});

test('unilateral work is costed honestly', () => {
  const d = calibrated(doc(), { deadlift: 315, 'bulgarian-split-squat': 40 });
  d.slots['lowerB-secondary'].current = 'bulgarian-split-squat';
  const plan = planFor(d, THU);
  const bss = plan.estimate.items.find((i) => i.slotId === 'lowerB-secondary');
  assert.ok(bss.minutes >= 11, `Bulgarian split squats cost ${bss.minutes} min, not 9`);
});

test('the week overview marks today and finished sessions', () => {
  const d = doc({ sessions: [{ id: 's1', date: MON, dayIndex: 0, kind: 'lift', finishedAt: `${MON}T18:00:00Z` }] });
  const week = weekOverview(d, WED);
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((t) => t.dayName), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(week[0].done, true);
  assert.equal(week[1].done, false);
  assert.equal(week[2].isToday, true);
  assert.equal(week[6].date, SUN);
});

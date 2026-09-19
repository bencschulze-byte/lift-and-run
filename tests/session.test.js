import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startSession, finishSession, applyCalibration, pacePerMile,
  swapSlot, scheduleRotation, commitPendingRotations,
} from '../src/session.js';
import { planFor } from '../src/engine/template.js';
import { createProgramDocument } from '../src/engine/defaults.js';

const MON = '2026-09-21';
const SAT = '2026-09-26';
const NOW = new Date('2026-09-21T18:00:00Z');

function doc(weights = {}, overrides = {}) {
  const d = createProgramDocument({ today: MON });
  for (const [id, w] of Object.entries(weights)) {
    d.liftState[id] = { fiveRM: w / 0.875, workingWeight: w, failStreak: 0 };
  }
  return { ...d, ...overrides, settings: { ...d.settings, ...(overrides.settings ?? {}) } };
}

function logAll(session, reps) {
  for (const entry of session.exercises) {
    const count = entry.scheme.sets;
    entry.sets = Array.from({ length: count }, () => ({
      weight: entry.prescribedWeight,
      reps: reps[entry.exerciseId] ?? entry.scheme.reps ?? entry.scheme.repMax,
    }));
  }
  return session;
}

test('a fresh Lower A session mirrors the plan', () => {
  const d = doc();
  const session = startSession(planFor(d, MON), NOW);
  assert.equal(session.kind, 'lift');
  assert.equal(session.date, MON);
  assert.equal(session.exercises.length, 4);
  assert.equal(session.exercises[0].result, null, 'nothing has happened yet');
  assert.equal(session.exercises[0].prescribedWeight, null, 'the squat is not calibrated yet');
  assert.equal(session.finishedAt, null);
});

test('a lift left uncalibrated is not reported as calibrated', () => {
  const d = doc();
  const session = startSession(planFor(d, MON), NOW);
  session.exercises[2].sets = [{ weight: 60, reps: 12 }]; // only the leg curl got done
  d.liftState['leg-curl'] = { workingWeight: 60 };
  const { summary } = finishSession(d, session, NOW);
  assert.deepEqual(summary.map((s) => s.exerciseId), ['leg-curl']);
});

test('the calibration ramp counts as that lift\'s work for the day', () => {
  const d = applyCalibration(doc(), 'back-squat', {
    fiveRM: 115, e1RM: 134.17, workingWeight: 100, calibratedAt: MON,
  }, NOW);
  const session = startSession(planFor(doc(), MON), NOW);
  session.exercises[0].result = 'calibration';
  session.exercises[0].sets = [45, 65, 85, 105, 115].map((weight) => ({ weight, reps: 5 }));
  const { doc: after, summary } = finishSession(d, session, NOW);
  assert.equal(after.liftState['back-squat'].workingWeight, 100, 'not progressed on top of calibration');
  assert.equal(summary[0].calibrated, true);
  assert.equal(after.sessions[0].exercises[0].sets.length, 5);
});

test('calibration writes the working weight and clears the fail streak', () => {
  const d = applyCalibration(doc(), 'back-squat', {
    fiveRM: 200, e1RM: 233.34, workingWeight: 175, calibratedAt: MON, capped: false,
  }, NOW);
  assert.deepEqual(d.liftState['back-squat'], {
    fiveRM: 200, e1RM: 233.34, workingWeight: 175, failStreak: 0, manualOverride: null,
    calibratedAt: MON, calibrationCapped: false, lastPerformed: MON,
  });
  // The next Lower A now prescribes it.
  assert.equal(planFor(d, MON).items[0].weight, 175);
});

test('finishing a clean session moves every lift up', () => {
  const d = doc({ 'back-squat': 175, 'romanian-deadlift': 135 });
  d.liftState['leg-curl'] = { workingWeight: 60 };
  d.liftState['standing-calf-raise'] = { workingWeight: 90 };
  const session = logAll(startSession(planFor(d, MON), NOW), {});
  const { doc: after, summary } = finishSession(d, session, NOW);

  assert.equal(after.liftState['back-squat'].workingWeight, 180, '+5');
  assert.equal(after.liftState['romanian-deadlift'].workingWeight, 140, '+5');
  assert.equal(after.liftState['leg-curl'].workingWeight, 65, 'top of the range, +5');
  assert.equal(after.liftState['standing-calf-raise'].workingWeight, 95);
  assert.equal(after.sessions.length, 1);
  assert.ok(after.sessions[0].finishedAt);
  assert.equal(summary.find((s) => s.exerciseId === 'back-squat').result, 'success');

  // And the next Lower A shows the new numbers.
  assert.equal(planFor(after, '2026-09-28').items[0].weight, 180);
});

test('a missed rep repeats the weight and counts the fail', () => {
  const d = doc({ 'back-squat': 175, 'romanian-deadlift': 135 });
  const session = startSession(planFor(d, MON), NOW);
  session.exercises[0].sets = [5, 5, 5, 5, 3].map((reps) => ({ weight: 175, reps }));
  const { doc: after, summary } = finishSession(d, session, NOW);
  assert.equal(after.liftState['back-squat'].workingWeight, 175);
  assert.equal(after.liftState['back-squat'].failStreak, 1);
  assert.equal(summary[0].result, 'fail');
});

test('the third consecutive fail deloads and is recorded', () => {
  const d = doc({ 'back-squat': 175 });
  d.liftState['back-squat'].failStreak = 2;
  const session = startSession(planFor(d, MON), NOW);
  session.exercises[0].sets = [5, 5, 5, 5, 4].map((reps) => ({ weight: 175, reps }));
  const { doc: after, summary } = finishSession(d, session, NOW);
  assert.equal(after.liftState['back-squat'].workingWeight, 155, '0.9 x 175 = 157.5 -> 155');
  assert.equal(after.liftState['back-squat'].failStreak, 0);
  assert.deepEqual(after.deloads, [{ date: MON, exerciseId: 'back-squat', type: 'main' }]);
  assert.equal(summary[0].deloaded, true);
});

test('ramp sets are not judged', () => {
  const d = doc({ 'back-squat': 175 });
  const session = startSession(planFor(d, MON), NOW);
  session.exercises[0].sets = [
    { weight: 45, reps: 5, ramp: true },
    { weight: 95, reps: 3, ramp: true },
    ...Array(5).fill({ weight: 175, reps: 5 }),
  ];
  const { doc: after } = finishSession(d, session, NOW);
  assert.equal(after.liftState['back-squat'].workingWeight, 180);
});

test('a manual override is used once and then progressed from', () => {
  const d = doc({ 'back-squat': 175 });
  d.liftState['back-squat'].manualOverride = 200;
  const plan = planFor(d, MON);
  assert.equal(plan.items[0].weight, 200);
  const session = logAll(startSession(plan, NOW), {});
  const { doc: after } = finishSession(d, session, NOW);
  assert.equal(after.liftState['back-squat'].workingWeight, 205);
  assert.equal(after.liftState['back-squat'].manualOverride, null);
});

test('a deload week neither progresses nor punishes', () => {
  const d = doc({ 'back-squat': 175, 'romanian-deadlift': 135 }, { settings: { forceDeloadWeek: true } });
  const plan = planFor(d, MON);
  assert.equal(plan.items[0].weight, 140, '80 percent of 175');
  const session = startSession(plan, NOW);
  session.exercises[0].sets = [5, 5, 4].map((reps) => ({ weight: 140, reps }));
  const { doc: after, summary } = finishSession(d, session, NOW);
  assert.equal(after.liftState['back-squat'].workingWeight, 175, 'unchanged');
  assert.equal(after.liftState['back-squat'].failStreak, 0, 'and no fail recorded');
  assert.equal(summary[0].held, true);
});

test('exercises that were never started are left alone', () => {
  const d = doc({ 'back-squat': 175, 'romanian-deadlift': 135 });
  const session = logAll(startSession(planFor(d, MON), NOW), {});
  session.exercises[1].sets = []; // ran out of time
  const { doc: after } = finishSession(d, session, NOW);
  assert.equal(after.liftState['romanian-deadlift'].workingWeight, 135);
});

test('a zone 5 session walks the ladder', () => {
  const d = doc({}, { cardioState: { z5Step: 0, z5WeeksAtStep: 1 } });
  const session = startSession(planFor(d, SAT), NOW);
  assert.equal(session.cardio.intervalsCompleted, 4, 'prefilled with what was prescribed');
  session.cardio.distance = 3.1;
  const { doc: after, summary } = finishSession(d, session, NOW);
  assert.equal(after.cardioState.z5Step, 1);
  assert.equal(summary.at(-1).to, 'step 1');
});

test('an unfinished zone 5 session holds the step', () => {
  const d = doc({}, { cardioState: { z5Step: 1, z5WeeksAtStep: 1 } });
  const session = startSession(planFor(d, SAT), NOW);
  session.cardio.intervalsCompleted = 3;
  const { doc: after } = finishSession(d, session, NOW);
  assert.equal(after.cardioState.z5Step, 1);
  assert.equal(after.cardioState.z5WeeksAtStep, 0);
});

test('finishing twice does not duplicate the session', () => {
  const d = doc({ 'back-squat': 175 });
  const session = logAll(startSession(planFor(d, MON), NOW), {});
  const first = finishSession(d, session, NOW);
  const second = finishSession(first.doc, first.doc.sessions[0], NOW);
  assert.equal(second.doc.sessions.length, 1);
});

test('finishing never mutates the document it was given', () => {
  const d = doc({ 'back-squat': 175 });
  const session = logAll(startSession(planFor(d, MON), NOW), {});
  finishSession(d, session, NOW);
  assert.equal(d.liftState['back-squat'].workingWeight, 175);
  assert.equal(d.sessions.length, 0);
});

test('pace is minutes per mile, or nothing', () => {
  assert.equal(pacePerMile({ duration: 40, distance: 4 }), 10);
  assert.equal(pacePerMile({ duration: 40 }), null);
});

test('swapping a slot keeps the old lift state for later', () => {
  let d = doc({ 'romanian-deadlift': 135 });
  d = swapSlot(d, 'lowerA-secondary', 'good-morning', MON);
  assert.equal(d.slots['lowerA-secondary'].current, 'good-morning');
  assert.deepEqual(d.rotations, [{ date: MON, slotId: 'lowerA-secondary', from: 'romanian-deadlift', to: 'good-morning' }]);

  const plan = planFor(d, MON);
  assert.equal(plan.items[1].exerciseId, 'good-morning');
  assert.equal(plan.items[1].needsCalibration, true, 'the rotated-in lift calibrates on first appearance');

  // ...and rotating back restores the Romanian deadlift exactly where it was.
  d = swapSlot(d, 'lowerA-secondary', 'romanian-deadlift', '2026-10-05');
  assert.equal(planFor(d, '2026-10-05').items[1].weight, 135);
});

test('swapping to something that is not an option is refused', () => {
  assert.throws(() => swapSlot(doc(), 'lowerA-secondary', 'bench-press'), /not an option/);
  assert.throws(() => swapSlot(doc(), 'nope', 'good-morning'), /unknown slot/);
});

test('a rotation chosen in a deload week starts the week after', () => {
  let d = scheduleRotation(doc({ 'romanian-deadlift': 135 }), 'lowerA-secondary', 'good-morning', '2026-09-28');
  assert.equal(d.slots['lowerA-secondary'].current, 'romanian-deadlift', 'not yet');

  const still = commitPendingRotations(d, '2026-09-25');
  assert.equal(still.changed, false);
  assert.equal(planFor(still.doc, MON).items[1].exerciseId, 'romanian-deadlift');

  const now = commitPendingRotations(d, '2026-09-28');
  assert.equal(now.changed, true);
  assert.equal(now.doc.slots['lowerA-secondary'].current, 'good-morning');
  assert.equal(now.doc.rotations.at(-1).to, 'good-morning');
  assert.equal(commitPendingRotations(now.doc, '2026-09-28').changed, false, 'and only once');
});

test('choosing to keep the current exercise schedules nothing', () => {
  const d = scheduleRotation(doc(), 'lowerA-secondary', 'romanian-deadlift', '2026-09-28');
  assert.equal(d.slots['lowerA-secondary'].pending, null);
});

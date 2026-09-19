// Turning a finished workout into new prescriptions. Takes a document and
// returns a new one; the engine does the arithmetic, this does the bookkeeping.
import { isCalibratedType } from './engine/defaults.js';
import { toISODate } from './engine/dates.js';
import {
  evaluateLift, nextPrescription, nextAccessoryPrescription,
} from './engine/progression.js';
import { progressZ5 } from './engine/cardio.js';

export function newSessionId(date, dayIndex, now = new Date()) {
  return `${date}-${dayIndex}-${new Date(now).getTime().toString(36)}`;
}

// A blank session matching the plan, ready to be logged into.
export function startSession(plan, now = new Date()) {
  const base = {
    id: newSessionId(plan.date, plan.dayIndex, now),
    date: plan.date,
    dayIndex: plan.dayIndex,
    kind: plan.kind,
    deloadWeek: !!plan.deloadWeek,
    startedAt: new Date(now).toISOString(),
    finishedAt: null,
    notes: '',
  };

  if (plan.kind !== 'lift') {
    return {
      ...base,
      cardio: {
        duration: plan.duration ?? plan.totalMinutes ?? null,
        distance: null,
        avgHR: null,
        intervalsCompleted: plan.intervals ?? null,
        rpe: null,
      },
      z5Step: plan.step ?? null,
    };
  }

  return {
    ...base,
    exercises: plan.items.map((item) => ({
      exerciseId: item.exerciseId,
      slotId: item.slotId,
      role: item.role,
      prescribedWeight: item.weight,
      scheme: item.scheme,
      sets: [],
      result: null, // set to 'calibration' by the wizard, otherwise by the finish flow
    })),
  };
}

// Store the result of the calibration wizard on the lift.
export function applyCalibration(doc, exerciseId, outputs, now = new Date()) {
  const next = structuredClone(doc);
  next.liftState[exerciseId] = {
    ...(next.liftState[exerciseId] ?? {}),
    fiveRM: outputs.fiveRM,
    e1RM: outputs.e1RM,
    workingWeight: outputs.workingWeight,
    failStreak: 0,
    manualOverride: null,
    calibratedAt: outputs.calibratedAt ?? toISODate(now),
    calibrationCapped: !!outputs.capped,
    lastPerformed: toISODate(now),
  };
  return next;
}

// Finish a session: record it, move every lift on, and report what changed.
// Returns { doc, summary }.
export function finishSession(doc, session, now = new Date()) {
  const next = structuredClone(doc);
  const finished = { ...structuredClone(session), finishedAt: new Date(now).toISOString() };
  const summary = [];
  const date = finished.date;

  if (finished.kind === 'lift') {
    for (const entry of finished.exercises ?? []) {
      const exercise = next.exercises[entry.exerciseId];
      if (!exercise) continue;
      const working = (entry.sets ?? []).filter((s) => !s.ramp);
      if (!working.length && entry.result !== 'calibration') continue; // never started

      const state = next.liftState[entry.exerciseId] ?? {};
      state.lastPerformed = date;

      if (entry.result === 'calibration') {
        summary.push({ exerciseId: entry.exerciseId, name: exercise.name, calibrated: true, to: state.workingWeight });
        next.liftState[entry.exerciseId] = state;
        continue;
      }

      if (isCalibratedType(exercise)) {
        const result = evaluateLift(entry.scheme, working);
        entry.result = result;
        // A deload week is a rest week: it neither progresses nor punishes.
        if (finished.deloadWeek) {
          summary.push({ exerciseId: entry.exerciseId, name: exercise.name, held: true, to: state.workingWeight });
          next.liftState[entry.exerciseId] = state;
          continue;
        }
        const from = entry.prescribedWeight ?? state.workingWeight;
        const outcome = nextPrescription(
          { current: from, exercise, failStreak: state.failStreak ?? 0, result },
          next.settings,
        );
        state.workingWeight = outcome.weight;
        state.failStreak = outcome.failStreak;
        state.manualOverride = null; // the override has now been used
        if (outcome.deloaded) {
          next.deloads.push({ date, exerciseId: entry.exerciseId, type: exercise.type });
        }
        summary.push({
          exerciseId: entry.exerciseId,
          name: exercise.name,
          result,
          from,
          to: outcome.weight,
          deloaded: outcome.deloaded,
          failStreak: outcome.failStreak,
        });
      } else {
        const reps = working.map((s) => Number(s.reps));
        if (finished.deloadWeek) {
          summary.push({ exerciseId: entry.exerciseId, name: exercise.name, held: true, to: state.workingWeight });
          next.liftState[entry.exerciseId] = state;
          continue;
        }
        const from = entry.prescribedWeight ?? state.workingWeight ?? 0;
        const outcome = nextAccessoryPrescription({ current: from, exercise, reps }, next.settings);
        state.workingWeight = outcome.weight;
        summary.push({
          exerciseId: entry.exerciseId,
          name: exercise.name,
          from,
          to: outcome.weight,
          addWeightSuggested: outcome.addWeightSuggested,
        });
      }
      next.liftState[entry.exerciseId] = state;
    }
  }

  if (finished.kind === 'z5' && !finished.deloadWeek) {
    const done = Number(finished.cardio?.intervalsCompleted ?? 0);
    const outcome = progressZ5(next.cardioState, done);
    next.cardioState = { z5Step: outcome.z5Step, z5WeeksAtStep: outcome.z5WeeksAtStep };
    summary.push({
      name: 'Zone 5 intervals',
      cardio: true,
      from: `step ${finished.z5Step ?? 0}`,
      to: `step ${outcome.z5Step}`,
      held: outcome.held,
    });
  }

  next.sessions = [...(next.sessions ?? []).filter((s) => s.id !== finished.id), finished];
  next.activeSession = null;
  return { doc: next, summary };
}

// Pace in minutes per mile, for the cardio trend on the History screen.
export function pacePerMile(cardio) {
  if (!cardio?.distance || !cardio?.duration) return null;
  return Math.round((cardio.duration / cardio.distance) * 100) / 100;
}

// --- slot rotation --------------------------------------------------------

// Swap a slot to one of its alternatives now. The previous exercise keeps its
// stored state, so rotating back later restores its working weight.
export function swapSlot(doc, slotId, toExerciseId, date) {
  const next = structuredClone(doc);
  const slot = next.slots[slotId];
  if (!slot) throw new Error(`unknown slot ${slotId}`);
  if (!slot.options.includes(toExerciseId)) throw new Error(`${toExerciseId} is not an option for ${slotId}`);
  if (slot.current === toExerciseId) return next;
  next.rotations.push({ date, slotId, from: slot.current, to: toExerciseId });
  slot.current = toExerciseId;
  slot.pending = null;
  return next;
}

// A rotation chosen during a deload week takes effect the first week after it.
export function scheduleRotation(doc, slotId, toExerciseId, effectiveFrom) {
  const next = structuredClone(doc);
  const slot = next.slots[slotId];
  if (!slot) throw new Error(`unknown slot ${slotId}`);
  if (!slot.options.includes(toExerciseId)) throw new Error(`${toExerciseId} is not an option for ${slotId}`);
  slot.pending = slot.current === toExerciseId ? null : { to: toExerciseId, effectiveFrom };
  return next;
}

// Called on load: bring any scheduled rotation into effect once its week starts.
export function commitPendingRotations(doc, date) {
  let changed = false;
  const next = structuredClone(doc);
  for (const slot of Object.values(next.slots)) {
    if (!slot.pending) continue;
    if (slot.pending.effectiveFrom > date) continue;
    next.rotations.push({ date: slot.pending.effectiveFrom, slotId: slot.id, from: slot.current, to: slot.pending.to });
    slot.current = slot.pending.to;
    slot.pending = null;
    changed = true;
  }
  return { doc: changed ? next : doc, changed };
}

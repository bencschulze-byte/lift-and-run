// Progression, deload and accessory double progression (spec section 5). Pure.
import { roundForLoadType, nextDumbbell, round2 } from './plates.js';
import { mondayOf, addDays, daysBetween, weekIndexFor } from './dates.js';

export const DELOAD_PCT = 0.9; // after three consecutive fails
export const DELOAD_WEEK_PCT = 0.8; // scheduled deload week
export const DELOAD_WEEK_SCHEME = { sets: 3, reps: 5 };
export const DELOAD_WEEK_ACCESSORY_SETS = 2;
export const FAIL_STREAK_LIMIT = 3;
export const DELOAD_WEEK_EVERY = 7; // every 7th week is a deload week

// Overhead press moves in 2.5 lb steps when microplates are on.
export function incrementFor(exercise, settings = {}) {
  if (settings.microplates && exercise.microIncrement) return exercise.microIncrement;
  return exercise.increment;
}

// A session on a lift succeeds only if every prescribed working set hit the
// prescribed reps. Ramp sets are not working sets.
export function evaluateLift(prescription, loggedSets = []) {
  const working = loggedSets.filter((s) => !s.ramp);
  const enough = working.length >= prescription.sets;
  const allHit = working
    .slice(0, prescription.sets)
    .every((s) => Number(s.reps) >= prescription.reps);
  return enough && allHit ? 'success' : 'fail';
}

// Next prescription for a calibrated (main or secondary) lift.
// Returns { weight, failStreak, deloaded }.
export function nextPrescription({ current, exercise, failStreak = 0, result }, settings = {}) {
  const loadType = exercise.loadType;
  if (result === 'success') {
    return {
      weight: roundForLoadType(current + incrementFor(exercise, settings), loadType, settings),
      failStreak: 0,
      deloaded: false,
    };
  }
  const streak = failStreak + 1;
  if (streak >= FAIL_STREAK_LIMIT) {
    return {
      weight: roundForLoadType(current * DELOAD_PCT, loadType, settings),
      failStreak: 0,
      deloaded: true,
    };
  }
  return { weight: current, failStreak: streak, deloaded: false };
}

// Double progression for accessories.
// Returns { weight, addWeightSuggested, progressed }.
export function nextAccessoryPrescription({ current, exercise, reps = [] }, settings = {}) {
  const { sets, repMin, repMax } = exercise.repScheme;
  const done = reps.slice(0, sets);
  const allTop = done.length >= sets && done.every((r) => Number(r) >= repMax);
  const anyLow = done.some((r) => Number(r) < repMin);

  if (!allTop) return { weight: current, addWeightSuggested: false, progressed: false, missed: anyLow };

  if (!exercise.step) {
    // Bodyweight work: there is nothing to add, so nudge the user instead.
    return { weight: current, addWeightSuggested: true, progressed: false, missed: false };
  }
  const weight = exercise.loadType === 'dumbbell'
    ? nextDumbbell(current, settings)
    : roundForLoadType(current + exercise.step, exercise.loadType, settings);
  return { weight, addWeightSuggested: false, progressed: true, missed: false };
}

// --- deload weeks ---------------------------------------------------------

export function isScheduledDeloadWeek(programStart, date) {
  if (!programStart) return false;
  const week = weekIndexFor(programStart, date);
  if (week < 0) return false;
  return week % DELOAD_WEEK_EVERY === DELOAD_WEEK_EVERY - 1;
}

// Two different main lifts auto-deloading inside 14 days forces the next
// Mon-Sun week to be a deload week.
export function triggeredDeloadWeekStarts(deloads = []) {
  const main = deloads
    .filter((d) => d.type === 'main')
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const starts = new Set();
  for (let i = 0; i < main.length; i++) {
    for (let j = i + 1; j < main.length; j++) {
      if (main[j].exerciseId === main[i].exerciseId) continue;
      if (daysBetween(main[i].date, main[j].date) > 14) break;
      starts.add(addDays(mondayOf(main[j].date), 7));
    }
  }
  return [...starts].sort();
}

export function isTriggeredDeloadWeek(deloads, date) {
  return triggeredDeloadWeekStarts(deloads).includes(mondayOf(date));
}

export function isDeloadWeek(doc, date) {
  if (doc?.settings?.forceDeloadWeek) return true;
  if (isScheduledDeloadWeek(doc?.settings?.programStart, date)) return true;
  return isTriggeredDeloadWeek(doc?.deloads ?? [], date);
}

export function deloadWeekWeight(workingWeight, exercise, settings = {}) {
  if (!Number.isFinite(workingWeight)) return workingWeight;
  return roundForLoadType(workingWeight * DELOAD_WEEK_PCT, exercise.loadType, settings);
}

// The weight to prescribe right now for a calibrated lift.
export function prescribedWeight(liftState, exercise, { deload = false } = {}, settings = {}) {
  const base = liftState?.manualOverride ?? liftState?.workingWeight;
  if (!Number.isFinite(base)) return null;
  return deload ? deloadWeekWeight(base, exercise, settings) : round2(base);
}

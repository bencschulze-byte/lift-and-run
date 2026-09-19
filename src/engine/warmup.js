// Ramp (warm-up) set generation. Pure.
import { roundForLoadType, barWeightFor } from './plates.js';

// Main lift: empty bar x5, then 40% x3, 60% x2, 80% x1.
export const MAIN_RAMP = [
  { pct: 0.4, reps: 3 },
  { pct: 0.6, reps: 2 },
  { pct: 0.8, reps: 1 },
];

// Secondary lift: 50% x5, 75% x3.
export const SECONDARY_RAMP = [
  { pct: 0.5, reps: 5 },
  { pct: 0.75, reps: 3 },
];

export const REST_SECONDS = {
  ramp: 60,
  main: 180,
  secondary: 120,
  accessory: 75,
};

export function restSecondsFor(role) {
  return REST_SECONDS[role] ?? REST_SECONDS.accessory;
}

// Returns [{ weight, reps, ramp: true }] for the given working weight.
// Accessories get no ramp: the first set of a light accessory is its own warm-up.
export function rampSets(workingWeight, exercise, settings = {}) {
  const role = exercise.type;
  if (role === 'accessory' || !Number.isFinite(workingWeight)) return [];

  const scheme = role === 'main' ? MAIN_RAMP : SECONDARY_RAMP;
  const sets = [];

  if (exercise.addedWeight) {
    // Chin-ups and friends: the warm-up is bodyweight reps, then half the belt load.
    sets.push({ weight: 0, reps: 5, ramp: true });
    if (workingWeight > 0) {
      sets.push({ weight: roundForLoadType(workingWeight * 0.5, exercise.loadType, settings), reps: 3, ramp: true });
    }
    return dedupe(sets);
  }

  // Only the first lift of the session starts from the empty bar.
  if (role === 'main' && exercise.loadType === 'barbell') {
    sets.push({ weight: barWeightFor(settings), reps: 5, ramp: true });
  }

  for (const step of scheme) {
    const weight = roundForLoadType(workingWeight * step.pct, exercise.loadType, settings);
    sets.push({ weight, reps: step.reps, ramp: true });
  }

  return dedupe(sets).filter((s) => s.weight < workingWeight);
}

// Drop consecutive ramp sets that land on the same weight after rounding.
function dedupe(sets) {
  const out = [];
  for (const s of sets) {
    if (out.length && out[out.length - 1].weight === s.weight) {
      out[out.length - 1] = s.reps < out[out.length - 1].reps ? out[out.length - 1] : s;
      continue;
    }
    out.push(s);
  }
  return out;
}

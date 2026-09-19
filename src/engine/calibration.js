// The 5RM calibration ramp (spec section 4). A pure state machine:
// startCalibration -> applyFeedback (once per set) -> finishCalibration.
import { roundForLoadType, smallestStep, round2 } from './plates.js';
import { toISODate } from './dates.js';

export const MAX_RAMP_SETS = 8;
export const E1RM_FACTOR = 1.1667; // Epley at 5 reps
export const WORKING_PCT = 0.875;

// What the five big buttons mean.
export const FEEDBACK = {
  easy: { rpe: 6, label: 'Easy' },
  moderate: { rpe: 7, label: 'Moderate' },
  hard: { rpe: 8, label: 'Hard' },
  nearmax: { rpe: 9, label: 'Near max' },
  failed: { rpe: null, label: 'Failed' },
};

export function startCalibration(exercise, settings = {}) {
  return {
    exerciseId: exercise.id,
    loadType: exercise.loadType,
    unilateral: !!exercise.unilateral,
    sets: [],
    nextWeight: roundForLoadType(exercise.calibStart, exercise.loadType, settings),
    jump: exercise.calibJump,
    done: false,
    capped: false,
    stopped: false,
    failedFirstSet: false,
  };
}

// Rest is 2 min early, 3 min once the work has reached RPE 7.
export function restSeconds(state) {
  return state.sets.some((s) => (s.rpe ?? 0) >= 7) ? 180 : 120;
}

// The set the user is about to do.
export function nextSet(state) {
  if (state.done) return null;
  return {
    index: state.sets.length,
    weight: state.nextWeight,
    reps: 5,
    perLeg: state.unilateral,
    restSeconds: restSeconds(state),
  };
}

// Record the user's tap on one of the five buttons and advance the ramp.
// Returns a new state; never mutates.
export function applyFeedback(state, key, settings = {}) {
  if (state.done) return state;
  const fb = FEEDBACK[key];
  if (!fb) throw new Error(`unknown calibration feedback: ${key}`);

  const completed = key !== 'failed';
  const sets = [...state.sets, { weight: state.nextWeight, reps: completed ? 5 : null, feedback: key, rpe: fb.rpe }];
  const next = { ...state, sets };

  if (key === 'failed') {
    // The previous completed set is the 5RM. If there is no previous set the
    // start weight was already too heavy and the user must start lighter.
    next.done = true;
    next.failedFirstSet = sets.length === 1;
    return next;
  }

  if (key === 'nearmax') {
    next.done = true;
    return next;
  }

  if (key === 'hard') {
    // RPE 8: halve the remaining ramp jump, never below one loadable step.
    const min = smallestStep(state.loadType, settings) || 1;
    next.jump = Math.max(min, round2(state.jump / 2));
  }

  if (sets.length >= MAX_RAMP_SETS) {
    next.done = true;
    next.capped = true;
    return next;
  }

  next.nextWeight = nextRampWeight(state.nextWeight, next.jump, state.loadType, settings);
  return next;
}

// "Stop here": treat the last completed set as the 5RM.
export function stopHere(state) {
  if (state.done) return state;
  return { ...state, done: true, stopped: true };
}

function nextRampWeight(current, jump, loadType, settings) {
  const target = current + jump;
  const rounded = roundForLoadType(target, loadType, settings);
  // Rounding down must never stall the ramp.
  if (rounded > current) return rounded;
  return round2(current + (smallestStep(loadType, settings) || jump));
}

export function lastCompletedWeight(state) {
  for (let i = state.sets.length - 1; i >= 0; i--) {
    if (state.sets[i].feedback !== 'failed') return state.sets[i].weight;
  }
  return null;
}

// Outputs stored on the lift once the ramp ends.
export function finishCalibration(state, exercise, settings = {}, now = new Date()) {
  const fiveRM = lastCompletedWeight(state);
  if (fiveRM === null) {
    return { fiveRM: null, e1RM: null, workingWeight: null, capped: state.capped, needsLighterStart: true };
  }
  return {
    fiveRM,
    e1RM: round2(fiveRM * E1RM_FACTOR),
    workingWeight: roundForLoadType(fiveRM * WORKING_PCT, exercise.loadType, settings),
    calibratedAt: toISODate(now),
    capped: state.capped,
    needsLighterStart: false,
  };
}

// Spec section 3: if bodyweight chin-ups for 5 are already RPE 9+, the slot
// should be lat pulldown instead. The wizard offers the swap.
export function suggestsPulldownSwap(state, exercise) {
  if (!exercise?.addedWeight) return false;
  const first = state.sets[0];
  if (!first || first.weight !== 0) return false;
  return first.feedback === 'nearmax' || first.feedback === 'failed';
}

// Running prescriptions (spec section 6). Pure.

export const WARMUP_MIN = 10;
export const COOLDOWN_MIN = 5;
export const SESSION_CAP_MIN = 45;

// Zone 5 ladder. One step every two weeks, provided every prescribed interval
// was completed in both weeks. Step 4 is the cap.
export const Z5_LADDER = [
  { step: 0, intervals: 4, workMin: 3, recoveryMin: 3 },
  { step: 1, intervals: 5, workMin: 3, recoveryMin: 3 },
  { step: 2, intervals: 6, workMin: 3, recoveryMin: 2 },
  { step: 3, intervals: 4, workMin: 4, recoveryMin: 3 },
  { step: 4, intervals: 5, workMin: 4, recoveryMin: 2 },
];

export const Z5_MAX_STEP = Z5_LADDER.length - 1;
export const Z5_WEEKS_PER_STEP = 2;

export function z5Rung(step) {
  return Z5_LADDER[clampStep(step)];
}

// No recovery jog after the final interval.
export function z5TotalMinutes(step) {
  const r = z5Rung(step);
  return WARMUP_MIN + r.intervals * r.workMin + (r.intervals - 1) * r.recoveryMin + COOLDOWN_MIN;
}

// The full phase list the interval timer walks through.
export function z5Session(step) {
  const r = z5Rung(step);
  const phases = [{ kind: 'warmup', label: 'Easy warm-up', minutes: WARMUP_MIN }];
  for (let i = 0; i < r.intervals; i++) {
    phases.push({ kind: 'work', label: `Interval ${i + 1} of ${r.intervals}`, minutes: r.workMin });
    if (i < r.intervals - 1) {
      phases.push({ kind: 'recovery', label: 'Easy jog', minutes: r.recoveryMin });
    }
  }
  phases.push({ kind: 'cooldown', label: 'Cool-down', minutes: COOLDOWN_MIN });
  return {
    kind: 'z5',
    step: r.step,
    intervals: r.intervals,
    workMin: r.workMin,
    recoveryMin: r.recoveryMin,
    totalMinutes: z5TotalMinutes(r.step),
    atCap: r.step === Z5_MAX_STEP,
    phases,
  };
}

// Advance (or hold) the ladder after a completed Zone 5 session.
export function progressZ5(state = { z5Step: 0, z5WeeksAtStep: 0 }, intervalsCompleted) {
  const step = clampStep(state.z5Step ?? 0);
  const prescribed = z5Rung(step).intervals;
  if (Number(intervalsCompleted) < prescribed) {
    // Held: the two-week clock restarts.
    return { z5Step: step, z5WeeksAtStep: 0, changed: false, held: true };
  }
  const weeks = (state.z5WeeksAtStep ?? 0) + 1;
  if (weeks >= Z5_WEEKS_PER_STEP && step < Z5_MAX_STEP) {
    return { z5Step: step + 1, z5WeeksAtStep: 0, changed: true, held: false };
  }
  return { z5Step: step, z5WeeksAtStep: weeks, changed: false, held: false };
}

export function z2Session({ sundayWalk = false, isSunday = false, deloadWeek = false } = {}) {
  const walk = sundayWalk && isSunday;
  return {
    kind: 'z2',
    walk,
    duration: 40,
    totalMinutes: 40,
    deloadWeek,
    label: walk ? 'Easy walk' : 'Zone 2 run',
  };
}

// During a deload week Saturday becomes a 30-minute Zone 2 run.
export function deloadSaturdaySession() {
  return { kind: 'z2', walk: false, duration: 30, totalMinutes: 30, deloadWeek: true, label: 'Zone 2 run (deload)' };
}

// Heart-rate guidance, if we have anything to go on.
export function maxHRFor(settings = {}) {
  if (Number.isFinite(settings.maxHR) && settings.maxHR > 0) return settings.maxHR;
  if (Number.isFinite(settings.age) && settings.age > 0) return 220 - settings.age;
  return null;
}

export function hrRange(zone, settings = {}) {
  const max = maxHRFor(settings);
  if (!max) return null;
  const pct = zone === 'z5' ? [0.9, 1.0] : [0.6, 0.7];
  return { low: Math.round(max * pct[0]), high: Math.round(max * pct[1]), max };
}

function clampStep(step) {
  const n = Number.isFinite(step) ? Math.trunc(step) : 0;
  return Math.min(Z5_MAX_STEP, Math.max(0, n));
}

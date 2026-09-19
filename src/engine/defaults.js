// The program itself, as data. Change this file to change the program.
// Pure data + tiny helpers; no DOM, no storage.

// loadType drives rounding (see plates.js):
//   barbell | dumbbell | machine | belt | bodyweight
// repScheme is either {sets, reps} (straight sets) or {sets, repMin, repMax}.

const main = (id, name, muscles, o) => ({
  id, name, type: 'main', muscles, unilateral: false, loadType: 'barbell',
  repScheme: { sets: 5, reps: 5 }, ...o,
});
const secondary = (id, name, muscles, o) => ({
  id, name, type: 'secondary', muscles, unilateral: false, loadType: 'barbell',
  repScheme: { sets: 3, reps: 5 }, ...o,
});
const accessory = (id, name, muscles, o) => ({
  id, name, type: 'accessory', muscles, unilateral: false, loadType: 'machine',
  repScheme: { sets: 3, repMin: 10, repMax: 12 }, step: 5, ...o,
});

export const EXERCISES = [
  // --- main lifts: fixed, never rotate -------------------------------------
  main('back-squat', 'Back squat', ['quads', 'glutes'], { calibStart: 45, calibJump: 20, increment: 5 }),
  main('bench-press', 'Bench press', ['chest', 'triceps'], { calibStart: 45, calibJump: 10, increment: 5 }),
  main('deadlift', 'Deadlift', ['hamstrings', 'glutes', 'back'], {
    calibStart: 95, calibJump: 20, increment: 10, repScheme: { sets: 3, reps: 5 },
  }),
  main('overhead-press', 'Overhead press', ['shoulders', 'triceps'], {
    calibStart: 45, calibJump: 5, increment: 5, microIncrement: 2.5,
  }),

  // --- secondaries ---------------------------------------------------------
  secondary('romanian-deadlift', 'Romanian deadlift', ['hamstrings', 'glutes'], { calibStart: 45, calibJump: 15, increment: 5 }),
  secondary('good-morning', 'Good morning', ['hamstrings', 'glutes'], { calibStart: 45, calibJump: 10, increment: 5 }),
  secondary('barbell-hip-thrust', 'Barbell hip thrust', ['glutes'], { calibStart: 95, calibJump: 20, increment: 10 }),

  secondary('front-squat', 'Front squat', ['quads'], { calibStart: 45, calibJump: 15, increment: 5 }),
  secondary('bulgarian-split-squat', 'Bulgarian split squat', ['quads', 'glutes'], {
    loadType: 'dumbbell', unilateral: true, calibStart: 20, calibJump: 10, increment: 5,
  }),
  secondary('leg-press', 'Leg press', ['quads', 'glutes'], { loadType: 'machine', calibStart: 90, calibJump: 40, increment: 10 }),

  secondary('barbell-row', 'Barbell row', ['back', 'biceps'], {
    calibStart: 45, calibJump: 10, increment: 5, repScheme: { sets: 5, reps: 5 },
  }),
  secondary('pendlay-row', 'Pendlay row', ['back', 'biceps'], {
    calibStart: 45, calibJump: 10, increment: 5, repScheme: { sets: 5, reps: 5 },
  }),
  secondary('chest-supported-row', 'Chest-supported row', ['back', 'biceps'], {
    loadType: 'machine', calibStart: 50, calibJump: 10, increment: 5, repScheme: { sets: 5, reps: 5 },
  }),

  // Chin-up / pull-up weights are ADDED weight: 0 means bodyweight.
  secondary('weighted-chinup', 'Weighted chin-up', ['lats', 'biceps'], {
    loadType: 'belt', addedWeight: true, calibStart: 0, calibJump: 5, increment: 2.5,
    repScheme: { sets: 5, reps: 5 },
  }),
  secondary('weighted-pullup', 'Weighted pull-up', ['lats', 'biceps'], {
    loadType: 'belt', addedWeight: true, calibStart: 0, calibJump: 5, increment: 2.5,
    repScheme: { sets: 5, reps: 5 },
  }),
  secondary('lat-pulldown', 'Lat pulldown', ['lats', 'biceps'], {
    loadType: 'machine', calibStart: 70, calibJump: 10, increment: 5, repScheme: { sets: 5, reps: 5 },
  }),

  // --- accessories: never calibrated, double progression -------------------
  accessory('leg-curl', 'Leg curl', ['hamstrings']),
  accessory('nordic-curl', 'Nordic curl', ['hamstrings'], {
    loadType: 'bodyweight', step: 0, repScheme: { sets: 3, repMin: 5, repMax: 8 },
  }),
  accessory('standing-calf-raise', 'Standing calf raise', ['calves'], { repScheme: { sets: 3, repMin: 12, repMax: 15 } }),
  accessory('seated-calf-raise', 'Seated calf raise', ['calves'], { repScheme: { sets: 3, repMin: 12, repMax: 15 } }),

  accessory('db-lateral-raise', 'DB lateral raise', ['shoulders'], { loadType: 'dumbbell' }),
  accessory('cable-lateral-raise', 'Cable lateral raise', ['shoulders']),
  accessory('cable-triceps-pushdown', 'Cable triceps pushdown', ['triceps']),
  accessory('dips', 'Dips', ['chest', 'triceps'], {
    loadType: 'belt', addedWeight: true, bodyweightStart: true, step: 2.5,
  }),
  accessory('incline-db-press', 'Incline DB press', ['chest', 'triceps'], {
    loadType: 'dumbbell', repScheme: { sets: 3, repMin: 8, repMax: 12 },
  }),

  accessory('hanging-leg-raise', 'Hanging leg raise', ['core'], { loadType: 'bodyweight', step: 0 }),
  accessory('ab-wheel', 'Ab wheel', ['core'], { loadType: 'bodyweight', step: 0 }),
  accessory('cable-crunch', 'Cable crunch', ['core']),
  accessory('walking-lunge', 'Walking lunges', ['quads', 'glutes'], { loadType: 'dumbbell', unilateral: true }),

  accessory('barbell-curl', 'Barbell curl', ['biceps'], { loadType: 'barbell' }),
  accessory('incline-db-curl', 'Incline DB curl', ['biceps'], { loadType: 'dumbbell' }),
  accessory('hammer-curl', 'Hammer curl', ['biceps'], { loadType: 'dumbbell' }),
  accessory('face-pull', 'Face pull', ['rear delts'], { repScheme: { sets: 3, repMin: 12, repMax: 15 } }),
  accessory('rear-delt-fly', 'Rear-delt DB fly', ['rear delts'], {
    loadType: 'dumbbell', repScheme: { sets: 3, repMin: 12, repMax: 15 },
  }),
];

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// Main and secondary lifts are calibrated; accessories are not.
export function isCalibratedType(exercise) {
  return exercise?.type === 'main' || exercise?.type === 'secondary';
}

const slot = (id, dayIndex, role, current, options = []) => ({
  id, dayIndex, role,
  rotatable: role !== 'main',
  options: [current, ...options],
  current,
});

export const SLOTS = [
  // Mon - Lower A
  slot('lowerA-main', 0, 'main', 'back-squat'),
  slot('lowerA-secondary', 0, 'secondary', 'romanian-deadlift', ['good-morning', 'barbell-hip-thrust']),
  slot('lowerA-acc1', 0, 'accessory', 'leg-curl', ['nordic-curl']),
  slot('lowerA-acc2', 0, 'accessory', 'standing-calf-raise', ['seated-calf-raise']),
  // Tue - Upper A
  slot('upperA-main', 1, 'main', 'bench-press'),
  slot('upperA-secondary', 1, 'secondary', 'barbell-row', ['pendlay-row', 'chest-supported-row']),
  slot('upperA-acc1', 1, 'accessory', 'db-lateral-raise', ['cable-lateral-raise']),
  slot('upperA-acc2', 1, 'accessory', 'cable-triceps-pushdown', ['dips', 'incline-db-press']),
  // Thu - Lower B
  slot('lowerB-main', 3, 'main', 'deadlift'),
  slot('lowerB-secondary', 3, 'secondary', 'front-squat', ['bulgarian-split-squat', 'leg-press']),
  slot('lowerB-acc1', 3, 'accessory', 'hanging-leg-raise', ['ab-wheel']),
  slot('lowerB-acc2', 3, 'accessory', 'cable-crunch', ['walking-lunge']),
  // Fri - Upper B
  slot('upperB-main', 4, 'main', 'overhead-press'),
  slot('upperB-secondary', 4, 'secondary', 'weighted-chinup', ['weighted-pullup', 'lat-pulldown']),
  slot('upperB-acc1', 4, 'accessory', 'barbell-curl', ['incline-db-curl', 'hammer-curl']),
  slot('upperB-acc2', 4, 'accessory', 'face-pull', ['rear-delt-fly']),
];

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Monday is always day 1.
export const TEMPLATE = [
  { dayIndex: 0, name: 'Lower A', kind: 'lift', slots: ['lowerA-main', 'lowerA-secondary', 'lowerA-acc1', 'lowerA-acc2'] },
  { dayIndex: 1, name: 'Upper A', kind: 'lift', slots: ['upperA-main', 'upperA-secondary', 'upperA-acc1', 'upperA-acc2'] },
  { dayIndex: 2, name: 'Zone 2 run', kind: 'z2', duration: 40 },
  { dayIndex: 3, name: 'Lower B', kind: 'lift', slots: ['lowerB-main', 'lowerB-secondary', 'lowerB-acc1', 'lowerB-acc2'] },
  { dayIndex: 4, name: 'Upper B', kind: 'lift', slots: ['upperB-main', 'upperB-secondary', 'upperB-acc1', 'upperB-acc2'] },
  { dayIndex: 5, name: 'Zone 5 run', kind: 'z5' },
  { dayIndex: 6, name: 'Zone 2 run', kind: 'z2', duration: 40, sundayWalkOption: true },
];

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  units: 'lb',
  barWeight: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  microplates: false,
  dumbbells: null, // null = default ladder, 5..100 by 5
  age: null,
  maxHR: null,
  sundayWalk: false,
  programStart: null, // set to today on first run
  forceDeloadWeek: false, // dev-only toggle
};

// A fresh program document. Pure data assembly; storage.js persists it.
export function createProgramDocument({ today, now } = {}) {
  const start = today ?? new Date().toISOString().slice(0, 10);
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now ?? new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, programStart: start },
    exercises: Object.fromEntries(EXERCISES.map((e) => [e.id, { ...e }])),
    slots: Object.fromEntries(SLOTS.map((s) => [s.id, { ...s, options: [...s.options] }])),
    liftState: {},
    template: TEMPLATE.map((d) => ({ ...d, slots: d.slots ? [...d.slots] : undefined })),
    rotations: [],
    swaps: {},
    cardioState: { z5Step: 0, z5WeeksAtStep: 0 },
    sessions: [],
    deloads: [],
  };
}

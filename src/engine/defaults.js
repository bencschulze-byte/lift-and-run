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

const CATALOG = [
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
  // Two sets, not three: it is per side, and it shares the last block of the
  // session with two other accessories.
  accessory('pallof-press', 'Pallof press', ['core'], {
    unilateral: true, repScheme: { sets: 2, repMin: 10, repMax: 12 },
  }),
  accessory('walking-lunge', 'Walking lunges', ['quads', 'glutes'], { loadType: 'dumbbell', unilateral: true }),

  accessory('barbell-curl', 'Barbell curl', ['biceps'], { loadType: 'barbell' }),
  accessory('incline-db-curl', 'Incline DB curl', ['biceps'], { loadType: 'dumbbell' }),
  accessory('hammer-curl', 'Hammer curl', ['biceps'], { loadType: 'dumbbell' }),
  accessory('face-pull', 'Face pull', ['rear delts'], { repScheme: { sets: 3, repMin: 12, repMax: 15 } }),
  accessory('rear-delt-fly', 'Rear-delt DB fly', ['rear delts'], {
    loadType: 'dumbbell', repScheme: { sets: 3, repMin: 12, repMax: 15 },
  }),
];

// What each movement actually is, for the days you meet one you do not know.
const DESCRIPTIONS = {
  'back-squat': 'Bar across your upper back, both feet planted. Sit down and back until your hip crease drops below your knee, then stand up. Both legs together.',
  'bench-press': 'Flat on the bench, feet on the floor, bar over your chest. Lower it to touch your mid-chest, then press back up.',
  deadlift: 'Bar on the floor over the middle of your feet. Both legs. Take the slack out, then push the floor away and stand tall, keeping the bar dragging up your legs.',
  'overhead-press': 'Standing, bar resting at your collarbone. Press it straight up, moving your head back out of the way, and finish with the bar over your ears.',
  'romanian-deadlift': 'Both legs, not one. Start standing with the bar at your hips. Push your hips back and let the bar slide down your thighs, knees barely bending, until your hamstrings pull tight. Then stand up. The bar does not touch the floor between reps.',
  'good-morning': 'Bar on your upper back as if squatting. Both legs, knees soft. Hinge forward from the hips until your torso is close to parallel with the floor, then stand. Go light: this one humbles people.',
  'barbell-hip-thrust': 'Upper back against a bench, bar across your hips on a pad, both feet planted. Drive through your heels until your body makes a straight line from knees to shoulders, then lower.',
  'front-squat': 'Bar resting on the front of your shoulders with your elbows held high. Both legs. Squat down with your torso as upright as you can keep it.',
  'bulgarian-split-squat': 'One leg at a time. Rear foot up on a bench behind you, a dumbbell in each hand. Lower until your front thigh is parallel to the floor, then stand. Finish all the reps on one leg before swapping.',
  'leg-press': 'Sitting in the machine with both feet on the platform. Push it away, then let it come back until your knees are bent to about a right angle.',
  'barbell-row': 'Hinge forward at the hips with a flat back, bar hanging at arms length. Pull it into your lower ribs, squeeze your shoulder blades together, and lower it under control.',
  'pendlay-row': 'A barbell row that starts and ends on the floor. The bar comes to a dead stop every rep, so there is no bouncing and every rep starts from nothing.',
  'chest-supported-row': 'Chest against the pad so your lower back is doing none of the work. Pull the handles to your ribs and squeeze.',
  'weighted-chinup': 'Hanging from the bar with your palms facing you, hands about shoulder width. Pull until your chin clears the bar. Once bodyweight is comfortable, hang plates from a dip belt and this app tracks that added weight.',
  'weighted-pullup': 'Same as a chin-up but with your palms facing away and hands wider. Harder on the back, less help from the biceps.',
  'lat-pulldown': 'Seated with your thighs under the pad. Pull the bar down to your collarbone by driving your elbows toward your hips.',
  'leg-curl': 'On the machine, curl your heels toward your backside against the pad, then let it back slowly.',
  'nordic-curl': 'Kneel with your ankles held down. Lower yourself face-first as slowly as you can manage, catch yourself with your hands, and push back up. Bodyweight only, and genuinely hard: a handful of reps is a good set.',
  'standing-calf-raise': 'Standing with the balls of your feet on the step. Rise up as high as you can, then let your heels sink below the step for a stretch at the bottom.',
  'seated-calf-raise': 'The same movement sitting down with the pad on your knees. Bending the knee shifts the work to the deeper calf muscle underneath.',
  'db-lateral-raise': 'Dumbbells at your sides, elbows slightly bent. Raise them out sideways to shoulder height and lower them slowly. Light weight, no swinging.',
  'cable-lateral-raise': 'The same as the dumbbell version but on a low cable, which keeps tension on the shoulder the whole way down.',
  'cable-triceps-pushdown': 'Facing a high cable with your elbows pinned to your sides. Straighten your arms down, then let your hands come back up without your elbows drifting.',
  dips: 'On parallel bars, leaning forward slightly. Lower until your upper arms are parallel with the floor, then press back up. Bodyweight to start; add belt weight once 12 reps is easy.',
  'incline-db-press': 'Bench set to about 30 degrees, a dumbbell in each hand. Press from the outside of your chest up to over your shoulders.',
  'hanging-leg-raise': 'Hang from a bar and raise your legs until your thighs are at least parallel with the floor, without swinging. Bend your knees if straight legs are too much for now.',
  'ab-wheel': 'Kneeling with both hands on the wheel. Roll out as far as you can go while stopping your lower back from sagging, then pull yourself back.',
  'cable-crunch': 'Kneeling under a high cable with the rope beside your head. Curl your ribs down toward your hips. The movement is your spine bending, not your hips folding.',
  'walking-lunge': 'A dumbbell in each hand. Step forward, lower your back knee toward the floor, then step through onto the other leg. Counted per leg.',
  'barbell-curl': 'Standing with the bar in both hands. Curl it to your chest with your elbows staying at your sides.',
  'incline-db-curl': 'Lying back on an incline bench with your arms hanging straight down. Starting from that stretch makes it harder than a standing curl.',
  'hammer-curl': 'Dumbbells held like hammers, palms facing each other, and curled that way throughout. Works the forearm and the outside of the upper arm.',
  'face-pull': 'Rope on a high cable. Pull it toward your face, splitting your hands apart, and finish with your hands beside your ears and your elbows high.',
  'rear-delt-fly': 'Hinged forward with light dumbbells hanging. Sweep your arms out and back, like opening a pair of curtains.',
  'pallof-press': 'Stand side-on to a cable set at chest height, hands clasped in front of your sternum. Press your hands straight out and hold for a beat. The cable is trying to twist you and your only job is to not let it. One side at a time, and it should feel like nothing is moving.'
};

export const EXERCISES = CATALOG.map((e) => ({ ...e, description: DESCRIPTIONS[e.id] ?? '' }));

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
  slot('lowerA-acc3', 0, 'accessory', 'pallof-press', ['ab-wheel', 'hanging-leg-raise', 'cable-crunch']),
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
  { dayIndex: 0, name: 'Lower A', kind: 'lift', slots: ['lowerA-main', 'lowerA-secondary', 'lowerA-acc1', 'lowerA-acc2', 'lowerA-acc3'] },
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

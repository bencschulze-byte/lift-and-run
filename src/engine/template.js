// "What am I doing today", built from the template, the calendar and the
// stored lift state. Pure: hand it a document and a date, get a plan back.
import { TEMPLATE, SLOTS, DAY_NAMES, EXERCISE_BY_ID, isCalibratedType } from './defaults.js';
import { toISODate, dayIndexFor, mondayOf, addDays } from './dates.js';
import { rampSets, restSecondsFor } from './warmup.js';
import {
  isDeloadWeek, prescribedWeight, DELOAD_WEEK_SCHEME, DELOAD_WEEK_ACCESSORY_SETS,
} from './progression.js';
import { z2Session, z5Session, deloadSaturdaySession } from './cardio.js';

export { TEMPLATE, DAY_NAMES };

// Time model, in minutes. Tuned to the budget in spec section 3.
export const GENERAL_WARMUP_MIN = 5;
const WORK_MIN_PER_SET = 0.7;
const UNILATERAL_WORK_MIN_PER_SET = 2 * WORK_MIN_PER_SET + 0.5; // both legs plus the switch
const RAMP_WORK_MIN = 0.5; // ramp sets are light and quick
const RAMP_REST_MIN = 0.75;
const SUPERSET_REST_MIN = 1.0;
export const BUDGET_MIN = 45;

function workMin(exercise) {
  return exercise.unilateral ? UNILATERAL_WORK_MIN_PER_SET : WORK_MIN_PER_SET;
}

function templateFor(doc) {
  return doc?.template ?? TEMPLATE;
}

function slotsFor(doc) {
  if (doc?.slots) return doc.slots;
  return Object.fromEntries(SLOTS.map((s) => [s.id, s]));
}

function exerciseFor(doc, id) {
  return doc?.exercises?.[id] ?? EXERCISE_BY_ID[id];
}

// The day the user is actually doing: the calendar day, unless they swapped.
export function effectiveDayIndex(doc, iso) {
  const swap = doc?.swaps?.[iso];
  return Number.isInteger(swap) ? swap : dayIndexFor(iso);
}

export function planFor(doc, date = new Date()) {
  const iso = toISODate(date);
  const calendarDay = dayIndexFor(iso);
  const dayIndex = effectiveDayIndex(doc, iso);
  const day = templateFor(doc)[dayIndex];
  const deload = isDeloadWeek(doc, iso);
  const settings = doc?.settings ?? {};

  const base = {
    date: iso,
    dayIndex,
    calendarDayIndex: calendarDay,
    swapped: dayIndex !== calendarDay,
    dayName: DAY_NAMES[dayIndex],
    name: day.name,
    kind: day.kind,
    deloadWeek: deload,
  };

  if (day.kind === 'z2') {
    const session = z2Session({ sundayWalk: settings.sundayWalk, isSunday: dayIndex === 6, deloadWeek: deload });
    return { ...base, ...session, name: session.label, estimate: { total: session.totalMinutes, items: [] } };
  }

  if (day.kind === 'z5') {
    const session = deload ? deloadSaturdaySession() : z5Session(doc?.cardioState?.z5Step ?? 0);
    return { ...base, ...session, kind: session.kind, name: session.label ?? 'Zone 5 intervals', estimate: { total: session.totalMinutes, items: [] } };
  }

  const items = day.slots.map((slotId) => buildItem(doc, slotsFor(doc)[slotId], { deload, settings }));
  const estimate = estimateMinutes(items);
  return { ...base, items, estimate, overBudget: estimate.total > BUDGET_MIN };
}

export function planForDayIndex(doc, dayIndex, date = new Date()) {
  const iso = toISODate(date);
  const swaps = { ...(doc?.swaps ?? {}), [iso]: dayIndex };
  return planFor({ ...doc, swaps }, iso);
}

function buildItem(doc, slot, { deload, settings }) {
  const exercise = exerciseFor(doc, slot.current);
  const state = doc?.liftState?.[exercise.id] ?? null;
  const calibrated = isCalibratedType(exercise);
  const item = {
    slotId: slot.id,
    role: slot.role,
    exerciseId: exercise.id,
    exercise,
    optional: false,
    restSeconds: restSecondsFor(slot.role),
  };

  if (calibrated) {
    const needsCalibration = !Number.isFinite(state?.fiveRM);
    const weight = needsCalibration ? null : prescribedWeight(state, exercise, { deload }, settings);
    const scheme = deload ? { ...DELOAD_WEEK_SCHEME } : { ...exercise.repScheme };
    return {
      ...item,
      needsCalibration,
      weight,
      scheme,
      ramp: needsCalibration ? [] : rampSets(weight, exercise, settings),
      manualOverride: state?.manualOverride ?? null,
    };
  }

  // Accessory: weight comes from stored state, or the user is asked for one.
  const scheme = { ...exercise.repScheme };
  if (deload) scheme.sets = DELOAD_WEEK_ACCESSORY_SETS;
  const weight = Number.isFinite(state?.workingWeight) ? state.workingWeight
    : (exercise.loadType === 'bodyweight' || exercise.bodyweightStart ? 0 : null);
  return {
    ...item,
    needsCalibration: false,
    needsStartingWeight: weight === null,
    weight,
    scheme,
    ramp: [],
  };
}

// Honest time estimate: unilateral work counts both legs.
export function estimateMinutes(items = []) {
  const perItem = [];
  let total = GENERAL_WARMUP_MIN;

  const accessories = items.filter((i) => i.role === 'accessory');
  for (const item of items) {
    if (item.role === 'accessory') continue;
    const w = workMin(item.exercise);
    const rampWork = item.exercise.unilateral ? RAMP_WORK_MIN * 2 : RAMP_WORK_MIN;
    const ramp = (item.ramp?.length ?? 0) * (rampWork + RAMP_REST_MIN);
    const sets = item.scheme?.sets ?? 0;
    const rest = (item.restSeconds ?? 120) / 60;
    const working = sets * w + Math.max(0, sets - 1) * rest;
    const minutes = round1(ramp + working);
    perItem.push({ slotId: item.slotId, minutes });
    total += minutes;
  }

  if (accessories.length) {
    // The two accessories are supersetted, so they cost one block, not two.
    const pairs = Math.max(...accessories.map((a) => a.scheme?.sets ?? 0));
    const perPair = accessories.reduce((sum, a) => sum + workMin(a.exercise), 0);
    const minutes = round1(pairs * perPair + Math.max(0, pairs - 1) * SUPERSET_REST_MIN);
    for (const a of accessories) perItem.push({ slotId: a.slotId, minutes: round1(minutes / accessories.length) });
    total += minutes;
  }

  return { total: round1(total), warmup: GENERAL_WARMUP_MIN, items: perItem };
}

// Seven tiles for the Week screen.
export function weekOverview(doc, date = new Date()) {
  const iso = toISODate(date);
  const monday = mondayOf(iso);
  const sessions = doc?.sessions ?? [];
  return templateFor(doc).map((day, i) => {
    const dayISO = addDays(monday, i);
    const done = sessions.filter((s) => s.date === dayISO && s.finishedAt);
    return {
      dayIndex: i,
      dayName: DAY_NAMES[i],
      date: dayISO,
      name: day.name,
      kind: day.kind,
      done: done.length > 0,
      isToday: dayISO === iso,
      deloadWeek: isDeloadWeek(doc, dayISO),
    };
  });
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

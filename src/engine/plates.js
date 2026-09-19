// Loadable-weight math. Pure: no DOM, no storage.
//
// Every prescribed number in the app passes through here so that it is a weight
// that can actually be loaded in the gym.

export const DEFAULT_PLATES = [45, 35, 25, 10, 5, 2.5];
export const MICROPLATE = 1.25;
export const DEFAULT_BAR = 45;

// Dumbbells available in a typical commercial gym rack, in pounds.
export const DEFAULT_DUMBBELLS = (() => {
  const ladder = [];
  for (let w = 5; w <= 100; w += 5) ladder.push(w);
  return ladder;
})();

const EPS = 1e-9;

export function plateSetFor(settings = {}) {
  const plates = (settings.plates ?? DEFAULT_PLATES).slice();
  if (settings.microplates) plates.push(MICROPLATE);
  return plates.sort((a, b) => b - a);
}

export function barWeightFor(settings = {}) {
  return settings.barWeight ?? DEFAULT_BAR;
}

// Smallest change in total bar weight that can be made: two of the lightest plate.
export function smallestBarbellStep(settings = {}) {
  const plates = plateSetFor(settings);
  return 2 * plates[plates.length - 1];
}

// Greedy breakdown of one side of the bar. With any sane plate set (each plate
// a multiple of the next smallest) greedy is optimal.
export function plateBreakdown(weight, settings = {}) {
  const bar = barWeightFor(settings);
  if (weight <= bar + EPS) return { bar, perSide: [], perSideWeight: 0, total: bar, exact: Math.abs(weight - bar) < EPS };
  const plates = plateSetFor(settings);
  let remaining = (weight - bar) / 2;
  const perSide = [];
  for (const p of plates) {
    while (remaining - p >= -EPS) {
      perSide.push(p);
      remaining = round2(remaining - p);
    }
  }
  const perSideWeight = round2(perSide.reduce((a, b) => a + b, 0));
  const total = round2(bar + 2 * perSideWeight);
  return { bar, perSide, perSideWeight, total, exact: Math.abs(total - weight) < EPS };
}

export function roundDownToPlates(weight, settings = {}) {
  return plateBreakdown(weight, settings).total;
}

export function dumbbellLadder(settings = {}) {
  return (settings.dumbbells ?? DEFAULT_DUMBBELLS).slice().sort((a, b) => a - b);
}

export function roundDownToDumbbell(weight, settings = {}) {
  const ladder = dumbbellLadder(settings);
  let best = ladder[0];
  for (const w of ladder) if (w <= weight + EPS) best = w;
  return best;
}

export function nextDumbbell(weight, settings = {}) {
  const ladder = dumbbellLadder(settings);
  for (const w of ladder) if (w > weight + EPS) return w;
  return ladder[ladder.length - 1];
}

function floorTo(weight, step) {
  return round2(Math.floor(weight / step + EPS) * step);
}

// A weight the gym can actually produce for this kind of load.
//   barbell    plates around the bar
//   dumbbell   a dumbbell on the rack (weight is per hand)
//   machine    cable / machine / plate-loaded stack, 5 lb granularity
//   belt       weight hung from a dip belt, 2.5 lb granularity, 0 allowed
//   bodyweight always 0
export function roundForLoadType(weight, loadType, settings = {}) {
  if (loadType === 'bodyweight') return 0;
  if (!Number.isFinite(weight)) return 0;
  switch (loadType) {
    case 'barbell':
      return roundDownToPlates(weight, settings);
    case 'dumbbell':
      return roundDownToDumbbell(weight, settings);
    case 'belt':
      return Math.max(0, floorTo(weight, settings.microplates ? 1.25 : 2.5));
    case 'machine':
    default:
      return Math.max(0, floorTo(weight, 5));
  }
}

// The smallest sensible increase for this load type, used when halving a
// calibration jump or stepping an accessory.
export function smallestStep(loadType, settings = {}) {
  switch (loadType) {
    case 'barbell':
      return smallestBarbellStep(settings);
    case 'belt':
      return settings.microplates ? 1.25 : 2.5;
    case 'dumbbell':
      return 5;
    case 'bodyweight':
      return 0;
    case 'machine':
    default:
      return 5;
  }
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

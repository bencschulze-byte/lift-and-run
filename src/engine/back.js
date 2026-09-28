// The one-tap back check-in at the end of a session, and what it adds up to.
// Pure: sessions in, a summary out. Nothing here changes the program.
import { TEMPLATE, DAY_NAMES } from './defaults.js';

export const BACK_RATINGS = [
  { id: 'fine', label: 'Fine' },
  { id: 'bit', label: 'A bit sore' },
  { id: 'sore', label: 'Sore' },
];

const isSore = (rating) => rating === 'bit' || rating === 'sore';

// Record a rating on a finished session. editedAt makes this copy win when
// sync meets an older copy of the same session from another device.
export function rateBack(doc, sessionId, rating, now = new Date()) {
  const next = structuredClone(doc);
  const session = next.sessions.find((s) => s.id === sessionId);
  if (!session) return next;
  session.back = session.back === rating ? null : rating; // tapping again clears it
  session.editedAt = new Date(now).toISOString();
  return next;
}

// The most recent ratings, oldest first, and per workout how often it ended
// sore - the view that shows whether it follows one day of the week.
export function backSummary(doc, { recent = 14 } = {}) {
  const template = doc?.template ?? TEMPLATE;
  const rated = (doc?.sessions ?? [])
    .filter((s) => s.back)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const byWorkout = new Map();
  for (const s of rated) {
    const name = template[s.dayIndex]?.name ?? DAY_NAMES[s.dayIndex];
    const row = byWorkout.get(name) ?? { name, rated: 0, sore: 0 };
    row.rated += 1;
    if (isSore(s.back)) row.sore += 1;
    byWorkout.set(name, row);
  }

  return {
    recent: rated.slice(-recent).map((s) => ({
      date: s.date,
      dayName: DAY_NAMES[s.dayIndex],
      name: template[s.dayIndex]?.name ?? '',
      back: s.back,
    })),
    byWorkout: [...byWorkout.values()].sort((a, b) => b.sore / b.rated - a.sore / a.rated || b.rated - a.rated),
    total: rated.length,
    sore: rated.filter((s) => isSore(s.back)).length,
  };
}

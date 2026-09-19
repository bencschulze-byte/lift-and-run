// Calendar helpers. Everything is an ISO date string (YYYY-MM-DD) handled in
// UTC so that a workout never shifts a day because of the local timezone.

export function toISODate(value = new Date()) {
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Monday = 0 ... Sunday = 6.
export function dayIndexFor(iso) {
  return (parseISODate(iso).getUTCDay() + 6) % 7;
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso) {
  return addDays(iso, -dayIndexFor(iso));
}

export function daysBetween(a, b) {
  return Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
}

// Whole weeks from the Monday of the start week to the Monday of this week.
export function weekIndexFor(programStart, iso) {
  return Math.floor(daysBetween(mondayOf(programStart), mondayOf(iso)) / 7);
}

export function sameWeek(a, b) {
  return mondayOf(a) === mondayOf(b);
}

export function weeksSince(iso, now) {
  if (!iso) return null;
  return Math.floor(daysBetween(iso, toISODate(now)) / 7);
}

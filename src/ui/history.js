// History: how each lift has moved, and whether the running is getting faster.
import { h, append, fmtDate, fmtNumber, fmtLoad } from './dom.js';
import { DAY_NAMES } from '../engine/defaults.js';
import { pacePerMile } from '../session.js';

export function renderHistory(ctx) {
  ctx.setTitle('History');
  const doc = ctx.doc;
  const sessions = [...(doc.sessions ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  const lifted = liftsWithHistory(doc);

  const chosen = doc.historyLift && lifted.includes(doc.historyLift) ? doc.historyLift : lifted[0];

  return h('div', { class: 'screen-body' },
    lifted.length
      ? liftSection(ctx, lifted, chosen)
      : h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing logged yet. Finish a session and it shows up here.')),
    cardioSection(ctx, sessions),
    sessionList(ctx, sessions),
  );
}

export function liftsWithHistory(doc) {
  const ids = new Set();
  for (const s of doc.sessions ?? []) {
    for (const e of s.exercises ?? []) if ((e.sets ?? []).length) ids.add(e.exerciseId);
  }
  return [...ids].sort((a, b) => (doc.exercises[a]?.name ?? a).localeCompare(doc.exercises[b]?.name ?? b));
}

// One point per session: the top working set, and the 1RM it implies (Epley).
export function liftSeries(doc, exerciseId) {
  const points = [];
  for (const session of [...(doc.sessions ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const entry of session.exercises ?? []) {
      if (entry.exerciseId !== exerciseId) continue;
      const sets = (entry.sets ?? []).filter((s) => !s.ramp && Number(s.reps) > 0);
      if (!sets.length) continue;
      const top = Math.max(...sets.map((s) => Number(s.weight)));
      const e1RM = Math.max(...sets.map((s) => Number(s.weight) * (1 + Number(s.reps) / 30)));
      points.push({ date: session.date, weight: top, e1RM: Math.round(e1RM * 10) / 10, result: entry.result });
    }
  }
  return points;
}

function liftSection(ctx, lifted, chosen) {
  const doc = ctx.doc;
  const select = h('select', {},
    ...lifted.map((id) => h('option', { value: id, selected: id === chosen }, doc.exercises[id]?.name ?? id)),
  );
  select.addEventListener('change', () => ctx.update((d) => { d.historyLift = select.value; }));

  const points = liftSeries(doc, chosen);
  const state = doc.liftState[chosen] ?? {};
  const exercise = doc.exercises[chosen];

  return h('section', { class: 'card' },
    h('div', { class: 'row between' },
      h('h2', {}, 'Per lift'),
      h('a', { class: 'btn small ghost', href: `#/exercise/${chosen}` }, 'Detail'),
    ),
    select,
    lineChart(points, [
      { key: 'weight', label: 'Working weight' },
      { key: 'e1RM', label: 'Estimated 1RM', alt: true },
    ]),
    h('div', { class: 'row between' },
      h('span', { class: 'muted' }, `${points.length} session${points.length === 1 ? '' : 's'}`),
      h('span', { class: 'mono' }, state.workingWeight != null ? fmtLoad(state.workingWeight, exercise) : '-'),
    ),
  );
}

function cardioSection(ctx, sessions) {
  const runs = sessions
    .filter((s) => s.kind === 'z2' || s.kind === 'z5')
    .map((s) => ({ date: s.date, pace: pacePerMile(s.cardio), kind: s.kind }))
    .filter((r) => r.pace)
    .reverse();

  return h('section', { class: 'card' },
    h('h2', {}, 'Running pace'),
    runs.length
      ? h('div', {},
        lineChart(runs, [{ key: 'pace', label: 'Min per mile' }], { invert: true }),
        h('p', { class: 'muted' }, 'Lower is faster. Only runs where you logged a distance appear here.'),
      )
      : h('p', { class: 'muted' }, 'Log a distance on a run to see the pace trend.'),
  );
}

function sessionList(ctx, sessions) {
  const doc = ctx.doc;
  return h('section', { class: 'card' },
    h('h2', {}, 'Sessions'),
    sessions.length === 0 && h('p', { class: 'muted' }, 'Nothing yet.'),
    h('div', { class: 'list' }, ...sessions.slice(0, 40).map((s) => h('div', { class: 'item' },
      h('div', {},
        h('div', {}, `${DAY_NAMES[s.dayIndex]} - ${describe(doc, s)}`),
        h('div', { class: 'muted' }, fmtDate(s.date)),
      ),
      h('span', { class: 'muted mono' }, volume(s)),
    ))),
  );
}

function describe(doc, session) {
  if (session.kind === 'z2') return session.cardio?.duration ? `Zone 2, ${session.cardio.duration} min` : 'Zone 2 run';
  if (session.kind === 'z5') return `Zone 5, ${session.cardio?.intervalsCompleted ?? 0} intervals`;
  const names = (session.exercises ?? [])
    .filter((e) => (e.sets ?? []).length)
    .map((e) => doc.exercises[e.exerciseId]?.name ?? e.exerciseId);
  return names.join(', ') || 'Nothing logged';
}

function volume(session) {
  if (session.kind !== 'lift') {
    return session.cardio?.distance ? `${fmtNumber(session.cardio.distance)} mi` : '';
  }
  const sets = (session.exercises ?? []).reduce((n, e) => n + (e.sets ?? []).filter((s) => !s.ramp).length, 0);
  return `${sets} sets`;
}

// A plain SVG line chart. No library, no axes to speak of: a shape and a range.
export function lineChart(points, series, { invert = false } = {}) {
  const width = 320;
  const height = 140;
  const pad = { left: 34, right: 8, top: 10, bottom: 18 };

  if (points.length === 0) return h('p', { class: 'muted' }, 'No data yet.');

  const values = series.flatMap((s) => points.map((p) => Number(p[s.key])).filter(Number.isFinite));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }

  const x = (i) => pad.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (v) => {
    const t = (v - min) / (max - min);
    return pad.top + (1 - t) * (height - pad.top - pad.bottom);
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', series.map((s) => s.label).join(' and '));

  for (const [i, v] of [max, (max + min) / 2, min].entries()) {
    svg.append(
      svgEl('line', { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), class: 'grid' }),
      svgEl('text', { x: 2, y: y(v) + 3 }, fmtNumber(Math.round(v * 10) / 10)),
    );
  }

  for (const s of series) {
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Number(p[s.key])).toFixed(1)}`)
      .join(' ');
    svg.append(svgEl('path', { d, class: `series${s.alt ? ' alt' : ''}` }));
    if (points.length === 1) svg.append(svgEl('circle', { cx: x(0), cy: y(Number(points[0][s.key])), r: 3, class: 'dot' }));
  }

  svg.append(
    svgEl('text', { x: pad.left, y: height - 4 }, points[0].date.slice(5)),
    svgEl('text', { x: width - pad.right - 28, y: height - 4 }, points.at(-1).date.slice(5)),
  );

  const legend = h('div', { class: 'row wrap' },
    ...series.map((s) => h('span', { class: 'badge' }, s.label)),
    invert && h('span', { class: 'badge' }, 'lower is better'),
  );

  const wrap = h('div', {});
  append(wrap, svg, legend);
  return wrap;
}

function svgEl(tag, attrs, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

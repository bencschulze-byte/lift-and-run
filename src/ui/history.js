// History: how a lift has moved, and whether the running is getting faster.
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
    lifted.length ? liftSection(ctx, lifted, chosen) : emptyLifts(),
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

// One point per session: the top working set, the 1RM it implies (Epley), and
// whether that session was a miss or a deload.
export function liftSeries(doc, exerciseId) {
  const deloadDates = new Set(
    (doc.deloads ?? []).filter((d) => d.exerciseId === exerciseId).map((d) => d.date),
  );
  const points = [];
  for (const session of [...(doc.sessions ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const entry of session.exercises ?? []) {
      if (entry.exerciseId !== exerciseId) continue;
      const sets = (entry.sets ?? []).filter((s) => !s.ramp && Number(s.reps) > 0);
      if (!sets.length) continue;
      const top = Math.max(...sets.map((s) => Number(s.weight)));
      const e1RM = Math.max(...sets.map((s) => Number(s.weight) * (1 + Number(s.reps) / 30)));
      points.push({
        date: session.date,
        weight: top,
        e1RM: Math.round(e1RM * 10) / 10,
        result: entry.result,
        missed: entry.result === 'fail',
        deload: deloadDates.has(session.date),
        // A scheduled deload week: the dip in the line is meant to be there.
        deloadWeek: !!session.deloadWeek,
      });
    }
  }
  return points;
}

function liftSection(ctx, lifted, chosen) {
  const doc = ctx.doc;
  const exercise = doc.exercises[chosen];
  const points = liftSeries(doc, chosen);
  const state = doc.liftState[chosen] ?? {};

  const select = h('select', { 'aria-label': 'Which lift' },
    ...lifted.map((id) => h('option', { value: id, selected: id === chosen }, doc.exercises[id]?.name ?? id)),
  );
  select.addEventListener('change', () => ctx.update((d) => { d.historyLift = select.value; }));

  const first = points[0];
  const latest = points.at(-1);
  const moved = first && latest ? latest.weight - first.weight : 0;

  return h('section', { class: 'card' },
    h('div', { class: 'titlebar' },
      h('h2', {}, 'Progress'),
      h('a', { class: 'btn small ghost', href: `#/exercise/${chosen}` }, 'Detail'),
    ),
    h('hr', { class: 'rule' }),
    select,
    liftChart(points, exercise),
    h('div', { class: 'row between wrap' },
      h('span', { class: 'muted' },
        state.workingWeight != null
          ? `Next: ${fmtLoad(state.workingWeight, exercise)}`
          : 'Not calibrated'),
      points.length > 1 && h('span', { class: 'muted' },
        `${moved >= 0 ? '+' : ''}${fmtNumber(moved)} lb over ${points.length} sessions`),
    ),
  );
}

function emptyLifts() {
  return h('section', { class: 'card' },
    h('h2', {}, 'Progress'),
    h('div', { class: 'empty' },
      h('span', { class: 'mark' }, '↗'),
      h('p', { class: 'muted' }, 'Finish a lifting session and the line starts here.'),
      h('p', { class: 'muted' }, 'A few weeks in, this is where you see whether a lift is still climbing.'),
    ),
  );
}

function cardioSection(ctx, sessions) {
  const runs = sessions
    .filter((s) => s.kind === 'z2' || s.kind === 'z5')
    .map((s) => ({ date: s.date, pace: pacePerMile(s.cardio) }))
    .filter((r) => r.pace)
    .reverse();

  return h('section', { class: 'card' },
    h('h3', {}, 'Running pace'),
    runs.length
      ? h('div', {},
        lineChart(runs, [{ key: 'pace', label: 'Min per mile' }], { format: (v) => fmtNumber(v) }),
        h('p', { class: 'muted' }, 'Lower is faster. Runs where you logged a distance only.'),
      )
      : h('p', { class: 'muted' }, 'Log a distance on a run and the pace trend appears here.'),
  );
}

function sessionList(ctx, sessions) {
  const doc = ctx.doc;
  return h('section', { class: 'card' },
    h('h3', {}, 'Sessions'),
    sessions.length === 0 && h('p', { class: 'muted' }, 'Nothing yet.'),
    h('div', { class: 'list' }, ...sessions.slice(0, 40).map((s) => h('div', { class: 'item' },
      h('div', { class: 'grow' },
        h('div', {}, `${DAY_NAMES[s.dayIndex]} · ${describe(doc, s)}`),
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

// --- the chart ------------------------------------------------------------

// A lift: working weight as a filled line, estimated 1RM dashed behind it, and
// every session marked - amber where reps were missed, red where it deloaded.
export function liftChart(points, exercise) {
  return h('div', {},
    lineChart(points, [
      { key: 'weight', label: 'Top set', area: true },
      { key: 'e1RM', label: 'Estimated 1RM', alt: true },
    ], { markers: true, format: (v) => fmtNumber(v) }),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'line' }), 'Top set'),
      h('span', {}, h('i', { class: 'line alt' }), 'Estimated 1RM'),
      points.some((p) => p.missed) && h('span', {}, h('i', { class: 'missed' }), 'Reps missed'),
      points.some((p) => p.deload) && h('span', {}, h('i', { class: 'deload' }), 'Deload'),
      points.some((p) => p.deloadWeek) && h('span', {}, h('i', { class: 'planned' }), 'Deload week'),
    ),
  );
}

let gradientSeq = 0;

// Plain SVG, no library. Scales to the width it is given.
export function lineChart(points, series, { markers = false, format = (v) => String(v) } = {}) {
  if (!points.length) return h('p', { class: 'muted' }, 'No data yet.');

  const W = 340;
  const H = 190;
  const pad = { left: 40, right: 12, top: 16, bottom: 28 };
  const gradientId = `fade${gradientSeq++}`;

  const values = series.flatMap((s) => points.map((p) => Number(p[s.key])).filter(Number.isFinite));
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (low === high) { low -= 5; high += 5; }
  // Round the scale outwards so the gridlines land on numbers a person would
  // say out loud - 100, 125, 150 - rather than 93, 117, 141.
  const step = niceStep((high - low) / 3);
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks = [];
  for (let v = max; v >= min - 1e-9; v -= step) ticks.push(v);

  const x = (i) => (points.length === 1
    ? (pad.left + W - pad.right) / 2
    : pad.left + (i / (points.length - 1)) * (W - pad.left - pad.right));
  const y = (v) => pad.top + (1 - (v - min) / (max - min)) * (H - pad.top - pad.bottom);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': `${series.map((s) => s.label).join(' and ')} over ${points.length} sessions`,
  });

  const defs = svgEl('defs', {});
  const gradient = svgEl('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(
    svgEl('stop', { offset: '0%', 'stop-color': '#4ea1ff', 'stop-opacity': '0.28' }),
    svgEl('stop', { offset: '100%', 'stop-color': '#4ea1ff', 'stop-opacity': '0' }),
  );
  defs.append(gradient);
  svg.append(defs);

  // Labelled gridlines, so a value can be read off without tapping anything.
  for (const v of ticks) {
    svg.append(
      svgEl('line', { x1: pad.left, x2: W - pad.right, y1: y(v), y2: y(v), class: 'grid' }),
      svgEl('text', { x: pad.left - 6, y: y(v) + 3.5, class: 'label', 'text-anchor': 'end' }, format(v)),
    );
  }
  svg.append(svgEl('line', { x1: pad.left, x2: pad.left, y1: pad.top, y2: H - pad.bottom, class: 'axis' }));

  for (const s of series) {
    const usable = points.map((p, i) => ({ i, v: Number(p[s.key]) })).filter((p) => Number.isFinite(p.v));
    if (!usable.length) continue;
    const d = usable.map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

    if (s.area && usable.length > 1) {
      const floor = H - pad.bottom;
      const area = `${d} L${x(usable.at(-1).i).toFixed(1)},${floor} L${x(usable[0].i).toFixed(1)},${floor} Z`;
      svg.append(svgEl('path', { d: area, fill: `url(#${gradientId})`, stroke: 'none' }));
    }
    svg.append(svgEl('path', { d, class: `series${s.alt ? ' alt' : ''}` }));
  }

  // One dot per session on the main series, coloured by what happened.
  const main = series[0];
  points.forEach((p, i) => {
    const v = Number(p[main.key]);
    if (!Number.isFinite(v)) return;
    const kind = p.deload ? ' deload' : p.missed ? ' missed' : p.deloadWeek ? ' planned' : '';
    if (!markers && !kind && points.length > 1) return;
    svg.append(svgEl('circle', { cx: x(i), cy: y(v), r: kind ? 4 : 3, class: `dot${kind}` }));
  });

  svg.append(
    svgEl('text', { x: pad.left, y: H - 8, class: 'label' }, shortDate(points[0].date)),
    points.length > 2 && svgEl('text', {
      x: (pad.left + W - pad.right) / 2, y: H - 8, class: 'label', 'text-anchor': 'middle',
    }, shortDate(points[Math.floor((points.length - 1) / 2)].date)),
    points.length > 1 && svgEl('text', {
      x: W - pad.right, y: H - 8, class: 'label', 'text-anchor': 'end',
    }, shortDate(points.at(-1).date)),
  );

  return svg;
}

// The smallest "round" step at or above what the range needs.
function niceStep(raw) {
  const steps = [1, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  return steps.find((s) => s >= raw) ?? Math.ceil(raw / 500) * 500;
}

function shortDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function svgEl(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

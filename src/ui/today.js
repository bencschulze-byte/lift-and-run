// The Today screen: what to do right now, and one tap per set to log it.
import { h, append, fmtLoad, fmtScheme, fmtPlates, fmtNumber, fmtMinutes, onLongPress, toast } from './dom.js';
import { planFor, BUDGET_MIN } from '../engine/template.js';
import { startSession, finishSession } from '../session.js';
import { renderCardio } from './cardio.js';

export function renderToday(ctx) {
  const doc = ctx.doc;
  const plan = planFor(doc, ctx.today());
  ctx.setTitle(plan.name);

  if (doc.finishedSummary) return renderSummary(ctx, doc.finishedSummary);
  if (plan.kind !== 'lift') return renderCardio(ctx, plan);

  const session = activeSession(doc, plan);
  const elapsed = session ? (Date.now() - new Date(session.startedAt).getTime()) / 60000 : 0;
  const overBudget = plan.overBudget || elapsed > BUDGET_MIN;

  return h('div', { class: 'screen-body' },
    header(ctx, plan, session),
    ...plan.items.map((item, i) => card(ctx, plan, session, item, i, overBudget)),
    supersetNote(plan),
    finishRow(ctx, plan, session),
  );
}

function header(ctx, plan, session) {
  return h('div', { class: 'card' },
    h('div', { class: 'row between' },
      h('div', {},
        h('h2', {}, plan.name),
        h('p', { class: 'muted' }, `${plan.dayName} - planned ${fmtMinutes(plan.estimate.total)}`),
      ),
      h('div', { class: 'row' },
        plan.deloadWeek && h('span', { class: 'badge warn' }, 'Deload week'),
        plan.swapped && h('span', { class: 'badge accent' }, 'Swapped in'),
      ),
    ),
    !session && h('button', {
      class: 'primary wide',
      onclick: () => {
        ctx.update((d) => { d.activeSession = startSession(plan); });
        ctx.wakeLock.acquire();
      },
    }, 'Start session'),
    plan.overBudget && h('p', { class: 'muted' },
      'This one runs past 45 min: the accessories are optional.'),
  );
}

function card(ctx, plan, session, item, index, overBudget) {
  const entry = session?.exercises?.[index] ?? null;
  const ex = item.exercise;
  const optional = overBudget && item.role === 'accessory';
  const logged = (entry?.sets ?? []).filter((s) => !s.ramp);
  const complete = logged.length >= (item.scheme?.sets ?? 99);

  const el = h('section', { class: `card${optional ? ' optional' : ''}${complete ? ' done' : ''}` },
    h('div', { class: 'row between' },
      h('div', { class: 'grow' },
        h('h2', {}, ex.name),
        h('p', { class: 'muted' }, `${item.role}${optional ? ' - optional today' : ''}`),
      ),
      h('a', { class: 'btn small ghost', href: `#/exercise/${ex.id}` }, 'Detail'),
    ),
  );

  // The calibration ramp was this lift's work for today.
  if (entry?.result === 'calibration' && entry.sets?.length) {
    const state = ctx.doc.liftState[ex.id] ?? {};
    append(el,
      h('span', { class: 'badge good' }, 'Calibrated today'),
      h('p', {}, `5RM ${fmtLoad(state.fiveRM, ex)} - working weight ${fmtLoad(state.workingWeight, ex)} from next time.`),
      h('p', { class: 'muted' }, `${entry.sets.length} ramp sets. That was the work for this lift today.`),
    );
    return el;
  }

  if (item.needsCalibration) {
    append(el,
      h('p', { class: 'muted' }, 'First time on this lift. A short ramp sets your working weight.'),
      h('button', { class: 'primary wide', onclick: () => ctx.navigate(`#/calibrate/${ex.id}`) }, 'Calibrate'),
    );
    return el;
  }

  if (item.needsStartingWeight) {
    append(el, startingWeightForm(ctx, ex));
    return el;
  }

  const plates = fmtPlates(item.weight, ex, ctx.doc.settings);
  append(el,
    h('div', { class: 'row between wrap' },
      h('span', { class: 'big' }, fmtLoad(item.weight, ex)),
      h('span', { class: 'badge' }, fmtScheme(item.scheme, ex)),
    ),
    plates && h('p', { class: 'muted' }, plates),
    item.manualOverride && h('p', { class: 'muted' }, `Manual override in effect (${fmtNumber(item.manualOverride)})`),
  );

  const rows = h('div', { class: 'sets' });
  (item.ramp ?? []).forEach((set, i) => rows.append(setRow(ctx, plan, index, item, set, i, true)));
  for (let i = 0; i < item.scheme.sets; i++) {
    rows.append(setRow(ctx, plan, index, item, null, i, false));
  }
  if (ex.unilateral) rows.append(h('p', { class: 'muted' }, 'Each set is both legs - log it once both are done.'));
  append(el, rows);
  return el;
}

function setRow(ctx, plan, itemIndex, item, rampSet, i, isRamp) {
  const session = activeSession(ctx.doc, plan);
  const entry = session?.exercises?.[itemIndex];
  const all = entry?.sets ?? [];
  const stored = isRamp
    ? all.find((s) => s.ramp && s.index === i)
    : all.filter((s) => !s.ramp)[i];

  const ex = item.exercise;
  const prescribedReps = isRamp ? rampSet.reps : (item.scheme.reps ?? item.scheme.repMax);
  const weight = isRamp ? rampSet.weight : item.weight;
  const reps = stored?.reps ?? prescribedReps;
  // A rep range is met anywhere inside it; straight sets have to hit the number.
  const enough = isRamp ? rampSet.reps : (item.scheme.repMin ?? item.scheme.reps);
  const state = !stored ? '' : (Number(stored.reps) >= enough ? ' logged' : ' short');

  const button = h('button', { class: `tapset${state}` }, `${reps}`);
  button.addEventListener('click', () => {
    if (button.consumedLongPress?.()) return;
    if (!stored) logSet(ctx, plan, itemIndex, i, isRamp, { weight, reps: prescribedReps });
    else cycleReps(ctx, plan, itemIndex, i, isRamp, stored, prescribedReps);
  });
  onLongPress(button, () => openEditor(ctx, plan, itemIndex, i, isRamp, { weight, reps }));

  return h('div', { class: `setrow${isRamp ? ' ramp' : ''}` },
    h('span', { class: 'idx' }, isRamp ? 'W' : `${i + 1}`),
    h('span', { class: 'load' }, fmtLoad(weight, ex), isRamp ? ' - warm-up' : ''),
    button,
  );
}

function openEditor(ctx, plan, itemIndex, i, isRamp, current) {
  const weight = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', value: current.weight ?? 0 });
  const reps = h('input', { type: 'number', inputmode: 'numeric', step: '1', value: current.reps ?? 0 });
  const dialog = h('div', { class: 'card' },
    h('h3', {}, 'Log this set'),
    h('div', { class: 'editor' },
      h('label', {}, 'Weight', weight),
      h('label', {}, 'Reps', reps),
      h('button', {
        class: 'primary',
        onclick: () => {
          logSet(ctx, plan, itemIndex, i, isRamp, { weight: Number(weight.value), reps: Number(reps.value) });
        },
      }, 'Save'),
    ),
    h('button', { class: 'ghost wide small', onclick: () => dialog.remove() }, 'Cancel'),
  );
  document.querySelector('.editor')?.closest('.card')?.remove();
  document.querySelector('#app').prepend(dialog);
  dialog.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function logSet(ctx, plan, itemIndex, i, isRamp, { weight, reps }) {
  const item = plan.items[itemIndex];
  ctx.update((d) => {
    d.activeSession = d.activeSession ?? startSession(plan);
    const entry = d.activeSession.exercises[itemIndex];
    entry.sets = entry.sets ?? [];
    if (isRamp) {
      const existing = entry.sets.find((s) => s.ramp && s.index === i);
      if (existing) Object.assign(existing, { weight, reps });
      else entry.sets.push({ weight, reps, ramp: true, index: i, at: new Date().toISOString() });
    } else {
      const working = entry.sets.filter((s) => !s.ramp);
      if (working[i]) Object.assign(working[i], { weight, reps });
      else entry.sets.push({ weight, reps, at: new Date().toISOString() });
    }
  });
  const rest = isRamp ? 60 : item.restSeconds;
  ctx.timer.start(rest, `${item.exercise.name} - rest`);
  ctx.wakeLock.acquire();
}

function cycleReps(ctx, plan, itemIndex, i, isRamp, stored, prescribed) {
  const next = Number(stored.reps) <= 0 ? prescribed : Number(stored.reps) - 1;
  ctx.update((d) => {
    const entry = d.activeSession.exercises[itemIndex];
    const target = isRamp
      ? entry.sets.find((s) => s.ramp && s.index === i)
      : entry.sets.filter((s) => !s.ramp)[i];
    if (target) target.reps = next;
  });
}

function startingWeightForm(ctx, ex) {
  const input = h('input', { type: 'number', inputmode: 'decimal', step: '2.5', placeholder: '0' });
  return h('div', {},
    h('p', { class: 'muted' }, `Pick a weight you could do for about ${ex.repScheme.repMax} reps.`),
    h('div', { class: 'editor' },
      h('label', {}, 'Starting weight', input),
      h('span', {}),
      h('button', {
        class: 'primary',
        onclick: () => {
          const weight = Number(input.value);
          if (!Number.isFinite(weight) || weight < 0) return toast('Enter a weight');
          ctx.update((d) => {
            d.liftState[ex.id] = { ...(d.liftState[ex.id] ?? {}), workingWeight: weight };
          });
        },
      }, 'Set'),
    ),
  );
}

function supersetNote(plan) {
  const accessories = plan.items.filter((i) => i.role === 'accessory');
  if (accessories.length < 2) return null;
  return h('p', { class: 'muted' },
    `Superset: alternate ${accessories.map((a) => a.exercise.name).join(' and ')}, 60-90 s after each pair.`);
}

function finishRow(ctx, plan, session) {
  const anyLogged = (session?.exercises ?? []).some((e) => (e.sets ?? []).some((s) => !s.ramp));
  return h('div', { class: 'card' },
    h('button', {
      class: 'primary wide',
      disabled: !anyLogged,
      onclick: () => {
        const { doc, summary } = finishSession(ctx.doc, ctx.doc.activeSession);
        ctx.storage.save({ ...doc, finishedSummary: { sessionId: ctx.doc.activeSession.id, summary, date: plan.date } });
        ctx.timer.stop();
        ctx.wakeLock.release();
        ctx.refresh();
      },
    }, 'Finish session'),
    session && h('button', {
      class: 'ghost wide small',
      onclick: () => {
        if (!confirm('Discard everything logged in this session?')) return;
        ctx.update((d) => { d.activeSession = null; });
        ctx.timer.stop();
      },
    }, 'Discard session'),
  );
}

function renderSummary(ctx, finished) {
  ctx.setTitle('Done');
  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('h2', {}, 'Session saved'),
      h('p', { class: 'muted' }, 'Next time you do these lifts:'),
      ...finished.summary.map((line) => h('div', { class: 'summary-line' },
        h('span', {}, line.name),
        h('span', { class: 'mono' }, summaryText(line)),
      )),
      h('button', {
        class: 'primary wide',
        onclick: () => ctx.update((d) => { d.finishedSummary = null; }),
      }, 'Done'),
    ),
  );
}

function summaryText(line) {
  if (line.calibrated) return `calibrated - ${fmtNumber(line.to)}`;
  if (line.held) return `held at ${fmtNumber(line.to)}`;
  if (line.cardio) return `${line.from} -> ${line.to}`;
  const arrow = `${fmtNumber(line.from)} -> ${fmtNumber(line.to)}`;
  if (line.deloaded) return `${arrow} (deload)`;
  if (line.addWeightSuggested) return `${arrow} (time to add weight)`;
  return arrow;
}

export function activeSession(doc, plan) {
  const s = doc.activeSession;
  if (!s) return null;
  if (s.date !== plan.date || s.dayIndex !== plan.dayIndex) return null;
  return s;
}

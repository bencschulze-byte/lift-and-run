// Exercise detail: the numbers for one lift, and the three things you might
// want to change about it - the weight, the calibration, the exercise itself.
import { h, append, fmtLoad, fmtNumber, fmtDate, fmtScheme, toast, confirmDanger } from './dom.js';
import { weeksSince } from '../engine/dates.js';
import { isCalibratedType } from '../engine/defaults.js';
import { swapSlot } from '../session.js';
import { liftSeries, liftChart } from './history.js';

const STALE_WEEKS = 8;

// slotId says which slot you came from, since one exercise can sit in more
// than one; without it, the first slot that runs or offers it.
export function renderExercise(ctx, exerciseId, slotId) {
  const doc = ctx.doc;
  const exercise = doc.exercises[exerciseId];
  if (!exercise) return h('div', { class: 'card' }, h('h2', {}, 'Unknown exercise'));
  ctx.setTitle(exercise.name);

  const state = doc.liftState[exerciseId] ?? {};
  const from = doc.slots[slotId];
  const slot = (from?.options.includes(exerciseId) ? from : null)
    ?? Object.values(doc.slots).find((s) => s.current === exerciseId)
    ?? Object.values(doc.slots).find((s) => s.options.includes(exerciseId));
  const calibrated = isCalibratedType(exercise);
  const stale = weeksSince(state.calibratedAt, ctx.today());

  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('h2', {}, exercise.name),
        h('span', { class: 'badge' }, exercise.type),
      ),
      h('p', { class: 'muted' }, `${exercise.muscles.join(', ')} - ${fmtScheme(exercise.repScheme, exercise)}`),
      exercise.description && h('p', { class: 'dim' }, exercise.description),
      line('Prescription', state.manualOverride ?? state.workingWeight, exercise),
      calibrated && line('5RM', state.fiveRM, exercise),
      calibrated && h('div', { class: 'summary-line' },
        h('span', {}, 'Estimated 1RM'),
        h('span', { class: 'mono' }, state.e1RM != null ? fmtNumber(state.e1RM) : '-'),
      ),
      h('div', { class: 'summary-line' },
        h('span', {}, 'Fail streak'),
        h('span', { class: 'mono' }, String(state.failStreak ?? 0)),
      ),
      calibrated && h('div', { class: 'summary-line' },
        h('span', {}, 'Calibrated'),
        h('span', { class: 'mono' }, state.calibratedAt ? fmtDate(state.calibratedAt) : 'never'),
      ),
      state.calibrationCapped && h('p', { class: 'badge warn' }, 'Calibration was capped at 8 sets.'),
      calibrated && stale !== null && stale > STALE_WEEKS
        && h('p', { class: 'badge warn' }, `Last calibrated ${stale} weeks ago - the working weight may be out of date.`),
    ),

    overrideCard(ctx, exercise, state),
    calibrated && h('section', { class: 'card' },
      h('h3', {}, 'Calibration'),
      h('p', { class: 'muted' }, 'Re-running clears the 5RM and ramps again from the start weight.'),
      h('button', {
        class: 'wide',
        onclick: () => {
          if (!confirmDanger(`Re-calibrate ${exercise.name}? This clears its 5RM.`)) return;
          ctx.update((d) => {
            d.liftState[exercise.id] = { ...(d.liftState[exercise.id] ?? {}), fiveRM: null, e1RM: null, manualOverride: null };
            d.calibration = null;
          });
          ctx.navigate(`#/calibrate/${exercise.id}`);
        },
      }, 'Re-calibrate'),
    ),

    slot && swapCard(ctx, slot, exercise),
    historyCard(ctx, exercise),
  );
}

function line(label, value, exercise) {
  return h('div', { class: 'summary-line' },
    h('span', {}, label),
    h('span', { class: 'mono' }, value != null ? fmtLoad(value, exercise) : '-'),
  );
}

function overrideCard(ctx, exercise, state) {
  const input = h('input', {
    type: 'number', inputmode: 'decimal', step: '2.5',
    value: state.manualOverride ?? state.workingWeight ?? '',
  });
  return h('section', { class: 'card' },
    h('h3', {}, 'Next prescription'),
    h('p', { class: 'muted' }, 'Set it to whatever you want. This does not reset the fail streak.'),
    h('div', { class: 'editor' },
      h('label', {}, 'Weight', input),
      h('span', {}),
      h('button', {
        class: 'primary',
        onclick: () => {
          const weight = Number(input.value);
          if (!Number.isFinite(weight) || weight < 0) return toast('Enter a weight');
          ctx.update((d) => {
            d.liftState[exercise.id] = { ...(d.liftState[exercise.id] ?? {}), manualOverride: weight };
          });
          toast(`Next ${exercise.name}: ${fmtLoad(weight, exercise)}`);
        },
      }, 'Set'),
    ),
    state.manualOverride != null && h('button', {
      class: 'ghost wide small',
      onclick: () => ctx.update((d) => { d.liftState[exercise.id].manualOverride = null; }),
    }, 'Clear override'),
  );
}

function swapCard(ctx, slot, exercise) {
  const doc = ctx.doc;
  if (!slot.rotatable || slot.options.length < 2) {
    return h('section', { class: 'card' },
      h('h3', {}, 'Slot'),
      h('p', { class: 'muted' }, 'Main lifts never rotate: linear progression depends on repeating them weekly.'),
    );
  }

  const card = h('section', { class: 'card' },
    h('h3', {}, 'Swap this slot'),
    h('p', { class: 'muted' }, 'The slot keeps its progression rules. Anything you swap away keeps its weight for when you come back.'),
  );

  for (const id of slot.options) {
    const other = doc.exercises[id];
    const stored = doc.liftState[id];
    const stale = weeksSince(stored?.calibratedAt, ctx.today());
    const isCurrent = id === slot.current;
    append(card, h('div', { class: 'row between' },
      h('div', { class: 'grow' },
        h('div', {}, other?.name ?? id),
        h('div', { class: 'muted' },
          stored?.workingWeight != null
            ? `last at ${fmtLoad(stored.workingWeight, other)}${stale > STALE_WEEKS ? ` - ${stale} weeks ago` : ''}`
            : 'never done'),
      ),
      isCurrent
        ? h('span', { class: 'badge good' }, 'Current')
        : h('button', {
          class: 'small',
          onclick: () => {
            ctx.storage.save(swapSlot(ctx.doc, slot.id, id, ctx.today()));
            toast(`Slot now runs ${other?.name ?? id}`);
            ctx.navigate(`#/exercise/${id}/${slot.id}`);
          },
        }, 'Use this'),
    ));
  }
  return card;
}

function historyCard(ctx, exercise) {
  const points = liftSeries(ctx.doc, exercise.id);
  return h('section', { class: 'card' },
    h('h3', {}, 'History'),
    points.length
      ? h('div', {},
        liftChart(points, exercise),
        h('div', { class: 'list' }, ...points.slice(-10).reverse().map((p) => h('div', { class: 'item' },
          h('span', {}, fmtDate(p.date)),
          h('span', { class: 'mono' }, `${fmtLoad(p.weight, exercise)}${p.result === 'fail' ? ' - missed' : ''}`),
        ))),
      )
      : h('p', { class: 'muted' }, 'Nothing logged for this lift yet.'),
  );
}

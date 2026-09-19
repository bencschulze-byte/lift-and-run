// The calibration wizard: one ramp set per screen, five big buttons.
import { h, fmtLoad, fmtPlates, fmtNumber, fmtClock, toast } from './dom.js';
import {
  startCalibration, applyFeedback, stopHere, nextSet, finishCalibration,
  suggestsPulldownSwap, FEEDBACK, MAX_RAMP_SETS,
} from '../engine/calibration.js';
import { applyCalibration } from '../session.js';

const HINTS = {
  easy: 'RPE 6 or less',
  moderate: 'RPE 7',
  hard: 'RPE 8',
  nearmax: 'RPE 9 - this is my 5RM',
  failed: 'Did not get 5 reps',
};

export function renderCalibrate(ctx, exerciseId) {
  const doc = ctx.doc;
  const exercise = doc.exercises[exerciseId];
  if (!exercise) return h('p', {}, 'Unknown exercise.');
  ctx.setTitle(`Calibrate ${exercise.name}`);

  const state = doc.calibration?.exerciseId === exerciseId
    ? doc.calibration
    : startCalibration(exercise, doc.settings);

  if (state.done) return renderResult(ctx, exercise, state);

  const set = nextSet(state);
  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('h2', {}, exercise.name),
        h('span', { class: 'badge' }, `Set ${set.index + 1} of up to ${MAX_RAMP_SETS}`),
      ),
      h('p', { class: 'muted' },
        'Ramp up in fives until five reps feels like a limit. This replaces today\'s work for this lift.'),
      h('div', { class: 'wizard-weight' },
        h('p', { class: 'big' }, fmtLoad(set.weight, exercise)),
        h('p', { class: 'muted' }, `5 reps${set.perLeg ? ' per leg' : ''}`),
        fmtPlates(set.weight, exercise, doc.settings) && h('p', { class: 'muted' }, fmtPlates(set.weight, exercise, doc.settings)),
      ),
      h('p', { class: 'muted' }, `Rest ${fmtClock(set.restSeconds)} between sets.`),
    ),
    h('section', { class: 'card' },
      h('h3', {}, 'How did that feel?'),
      h('div', { class: 'rpe-grid' },
        ...['easy', 'moderate', 'hard', 'nearmax'].map((key) => button(ctx, exercise, state, key)),
        button(ctx, exercise, state, 'failed', true),
      ),
    ),
    doneSoFar(state, exercise),
    h('div', { class: 'card' },
      h('button', {
        class: 'ghost wide',
        onclick: () => saveState(ctx, stopHere(state)),
        disabled: state.sets.length === 0,
      }, 'Stop here'),
      h('button', {
        class: 'ghost wide small',
        onclick: () => { ctx.update((d) => { d.calibration = null; }); ctx.navigate('#/today'); },
      }, 'Cancel'),
    ),
  );
}

function button(ctx, exercise, state, key, wide = false) {
  return h('button', {
    class: wide ? 'span2' : '',
    onclick: () => {
      const next = applyFeedback(state, key, ctx.doc.settings);
      saveState(ctx, next);
      if (!next.done) ctx.timer.start(restFor(next), `${exercise.name} - rest`);
    },
  }, FEEDBACK[key].label, h('span', {}, HINTS[key]));
}

function restFor(state) {
  return state.sets.some((s) => (s.rpe ?? 0) >= 7) ? 180 : 120;
}

function saveState(ctx, state) {
  ctx.update((d) => { d.calibration = state; });
}

function doneSoFar(state, exercise) {
  if (!state.sets.length) return null;
  return h('section', { class: 'card' },
    h('h3', {}, 'So far'),
    ...state.sets.map((s, i) => h('div', { class: 'summary-line' },
      h('span', {}, `Set ${i + 1} - ${fmtLoad(s.weight, exercise)}`),
      h('span', { class: 'muted' }, FEEDBACK[s.feedback].label),
    )),
  );
}

function renderResult(ctx, exercise, state) {
  const out = finishCalibration(state, exercise, ctx.doc.settings, ctx.today());

  if (out.needsLighterStart) {
    return h('div', { class: 'screen-body' },
      h('section', { class: 'card' },
        h('h2', {}, 'Start lighter'),
        h('p', { class: 'muted' }, `${fmtLoad(state.sets[0].weight, exercise)} was already too heavy for five reps. Run it again from a lighter start.`),
        h('button', {
          class: 'primary wide',
          onclick: () => { ctx.update((d) => { d.calibration = null; }); ctx.refresh(); },
        }, 'Try again'),
      ),
    );
  }

  const swap = suggestsPulldownSwap(state, exercise);

  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('h2', {}, `${exercise.name} calibrated`),
      h('div', { class: 'summary-line' }, h('span', {}, '5RM'), h('span', { class: 'mono' }, fmtLoad(out.fiveRM, exercise))),
      h('div', { class: 'summary-line' }, h('span', {}, 'Estimated 1RM'), h('span', { class: 'mono' }, fmtNumber(out.e1RM))),
      h('div', { class: 'summary-line' },
        h('span', {}, 'Working weight'),
        h('span', { class: 'mono' }, fmtLoad(out.workingWeight, exercise)),
      ),
      out.capped && h('p', { class: 'badge warn' }, 'Calibration capped at 8 sets - consider re-running it.'),
      h('button', {
        class: 'primary wide',
        onclick: () => {
          const doc = applyCalibration(ctx.doc, exercise.id, out, ctx.today());
          doc.calibration = null;
          markSessionCalibrated(doc, exercise.id, state);
          ctx.storage.save(doc);
          toast(`${exercise.name} set to ${fmtLoad(out.workingWeight, exercise)}`);
          ctx.navigate('#/today');
        },
      }, 'Save and go back'),
    ),
    swap && h('section', { class: 'card' },
      h('h3', {}, 'Chin-ups are already near max'),
      h('p', { class: 'muted' }, 'Five bodyweight reps is at RPE 9 or beyond, so this slot should run lat pulldowns until chin-ups come down in effort.'),
      h('button', {
        class: 'wide',
        onclick: () => {
          ctx.update((d) => {
            const slot = Object.values(d.slots).find((s) => s.current === exercise.id);
            if (slot) {
              slot.current = 'lat-pulldown';
              d.rotations.push({ date: ctx.today(), slotId: slot.id, from: exercise.id, to: 'lat-pulldown' });
            }
            d.calibration = null;
          });
          ctx.navigate('#/today');
        },
      }, 'Switch this slot to lat pulldown'),
    ),
  );
}

// Mark the matching entry in today's session so the finish flow knows it was a
// calibration rather than a failed set of working sets, and keep the ramp as
// the record of what was actually lifted.
function markSessionCalibrated(doc, exerciseId, state) {
  const entry = doc.activeSession?.exercises?.find((e) => e.exerciseId === exerciseId);
  if (!entry) return;
  entry.result = 'calibration';
  entry.sets = state.sets.map((s) => ({ weight: s.weight, reps: s.reps ?? 0, rpe: s.rpe ?? null }));
}

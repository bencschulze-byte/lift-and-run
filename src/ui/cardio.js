// The two running days: an easy Zone 2 log, and the Zone 5 interval timer.
import { h, fmtClock, toast } from './dom.js';
import { hrRange } from '../engine/cardio.js';
import { startSession, finishSession } from '../session.js';
import { createIntervalTimer } from './timer.js';
import { swapPanel } from './swap.js';

export function renderCardio(ctx, plan) {
  return plan.kind === 'z5' ? renderZ5(ctx, plan) : renderZ2(ctx, plan);
}

function guidance(ctx, zone, text) {
  const range = hrRange(zone, ctx.doc.settings);
  return h('p', { class: 'muted' }, range ? `${text} That is about ${range.low}-${range.high} bpm.` : text);
}

function renderZ2(ctx, plan) {
  ctx.setTitle(plan.label ?? 'Zone 2 run');
  const form = logForm(ctx, plan, {
    duration: plan.duration,
    fields: ['duration', 'distance', 'avgHR', 'rpe', 'notes'],
  });
  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('h2', {}, plan.walk ? 'Easy walk' : 'Zone 2 run'),
      h('p', { class: 'big' }, `${plan.duration} min`),
      guidance(ctx, 'z2', 'Conversational pace: you should be able to breathe through your nose and hold a sentence.'),
      plan.deloadWeek && h('span', { class: 'badge warn' }, 'Deload week'),
    ),
    form,
    swapPanel(ctx, plan),
  );
}

function renderZ5(ctx, plan) {
  ctx.setTitle('Zone 5 intervals');
  const phaseLabel = h('p', { class: 'big' }, 'Ready');
  const countdown = h('p', { class: 'big mono' }, fmtClock((plan.phases?.[0]?.minutes ?? 0) * 60));
  const state = h('p', { class: 'muted' }, `${plan.intervals} x ${plan.workMin} min hard, ${plan.recoveryMin} min jog - ${plan.totalMinutes} min total`);

  const timer = createIntervalTimer(plan, {
    onPhase: (phase) => {
      phaseLabel.textContent = phase.label;
      document.body.dataset.phase = phase.kind;
    },
    onTick: (left) => { countdown.textContent = fmtClock(left); },
    onFinish: () => {
      phaseLabel.textContent = 'Finished';
      countdown.textContent = '0:00';
      toast('Session complete');
    },
  });

  const startBtn = h('button', { class: 'primary grow' }, 'Start');
  startBtn.addEventListener('click', () => {
    if (timer.paused) {
      timer.start();
      ctx.wakeLock.acquire();
      startBtn.textContent = 'Pause';
    } else {
      timer.pause();
      startBtn.textContent = 'Resume';
    }
  });

  ctx.onLeave(() => timer.stop());

  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('h2', {}, `Step ${plan.step}`),
        plan.atCap && h('span', { class: 'badge' }, 'Top of the ladder'),
      ),
      state,
      guidance(ctx, 'z5', 'Hard means an effort you could not hold for more than about five minutes.'),
    ),
    h('section', { class: 'card', style: 'text-align:center' },
      phaseLabel,
      countdown,
      h('div', { class: 'row' },
        startBtn,
        h('button', { class: 'small', onclick: () => timer.skip() }, 'Skip phase'),
      ),
    ),
    logForm(ctx, plan, {
      intervals: plan.intervals,
      fields: ['intervalsCompleted', 'distance', 'avgHR', 'rpe', 'notes'],
      getIntervals: () => timer.intervalsDone(),
    }),
    swapPanel(ctx, plan),
  );
}

function logForm(ctx, plan, { fields, duration, intervals, getIntervals }) {
  const inputs = {};
  const rows = [];

  if (fields.includes('duration')) {
    inputs.duration = numberInput(duration ?? plan.duration ?? 40, '1');
    rows.push(h('label', {}, 'Duration (min)', inputs.duration));
  }
  if (fields.includes('intervalsCompleted')) {
    inputs.intervalsCompleted = numberInput(intervals ?? 0, '1');
    rows.push(h('label', {}, 'Intervals completed', inputs.intervalsCompleted));
  }
  inputs.distance = numberInput('', '0.01');
  rows.push(h('label', {}, 'Distance (miles, optional)', inputs.distance));
  inputs.avgHR = numberInput('', '1');
  rows.push(h('label', {}, 'Average HR (optional)', inputs.avgHR));

  let rpe = null;
  const rpeRow = h('div', { class: 'row wrap' });
  for (let i = 1; i <= 10; i++) {
    const b = h('button', { class: 'small' }, String(i));
    b.addEventListener('click', () => {
      rpe = i;
      [...rpeRow.children].forEach((c) => c.classList.remove('primary'));
      b.classList.add('primary');
    });
    rpeRow.append(b);
  }
  const notes = h('textarea', { placeholder: 'Notes' });

  return h('section', { class: 'card' },
    h('h3', {}, 'Log it'),
    ...rows,
    h('label', {}, 'RPE', rpeRow),
    h('label', {}, 'Notes', notes),
    h('button', {
      class: 'primary wide',
      onclick: () => {
        const session = startSession(plan);
        session.cardio = {
          duration: num(inputs.duration) ?? plan.duration ?? plan.totalMinutes,
          distance: num(inputs.distance),
          avgHR: num(inputs.avgHR),
          intervalsCompleted: fields.includes('intervalsCompleted')
            ? (num(inputs.intervalsCompleted) ?? getIntervals?.() ?? 0)
            : null,
          rpe,
        };
        session.notes = notes.value;
        const { doc, summary } = finishSession(ctx.doc, session);
        ctx.storage.save({ ...doc, finishedSummary: { summary, date: plan.date } });
        ctx.wakeLock.release();
        ctx.refresh();
      },
    }, 'Save session'),
  );
}

function numberInput(value, step) {
  return h('input', { type: 'number', inputmode: 'decimal', step, value: value === '' ? '' : String(value) });
}

function num(input) {
  const v = Number(input?.value);
  return input && input.value !== '' && Number.isFinite(v) ? v : null;
}

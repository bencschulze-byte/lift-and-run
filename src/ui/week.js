// The Week screen: seven tiles, plus the deload-week rotation prompt.
import { h, append, fmtDate, toast } from './dom.js';
import { weekOverview } from '../engine/template.js';
import { isDeloadWeek } from '../engine/progression.js';
import { mondayOf, addDays } from '../engine/dates.js';
import { scheduleRotation } from '../session.js';

export function renderWeek(ctx) {
  ctx.setTitle('Week');
  const doc = ctx.doc;
  const today = ctx.today();
  const week = weekOverview(doc, today);

  return h('div', { class: 'screen-body' },
    isDeloadWeek(doc, today) && rotationPrompt(ctx, today),
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('h2', {}, 'This week'),
        isDeloadWeek(doc, today) && h('span', { class: 'badge warn' }, 'Deload'),
      ),
      h('div', { class: 'week-grid' }, ...week.map((tile) => tileFor(ctx, tile, today))),
    ),
  );
}

function tileFor(ctx, tile, today) {
  const el = h('div', { class: `card tile${tile.isToday ? ' today' : ''}${tile.done ? ' done' : ''}` },
    h('span', { class: 'day' }, tile.dayName),
    h('span', { class: 'name' }, tile.name),
    h('span', { class: 'muted' }, !tile.done ? fmtDate(tile.date)
      : tile.doneOn === tile.date ? 'Done' : `Done ${fmtDate(tile.doneOn)}`),
    tile.doingToday && h('span', { class: 'badge accent' }, `Today: ${tile.doingToday}`),
  );
  if (!tile.isToday) {
    append(el, h('button', {
      class: 'small',
      onclick: () => {
        ctx.update((d) => { d.swaps = { ...(d.swaps ?? {}), [today]: tile.dayIndex }; });
        toast(`${tile.name} moved to today`);
        ctx.navigate('#/today');
      },
    }, 'Do this today'));
  } else if (ctx.doc.swaps?.[today] !== undefined) {
    append(el, h('button', {
      class: 'small ghost',
      onclick: () => ctx.update((d) => { delete d.swaps[today]; }),
    }, 'Undo swap'));
  }
  return el;
}

// Spec 3b: the deload week is when the app nudges you to rotate accessories
// and secondaries for the next block. Default is keep.
function rotationPrompt(ctx, today) {
  const doc = ctx.doc;
  const effectiveFrom = addDays(mondayOf(today), 7);
  // In the order the week runs them, not the order they were stored in.
  const rotatable = doc.template.flatMap((d) => d.slots ?? []).map((id) => doc.slots[id])
    .filter((s) => s?.rotatable && s.options.length > 1);

  return h('section', { class: 'card' },
    h('h2', {}, 'Rotate for next block?'),
    h('p', { class: 'muted' }, `Anything you change here starts on ${effectiveFrom}. Leave them as they are to keep going.`),
    ...rotatable.map((slot) => {
      const select = h('select', {},
        ...slot.options.map((id) => h('option', {
          value: id,
          selected: (slot.pending?.to ?? slot.current) === id,
        }, doc.exercises[id]?.name ?? id)),
      );
      select.addEventListener('change', () => {
        ctx.storage.save(scheduleRotation(ctx.doc, slot.id, select.value, effectiveFrom));
        toast(select.value === slot.current ? 'Keeping it' : `From ${effectiveFrom}`);
      });
      return h('label', {}, `${slotLabel(slot)} - now ${doc.exercises[slot.current]?.name}`, select);
    }),
  );
}

function slotLabel(slot) {
  const day = slot.id.startsWith('lowerA') ? 'Lower A'
    : slot.id.startsWith('upperA') ? 'Upper A'
      : slot.id.startsWith('lowerB') ? 'Lower B' : 'Upper B';
  const acc = slot.id.match(/acc(\d)$/);
  const role = slot.id.endsWith('secondary') ? 'secondary'
    : slot.optional ? 'back care' : `accessory ${acc?.[1] ?? ''}`.trim();
  return `${day} ${role}`;
}

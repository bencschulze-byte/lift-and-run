// "Do a different workout today": the short way to make up a missed day,
// shown at the foot of the Today screen. The Week tab can swap in any day;
// this offers only the likely ones.
import { h, toast } from './dom.js';
import { missedThisWeek, weekOverview } from '../engine/template.js';

export function swapPanel(ctx, plan) {
  const today = plan.date;
  const tiles = weekOverview(ctx.doc, today);
  const own = tiles[plan.calendarDayIndex];

  if (plan.swapped) {
    return h('section', { class: 'card' },
      h('p', { class: 'muted' }, `Doing ${plan.dayName}'s ${tiles[plan.dayIndex].name} in place of ${own.name}.`),
      h('button', {
        class: 'ghost wide small',
        onclick: () => {
          ctx.update((d) => { delete d.swaps[today]; });
          toast(`Back to ${own.name}`);
        },
      }, `Back to ${own.name}`),
    );
  }

  const missed = missedThisWeek(ctx.doc, today);
  const alreadyDone = tiles[plan.dayIndex].done && tiles[plan.dayIndex].doneOn !== today;
  if (!missed.length && !alreadyDone) {
    return h('p', { class: 'muted', style: 'text-align:center' }, h('a', { href: '#/week' }, 'Do a different day\'s workout'));
  }

  return h('section', { class: 'card' },
    h('h3', {}, alreadyDone ? 'Already done this week' : 'Missed a workout?'),
    alreadyDone && h('p', { class: 'muted' }, `You did ${plan.name} earlier this week.`),
    missed.length > 0 && h('p', { class: 'muted' }, 'Do it today instead:'),
    ...missed.map((t) => h('button', {
      class: 'wide',
      onclick: () => {
        ctx.update((d) => { d.swaps = { ...(d.swaps ?? {}), [today]: t.dayIndex }; });
        toast(`${t.name} moved to today`);
        window.scrollTo({ top: 0 });
      },
    }, `${t.dayName} · ${t.name}`)),
    h('p', { class: 'muted', style: 'text-align:center' }, h('a', { href: '#/week' }, 'Or pick any day')),
  );
}

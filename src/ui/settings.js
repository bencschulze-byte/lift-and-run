// Settings: the gym, the runner, and the data.
import { h, toast, confirmDanger, fmtNumber } from './dom.js';
import { DEFAULT_PLATES, MICROPLATE } from '../engine/plates.js';
import { maxHRFor } from '../engine/cardio.js';
import { renderSync } from './sync-panel.js';

export function renderSettings(ctx) {
  ctx.setTitle('Settings');
  const doc = ctx.doc;
  const s = doc.settings;

  const set = (key) => (value) => ctx.update((d) => { d.settings[key] = value; });

  return h('div', { class: 'screen-body' },
    h('section', { class: 'card' },
      h('h2', {}, 'The bar'),
      numberField('Bar weight (lb)', s.barWeight, set('barWeight')),
      plateField(ctx, s),
      toggle('Microplates (1.25 lb)', s.microplates, set('microplates'),
        'Lets the bar move in 2.5 lb steps, and gives the overhead press a 2.5 lb increment.'),
      h('label', { class: 'inline' }, 'Units', h('span', { class: 'badge' }, 'lb')),
    ),

    h('section', { class: 'card' },
      h('h2', {}, 'Running'),
      numberField('Age', s.age, set('age'), { placeholder: 'optional' }),
      numberField('Max HR', s.maxHR, set('maxHR'), { placeholder: 'optional' }),
      h('p', { class: 'muted' }, maxHRFor(s)
        ? `Zones are based on a max HR of ${maxHRFor(s)}.`
        : 'With neither set, runs are prescribed by effort only.'),
      toggle('Make Sunday an easy walk instead', s.sundayWalk, set('sundayWalk')),
    ),

    h('section', { class: 'card' },
      h('h2', {}, 'Program'),
      h('label', {}, 'Program start',
        h('input', {
          type: 'date',
          value: s.programStart ?? '',
          onchange: (e) => set('programStart')(e.target.value),
        })),
      h('p', { class: 'muted' }, 'Deload weeks are counted every 7th week from the Monday of this week.'),
      toggle('Force deload week (dev)', s.forceDeloadWeek, set('forceDeloadWeek'),
        'Treats the current week as a deload week so you can see what it looks like.'),
    ),

    renderSync(ctx),
    dataCard(ctx),
  );
}

function numberField(label, value, onSave, { placeholder = '' } = {}) {
  const input = h('input', {
    type: 'number', inputmode: 'decimal', placeholder,
    value: value === null || value === undefined ? '' : String(value),
  });
  input.addEventListener('change', () => {
    onSave(input.value === '' ? null : Number(input.value));
  });
  return h('label', {}, label, input);
}

function toggle(label, checked, onChange, hint) {
  const box = h('input', { type: 'checkbox', checked: !!checked });
  box.addEventListener('change', () => onChange(box.checked));
  return h('div', {},
    h('label', { class: 'inline' }, label, box),
    hint && h('p', { class: 'muted' }, hint),
  );
}

function plateField(ctx, settings) {
  const current = settings.plates ?? DEFAULT_PLATES;
  const row = h('div', { class: 'row wrap' });
  for (const plate of DEFAULT_PLATES) {
    const on = current.includes(plate);
    const b = h('button', { class: `small${on ? ' primary' : ''}` }, fmtNumber(plate));
    b.addEventListener('click', () => {
      const next = on ? current.filter((p) => p !== plate) : [...current, plate].sort((a, z) => z - a);
      if (!next.length) return toast('Keep at least one plate');
      ctx.update((d) => { d.settings.plates = next; });
    });
    row.append(b);
  }
  return h('div', {},
    h('label', {}, 'Plates in the gym (per side)'),
    row,
    h('p', { class: 'muted' }, `Smallest step: ${fmtNumber(2 * Math.min(...(settings.microplates ? [...current, MICROPLATE] : current)))} lb on the bar.`),
  );
}

function dataCard(ctx) {
  const fileInput = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      ctx.storage.importJSON(await file.text());
      toast('Imported');
      ctx.refresh();
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });

  return h('section', { class: 'card' },
    h('h2', {}, 'Data'),
    h('button', {
      class: 'wide',
      onclick: () => {
        const blob = new Blob([ctx.storage.exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: `lift-and-run-${ctx.today()}.json` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    }, 'Export JSON'),
    h('button', { class: 'wide', onclick: () => fileInput.click() }, 'Import JSON'),
    fileInput,
    h('hr'),
    h('button', {
      class: 'wide danger',
      onclick: () => {
        if (!confirmDanger('Delete every session, weight and setting on this device?')) return;
        if (!confirmDanger('Really? This cannot be undone.')) return;
        ctx.storage.reset();
        toast('Everything reset');
        ctx.navigate('#/today');
      },
    }, 'Reset all data'),
  );
}

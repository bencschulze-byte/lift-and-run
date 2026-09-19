// Tiny DOM helpers and shared formatting. No framework.
import { plateBreakdown } from '../engine/plates.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el) {
  el.replaceChildren();
  return el;
}

// --- formatting -----------------------------------------------------------

export function fmtNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// How a prescription reads on the card.
export function fmtLoad(weight, exercise) {
  if (!exercise) return `${fmtNumber(weight)} lb`;
  if (exercise.loadType === 'bodyweight') return 'Bodyweight';
  if (exercise.addedWeight) return weight ? `BW + ${fmtNumber(weight)}` : 'Bodyweight';
  if (exercise.loadType === 'dumbbell') return `${fmtNumber(weight)} lb each`;
  return `${fmtNumber(weight)} lb`;
}

export function fmtScheme(scheme, exercise) {
  if (!scheme) return '';
  const perLeg = exercise?.unilateral ? ' per leg' : '';
  if (scheme.reps) return `${scheme.sets} x ${scheme.reps}${perLeg}`;
  return `${scheme.sets} x ${scheme.repMin}-${scheme.repMax}${perLeg}`;
}

// "135 = 45 per side" - the number that stops you doing mental arithmetic mid-set.
export function fmtPlates(weight, exercise, settings) {
  if (!exercise || exercise.loadType !== 'barbell' || !Number.isFinite(weight)) return '';
  const { perSide, bar } = plateBreakdown(weight, settings);
  if (!perSide.length) return `${fmtNumber(weight)} = empty bar`;
  return `${fmtNumber(weight)} = ${perSide.map(fmtNumber).join(' + ')} per side`;
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtMinutes(min) {
  return `${Math.round(min)} min`;
}

export function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// --- interaction ----------------------------------------------------------

// Long press without breaking ordinary taps or scrolling.
export function onLongPress(el, handler, ms = 450) {
  let timer = null;
  let fired = false;
  const start = () => {
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      if (navigator.vibrate) navigator.vibrate(12);
      handler();
    }, ms);
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.consumedLongPress = () => fired;
  return () => { cancel(); };
}

let toastTimer = null;
export function toast(message, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

export function confirmDanger(message) {
  return globalThis.confirm(message);
}

// Native append turns null into the text "null"; this one skips empties.
export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Hash router and bootstrap.
import { createStorage } from './storage.js';
import { createRestTimer, createWakeLock } from './ui/timer.js';
import { toISODate } from './engine/dates.js';
import { h, clear, fmtClock } from './ui/dom.js';
import { renderToday } from './ui/today.js';
import { renderCalibrate } from './ui/calibrate.js';
import { renderWeek } from './ui/week.js';
import { renderHistory } from './ui/history.js';
import { renderExercise } from './ui/exercise.js';
import { renderSettings } from './ui/settings.js';
import { commitPendingRotations } from './session.js';

const storage = createStorage();
const app = document.getElementById('app');
const titleEl = document.getElementById('screen-title');
const clockEl = document.getElementById('session-clock');
const timer = createRestTimer(document.getElementById('timer-bar'));
const wakeLock = createWakeLock();

// A dev aid: ?date=2026-09-21 pretends it is that day.
const forcedDate = new URLSearchParams(location.search).get('date');

let leaveHooks = [];
let lastHash = null;

const ctx = {
  storage,
  timer,
  wakeLock,
  get doc() { return storage.load(); },
  today: () => (forcedDate ? forcedDate : toISODate(new Date())),
  update(fn, options) { storage.update(fn, options); render(); },
  refresh() { render(); },
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  setTitle(text) { titleEl.textContent = text; },
  onLeave(fn) { leaveHooks.push(fn); },
};

const ROUTES = [
  [/^#\/today$/, () => renderToday(ctx)],
  [/^#\/week$/, () => renderWeek(ctx)],
  [/^#\/history$/, () => renderHistory(ctx)],
  [/^#\/settings$/, () => renderSettings(ctx)],
  [/^#\/exercise\/([\w-]+)$/, (m) => renderExercise(ctx, m[1])],
  [/^#\/calibrate\/([\w-]+)$/, (m) => renderCalibrate(ctx, m[1])],
];

function render() {
  for (const fn of leaveHooks) { try { fn(); } catch { /* ignore */ } }
  leaveHooks = [];

  const hash = location.hash || '#/today';
  let view = null;
  for (const [pattern, fn] of ROUTES) {
    const match = hash.match(pattern);
    if (match) { view = fn(match); break; }
  }
  if (!view) {
    view = h('div', { class: 'card' },
      h('h2', {}, 'Nothing here'),
      h('a', { class: 'btn', href: '#/today' }, 'Back to today'),
    );
  }

  clear(app).append(view);
  // Re-rendering after logging a set must not throw you back to the top.
  if (hash !== lastHash) window.scrollTo({ top: 0 });
  lastHash = hash;
  markTab(hash);
  tickClock();
}

function markTab(hash) {
  for (const a of document.querySelectorAll('.tabbar a')) {
    const active = hash.startsWith(a.getAttribute('href'))
      || (a.dataset.tab === 'today' && hash.startsWith('#/calibrate'))
      || (a.dataset.tab === 'history' && hash.startsWith('#/exercise'));
    a.toggleAttribute('aria-current', active);
    if (active) a.setAttribute('aria-current', 'page');
  }
}

function tickClock() {
  const session = storage.load().activeSession;
  if (!session?.startedAt || session.finishedAt) {
    clockEl.hidden = true;
    return;
  }
  const minutes = (Date.now() - new Date(session.startedAt).getTime()) / 60000;
  clockEl.hidden = false;
  clockEl.textContent = fmtClock(minutes * 60);
  clockEl.classList.toggle('over', minutes > 45);
}

// A rotation chosen during a deload week comes into effect the following week.
{
  const { doc, changed } = commitPendingRotations(storage.load(), ctx.today());
  if (changed) storage.save(doc);
}

window.addEventListener('hashchange', render);
setInterval(tickClock, 1000);
render();

// The service worker is registered only where it exists (it is added in the
// PWA phase and is absent when running from a plain file:// copy).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

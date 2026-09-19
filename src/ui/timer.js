// The persistent rest-timer bar, the Zone 5 interval timer, and the wake lock.
import { h, clear, fmtClock } from './dom.js';

export function createRestTimer(mount) {
  let endsAt = null;
  let total = 0;
  let label = '';
  let tick = null;
  let buzzed = false;

  const count = h('span', { class: 'count' });
  const text = h('span', { class: 'label' });
  const progress = h('div', { class: 'timer-progress' });
  const skip = h('button', { class: 'small', onclick: () => stop() }, 'Skip');
  clear(mount).append(progress, count, text, skip);

  function render() {
    const left = remaining();
    count.textContent = fmtClock(left);
    text.textContent = left > 0 ? label : `${label} - go`;
    mount.classList.toggle('done', left <= 0);
    progress.style.width = total ? `${100 - Math.min(100, (left / total) * 100)}%` : '0%';
    if (left <= 0 && !buzzed) {
      buzzed = true;
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    }
  }

  function remaining() {
    return endsAt ? Math.max(0, (endsAt - Date.now()) / 1000) : 0;
  }

  function start(seconds, restLabel = 'Rest') {
    if (!seconds) return;
    total = seconds;
    label = restLabel;
    buzzed = false;
    endsAt = Date.now() + seconds * 1000;
    mount.hidden = false;
    render();
    clearInterval(tick);
    tick = setInterval(render, 250);
  }

  function stop() {
    clearInterval(tick);
    tick = null;
    endsAt = null;
    mount.hidden = true;
  }

  return { start, stop, remaining, isRunning: () => !!endsAt };
}

// Keep the screen on during a workout where the browser allows it.
export function createWakeLock() {
  let sentinel = null;
  let wanted = false;

  async function acquire() {
    wanted = true;
    if (!('wakeLock' in navigator)) return false;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { sentinel = null; });
      return true;
    } catch {
      return false;
    }
  }

  function release() {
    wanted = false;
    sentinel?.release?.().catch(() => {});
    sentinel = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (wanted && !sentinel && document.visibilityState === 'visible') acquire();
  });

  return { acquire, release, get active() { return !!sentinel; } };
}

// Walks the phases of a Zone 5 session: warm-up, work, jog, ..., cool-down.
export function createIntervalTimer(session, { onPhase, onTick, onFinish } = {}) {
  let index = 0;
  let phaseEndsAt = null;
  let handle = null;
  let paused = true;

  function phase() {
    return session.phases[index] ?? null;
  }

  function remaining() {
    return phaseEndsAt ? Math.max(0, (phaseEndsAt - Date.now()) / 1000) : (phase()?.minutes ?? 0) * 60;
  }

  function enter(i) {
    index = i;
    const p = phase();
    if (!p) {
      stop();
      onFinish?.();
      return;
    }
    phaseEndsAt = Date.now() + p.minutes * 60 * 1000;
    buzz(p.kind);
    onPhase?.(p, index);
  }

  function step() {
    if (remaining() <= 0) enter(index + 1);
    else onTick?.(remaining(), phase(), index);
  }

  function start() {
    paused = false;
    if (!phaseEndsAt) enter(0);
    clearInterval(handle);
    handle = setInterval(step, 250);
  }

  function pause() {
    paused = true;
    clearInterval(handle);
    handle = null;
  }

  function stop() {
    pause();
    phaseEndsAt = null;
  }

  function skip() {
    enter(index + 1);
  }

  function buzz(kind) {
    if (!navigator.vibrate) return;
    navigator.vibrate(kind === 'work' ? [200, 80, 200] : [120]);
  }

  return {
    start, pause, stop, skip,
    get index() { return index; },
    get paused() { return paused; },
    phase, remaining,
    intervalsDone: () => session.phases.slice(0, index).filter((p) => p.kind === 'work').length,
  };
}

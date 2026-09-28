// Screen smoke tests: the real app, in a headless Chrome, at phone size.
// Each screen is rendered from a seeded document and must show what it
// should without a single uncaught error. No dependencies: Chrome is driven
// over its DevTools protocol with Node's built-in WebSocket (Node 22+).
// Skipped, not failed, where Chrome cannot be found (set CHROME_PATH).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../tools/serve.mjs';
import { createProgramDocument } from '../src/engine/defaults.js';

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
const skip = !CHROME || typeof WebSocket === 'undefined'
  ? 'needs Chrome (CHROME_PATH) and Node 22+' : false;

const MON = '2026-09-21';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a seeded document: calibrated, a week of history, a few back ratings ---
function seed() {
  const d = createProgramDocument({ today: '2026-09-07', now: '2026-09-21T08:00:00Z' });
  for (const [id, w] of Object.entries({
    'back-squat': 225, 'romanian-deadlift': 185, 'bench-press': 185, 'barbell-row': 135,
    deadlift: 315, 'front-squat': 165, 'overhead-press': 115, 'weighted-chinup': 25,
  })) d.liftState[id] = { fiveRM: w / 0.875, workingWeight: w, failStreak: 0, calibratedAt: '2026-09-07' };
  for (const id of ['leg-curl', 'standing-calf-raise', 'pallof-press', 'leg-extension']) {
    d.liftState[id] = { workingWeight: 50 };
  }
  d.sessions = [
    { id: 'h1', date: '2026-09-14', dayIndex: 0, kind: 'lift', startedAt: '2026-09-14T17:00:00Z', finishedAt: '2026-09-14T17:38:00Z', back: 'fine',
      exercises: [{ exerciseId: 'back-squat', slotId: 'lowerA-main', role: 'main', scheme: { sets: 5, reps: 5 }, sets: [{ weight: 220, reps: 5 }] }] },
    { id: 'h2', date: '2026-09-17', dayIndex: 3, kind: 'lift', startedAt: '2026-09-17T17:00:00Z', finishedAt: '2026-09-17T17:35:00Z', back: 'bit', exercises: [] },
    { id: 'h3', date: '2026-09-16', dayIndex: 2, kind: 'z2', startedAt: '2026-09-16T17:00:00Z', finishedAt: '2026-09-16T17:40:00Z', cardio: { duration: 40 } },
  ];
  return d;
}

// --- a minimal DevTools protocol client -------------------------------------
let server; let chrome; let profile; let ws; let base;
let nextId = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

// Load the app on a given date and route, with a given document in storage.
async function open(route, { date = MON, doc = seed() } = {}) {
  await evaluate(`localStorage.setItem('lift-and-run:doc', ${JSON.stringify(JSON.stringify(doc))}); true`);
  await send('Page.navigate', { url: `${base}/?date=${date}&t=${nextId}${route}` });
  await sleep(500);
}

const text = () => evaluate("document.querySelector('main').innerText");
const stored = () => evaluate("JSON.parse(localStorage.getItem('lift-and-run:doc'))");
const click = (label) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
  if (!b) throw new Error('no button ' + ${JSON.stringify(label)});
  b.click(); return true;
})()`).then(() => sleep(200));

before(async () => {
  if (skip) return;
  server = serve(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  profile = mkdtempSync(join(tmpdir(), 'lift-and-run-screens-'));
  chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=390,844', 'about:blank',
  ], { stdio: 'ignore' });

  // Chrome writes the port it picked into the profile once it is listening.
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}/` });
  await sleep(500);
});

after(async () => {
  ws?.close();
  chrome?.kill();
  server?.close();
  await sleep(300);
  if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

// Every test also checks that nothing threw along the way.
function screen(name, fn) {
  test(name, { skip }, async () => {
    errors.length = 0;
    await fn();
    assert.deepEqual(errors, [], 'uncaught errors on the page');
  });
}

screen('Today on a lifting day lists every exercise, back care last', async () => {
  await open('#/today');
  const t = await text();
  for (const name of ['Back squat', 'Romanian deadlift', 'Leg extension', 'Bird dog']) assert.match(t, new RegExp(name));
  assert.match(t, /BACK CARE · OPTIONAL/i);
  assert.ok(t.indexOf('Bird dog') > t.indexOf('Leg extension'));
});

screen('tapping a set logs it against the right exercise', async () => {
  await open('#/today');
  await click('Start session');
  await evaluate("document.querySelector('button.tapset').click(); true");
  await sleep(200);
  const entry = (await stored()).activeSession.exercises.find((e) => e.slotId === 'lowerA-main');
  assert.equal(entry.exerciseId, 'back-squat');
  assert.equal(entry.sets.length, 1);
});

screen('finishing asks about the back, and the answer is kept', async () => {
  await open('#/today');
  await click('Start session');
  await evaluate("document.querySelectorAll('button.tapset')[4].click(); true");
  await sleep(200);
  await evaluate('window.confirm = () => true');
  await click('Finish session');
  assert.match(await text(), /How is your back right now\?/);
  await click('A bit sore');
  const doc = await stored();
  assert.equal(doc.sessions.at(-1).back, 'bit');
  assert.match(await text(), /225 lb/);
});

screen('Zone 2 asks for total time and no distance', async () => {
  await open('#/today', { date: '2026-09-23' });
  const t = await text();
  assert.match(t, /Zone 2 cardio/);
  assert.match(t, /Total time/);
  assert.doesNotMatch(t, /Distance/);
});

screen('Zone 5 shows the interval timer', async () => {
  await open('#/today', { date: '2026-09-26' });
  assert.match(await text(), /Intervals completed/);
});

screen('a missed workout can be swapped in from Today', async () => {
  await open('#/today', { date: '2026-09-22' });
  assert.match(await text(), /missed a workout\?/i);
  await click('Mon · Lower A');
  assert.match(await text(), /in place of Upper A/);
});

screen('Week, History, Settings and the calibration wizard all render', async () => {
  await open('#/week');
  assert.match(await text(), /This week/);
  await open('#/history');
  const h = await text();
  assert.match(h, /Progress/);
  assert.match(h, /Sore after 1 of 2 sessions you rated/);
  await open('#/settings');
  assert.match(await text(), /Gist/i);
  const fresh = createProgramDocument({ today: MON });
  await open('#/calibrate/back-squat', { doc: fresh });
  assert.match(await text(), /Back squat/);
});

screen('exercise detail swaps the slot it was opened from', async () => {
  await open('#/exercise/bird-dog/upperA-back');
  await evaluate(`[...document.querySelectorAll('.row')]
    .find((r) => r.textContent.startsWith('Bird dog') && r.querySelector('button'))
    .querySelector('button').click(); true`);
  await sleep(200);
  const doc = await stored();
  assert.equal(doc.slots['upperA-back'].current, 'bird-dog');
  assert.equal(doc.slots['lowerA-back'].current, 'bird-dog', 'Monday was already bird dog and is untouched');
});

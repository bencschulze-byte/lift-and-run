import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, mergeDocuments, isNewer, GIST_FILENAME } from '../src/sync.js';
import { createStorage, createMemoryBackend } from '../src/storage.js';
import { createProgramDocument } from '../src/engine/defaults.js';

const MON = '2026-09-21';
const T = (iso) => `2026-09-21T${iso}:00.000Z`;

function docAt(updatedAt, patch = {}) {
  const d = createProgramDocument({ today: MON, now: updatedAt });
  return { ...d, ...patch, updatedAt };
}

const session = (id, date, finishedAt) => ({
  id, date, dayIndex: 0, kind: 'lift', startedAt: `${date}T17:00:00Z`, finishedAt, exercises: [],
});

// --- merge policy ---------------------------------------------------------

test('sessions from both devices are kept, by id', () => {
  const local = docAt(T('18:00'), { sessions: [session('a', '2026-09-21', T('18:00'))] });
  const remote = docAt(T('19:00'), { sessions: [session('b', '2026-09-22', T('19:00'))] });
  const { doc } = mergeDocuments(local, remote);
  assert.deepEqual(doc.sessions.map((s) => s.id), ['a', 'b']);
});

test('the same session on both sides is kept once, finished wins', () => {
  const local = docAt(T('18:00'), { sessions: [session('a', '2026-09-21', null)] });
  const remote = docAt(T('19:00'), { sessions: [session('a', '2026-09-21', T('19:00'))] });
  const { doc } = mergeDocuments(local, remote);
  assert.equal(doc.sessions.length, 1);
  assert.equal(doc.sessions[0].finishedAt, T('19:00'));
});

test('deloads are unioned by date and lift', () => {
  const entry = { date: '2026-09-21', exerciseId: 'back-squat', type: 'main' };
  const other = { date: '2026-09-25', exerciseId: 'bench-press', type: 'main' };
  const { doc } = mergeDocuments(docAt(T('18:00'), { deloads: [entry] }), docAt(T('19:00'), { deloads: [entry, other] }));
  assert.equal(doc.deloads.length, 2);
});

test('each lift takes the copy that was performed most recently', () => {
  const local = docAt(T('18:00'), {
    liftState: {
      'back-squat': { workingWeight: 180, lastPerformed: '2026-09-21' },
      'bench-press': { workingWeight: 135, lastPerformed: '2026-09-15' },
    },
  });
  const remote = docAt(T('19:00'), {
    liftState: {
      'back-squat': { workingWeight: 175, lastPerformed: '2026-09-14' },
      'bench-press': { workingWeight: 140, lastPerformed: '2026-09-22' },
      deadlift: { workingWeight: 300, lastPerformed: '2026-09-17' },
    },
  });
  const { doc, notes } = mergeDocuments(local, remote);
  assert.equal(doc.liftState['back-squat'].workingWeight, 180, 'this device squatted later');
  assert.equal(doc.liftState['bench-press'].workingWeight, 140, 'the gist benched later');
  assert.equal(doc.liftState.deadlift.workingWeight, 300, 'a lift only the gist knows about');
  assert.ok(notes.some((n) => n.includes('bench-press')));
});

test('a calibration counts as touching the lift', () => {
  const local = docAt(T('18:00'), { liftState: { 'front-squat': { workingWeight: 95, lastPerformed: '2026-09-10' } } });
  const remote = docAt(T('19:00'), { liftState: { 'front-squat': { workingWeight: 120, calibratedAt: '2026-09-20' } } });
  assert.equal(mergeDocuments(local, remote).doc.liftState['front-squat'].workingWeight, 120);
});

test('settings and cardio state come from the newer document as a set', () => {
  const local = docAt(T('20:00'), {
    settings: { ...createProgramDocument({ today: MON }).settings, microplates: true },
    cardioState: { z5Step: 3, z5WeeksAtStep: 1 },
  });
  const remote = docAt(T('19:00'), {
    settings: { ...createProgramDocument({ today: MON }).settings, microplates: false },
    cardioState: { z5Step: 1, z5WeeksAtStep: 0 },
  });
  const { doc } = mergeDocuments(local, remote);
  assert.equal(doc.settings.microplates, true);
  assert.deepEqual(doc.cardioState, { z5Step: 3, z5WeeksAtStep: 1 });
  assert.equal(isNewer(local, remote), true);
});

test('an unfinished workout stays on the device that started it', () => {
  const local = docAt(T('18:00'), { activeSession: session('live', '2026-09-21', null) });
  const remote = docAt(T('19:00'), { activeSession: null });
  assert.equal(mergeDocuments(local, remote).doc.activeSession.id, 'live');
});

// --- the client -----------------------------------------------------------

function harness({ gist = null, remoteDoc = null } = {}) {
  const calls = [];
  let stored = remoteDoc;
  const backend = createMemoryBackend();
  const storage = createStorage(backend, { now: () => new Date(T('18:00')) });

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', headers: options.headers, body: options.body });
    const body = options.body ? JSON.parse(options.body) : null;

    if (url.endsWith('/gists') && options.method === 'POST') {
      stored = JSON.parse(body.files[GIST_FILENAME].content);
      return json({ id: 'gist123' });
    }
    if (url.includes('/gists/') && options.method === 'PATCH') {
      stored = JSON.parse(body.files[GIST_FILENAME].content);
      return json({ id: 'gist123' });
    }
    if (url.includes('/gists/')) {
      if (!stored) return json({ message: 'Not Found' }, 404);
      return json({ id: 'gist123', files: { [GIST_FILENAME]: { content: JSON.stringify(stored) } } });
    }
    return json({}, 404);
  };

  const sync = createSync({ storage, fetch: fetchImpl, now: () => new Date(T('18:00')), debounceMs: 1 });
  return { storage, sync, calls, remote: () => stored, setRemote: (d) => { stored = d; } };
}

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('connecting with no gist id creates a secret gist', async () => {
  const { sync, storage, calls, remote } = harness();
  storage.load();
  await sync.connect({ token: 'github_pat_secret' });

  const create = calls.find((c) => c.method === 'POST');
  assert.ok(create, 'posted a new gist');
  assert.equal(JSON.parse(create.body).public, false, 'and it is secret');
  assert.equal(storage.getGistId(), 'gist123');
  assert.equal(sync.status.state, 'ok');
  assert.ok(remote().settings, 'the document made it into the gist');
});

test('the token is sent as a header and never written into the gist', async () => {
  const { sync, storage, calls, remote } = harness();
  storage.update((d) => { d.liftState['back-squat'] = { workingWeight: 175 }; });
  await sync.connect({ token: 'github_pat_secret' });

  assert.equal(calls[0].headers.authorization, 'Bearer github_pat_secret');
  const written = JSON.stringify(remote());
  assert.equal(written.includes('github_pat_secret'), false);
  assert.equal(storage.exportJSON().includes('github_pat_secret'), false);
});

test('connecting with an existing gist id joins it instead of making one', async () => {
  const theirs = docAt(T('19:00'), { sessions: [session('theirs', '2026-09-20', T('19:00'))] });
  const { sync, storage, calls } = harness({ remoteDoc: theirs });
  storage.load();
  await sync.connect({ token: 'tok', gistId: 'gist123' });

  assert.equal(calls.some((c) => c.method === 'POST'), false, 'no new gist');
  assert.equal(storage.load().sessions.length, 1, 'and their history arrived');
});

test('a newer gist is adopted when this device has nothing pending', async () => {
  const { sync, storage, setRemote } = harness();
  storage.load();
  await sync.connect({ token: 'tok' });
  storage.markClean();

  setRemote({ ...storage.load(), updatedAt: T('20:00'), sessions: [session('later', '2026-09-21', T('20:00'))] });
  await sync.syncNow();

  assert.equal(storage.load().sessions.length, 1);
  assert.equal(storage.load().updatedAt, T('20:00'), 'adopting does not restamp the document');
  assert.equal(storage.isDirty(), false);
});

test('both sides changed since the last sync, so they are merged and pushed', async () => {
  const { sync, storage, setRemote, remote } = harness();
  storage.update((d) => { d.sessions.push(session('mine', '2026-09-21', T('18:00'))); });
  await sync.connect({ token: 'tok' });
  assert.equal(storage.isDirty(), false, 'the first push left it clean');

  // The other device logged its own session and pushed it.
  setRemote({
    ...storage.load(),
    updatedAt: T('19:00'),
    sessions: [session('mine', '2026-09-21', T('18:00')), session('theirs', '2026-09-22', T('19:00'))],
  });
  // ...and this one logged another before syncing again.
  storage.update((d) => { d.sessions.push(session('mine-2', '2026-09-23', T('20:00'))); });

  await sync.syncNow();

  const ids = storage.load().sessions.map((s) => s.id).sort();
  assert.deepEqual(ids, ['mine', 'mine-2', 'theirs'], 'nothing was lost');
  assert.deepEqual(remote().sessions.map((s) => s.id).sort(), ids, 'and the merge went back to the gist');
  assert.equal(sync.status.message, 'Merged both devices');
});

test('a rejected token is a status line, not an exception', async () => {
  const backend = createMemoryBackend();
  const storage = createStorage(backend);
  const sync = createSync({
    storage,
    fetch: async () => json({ message: 'Bad credentials' }, 401),
    debounceMs: 1,
  });
  storage.load();
  await sync.connect({ token: 'wrong' });

  assert.equal(sync.status.state, 'error');
  assert.match(sync.status.message, /rejected the token/);
  assert.ok(storage.load().settings, 'the app still has its document');
});

test('no network is a status line too', async () => {
  const backend = createMemoryBackend();
  const storage = createStorage(backend);
  const sync = createSync({
    storage,
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    debounceMs: 1,
  });
  storage.load();
  await sync.connect({ token: 'tok' });
  assert.equal(sync.status.state, 'error');
  assert.match(sync.status.message, /No connection/);
});

test('disconnecting forgets the token and the gist', async () => {
  const { sync, storage } = harness();
  storage.load();
  await sync.connect({ token: 'tok' });
  assert.equal(storage.getToken(), 'tok');

  sync.disconnect();
  assert.equal(storage.getToken(), null);
  assert.equal(storage.getGistId(), null);
  assert.equal(sync.status.state, 'off');
  assert.ok(storage.load().settings, 'the data stays on the device');
});

test('nothing is pushed while disconnected', async () => {
  const { sync, storage, calls } = harness();
  storage.update((d) => { d.settings.microplates = true; });
  sync.schedulePush();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 0);
});

test('a clean document is not pushed when the app comes back to the foreground', async () => {
  const { sync, storage, calls } = harness();
  storage.load();
  await sync.connect({ token: 'tok' });
  const after = calls.length;
  await sync.pushIfDirty();
  assert.equal(calls.length, after, 'nothing to say, so nothing sent');
});

test('a dirty document is pushed when the app comes back to the foreground', async () => {
  const { sync, storage, calls, remote } = harness();
  storage.load();
  await sync.connect({ token: 'tok' });
  storage.update((d) => { d.liftState['back-squat'] = { workingWeight: 200 }; });
  const before = calls.length;
  await sync.pushIfDirty();
  assert.ok(calls.length > before);
  assert.equal(remote().liftState['back-squat'].workingWeight, 200);
  assert.equal(storage.isDirty(), false);
});

test('per-device scratch state does not travel to the gist', async () => {
  const { sync, storage, remote } = harness();
  storage.update((d) => {
    d.calibration = { exerciseId: 'back-squat', sets: [] };
    d.finishedSummary = { summary: [], date: MON };
    d.historyLift = 'deadlift';
    d.activeSession = session('live', MON, null);
  });
  await sync.connect({ token: 'tok' });

  assert.equal(remote().calibration, undefined, 'a half-finished ramp stays on the phone');
  assert.equal(remote().finishedSummary, undefined);
  assert.equal(remote().historyLift, undefined);
  assert.equal(remote().activeSession.id, 'live', 'but the workout in progress does travel');
  assert.ok(storage.load().calibration, 'and it is untouched locally');
});

test('a request that never answers times out instead of wedging sync', async () => {
  const backend = createMemoryBackend();
  const storage = createStorage(backend);
  const sync = createSync({
    storage,
    fetch: () => new Promise(() => {}), // never settles
    debounceMs: 1,
    timeoutMs: 20,
  });
  storage.load();
  await sync.connect({ token: 'tok' });
  assert.equal(sync.status.state, 'error');
  assert.match(sync.status.message, /did not answer in time/);

  // And sync still works afterwards rather than staying stuck.
  assert.equal(await sync.syncNow().then((s) => s.state), 'error');
});

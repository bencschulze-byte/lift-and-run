import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStorage, createMemoryBackend, migrate, normalize, DOC_KEY, TOKEN_KEY,
} from '../src/storage.js';
import { SCHEMA_VERSION, createProgramDocument } from '../src/engine/defaults.js';

const at = (iso) => () => new Date(iso);

function store(initial) {
  const backend = createMemoryBackend(initial);
  return { backend, storage: createStorage(backend, { now: at('2026-09-21T12:00:00.000Z') }) };
}

test('a fresh install creates a full default document', () => {
  const { storage } = store();
  const doc = storage.load();
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(doc.settings.programStart, '2026-09-21');
  assert.equal(doc.settings.barWeight, 45);
  assert.deepEqual(doc.settings.plates, [45, 35, 25, 10, 5, 2.5]);
  assert.equal(doc.settings.microplates, false);
  assert.equal(Object.keys(doc.slots).length, 25);
  assert.equal(doc.slots['lowerA-main'].current, 'back-squat');
  assert.equal(doc.exercises['back-squat'].increment, 5);
  assert.deepEqual(doc.sessions, []);
  assert.equal(doc.template.length, 7);
});

test('the default document is written straight away and is not dirty', () => {
  const { backend, storage } = store();
  storage.load();
  assert.ok(backend.getItem(DOC_KEY));
  assert.equal(storage.isDirty(), false);
});

test('save stamps updatedAt and marks the document dirty', () => {
  const { storage } = store();
  const doc = storage.load();
  const saved = storage.save({ ...doc, settings: { ...doc.settings, microplates: true } });
  assert.equal(saved.updatedAt, '2026-09-21T12:00:00.000Z');
  assert.equal(storage.isDirty(), true);
  storage.markClean();
  assert.equal(storage.isDirty(), false);
});

test('update is a read-modify-write that persists', () => {
  const { backend, storage } = store();
  storage.update((doc) => {
    doc.liftState['back-squat'] = { fiveRM: 200, workingWeight: 175, failStreak: 0 };
  });
  const reread = createStorage(backend).load();
  assert.equal(reread.liftState['back-squat'].workingWeight, 175);
});

test('subscribers hear about saves', () => {
  const { storage } = store();
  let seen = 0;
  const off = storage.subscribe(() => { seen += 1; });
  storage.update((doc) => { doc.settings.sundayWalk = true; });
  assert.equal(seen, 1);
  off();
  storage.update((doc) => { doc.settings.sundayWalk = false; });
  assert.equal(seen, 1);
});

test('export / import round trip', () => {
  const { storage } = store();
  storage.update((doc) => {
    doc.liftState['back-squat'] = { fiveRM: 200, e1RM: 233.34, workingWeight: 175, failStreak: 1 };
    doc.sessions.push({ id: 's1', date: '2026-09-21', dayIndex: 0, kind: 'lift', exercises: [] });
    doc.settings.microplates = true;
  });
  const json = storage.exportJSON();

  const { storage: other } = store();
  const imported = other.importJSON(json);
  assert.equal(imported.liftState['back-squat'].workingWeight, 175);
  assert.equal(imported.sessions.length, 1);
  assert.equal(imported.settings.microplates, true);
  assert.deepEqual(other.load().sessions, imported.sessions);
});

test('the export never carries the gist token', () => {
  const { storage } = store();
  storage.setToken('github_pat_example');
  const json = storage.exportJSON();
  assert.equal(json.includes('github_pat_example'), false);
  assert.equal(json.includes(TOKEN_KEY), false);
});

test('import rejects something that is not a backup', () => {
  const { storage } = store();
  assert.throws(() => storage.importJSON('{"hello":"world"}'), /not a Lift & Run backup/);
  assert.throws(() => storage.importJSON('nonsense'), SyntaxError);
});

test('a v0 document migrates to v1 keeping its history', () => {
  const v0 = {
    settings: { programStart: '2026-08-03', barWeight: 45, microplates: true },
    liftState: { 'back-squat': { fiveRM: 200, workingWeight: 175, failStreak: 0 } },
    sessions: [{ id: 'old', date: '2026-08-05', kind: 'lift', exercises: [] }],
    deloads: [{ date: '2026-08-31', exerciseId: 'bench-press', type: 'main' }],
    cardioState: { z5Step: 2, z5WeeksAtStep: 1 },
  };
  const doc = migrate(v0);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.settings.programStart, '2026-08-03');
  assert.equal(doc.settings.microplates, true);
  assert.equal(doc.liftState['back-squat'].workingWeight, 175);
  assert.equal(doc.sessions.length, 1);
  assert.equal(doc.deloads.length, 1);
  assert.equal(doc.cardioState.z5Step, 2);
  assert.ok(doc.slots['upperB-secondary'], 'the slot table is filled in');
  assert.ok(doc.exercises['deadlift'], 'and the exercise catalog');
});

test('loading a v0 document from the backend migrates it in place', () => {
  const { storage } = store({ [DOC_KEY]: JSON.stringify({ settings: { barWeight: 45 }, sessions: [] }) });
  assert.equal(storage.load().schemaVersion, SCHEMA_VERSION);
});

test('an unknown future version is refused rather than guessed at', () => {
  assert.throws(() => migrate({ schemaVersion: 0.5 }), /no migration/);
});

test('normalize adds new program exercises without losing user state', () => {
  const doc = normalize({
    schemaVersion: 1,
    settings: { barWeight: 35 },
    exercises: { 'back-squat': { id: 'back-squat', name: 'Back squat', increment: 10 } },
    slots: { 'lowerA-secondary': { id: 'lowerA-secondary', current: 'good-morning' } },
    liftState: {},
  });
  assert.equal(doc.settings.barWeight, 35, 'user settings survive');
  assert.equal(doc.exercises['back-squat'].increment, 10, 'user overrides survive');
  assert.equal(doc.exercises['back-squat'].calibStart, 45, 'missing fields are filled in');
  assert.ok(doc.exercises['face-pull'], 'exercises the user has never seen are added');
  assert.equal(doc.slots['lowerA-secondary'].current, 'good-morning', 'the chosen exercise survives');
  assert.deepEqual(doc.slots['lowerA-secondary'].options, ['romanian-deadlift', 'good-morning', 'barbell-hip-thrust']);
});

test('corrupt storage falls back to a fresh document instead of crashing', () => {
  const { storage } = store({ [DOC_KEY]: '{not json' });
  assert.equal(storage.load().schemaVersion, SCHEMA_VERSION);
});

test('reset clears the document but not the sync connection', () => {
  const { storage } = store();
  storage.setToken('tok');
  storage.setGistId('gist123');
  storage.update((doc) => { doc.sessions.push({ id: 'x' }); });
  const fresh = storage.reset();
  assert.deepEqual(fresh.sessions, []);
  assert.equal(storage.getToken(), 'tok');
  storage.disconnect();
  assert.equal(storage.getToken(), null);
  assert.equal(storage.getGistId(), null);
});

test('reload picks up a write made by another tab', () => {
  const { backend, storage } = store();
  storage.load();
  const other = createStorage(backend, { now: at('2026-09-21T13:00:00.000Z') });
  other.update((doc) => { doc.settings.microplates = true; });

  assert.equal(storage.load().settings.microplates, false, 'the cached copy is stale');
  assert.equal(storage.reload().settings.microplates, true);
});

test('a phone set up before a slot existed picks it up on the next load', () => {
  // What an install from an earlier release looks like: its own template, and
  // no idea that Monday now finishes with core work.
  const old = {
    schemaVersion: 1,
    settings: { barWeight: 45, programStart: '2026-09-21' },
    slots: { 'lowerA-acc1': { id: 'lowerA-acc1', current: 'nordic-curl' } },
    liftState: { 'back-squat': { workingWeight: 175, failStreak: 1 } },
    sessions: [{ id: 's1', date: '2026-09-21', dayIndex: 0, kind: 'lift', exercises: [] }],
    template: [{ dayIndex: 0, name: 'Lower A', kind: 'lift', slots: ['lowerA-main', 'lowerA-secondary', 'lowerA-acc1', 'lowerA-acc2'] }],
  };
  const doc = migrate(old);
  assert.ok(doc.slots['lowerA-acc3'], 'the new slot is there');
  assert.equal(doc.slots['lowerA-acc3'].current, 'pallof-press');
  assert.ok(doc.template[0].slots.includes('lowerA-acc3'), 'and Monday actually runs it');
  assert.equal(doc.template.length, 7, 'the rest of the week comes back too');
  assert.equal(doc.slots['lowerA-acc1'].current, 'nordic-curl', 'without disturbing their choices');
  assert.equal(doc.liftState['back-squat'].failStreak, 1);
  assert.equal(doc.sessions.length, 1);
});

test('the extra and back-care slots reach an existing phone without touching its data', () => {
  // A document as the previous release left it: five slots on Monday, four
  // everywhere else, and a session in progress when the update arrives.
  const fresh = createProgramDocument({ today: '2026-09-21' });
  const old = structuredClone(fresh);
  for (const id of Object.keys(old.slots)) if (/-(acc4|back)$/.test(id) || /^(upperA|lowerB|upperB)-acc3$/.test(id)) delete old.slots[id];
  old.template = old.template.map((d) => ({ ...d, slots: d.slots?.filter((id) => old.slots[id]) }));
  old.slots['upperA-acc2'].current = 'dips';
  old.liftState = { 'bench-press': { workingWeight: 185, fiveRM: 210 }, dips: { workingWeight: 10 } };
  old.sessions = [{ id: 's1', date: '2026-09-21', dayIndex: 0, kind: 'lift', exercises: [], finishedAt: 'x' }];
  old.activeSession = { id: 's2', date: '2026-09-22', dayIndex: 1, exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 185, reps: 5 }] }] };

  const doc = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(doc.template[1].slots.length, 6, 'Tuesday gains two slots');
  assert.deepEqual(doc.template[1].slots.slice(0, 4), old.template[1].slots, 'after the ones it already had');
  assert.equal(doc.slots['upperA-back'].optional, true);
  assert.equal(doc.slots['upperA-acc2'].current, 'dips', 'the chosen exercise survives');
  assert.deepEqual(doc.liftState, old.liftState);
  assert.deepEqual(doc.sessions, old.sessions);
  assert.deepEqual(doc.activeSession, old.activeSession, 'a session in progress is left alone');
});

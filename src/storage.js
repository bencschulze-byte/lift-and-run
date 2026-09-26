// The single JSON document: load, save, migrate, export, import.
// The backend is injectable so this is testable without a browser.
import { createProgramDocument, SCHEMA_VERSION, EXERCISES, SLOTS } from './engine/defaults.js';
import { toISODate } from './engine/dates.js';

export const DOC_KEY = 'lift-and-run:doc';
export const DIRTY_KEY = 'lift-and-run:dirty';
export const TOKEN_KEY = 'lift-and-run:token';
export const GIST_KEY = 'lift-and-run:gist';
export const LAST_SYNC_KEY = 'lift-and-run:lastSync';

export function createMemoryBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

// --- migrations -----------------------------------------------------------
// Each entry takes a document at version N and returns one at version N+1.
export const MIGRATIONS = {
  // v0: the pre-release shape - loose settings and a flat session list, with
  // no exercise catalog, slots or template stored alongside them.
  0: (old) => {
    const fresh = createProgramDocument({
      today: old?.settings?.programStart ?? toISODate(new Date()),
      now: old?.updatedAt,
    });
    return {
      ...fresh,
      settings: { ...fresh.settings, ...(old?.settings ?? {}) },
      liftState: { ...(old?.liftState ?? {}) },
      sessions: [...(old?.sessions ?? [])],
      deloads: [...(old?.deloads ?? [])],
      cardioState: { ...fresh.cardioState, ...(old?.cardioState ?? {}) },
      schemaVersion: 1,
    };
  },
};

export function migrate(doc) {
  let out = doc;
  let version = Number(out?.schemaVersion ?? 0);
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`no migration from schemaVersion ${version}`);
    out = step(out);
    const next = Number(out?.schemaVersion ?? version + 1);
    if (next <= version) throw new Error(`migration from ${version} did not advance the version`);
    version = next;
  }
  return normalize(out);
}

// Fill in anything a newer release of the program added, without clobbering
// the user's own choices.
export function normalize(doc) {
  const out = { ...doc };
  out.schemaVersion = SCHEMA_VERSION;
  out.settings = { ...createProgramDocument().settings, ...(doc.settings ?? {}) };
  out.exercises = { ...doc.exercises };
  for (const ex of EXERCISES) {
    out.exercises[ex.id] = { ...ex, ...(doc.exercises?.[ex.id] ?? {}) };
  }
  out.slots = { ...doc.slots };
  for (const slot of SLOTS) {
    const stored = doc.slots?.[slot.id];
    // Whether a slot is optional is program data, never a stored choice.
    out.slots[slot.id] = { ...slot, ...(stored ?? {}), options: slot.options.slice(), optional: slot.optional };
  }
  out.liftState = { ...(doc.liftState ?? {}) };
  // The template is program data, not user data: nothing in the app edits it,
  // so always take the current one. Otherwise a slot added in a later release
  // would never reach a phone that is already set up.
  out.template = createProgramDocument().template;
  out.rotations = doc.rotations ?? [];
  out.swaps = doc.swaps ?? {};
  out.cardioState = { z5Step: 0, z5WeeksAtStep: 0, ...(doc.cardioState ?? {}) };
  out.sessions = doc.sessions ?? [];
  out.deloads = doc.deloads ?? [];
  return out;
}

// --- store ----------------------------------------------------------------

export function createStorage(backend, { now = () => new Date() } = {}) {
  const store = backend ?? globalThis.localStorage ?? createMemoryBackend();
  const listeners = new Set();
  let cache = null;

  function read() {
    const raw = store.getItem(DOC_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function load() {
    if (cache) return cache;
    const raw = read();
    cache = raw ? migrate(raw) : createProgramDocument({ today: toISODate(now()), now: now().toISOString() });
    if (!raw) write(cache, { dirty: false });
    return cache;
  }

  function write(doc, { dirty = true } = {}) {
    cache = doc;
    store.setItem(DOC_KEY, JSON.stringify(doc));
    if (dirty) store.setItem(DIRTY_KEY, '1');
    return doc;
  }

  // Every save stamps updatedAt and marks the document dirty for sync.
  // Sync adopts remote documents with stamp:false, so that taking someone
  // else's copy does not make this device look like the newer one.
  function save(doc, { dirty = true, stamp = true } = {}) {
    const stamped = stamp ? { ...doc, updatedAt: now().toISOString() } : doc;
    write(stamped, { dirty });
    for (const fn of listeners) fn(stamped);
    return stamped;
  }

  // Read-modify-write in one step, so callers cannot forget to save.
  function update(fn, options) {
    const draft = structuredClone(load());
    const next = fn(draft) ?? draft;
    return save(next, options);
  }

  function exportJSON() {
    // The document never contains the token; nothing to strip.
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not a Lift & Run backup');
    if (!('settings' in parsed) && !('sessions' in parsed)) throw new Error('not a Lift & Run backup');
    return save(migrate(parsed));
  }

  function reset() {
    store.removeItem(DOC_KEY);
    store.removeItem(DIRTY_KEY);
    cache = null;
    return load();
  }

  // Drop the in-memory copy and read the backend again. Needed when another
  // tab of the app has written to the same storage underneath us.
  function reload() {
    cache = null;
    return load();
  }

  return {
    load,
    save,
    update,
    exportJSON,
    importJSON,
    reset,
    reload,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    isDirty: () => store.getItem(DIRTY_KEY) === '1',
    markClean: () => store.removeItem(DIRTY_KEY),
    markDirty: () => store.setItem(DIRTY_KEY, '1'),

    // Sync credentials live outside the document so they are never exported.
    getToken: () => store.getItem(TOKEN_KEY),
    setToken: (t) => (t ? store.setItem(TOKEN_KEY, t) : store.removeItem(TOKEN_KEY)),
    getGistId: () => store.getItem(GIST_KEY),
    setGistId: (id) => (id ? store.setItem(GIST_KEY, id) : store.removeItem(GIST_KEY)),
    getLastSync: () => store.getItem(LAST_SYNC_KEY),
    setLastSync: (iso) => store.setItem(LAST_SYNC_KEY, iso),
    disconnect() {
      store.removeItem(TOKEN_KEY);
      store.removeItem(GIST_KEY);
      store.removeItem(LAST_SYNC_KEY);
    },
  };
}

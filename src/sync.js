// Sync to a secret GitHub Gist (spec section 9).
//
// Two rules hold this together:
//   1. Sync never blocks the workout. Every failure becomes a status line.
//   2. The token never leaves this device except as an Authorization header:
//      never into the gist, the document, the export, or a log line.
import { migrate } from './storage.js';

export const GIST_FILENAME = 'lift-and-run.json';
export const GIST_DESCRIPTION = 'Lift & Run data (private)';
export const PUSH_DEBOUNCE_MS = 3000;
const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(message, { status = null, hint = '' } = {}) {
    super(message);
    this.name = 'SyncError';
    this.status = status;
    this.hint = hint;
  }
}

// --- merging --------------------------------------------------------------

// Union of two lists keyed by id, preferring the entry that looks finished,
// then the later one.
function unionBy(a = [], b = [], keyOf, prefer = (x, y) => (score(y) > score(x) ? y : x)) {
  const out = new Map();
  for (const item of [...a, ...b]) {
    const key = keyOf(item);
    out.set(key, out.has(key) ? prefer(out.get(key), item) : item);
  }
  return [...out.values()];
}

function score(session) {
  return `${session?.finishedAt ?? ''}${session?.startedAt ?? ''}`;
}

function latestTouch(state) {
  return [state?.lastPerformed ?? '', state?.calibratedAt ?? ''].sort().at(-1) ?? '';
}

export function isNewer(a, b) {
  return String(a?.updatedAt ?? '') > String(b?.updatedAt ?? '');
}

// Merge two documents that both moved on since the last sync.
// Returns { doc, notes } - the notes are for the sync status panel.
export function mergeDocuments(local, remote) {
  const notes = [];
  const newer = isNewer(remote, local) ? remote : local;
  const newerName = newer === remote ? 'this gist' : 'this device';

  const sessions = unionBy(local.sessions, remote.sessions, (s) => s.id);
  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const added = sessions.length - Math.max(local.sessions?.length ?? 0, remote.sessions?.length ?? 0);
  if (sessions.length !== (local.sessions?.length ?? 0)) {
    notes.push(`sessions: kept ${sessions.length}${added > 0 ? ` (${added} from the other device)` : ''}`);
  }

  const deloads = unionBy(local.deloads, remote.deloads, (d) => `${d.date}|${d.exerciseId}`, (x) => x);
  const rotations = unionBy(local.rotations, remote.rotations, (r) => `${r.date}|${r.slotId}|${r.to}`, (x) => x);

  // Per lift, whichever side did the lift (or calibrated it) most recently.
  const liftState = {};
  const ids = new Set([...Object.keys(local.liftState ?? {}), ...Object.keys(remote.liftState ?? {})]);
  for (const id of ids) {
    const mine = local.liftState?.[id];
    const theirs = remote.liftState?.[id];
    if (!mine) { liftState[id] = theirs; continue; }
    if (!theirs) { liftState[id] = mine; continue; }
    const winner = latestTouch(theirs) > latestTouch(mine) ? theirs : mine;
    liftState[id] = winner;
    if (winner === theirs && latestTouch(theirs) !== latestTouch(mine)) {
      notes.push(`${id}: took the gist's copy (${latestTouch(theirs)})`);
    }
  }

  const doc = {
    ...newer,
    schemaVersion: Math.max(local.schemaVersion ?? 1, remote.schemaVersion ?? 1),
    settings: newer.settings,
    cardioState: newer.cardioState,
    exercises: newer.exercises,
    slots: newer.slots,
    template: newer.template,
    swaps: { ...(local.swaps ?? {}), ...(remote.swaps ?? {}) },
    liftState,
    sessions,
    deloads,
    rotations,
    // An unfinished workout belongs to the device it was started on.
    activeSession: local.activeSession ?? remote.activeSession ?? null,
    calibration: local.calibration ?? null,
  };

  notes.push(`settings and cardio from ${newerName}`);
  return { doc, notes };
}

// Reject if the promise has not settled in time, so one stuck request cannot
// leave sync permanently "in flight".
function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new SyncError('GitHub did not answer in time', { hint: 'Try Sync now again when you have a better signal.' })),
      ms,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// --- the client -----------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 15000;

export function createSync({
  storage,
  fetch: fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => new Date(),
  isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  debounceMs = PUSH_DEBOUNCE_MS,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const listeners = new Set();
  let timer = null;
  let inFlight = null;
  let revision = 0;

  let status = {
    state: storage.getToken() ? 'idle' : 'off',
    message: storage.getToken() ? 'Connected' : 'Not connected',
    lastSync: storage.getLastSync(),
    notes: [],
    revision,
  };

  function setStatus(patch) {
    status = { ...status, ...patch, lastSync: storage.getLastSync(), revision };
    for (const fn of listeners) fn(status);
    return status;
  }

  function connected() {
    return !!storage.getToken();
  }

  async function api(path, { method = 'GET', body } = {}) {
    const token = storage.getToken();
    if (!token) throw new SyncError('Not connected');
    let response;
    try {
      // A request that never settles would wedge sync until the app restarts,
      // so every call gets a deadline.
      response = await withTimeout(fetchImpl(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }), timeoutMs);
    } catch (error) {
      if (error instanceof SyncError) throw error;
      throw new SyncError('No connection', { hint: 'Your workout is saved on this phone either way.' });
    }
    if (response.status === 401 || response.status === 403) {
      throw new SyncError('GitHub rejected the token', {
        status: response.status,
        hint: 'Check it has the Gists read and write permission, and has not expired.',
      });
    }
    if (response.status === 404) {
      throw new SyncError('That gist is not there', {
        status: 404,
        hint: 'Check the gist id, or disconnect and connect again to make a new one.',
      });
    }
    if (!response.ok) {
      throw new SyncError(`GitHub said ${response.status}`, { status: response.status });
    }
    return response.json();
  }

  // The token lives outside the document, so there is nothing to strip for
  // secrecy - but the per-device scratch state should not travel either. A
  // half-finished calibration or a "session saved" screen belongs to the phone
  // it happened on.
  function serialize(doc) {
    const { calibration, finishedSummary, historyLift, ...rest } = doc;
    return JSON.stringify(rest, null, 2);
  }

  async function readRemote() {
    const gistId = storage.getGistId();
    if (!gistId) return null;
    const gist = await api(`/gists/${gistId}`);
    const file = gist.files?.[GIST_FILENAME];
    if (!file) {
      throw new SyncError(`That gist has no ${GIST_FILENAME}`, {
        hint: 'Point at the gist this app made, or disconnect and connect again.',
      });
    }
    let content = file.content;
    if (file.truncated && file.raw_url) {
      const raw = await fetchImpl(file.raw_url);
      content = await raw.text();
    }
    try {
      return migrate(JSON.parse(content));
    } catch {
      throw new SyncError('The gist does not contain a readable backup');
    }
  }

  async function createGist() {
    const gist = await api('/gists', {
      method: 'POST',
      body: {
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILENAME]: { content: serialize(storage.load()) } },
      },
    });
    storage.setGistId(gist.id);
    storage.markClean();
    storage.setLastSync(now().toISOString());
    return gist.id;
  }

  async function push() {
    if (!connected()) return setStatus({ state: 'off', message: 'Not connected' });
    if (!storage.getGistId()) {
      await createGist();
      return setStatus({ state: 'ok', message: 'Created the gist' });
    }
    await api(`/gists/${storage.getGistId()}`, {
      method: 'PATCH',
      body: { files: { [GIST_FILENAME]: { content: serialize(storage.load()) } } },
    });
    storage.markClean();
    storage.setLastSync(now().toISOString());
    return setStatus({ state: 'ok', message: 'Pushed' });
  }

  // Pull, then reconcile. This is the whole of the merge policy.
  async function pull() {
    if (!connected()) return setStatus({ state: 'off', message: 'Not connected' });
    if (!storage.getGistId()) return push();

    const remote = await readRemote();
    if (!remote) return push();

    const local = storage.load();
    const lastSync = storage.getLastSync();
    const remoteMoved = !lastSync || String(remote.updatedAt ?? '') > String(lastSync);
    const localMoved = storage.isDirty();

    if (localMoved && remoteMoved) {
      const { doc, notes } = mergeDocuments(local, remote);
      revision += 1;
      storage.save(doc, { dirty: true });
      await push();
      return setStatus({ state: 'ok', message: 'Merged both devices', notes });
    }

    if (remoteMoved && isNewer(remote, local)) {
      revision += 1;
      storage.save(remote, { dirty: false, stamp: false });
      storage.setLastSync(now().toISOString());
      return setStatus({ state: 'ok', message: 'Took the newer copy from the gist', notes: [] });
    }

    if (localMoved) return push();

    storage.setLastSync(now().toISOString());
    return setStatus({ state: 'ok', message: 'Already up to date', notes: [] });
  }

  // Everything public funnels through here so two syncs never overlap and no
  // failure ever escapes into the UI as an exception.
  function run(work, busyMessage) {
    if (inFlight) return inFlight;
    setStatus({ state: 'syncing', message: busyMessage });
    inFlight = (async () => {
      try {
        return await work();
      } catch (error) {
        return setStatus({
          state: 'error',
          message: error instanceof SyncError ? error.message : 'Sync failed',
          hint: error?.hint ?? '',
        });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    get status() { return status; },
    connected,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async connect({ token, gistId }) {
      storage.setToken(token.trim());
      if (gistId?.trim()) storage.setGistId(gistId.trim());
      storage.markDirty();
      return run(async () => {
        if (storage.getGistId()) await pull();
        else {
          await createGist();
          setStatus({ state: 'ok', message: 'Created a secret gist' });
        }
        return status;
      }, 'Connecting');
    },

    disconnect() {
      clearTimeout(timer);
      storage.disconnect();
      return setStatus({ state: 'off', message: 'Not connected', notes: [] });
    },

    syncNow() {
      return run(() => pull(), 'Syncing');
    },

    // Debounced 3 s after a save, and only if there is something to send.
    schedulePush() {
      if (!connected()) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!storage.isDirty() || !isOnline()) return;
        run(() => push(), 'Pushing');
      }, debounceMs);
    },

    // Called on `online` and when the app comes back to the foreground.
    pushIfDirty() {
      if (!connected() || !storage.isDirty() || !isOnline()) return Promise.resolve(status);
      return run(() => push(), 'Pushing');
    },
  };
}

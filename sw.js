// Service worker: cache-first for the app shell so the gym's dead spot does
// not matter, network-only for the GitHub API.
//
// CACHE_VERSION MUST change on every deploy or iOS will keep serving the old
// files. Run `node tools/bump-cache.mjs` before pushing - it bumps this
// number and rewrites SHELL from what is actually on disk.

const CACHE_VERSION = 'v4';
const CACHE = `lift-and-run-${CACHE_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/apple-touch-icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/engine/calibration.js',
  'src/engine/cardio.js',
  'src/engine/dates.js',
  'src/engine/defaults.js',
  'src/engine/plates.js',
  'src/engine/progression.js',
  'src/engine/template.js',
  'src/engine/warmup.js',
  'src/session.js',
  'src/storage.js',
  'src/sync.js',
  'src/ui/calibrate.js',
  'src/ui/cardio.js',
  'src/ui/dom.js',
  'src/ui/exercise.js',
  'src/ui/history.js',
  'src/ui/settings.js',
  'src/ui/sync-panel.js',
  'src/ui/timer.js',
  'src/ui/today.js',
  'src/ui/week.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file must not fail the whole install.
    await Promise.all(SHELL.map((path) => cache.add(path).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Sync talks to GitHub directly; never cache it, never serve it stale.
  if (url.hostname === 'api.github.com') return;
  if (url.origin !== self.location.origin) return;

  // A navigation always lands on the shell, whatever the hash says.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('index.html', { ignoreSearch: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return new Response('Offline and no cached copy of the app.', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});

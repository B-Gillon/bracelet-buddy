// A hand-written service worker rather than a Workbox-generated one, since
// this project uses Metro (no Expo Router), which doesn't have first-class
// Workbox build tooling. This trades some sophistication for something
// simple and fully transparent.
//
// Strategy: "network falling back to cache". On every GET request, try the
// network first (so users online always get the freshest content) and cache
// whatever comes back. If the network fails - offline, or a flaky
// connection - serve the last cached copy of that exact request instead.
//
// This deliberately avoids hardcoding a precache list of bundle filenames,
// since Metro's exported JS/CSS filenames include a content hash that
// changes on every build. Instead, the cache fills up naturally with
// whatever the app actually requested the last time it was opened online -
// which is exactly what's needed to load the same app shell again offline.

const CACHE_NAME = 'bracelet-buddy-shell-v1';

self.addEventListener('install', () => {
  // Activate this version immediately rather than waiting for old tabs
  // using a previous service worker to close.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only GET requests are cacheable this way. Anything else (future POSTs
  // to a backend, etc.) should always go straight to the network untouched.
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Stash a copy of anything successfully fetched for offline use
        // later. Clone first, since a response body can only be read once.
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached;
          // Nothing cached for this specific request either - genuinely
          // nothing more this service worker can do for it.
          throw new Error('[sw] offline and nothing cached for: ' + request.url);
        })
      )
  );
});

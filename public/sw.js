/* TaskFlowCo service worker — installable PWA + auto-update.
   Strategy:
   - Navigations: network-first (so a new deploy is always picked up when online),
     falling back to the cached app shell offline.
   - Hashed build assets (/assets/*): cache-first (immutable, content-hashed).
   - Everything else: stale-while-revalidate.
   Bumping SW_VERSION (or any byte of this file) triggers an update. */
var SW_VERSION = 'tf-v1';
var SHELL_CACHE = 'tf-shell-' + SW_VERSION;
var ASSET_CACHE = 'tf-assets-' + SW_VERSION;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) { return c.add('/'); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== ASSET_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Let the page tell a waiting worker to activate immediately.
self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch Supabase/API/fonts/cross-origin

  // App navigations → network-first, offline fallback to the cached shell.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put('/', copy); });
        return res;
      }).catch(function () {
        return caches.match('/').then(function (r) { return r || caches.match(req); });
      })
    );
    return;
  }

  // Hashed, immutable build assets → cache-first.
  if (url.pathname.indexOf('/assets/') === 0) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(ASSET_CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  // Other same-origin GETs (icons, manifest, etc.) → stale-while-revalidate.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(ASSET_CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});

// Hifz Pro – Progressive Web App Service Worker (v3.4)
// Network-First for HTML navigation + Stale-While-Revalidate for static assets
const CACHE_NAME = 'hifz-pro-v3.4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './offline.html'
];
const OPTIONAL_ASSETS = [
  './fonts/KanzalLulu-Regular.ttf'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force active immediately without waiting for old tabs to close
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache core assets safely
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Core asset cache skip:', asset, err);
        }
      }
      // Cache optional assets non-blockingly (font, etc.)
      for (const asset of OPTIONAL_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {
          console.warn('[SW] Optional asset skipped:', asset);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  const acceptHeader = event.request.headers.get('accept') || '';
  const isHtmlNavigation = event.request.mode === 'navigate' || acceptHeader.includes('text/html');

  if (isHtmlNavigation) {
    // -------------------------------------------------------------
    // NETWORK-FIRST FOR HTML: Ensures mobile devices always load the
    // latest version committed to GitHub when online, while falling
    // back to cached index.html or offline.html when offline.
    // -------------------------------------------------------------
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(event.request);
          if (cached) return cached;
          const cachedIndex = await cache.match('./index.html') || await cache.match('./');
          if (cachedIndex) return cachedIndex;
          const cachedOffline = await cache.match('./offline.html');
          return cachedOffline || new Response('Offline - please reconnect to internet.', {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
  } else {
    // -------------------------------------------------------------
    // STALE-WHILE-REVALIDATE FOR STATIC ASSETS (Fonts, CSS, JSON, Icons)
    // Instant load from cache + background revalidation
    // -------------------------------------------------------------
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);

        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data === 'PURGE_ALL_CACHES') {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
});

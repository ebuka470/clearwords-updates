/* ============================================================
   ClearWords — Service Worker
   Handles offline caching for the 5-page app shell.
   ============================================================ */

const VERSION = 'v3.0.0';
const STATIC_CACHE = `cw-static-${VERSION}`;
const RUNTIME_CACHE = `cw-runtime-${VERSION}`;
const API_CACHE = `cw-api-${VERSION}`;

// The 5 core app pages — cached on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/learn.html',
  '/practice.html',
  '/community.html',
  '/profile.html',
  '/onboarding.html',
  '/shared.js',
  '/manifest.json',
  '/logo.png'
];

// Optional assets — cached on first use if not available at install
const OPTIONAL_ASSETS = [
  '/logo.jpg',
  '/og-image.jpg'
];

// API base — we treat requests to this origin differently
const API_ORIGIN = 'https://clearwords-backend.onrender.com';
const SUPABASE_ORIGIN = 'https://megxgmsivslzdxaqxxpl.supabase.co';

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', event => {
  console.log('[SW] Installing', VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Cache the app shell — fail loudly if any of these 404
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        // Optional assets — don't fail install if they're missing
        return caches.open(STATIC_CACHE).then(cache =>
          Promise.allSettled(OPTIONAL_ASSETS.map(url => cache.add(url)))
        );
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.error('[SW] Install failed:', err);
        throw err;
      })
  );
});

/* ============================================================
   ACTIVATE — clean up old caches
   ============================================================ */
self.addEventListener('activate', event => {
  console.log('[SW] Activating', VERSION);

  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('cw-') && !key.endsWith(VERSION))
        .map(key => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
    )).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH STRATEGY
   - API calls → network only (never serve stale auth'd data)
   - Supabase audio → cache first, fall back to network
   - HTML/JS/CSS → cache first, update in background (stale-while-revalidate)
   - Everything else → try network, fall back to cache
   ============================================================ */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Skip chrome-extension and non-http
  if (!url.protocol.startsWith('http')) return;

  // ---------- API requests ----------
  if (url.origin === API_ORIGIN) {
    event.respondWith(
      fetch(req).catch(err => {
        // Only serve cached API responses for GETs we actually cached
        return caches.match(req).then(hit => hit || Promise.reject(err));
      })
    );
    return;
  }

  // ---------- Supabase audio ----------
  if (url.origin === SUPABASE_ORIGIN) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(hit => {
          if (hit) return hit;
          return fetch(req).then(res => {
            // Only cache successful audio responses
            if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
              cache.put(req, res.clone());
            }
            return res;
          }).catch(() => hit || new Response('', { status: 504 }));
        })
      )
    );
    return;
  }

  // ---------- Same-origin app shell ----------
  if (url.origin === self.location.origin) {
    // For navigation requests, serve the right page (fall back to index)
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req)
          .then(res => {
            // Update cache on every navigation
            const copy = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(req, copy));
            return res;
          })
          .catch(() =>
            caches.match(req).then(hit =>
              hit || caches.match('/index.html')
            )
          )
      );
      return;
    }

    // Static assets — stale-while-revalidate
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
            return res;
          }).catch(() => null);

          // Return cached immediately if we have it
          if (cached) {
            network.catch(() => {});
            return cached;
          }

          // Otherwise wait for the network
          return network.then(res => res || new Response('Offline', { status: 503 }));
        })
      )
    );
    return;
  }

  // ---------- Everything else (fonts, etc.) ----------
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(cache =>
      cache.match(req).then(hit => {
        if (hit) {
          fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
          return hit;
        }
        return fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => new Response('', { status: 504 }));
      })
    )
  );
});

/* ============================================================
   MESSAGE — allow the page to force a cache update
   ============================================================ */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});

/* ============================================================
   PUSH NOTIFICATIONS
   ============================================================ */
self.addEventListener('push', event => {
  let payload = { title: 'ClearWords', body: 'Time to practice!' };
  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo.png',
      badge: '/logo.png',
      vibrate: [100, 50, 100],
      data: { url: payload.url || '/learn.html', ...(payload.data || {}) },
      actions: payload.actions || []
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/learn.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus an existing tab if one is open
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new one
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

console.log('[SW] ClearWords service worker loaded —', VERSION);

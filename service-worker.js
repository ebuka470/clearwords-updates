/* ============================================================
   ClearWords — Service Worker
   Handles offline caching for the 5-page app shell,
   plus Web Push notifications.
   ============================================================ */

const VERSION = 'v3.0.1';
const STATIC_CACHE = `cw-static-${VERSION}`;
const RUNTIME_CACHE = `cw-runtime-${VERSION}`;
const API_CACHE = `cw-api-${VERSION}`;

// The core app shell — cached on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/learn.html',
  '/practice.html',
  '/community.html',
  '/profile.html',
  '/shared.js',
  '/manifest.json',
  '/logo.png'
];

const OPTIONAL_ASSETS = [
  '/onboarding.html',
  '/logo.jpg',
  '/og-image.jpg'
];

const API_ORIGIN = 'https://clearwords-backend.onrender.com';
const SUPABASE_ORIGIN = 'https://megxgmsivslzdxaqxxpl.supabase.co';

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', event => {
  console.log('[SW] Installing', VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      // Cache each file individually so one 404 doesn't kill install
      const results = await Promise.allSettled(
        APP_SHELL.map(async url => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) {
              console.warn(`[SW] Skipping ${url} (status ${res.status})`);
              return;
            }
            await cache.put(url, res);
            return url;
          } catch (err) {
            console.warn(`[SW] Failed to cache ${url}:`, err.message);
          }
        })
      );

      const ok = results.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`[SW] Cached ${ok}/${APP_SHELL.length} shell assets`);

      // Optional assets — ignore failures
      await Promise.allSettled(
        OPTIONAL_ASSETS.map(async url => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) await cache.put(url, res);
          } catch {}
        })
      );

      await self.skipWaiting();
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
   FETCH
   - API calls → network only (never serve stale auth'd data)
   - Supabase audio → cache first, fall back to network
   - HTML/JS/CSS → stale-while-revalidate
   - Everything else → try network, fall back to cache
   ============================================================ */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ---------- API requests: never touch cache ----------
  if (url.origin === API_ORIGIN) {
    event.respondWith(fetch(req));
    return;
  }

  // ---------- Supabase audio ----------
  if (url.origin === SUPABASE_ORIGIN) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(hit => {
          if (hit) return hit;
          return fetch(req).then(res => {
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

  // ---------- Same-origin ----------
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req)
          .then(res => {
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

    // Static assets: stale-while-revalidate
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
            return res;
          }).catch(() => null);

          if (cached) {
            network.catch(() => {});
            return cached;
          }
          return network.then(res => res || new Response('Offline', { status: 503 }));
        })
      )
    );
    return;
  }

  // ---------- Cross-origin (fonts, etc.) ----------
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
   MESSAGE — page → SW commands
   ============================================================ */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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
  let payload = {
    title: 'ClearWords',
    body: 'Time to practice!',
    url: '/learn.html',
    tag: 'cw-default'
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch {
      try { payload.body = event.data.text(); } catch {}
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/logo.png',
    vibrate: payload.vibrate || [100, 50, 100],
    tag: payload.tag,
    renotify: !!payload.renotify,
    requireInteraction: !!payload.requireInteraction,
    data: {
      url: payload.url,
      ...(payload.data || {})
    },
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : []
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};
  const targetUrl = data.url || '/learn.html';

  // 'dismiss' action just closes
  if (action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate to the target if it's not already there
          try { client.navigate(targetUrl); } catch {}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

/* ============================================================
   PUSH SUBSCRIPTION CHANGE
   The browser can rotate the subscription. When it does, we
   post a message to all clients so they can re-send it to the
   backend.
   ============================================================ */
self.addEventListener('pushsubscriptionchange', event => {
  console.log('[SW] Push subscription changed');

  event.waitUntil((async () => {
    try {
      const newSub = await self.registration.pushManager.subscribe(
        event.oldSubscription
          ? event.oldSubscription.options
          : { userVisibleOnly: true }
      );

      // Notify all clients to sync with the backend
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGED',
          subscription: newSub.toJSON()
        });
      }
    } catch (e) {
      console.warn('[SW] Resubscribe failed:', e);
    }
  })());
});

console.log('[SW] ClearWords service worker loaded —', VERSION);

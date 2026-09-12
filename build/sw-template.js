/* eslint-disable no-restricted-globals */
/**
 * EzTimeZone service worker.
 *
 * Generated at build time by build/pwa.ts, which substitutes the precache
 * list and a version derived from it. Editing this file changes the template,
 * not the deployed worker -- rebuild to apply.
 */

const VERSION = '__VERSION__';
const SHELL = '__SHELL__';
const ASSETS = __ASSETS__;

const PRECACHE = `eztz-precache-${VERSION}`;
const FONTS = 'eztz-fonts';
const KEEP = new Set([PRECACHE, FONTS]);

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(ASSETS);
      // The app is a single bundle with no lazily-imported chunks, so taking
      // over immediately cannot leave a running page asking for a file that
      // the new version has renamed. Introduce code splitting and this must
      // become the wait-for-reload pattern instead.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !KEEP.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Serve from cache, refreshing in the background for next time. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // Opaque cross-origin responses are cacheable but not inspectable; that
      // is the accepted trade for keeping webfonts available offline.
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  return cached ?? (await network) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigations go to the network first so a deploy is picked up promptly,
  // and fall back to the cached shell so the app still opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(PRECACHE);
          return (await cache.match(SHELL)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }

  // Own-origin build output is content-hashed and therefore immutable, so a
  // cache hit is always correct and never needs revalidating.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(PRECACHE);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});

const CACHE_NAME = 'aetheros-shell-__BUILD_ID__';
const RUNTIME_CACHE = 'aetheros-runtimes';
const RUNTIME_URLS = new Set(__RUNTIME_ASSETS__.map((path) => new URL(path, self.registration.scope).href));
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;
const INDEX = new URL('index.html', self.registration.scope).href;
const SHELL_URLS = new Set(PRECACHE_ASSETS.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    [...SHELL_URLS].map((url) => new Request(url, { cache: 'reload' })),
  )));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && request.url.startsWith(self.registration.scope)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      await cache.match(INDEX) ?? await fetch(request)));
  } else if (SHELL_URLS.has(request.url)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      await cache.match(request.url, { ignoreVary: true }) ?? await fetch(request)));
  } else if (RUNTIME_URLS.has(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const hit = await cache.match(request.url, { ignoreVary: true });
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch {}
      }
      return response;
    })());
  } else if (new URL(request.url).origin === self.location.origin && /\/assets\//.test(request.url)) {
    event.respondWith((async () => {
      for (const key of await caches.keys()) {
        if (!key.startsWith('aetheros-shell-') && !key.startsWith('aetheros-cache-') && key !== RUNTIME_CACHE) continue;
        const previous = await (await caches.open(key)).match(request.url, { ignoreVary: true });
        if (previous) return previous;
      }
      return fetch(request);
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

const CACHE_NAME = "bending-qr-shell-v1";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const base = self.registration.scope;
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      base,
      new URL("manifest.webmanifest", base),
      new URL("icon.svg", base),
      new URL("apple-touch-icon.png", base),
      new URL("icon-192.png", base),
      new URL("icon-512.png", base),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("bending-qr-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return await cache.match(request) || await cache.match(self.registration.scope);
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});

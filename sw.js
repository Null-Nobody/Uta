/* UTA service worker — scoped caches, safe offline fallback, versioned updates. */
const CACHE_PREFIX = "uta-";
const CACHE_NAME = "uta-v11";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Core app files must install; icon files are optional if deployment paths differ.
    await cache.addAll(["./", "./index.html", "./manifest.webmanifest"]);
    await Promise.all(SHELL.slice(3).map(path => cache.add(path).catch(() => null)));
    // Keep update activation user-controlled rather than forcibly replacing an open session.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put("./index.html", response.clone());
        return response;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match("./index.html")) || new Response("UTA is offline. Reconnect and try again.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}});
      }
    })());
    return;
  }

  // Cache-first for the app's own shell/static assets; network-first for other same-origin files.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        const path = url.pathname;
        if (/\.(?:js|css|png|svg|webmanifest|woff2?)$/i.test(path)) {
          (await caches.open(CACHE_NAME)).put(request, response.clone()).catch(() => {});
        }
      }
      return response;
    } catch (_) {
      return new Response("This file is unavailable offline.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}});
    }
  })());
});

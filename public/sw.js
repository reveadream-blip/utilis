/* Service Worker — cache des ressources pour usage hors connexion basique */
const VERSION = "infos-indispensables-v12";
const CORE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/emergency-data.js",
  "./js/place-queries.js",
  "./js/overpass.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.svg",
  "./icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== VERSION ? caches.delete(k) : null)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200) return res;
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});

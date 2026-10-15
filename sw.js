/**
 * sw.js — service worker: la app queda cacheada y abre sin datos.
 * La nómina (data/roster.json) se revalida en cada visita.
 */
const CACHE = "asistencia-v3";
const PRECACHE = [
  "./",
  "index.html",
  "css/styles.css",
  "js/config.js",
  "js/api.js",
  "js/compartir.js",
  "js/app.js",
  "data/roster.json",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST/JSONP pasan directo a la red

  const url = new URL(req.url);

  // Navegaciones: red primero, respaldo con la app cacheada
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("index.html"))
    );
    return;
  }

  // Mismo origen: caché primero, revalidando en segundo plano
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cacheado) => {
        const red = fetch(req)
          .then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return resp;
          })
          .catch(() => cacheado);
        return cacheado || red;
      })
    );
  }
  // Dominios externos (Google): sin caché, solo red
});

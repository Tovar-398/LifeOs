const CACHE = "lifeos-v2"; // subir este número en cada actualización futura fuerza la limpieza de caché vieja
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting(); // activa la nueva versión de inmediato, sin esperar a cerrar todas las pestañas
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const isPage = e.request.mode === "navigate" || e.request.destination === "document";
  if (isPage) {
    // Red primero: si hay internet, siempre trae la versión más nueva del HTML
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request)) // sin internet: usa la última guardada
    );
    return;
  }
  // Otros archivos (íconos, manifest): caché primero, más rápido
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }))
  );
});

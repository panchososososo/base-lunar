// ============ service worker: la app abre aunque no haya señal ============
const VERSION = 'base-lunar-v3';
const SHELL = [
  './', './index.html', './config.js',
  './css/estilos.css',
  './js/app.js', './js/datos.js', './js/graficos.js', './js/excel.js', './js/util.js',
  './datos/historico.json',
  './manifest.webmanifest', './icono.svg', './icono-192.png', './icono-512.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET') return;
  // nunca cachear llamadas a Supabase ni a los CDN de módulos
  if (url.origin !== location.origin) return;

  ev.respondWith(
    caches.match(ev.request).then(hit => {
      const red = fetch(ev.request).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(ev.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || red;
    })
  );
});

// Subir el número de versión en cada publicación: es lo que dispara el aviso "Actualizar".
const CACHE = 'gastos-v56';
const FILES = ['./', './index.html', './style.css', './parser.js', './xlsx.js', './config.js', './pagos.js', './respaldo.js', './ticket.js', './ayuda.js', './app.js', './manifest.json', './icon.svg', './logo.jpg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // Sin skipWaiting: la versión nueva queda "en espera" hasta que el usuario toque Actualizar.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'VERSION' && e.ports[0]) e.ports[0].postMessage(CACHE);
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la API de IA va directo a la red
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});

const CACHE = 'ae69-web-v1';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './catalog.js',
  './manifest.webmanifest',
  './brand_logo.webp',
  './catalog.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/html5-qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (e) {
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const index = await caches.match('./index.html');
        if (index) return index;
      }
      throw e;
    }
  })());
});

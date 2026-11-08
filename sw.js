// Service worker: zorgt dat de app ook zonder netwerk opstart.
// Verhoog VERSION telkens je nieuwe bestanden uploadt, dan krijgt iedereen de update.
const VERSION = 'v1.3.0';
const CACHE = 'boodschappen-' + VERSION;

const APP_SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'config.js',
  'startcatalogus.js',
  'import.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

const EXTERNAL = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    await Promise.all(EXTERNAL.map((u) => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('boodschappen-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase-verkeer (database, aanmelden) nooit via de cache
  if (url.hostname.endsWith('googleapis.com') && !url.hostname.startsWith('fonts.')) return;
  if (url.hostname.endsWith('firebaseapp.com') || url.hostname.endsWith('firebaseio.com')) return;
  if (url.pathname.startsWith('/__/')) return;

  const sameOrigin = url.origin === self.location.origin;
  const isDeptPhoto = url.hostname === 'images.unsplash.com' || url.hostname === 'images.pexels.com';
  const cacheable = sameOrigin || EXTERNAL.includes(req.url) || url.hostname.startsWith('fonts.') || isDeptPhoto;
  if (!cacheable) return; // productfoto's e.d. gewoon via het netwerk
  if (isDeptPhoto && req.mode === 'cors') return; // kleur uitlezen: rechtstreeks, niet uit de cache

  // Eigen bestanden: netwerk eerst (altijd de nieuwste versie), cache als terugval.
  if (sameOrigin) {
    event.respondWith((async () => {
      try {
        // 'no-cache': altijd bij GitHub nagaan of er een nieuwere versie is (buffer van max. 10 min overslaan)
        const fresh = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
        return fresh;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || caches.match('index.html');
      }
    })());
    return;
  }

  // Externe bibliotheken en lettertypes: cache eerst.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh.ok || fresh.type === 'opaque') { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
      return fresh;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});

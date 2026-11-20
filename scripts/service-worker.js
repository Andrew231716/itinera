/* Cache only the public application shell and build assets. User data stays local. */
const CACHE = 'itinera-shell-v1';
const ASSETS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    const manifest = await fetch('/offline-assets.json', { cache: 'no-store' });
    if (!manifest.ok) throw new Error('Offline asset manifest unavailable');
    await cache.addAll(await manifest.json());
    const home = await cache.match('/');
    const html = await home.text();
    const paths = [...html.matchAll(/(?:src|href)="([^" ]+\/_next\/static\/[^" ]+|\/_next\/static\/[^" ]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
    await cache.addAll([...new Set(paths)]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('itinera-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('RSC')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === '/' && !url.search) (await caches.open(CACHE)).put('/', response.clone());
        return response;
      } catch {
        if (url.pathname === '/' || url.pathname === '/go') return (await caches.match('/')) ?? Response.error();
        return new Response('<html lang="it"><meta name="viewport" content="width=device-width"><h1>Sei offline</h1><p>Questo link richiede Internet.</p><a href="/">Apri i viaggi salvati</a></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
  } else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
  }
});

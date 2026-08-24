const CACHE_NAME = 'hyperspeed-cache-v11';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, bypass APIs & JS workers
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache completely for API endpoints, speed test traffic, and JS files
  if (
    url.pathname.startsWith('/api/') || 
    url.hostname.includes('workers.dev') || 
    url.hostname.includes('cloudflare.com') ||
    url.pathname.includes('/upload') ||
    url.pathname.includes('/download') ||
    url.pathname.includes('/ping') ||
    url.pathname.endsWith('.js')
  ) {
    return; // Let the browser fetch natively from network
  }

  // Network-first strategy for HTML/CSS
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});


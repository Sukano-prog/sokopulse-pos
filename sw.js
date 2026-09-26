// ============================================
// SOKOPULSE POS - SERVICE WORKER
// Offline caching for PWA support
// ============================================

const CACHE_NAME = 'sokopulse-pos-v1';
const CACHE_URLS = [
    '/',
    '/pos.html',
    '/index.html',
    '/dashboard.html',
    '/products.html',
    '/stock.html',
    '/orders.html',
    '/customers.html',
    '/returns.html',
    '/reports.html',
    '/audit.html',
    '/categories.html',
    '/suppliers.html',
    '/expiry.html',
    '/settings.html',
    '/activation.html',
    '/client_guide.html',
    '/change_password.html',
    '/db.js',
    '/sync.js',
    '/etims.js',
    '/qrcode.min.js',
    '/js/printer.js',
    '/css/style.css',
    '/css/responsive.css',
    '/manifest.json'
];

// ===== INSTALL =====
self.addEventListener('install', function(event) {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('Caching app shell...');
            // Cache each URL individually so one failure doesn't break everything
            return Promise.all(
                CACHE_URLS.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.log('Failed to cache:', url, err.message);
                    });
                })
            );
        }).then(function() {
            console.log('Service Worker installed');
            return self.skipWaiting();
        })
    );
});

// ===== ACTIVATE =====
self.addEventListener('activate', function(event) {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            console.log('Service Worker activated');
            return self.clients.claim();
        })
    );
});

// ===== FETCH =====
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip external requests (fonts, CDN, etc)
    if (url.origin !== self.location.origin) return;
    
    // Network-first for API calls (eTIMS)
    if (url.pathname.includes('/api/') || url.pathname.includes('etims')) {
        event.respondWith(
            fetch(event.request).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }
    
    // Cache-first for static assets (HTML, CSS, JS)
    event.respondWith(
        caches.match(event.request).then(function(response) {
            if (response) {
                return response;
            }
            return fetch(event.request).then(function(response) {
                // Don't cache non-successful responses
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                // Clone and cache
                var responseToCache = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, responseToCache);
                });
                return response;
            }).catch(function() {
                // If offline and not in cache, return offline page if HTML
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/pos.html');
                }
            });
        })
    );
});

// ===== MESSAGE HANDLER =====
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('Service Worker loaded');

const CACHE_NAME = 'sokopulse-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/pos.html',
    '/dashboard.html',
    '/customers.html',
    '/products.html',
    '/stock.html',
    '/orders.html',
    '/returns.html',
    '/audit.html',
    '/reports.html',
    '/settings.html',
    '/activation.html',
    '/admin_activation.html',
    '/expiry.html',
    '/categories.html',
    '/suppliers.html',
    '/setup_db.html',
    '/css/style.css',
    '/css/responsive.css',
    '/db.js',
    '/admin_restrictions.js',
    '/js/printer.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(urlsToCache);
            })
            .then(function() {
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// 파일명: sw.js
const CACHE_NAME = 'yc-prayer-v2-notification';

// 캐시할 파일 목록
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://d3js.org/d3.v7.min.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('google') || event.request.url.includes('api')) {
        return; 
    }
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// ★ [필수] 알림 클릭 시 앱 열기 (이게 없으면 알림 눌러도 반응 없음)
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // 알림 닫기
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            // 이미 열린 창이 있으면 포커스
            for (let client of windowClients) {
                if (client.url === '/' || client.url.includes('index.html')) {
                    return client.focus();
                }
            }
            // 없으면 새로 열기
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});

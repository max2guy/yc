// 파일명: sw.js
// 버전: yc-prayer-v19-pro-fix
const CACHE_NAME = 'yc-prayer-v19-pro-fix';

// 캐시할 파일 목록 (버전 관리에 포함된 모든 리소스)
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

// 1. 서비스 워커 설치 (새로운 v19 리소스 캐싱)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] v19 Pro 리소스 캐싱 시작');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // 대기 상태를 건너뛰고 즉시 활성화
});

// 2. 서비스 워커 활성화 (구버전 캐시 삭제)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] 구버전 캐시 삭제:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim(); // 즉시 브라우저 제어권 획득
});

// 3. 네트워크 요청 처리 (캐시 우선, 실패 시 네트워크)
self.addEventListener('fetch', (event) => {
    // 외부 데이터 통신(Firebase, 날씨 API 등)은 캐시하지 않음
    if (
        event.request.url.includes('google') || 
        event.request.url.includes('api') || 
        event.request.url.includes('firebase')
    ) {
        return; 
    }
    
    event.respondWith(
        caches.match(event.request).then((response) => {
            // 캐시에 저장된 파일이 있으면 반환, 없으면 네트워크 요청
            return response || fetch(event.request).catch(() => {
                // 오프라인 상태에서 페이지 이동 시 index.html 반환
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// 4. 푸시 알림 클릭 시 앱 활성화 로직
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url === '/' || client.url.includes('index.html')) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});

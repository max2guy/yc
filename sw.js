// 파일명: sw.js
// 버전: v5-network-first (버전을 변경하여 새 로직이 적용되게 함)
const CACHE_NAME = 'yc-prayer-v5-network-first';

// HTML(페이지)을 제외한 정적 자산만 미리 캐싱
const ASSETS_TO_CACHE = [
    './style.css',
    './script.js', // script.js는 버전 쿼리(?v=4)로 관리되므로 캐싱해도 됨
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
    // 외부 CDN(Firebase, D3)은 브라우저 캐시에 맡기거나 런타임 캐싱을 하는 것이 안전하여 제외함
];

// 1. 설치
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // 대기 없이 즉시 새 서비스 워커 활성화
});

// 2. 활성화 (구버전 캐시 정리)
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
    self.clients.claim(); // 즉시 모든 클라이언트 제어
});

// 3. 요청 처리 (핵심 변경 사항)
self.addEventListener('fetch', (event) => {
    // API나 구글 관련 요청은 건너뜀
    if (event.request.url.includes('google') || event.request.url.includes('api')) {
        return;
    }

    // 전략 1: HTML 문서(페이지 이동)는 'Network First' (항상 최신 버전 확인)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // 네트워크 실패(오프라인) 시에만 캐시된 index.html 사용
                    return caches.match('./index.html');
                })
        );
        return;
    }

    // 전략 2: 이미지, CSS, JS 등은 'Cache First' (속도 우선)
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// 4. 알림 클릭 처리 (기존 유지)
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

// ==========================================
// [sw.js] PWA 캐싱 + 알림 클릭 처리 (최종본)
// ==========================================

const CACHE_NAME = "yc-prayer-v1";
const ASSETS_TO_CACHE = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icon-192.png",
    "https://d3js.org/d3.v7.min.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js"
];

// 1. 설치 (캐싱)
self.addEventListener("install", (event) => {
    self.skipWaiting(); // 대기 없이 바로 새 버전 적용
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[Service Worker] 파일 캐싱 중...");
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. 활성화 (구버전 캐시 정리)
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // 즉시 제어권 가져오기
});

// 3. 네트워크 요청 가로채기 (오프라인 지원)
self.addEventListener("fetch", (event) => {
    // Firebase 요청은 캐싱하지 않고 네트워크로 보냄 (실시간성 중요)
    if (event.request.url.includes("firebase") || event.request.url.includes("googleapis")) {
        return; 
    }
    
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// 4. [중요] 알림 클릭 시 앱 열기 (꼼수 핵심)
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // 알림창 닫기
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(function(clientList) {
            // 이미 열린 앱이 있으면 그 창을 맨 앞으로
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes('index.html') && 'focus' in client) {
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

// 5. (혹시 모를) 푸시 수신 리스너
self.addEventListener('push', function(event) {
    // 데이터가 있으면 띄워줌
    if (event.data) {
        try {
            const payload = event.data.json();
            const options = {
                body: payload.notification.body,
                icon: 'icon-192.png',
                vibrate: [200, 100, 200],
                data: { url: './index.html' },
                tag: 'push-' + Date.now(), // 태그를 매번 다르게 해서 씹힘 방지
                renotify: true
            };
            event.waitUntil(self.registration.showNotification(payload.notification.title, options));
        } catch (e) {
            console.log('푸시 처리 중 오류 (무시 가능)', e);
        }
    }
});

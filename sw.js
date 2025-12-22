const CACHE_NAME = 'yc-prayer-v1';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://d3js.org/d3.v7.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
];

// 1. 설치 (Install): 캐시 파일 저장
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// 2. 활성화 (Activate): 이전 버전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// 3. 요청 가로채기 (Fetch): 캐시된 파일 우선 제공, 없으면 네트워크 요청
self.addEventListener('fetch', (event) => {
  // Firestore/Firebase 요청은 캐시하지 않고 실시간 네트워크 사용 (Network Only)
  if (event.request.url.includes('firebase') || event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
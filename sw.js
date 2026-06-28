const CACHE_NAME = 'inandout-v2';
const STATIC_FILES = [
    '/',
    '/인앤아웃_분석앱.html',
    '/app.js',
    '/data.js',
    '/manifest.json',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_FILES)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Network-first: API는 항상 네트워크, 정적 파일은 캐시 폴백
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/')) {
        // API 요청: 네트워크 우선, 실패 시 오프라인 응답
        e.respondWith(
            fetch(e.request).catch(() =>
                new Response(JSON.stringify({ error: 'offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
    } else {
        // 정적 파일: 네트워크 우선(HTTP 캐시 무시), 실패 시 SW 캐시
        e.respondWith(
            fetch(new Request(e.request, { cache: 'no-cache' }))
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
    }
});

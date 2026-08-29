// Service Worker for B_BoardGames PWA
// SW_VERSION は release.ps1 がリリースごとに自動更新する。
// このファイルの内容が変わるとブラウザがSW更新を検知し、
// install(新キャッシュ作成) → activate(旧キャッシュ削除) → ページ側が自動リロード、で最新版に切り替わる。
const SW_VERSION = '20260829165234';
const CACHE_NAME = 'bbg-cache-' + SW_VERSION;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './bbg.css',
  './bbg.js',
  './bbg-config.js',
  './manifest.json',
  './assets/icon.png'
];

// インストール時に最新アセットを取得してキャッシュ（HTTPキャッシュはバイパス）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// 古いバージョンのキャッシュを削除して即座に制御を握る
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // 外部オリジン: QRライブラリ/Firebase SDK はキャッシュ優先（起動高速化・オフライン耐性）。
  // Firebase RTDB などのAPI通信はキャッシュしない。
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'www.gstatic.com') {
      event.respondWith(
        caches.open(CACHE_NAME).then((cache) =>
          cache.match(req).then((hit) => {
            if (hit) return hit;
            return fetch(req).then((res) => {
              if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
              return res;
            });
          })
        )
      );
    }
    return;
  }

  // ローカル開発（localhost）: ネットワーク優先。編集がすぐ反映されるようにする。
  const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocalDev) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cache.match(req, { ignoreSearch: true }))
      )
    );
    return;
  }

  // 同一オリジン: キャッシュ優先 + 裏で更新（PWAを開いた瞬間に表示できる）。
  // ?v= キャッシュバスターは無視して照合する（キャッシュはSWバージョンで世代管理）。
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const refetch = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || refetch;
      })
    )
  );
});

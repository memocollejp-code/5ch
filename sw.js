/* ===================================================================
   5ch ブラウザ - Service Worker
   ---------------------------------------------------------------
   ・index.html側で ./sw.js?v=VERSION として登録されるため、
     self.location.search からバージョンを取得してキャッシュ名に
     刻み込む。これにより「見た目は同じsw.jsだがバージョンが違う」
     状態でも必ず新しいCacheStorageバケットが作られ、
     activate時に旧バージョンのキャッシュを確実に破棄できる。
   ・ネットワーク優先（network-first）＋オフライン時のみキャッシュ
     にフォールバックする方式。これにより「再アップロードしたのに
     古い内容のまま」というサイレントリグレッションを防ぐ。
   ・5ch/おーぷん2ch本体やCORSプロキシへの通信は同一オリジンでは
     ないため、SWのキャッシュ対象から明示的に除外する（ダブルガード
     的に origin チェックを行う）。
   =================================================================== */

const CACHE_VERSION = new URL(self.location).searchParams.get('v') || 'v0';
const CACHE_NAME = '5ch-viewer-cache-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  // 新しいSWはインストール完了と同時に即activateへ進める
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET以外（bbs.cgiへのPOST投稿など）はSWを介さずそのまま素通し
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 同一オリジン以外（CORSプロキシ経由の5ch/おーぷん2ch取得など）は
  // SWのキャッシュ制御対象外とし、通常のネットワーク通信に任せる
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});

// ==========================================
// ⚙️ サービスワーカー（オフラインキャッシュ）
// ==========================================
// 📦 キャッシュ名
const CACHE_NAME = "iropare-v1";
// 📦 起動時にキャッシュへ入れる主要ファイル
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./js/color-core.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 📦 インストール時に主要ファイルをキャッシュする
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

// 🧹 有効化時に古いキャッシュを削除する
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 🌐 キャッシュ優先で応答し、無ければ取得して保存する
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});

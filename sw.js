/* Day Oneness Service Worker
   アプリ本体：ネット優先（毎回最新版を確認）。ただし圏外ならすぐ、電波が弱ければ1.5秒で保存済みの版を使う
   フォント：保存済みを先に使い、裏で更新 */
const CACHE = 'day-oneness-v3';
const FONT_CACHE = 'day-oneness-fonts';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('day-oneness') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await caches.match('./index.html') : undefined);
      const net = (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' }))
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; });
      e.waitUntil(net.catch(() => {}));
      // 圏外・機内モードなら、ネットを待たずに保存済みの版ですぐ開く
      if (self.navigator && self.navigator.onLine === false) { const hit = await cached(); if (hit) return hit; }
      // 電波が弱いときは最大1.5秒だけ待ち、間に合わなければ保存済みの版で開く（裏で最新版を取得して次回に反映）
      const timeout = new Promise((r) => setTimeout(() => r(null), 1500));
      try {
        const res = await Promise.race([net, timeout]);
        if (res) return res;
      } catch (err) { /* 通信失敗 → 保存済みの版へ */ }
      const hit = await cached();
      if (hit) return hit;
      try { return await net; } catch (err) { return Response.error(); }
    })());
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
        return hit || net;
      })
    );
  }
});

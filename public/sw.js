// v189: PWA。ホーム画面に追加できるようにするための最小の Service Worker。
// 画面(HTML)はネット優先(いつも最新)。オフラインの時だけ前に開いた画面を出す。/api/* は一切ためない(数字が古くなるため)。
const C = 'csa-v189';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(C).then((ca) => ca.put(r, c)); return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match('/', { ignoreSearch: true }))));
    return;
  }
  if (u.pathname.startsWith('/icons/')) e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { const c = res.clone(); caches.open(C).then((ca) => ca.put(r, c)); return res; })));
});

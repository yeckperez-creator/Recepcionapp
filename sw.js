/* Recepción con escáner: funciona sin internet.
   Cambia VERSION cuando subas una versión nueva de la app. */
const VERSION='recepcion-v8';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));
    await Promise.all(LIBS.map(async u => {
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } catch (err) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin) e.respondWith(networkFirst(r));
  else if (/(^|\.)cdnjs\.cloudflare\.com$|(^|\.)cdn\.jsdelivr\.net$/.test(u.hostname)) e.respondWith(cacheFirst(r));
});

/* Archivos de la app: intenta internet primero (para recibir actualizaciones);
   si no hay señal o tarda más de 4 s, usa la copia guardada. */
async function networkFirst(r) {
  const c = await caches.open(VERSION);
  const cached = async () => (await c.match(r, { ignoreSearch: true })) ||
    (r.mode === 'navigate' ? (await c.match('./index.html')) || (await c.match('./')) : undefined);
  const net = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; });
  try {
    return await Promise.race([
      net,
      new Promise((ok, ko) => setTimeout(async () => { const h = await cached(); h ? ok(h) : ko(0); }, 4000))
    ]);
  } catch (err) {
    try { return await net; } catch (err2) { const h = await cached(); if (h) return h; throw err2; }
  }
}

/* Librerías externas: usa la copia guardada; si no existe, descárgala y guárdala. */
async function cacheFirst(r) {
  const c = await caches.open(VERSION);
  const h = await c.match(r.url);
  if (h) return h;
  const res = await fetch(r);
  if (res && (res.ok || res.type === 'opaque')) c.put(r.url, res.clone());
  return res;
}

// EG Music service worker — makes the site installable and gives a basic
// offline shell. Deliberately conservative: it never caches the API or media
// (those go to R2 / the backend), only the app shell and hashed assets.
const CACHE = 'egmusic-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo.png', '/favicon.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Only handle our own origin; let API, media (R2), everything else pass through.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (req.headers.has('range')) return

  // App navigations: network-first so you always get fresh content online,
  // fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { caches.open(CACHE).then(c => c.put('/index.html', res.clone())).catch(() => {}); return res })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    )
    return
  }

  // Hashed build assets never change -> cache-first (fast, offline-friendly).
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})
        return res
      }))
    )
    return
  }

  // Icons and other small static files: cache-first, revalidate in the background.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}) }
      return res
    }).catch(() => hit))
  )
})

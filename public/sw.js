const cacheName = 'ld-price-v10'
const shell = ['/', '/app.js', '/catalog.js', '/styles.css', '/manifest.webmanifest', '/logo.png', '/icon-192.png', '/icon-512.png']
const catalogPath = '/api/catalog'

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName)
  await cache.addAll(shell)
  try { await cache.add(catalogPath) } catch {}
  await self.skipWaiting()
})()))

self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys()
  await Promise.all(names.filter(name => name.startsWith('ld-price-') && name !== cacheName)
    .map(name => caches.delete(name)))
  await self.clients.claim()
})()))

async function fetchPublic(request, path) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      try { await cache.put(path, response.clone()) } catch {}
      return response
    }
    if (response.status < 500) return response
  } catch {}
  const saved = await cache.match(path)
  if (!saved) return Response.error()
  if (path !== catalogPath) return saved
  const headers = new Headers(saved.headers)
  headers.set('X-LD-Offline', '1')
  return new Response(saved.body, { headers })
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname === catalogPath || shell.includes(url.pathname)) {
    event.respondWith(fetchPublic(event.request, url.pathname))
  }
})

const cacheName = 'ld-price-pages-v3'
const shell = [new URL('./', self.registration.scope).pathname, new URL('./app.js', self.registration.scope).pathname, new URL('./catalog.js', self.registration.scope).pathname, new URL('./styles.css', self.registration.scope).pathname, new URL('./manifest.webmanifest', self.registration.scope).pathname, new URL('./icon-192.png', self.registration.scope).pathname, new URL('./icon-512.png', self.registration.scope).pathname]
const catalogPath = new URL('./catalog.json', self.registration.scope).pathname

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName)
  await cache.addAll(shell)
  try { await cache.add(catalogPath) } catch {}
  await self.skipWaiting()
})()))

self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys()
  await Promise.all(names.filter(name => name.startsWith('ld-price-pages-') && name !== cacheName)
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

import { createServer } from 'node:http'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { validateCatalog } from './public/catalog.js'

const password = process.env.ADMIN_PASSWORD
if (!password || password.length < 16 || password.length > 512) {
  console.error('Defina ADMIN_PASSWORD com 16 a 512 caracteres.')
  process.exit(1)
}
const hash = value => createHash('sha256').update(value).digest()
const passwordHash = hash(password)
const dbPath = resolve(process.env.DATABASE_PATH || 'data/catalog.sqlite')
await mkdir(dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec(`CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL
)`)
const readCatalog = db.prepare('SELECT body FROM catalog WHERE id = 1')
const saveCatalog = db.prepare(`INSERT INTO catalog VALUES (1, ?)
  ON CONFLICT (id) DO UPDATE SET body = excluded.body`)

const hour = 3600_000
const sessionLifetime = 8 * hour
const sessions = new Map()
const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : ''
const cookieName = secureCookie ? '__Host-ld_admin' : 'ld_admin'
const sessionCookie = (token, age) =>
  `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookie}`
const failures = new Map()
const globalFailures = { count: 0, expires: 0 }

function expireEntries() {
  const now = Date.now()
  for (const [token, expires] of sessions) {
    if (expires <= now) sessions.delete(token)
  }
  for (const [ip, entry] of failures) {
    if (entry.expires <= now) failures.delete(ip)
  }
}
setInterval(expireEntries, 60_000).unref()

const publicFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript'],
  '/admin.js': ['admin.js', 'text/javascript'],
  '/catalog.js': ['catalog.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css'],
  '/sw.js': ['sw.js', 'text/javascript'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png']
}
const assets = new Map(await Promise.all(Object.entries(publicFiles).map(async ([path, [file, type]]) =>
  [path, { type, body: await readFile(new URL(`./public/${file}`, import.meta.url)) }]
)))
const excel = await readFile(new URL('./node_modules/exceljs/dist/exceljs.min.js', import.meta.url))

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function json(req, limit) {
  if (Number(req.headers['content-length']) > limit) return null
  const chunks = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null }
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  const path = req.url?.split('?')[0]
  const method = req.method
  const token = req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  const admin = (sessions.get(token) || 0) > Date.now()

  try {
    if (method === 'GET') {
      if (path === '/api/catalog') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        return res.end(readCatalog.get()?.body ?? '{"items":[],"updatedAt":null}')
      }
      if (path === '/api/session') return reply(res, 200, { admin })
      if (path === '/exceljs.js') {
        if (!admin) return reply(res, 401, { error: 'Entre como administrador.' })
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' })
        return res.end(excel)
      }
      const asset = assets.get(path)
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-cache' })
        return res.end(asset.body)
      }
    }

    if (method === 'POST' && ['/api/login', '/api/logout', '/api/catalog'].includes(path)) {
      if (req.headers['x-ld-request'] !== '1' || req.headers['content-type'] !== 'application/json') {
        return reply(res, 403, { error: 'Solicitação inválida.' })
      }
      if (path === '/api/login') {
        const input = await json(req, 4096)
        const now = Date.now()
        const ip = req.socket.remoteAddress
        const previous = failures.get(ip)
        const entry = previous?.expires > now ? previous : { count: 0, expires: now + 15 * 60_000 }
        if (globalFailures.expires <= now) {
          globalFailures.count = 0
          globalFailures.expires = now + 15 * 60_000
        }
        if (entry.count >= 10 || globalFailures.count >= 50) {
          return reply(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' })
        }
        if (typeof input?.password !== 'string' || !timingSafeEqual(hash(input.password), passwordHash)) {
          entry.count++
          globalFailures.count++
          failures.set(ip, entry)
          return reply(res, 401, { error: 'Senha inválida.' })
        }
        failures.delete(ip)
        if (admin) sessions.delete(token)
        const next = randomBytes(32).toString('base64url')
        sessions.set(next, now + sessionLifetime)
        res.setHeader('Set-Cookie', sessionCookie(next, sessionLifetime / 1000))
        return reply(res, 200, { admin: true })
      }
      if (!admin) return reply(res, 401, { error: 'Entre como administrador.' })
      if (path === '/api/logout') {
        sessions.delete(token)
        res.setHeader('Set-Cookie', sessionCookie('', 0))
        return reply(res, 200, { admin: false })
      }
      const input = await json(req, 8 * 1024 * 1024)
      if ((sessions.get(token) || 0) <= Date.now()) {
        return reply(res, 401, { error: 'Entre como administrador.' })
      }
      const items = validateCatalog(input?.items)
      if (!items) return reply(res, 400, { error: 'Catálogo inválido ou acima do limite.' })
      const updatedAt = new Date().toISOString()
      saveCatalog.run(JSON.stringify({ items, updatedAt }))
      return reply(res, 200, { updatedAt, count: items.length })
    }

    return reply(res, 404, { error: 'Página não encontrada.' })
  } catch (error) {
    console.error(error)
    if (!res.headersSent) reply(res, 500, { error: 'Não foi possível concluir a operação.' })
    else res.end()
  }
})
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`Tabela de preços disponível na porta ${server.address().port}.`)
})

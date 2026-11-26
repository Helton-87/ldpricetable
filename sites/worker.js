import { validateCatalog } from '../public/catalog.js'

const catalogKey = 'catalog.json'
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: privateHeaders })
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    const email = request.headers.get('oai-authenticated-user-email')?.toLowerCase()
    const signedIn = Boolean(request.headers.get('oai-authenticated-user-id'))
    if (!signedIn) return json({ error: 'Entre com uma conta autorizada.' }, 401)
    const admin = Boolean(email && email === env.ADMIN_EMAIL?.toLowerCase())
    if (['/admin', '/admin.js', '/exceljs.js'].includes(path) && !admin) {
      return new Response('A importação é exclusiva do administrador.', { status: 403, headers: privateHeaders })
    }

    try {
      if (request.method === 'GET') {
        if (path === '/api/session') return json({ admin })
        if (path === '/api/catalog') {
          const catalog = await env.BUCKET.get(catalogKey)
          return new Response(catalog?.body ?? '{"items":[],"updatedAt":null}', {
            headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' }
          })
        }
        if (path === '/api/signout') {
          return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/signout-with-chatgpt' } })
        }
        const asset = Object.hasOwn(assets, path) ? assets[path] : undefined
        if (asset) {
          const [type, encoded] = asset
          return new Response(Uint8Array.fromBase64(encoded), {
            headers: { ...privateHeaders, 'Content-Type': type }
          })
        }
      }

      if (path === '/api/catalog' && request.method === 'POST') {
        if (!admin) return json({ error: 'A importação é exclusiva do administrador.' }, 403)
        if (request.headers.get('x-ld-request') !== '1' || request.headers.get('content-type') !== 'application/json') {
          return json({ error: 'Solicitação inválida.' }, 403)
        }
        const limit = 8 * 1024 * 1024
        if (!request.body || Number(request.headers.get('content-length')) > limit) {
          return json({ error: 'Arquivo acima do limite.' }, 413)
        }
        const reader = request.body.pipeThrough(new TextDecoderStream()).getReader()
        let raw = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          raw += value
          if (raw.length > limit) {
            await reader.cancel()
            return json({ error: 'Arquivo acima do limite.' }, 413)
          }
        }
        let input
        try { input = JSON.parse(raw) } catch { return json({ error: 'Dados inválidos.' }, 400) }
        const items = validateCatalog(input?.items)
        if (!items) return json({ error: 'Catálogo inválido ou acima do limite.' }, 400)
        const updatedAt = new Date().toISOString()
        await env.BUCKET.put(catalogKey, JSON.stringify({ items, updatedAt }))
        return json({ updatedAt, count: items.length })
      }

      return json({ error: 'Página não encontrada.' }, 404)
    } catch (error) {
      console.error(error)
      return json({ error: 'Não foi possível concluir a operação.' }, 500)
    }
  }
}

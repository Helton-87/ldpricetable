import { readFile, mkdir, writeFile } from 'node:fs/promises'

const html = 'text/html; charset=utf-8'
const js = 'text/javascript; charset=utf-8'
const png = 'image/png'
const source = {
  '/': [html, 'public/index.html'],
  '/admin': [html, 'public/admin.html', text => text.replace(
    '<button id="logout" type="button" class="secondary">Sair</button>',
    '<a id="site-signout" href="/api/signout">Sair</a>'
  )],
  '/app.js': [js, 'public/app.js'],
  '/admin.js': [js, 'public/admin.js', text => text.replace('logout.onclick = ', 'if (logout) logout.onclick = ')],
  '/catalog.js': [js, 'public/catalog.js'],
  '/exceljs.js': [js, 'node_modules/exceljs/dist/exceljs.min.js'],
  '/styles.css': ['text/css; charset=utf-8', 'public/styles.css'],
  '/manifest.webmanifest': ['application/manifest+json', 'public/manifest.webmanifest'],
  '/sw.js': [js, 'sites/sw.js'],
  '/icon-192.png': [png, 'public/icon-192.png'],
  '/icon-512.png': [png, 'public/icon-512.png']
}
const assets = Object.fromEntries(await Promise.all(Object.entries(source).map(async ([path, [type, file, transform]]) => {
  const bytes = await readFile(file)
  return [path, [type, (transform ? Buffer.from(transform(bytes.toString())) : bytes).toString('base64')]]
})))
const catalog = (await readFile('public/catalog.js', 'utf8')).replace(/^export /gm, '')
const worker = (await readFile('sites/worker.js', 'utf8')).replace(/^import .*\n/, '')
await mkdir('dist/server', { recursive: true })
await writeFile('dist/server/index.js', `const assets = ${JSON.stringify(assets)}\n${catalog}\n${worker}`)

import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

await mkdir('admin', { recursive: true })
for (const file of ['catalog.js', 'styles.css', 'logo.png', 'icon-192.png', 'icon-512.png']) {
  await copyFile('public/' + file, '' + file)
}
// Keep all static assets under the project's GitHub Pages path.
const html = (await readFile('public/index.html', 'utf8'))
  .replace(/(src|href)="\/([^"]+)"/g, (_, attr, path) => `${attr}="./${path === 'admin' ? 'admin/' : path}"`)
await writeFile('index.html', html)
const app = (await readFile('public/app.js', 'utf8'))
  .replace("register('/sw.js')", "register('./sw.js')")
  .replace("fetch('/api/catalog')", "fetch('./catalog.json', { cache: 'no-cache' })")
await writeFile('app.js', app)
const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'))
for (const key of ['id', 'start_url', 'scope']) manifest[key] = './'
for (const icon of manifest.icons) icon.src = '.' + icon.src
await writeFile('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n')
const worker = (await readFile('public/sw.js', 'utf8'))
  .replace(/ld-price-v(\d+)/, 'ld-price-pages-v$1')
  .replace(/'\/([^']*)'/g, (_, path) => "new URL('./" + (path === 'api/catalog' ? 'catalog.json' : path) + "', self.registration.scope).pathname")
  .replace("name.startsWith('ld-price-')", "name.startsWith('ld-price-pages-')")
await writeFile('sw.js', worker)
await copyFile('pages/admin.html', 'admin/index.html')
await copyFile('pages/import.js', 'admin/import.js')
await copyFile('node_modules/exceljs/dist/exceljs.min.js', 'admin/exceljs.min.js')
await writeFile('admin/exceljs.LICENSE.txt', (await readFile('node_modules/exceljs/LICENSE', 'utf8')).trimEnd() + '\n')
await writeFile('.nojekyll', '')
try { await access('catalog.json') } catch {
  await writeFile('catalog.json', '{"items":[],"updatedAt":null}\n')
}

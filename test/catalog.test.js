import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Excel from 'exceljs'
import { sheetToItems } from '../public/catalog.js'

test('imports an Excel workbook with numeric, localized and calculated prices', async () => {
  const source = new Excel.Workbook()
  const sheet = source.addWorksheet('Catálogo')
  sheet.addRows([
    [' Item ', 'PREÇO', 'Categoria', 'Interno'],
    ['Água', 3.5, 'Bebidas', 'privado'],
    ['Kit', 'R$ 1.234,56', 'Lanches'],
    ['Suco', { formula: '2+3', result: 5 }, 'Bebidas']
  ])
  const workbook = new Excel.Workbook()
  await workbook.xlsx.load(await source.xlsx.writeBuffer())
  const parsed = workbook.worksheets[0]
  assert.deepEqual(sheetToItems(parsed), [
    { category: 'Bebidas', name: 'Água', cents: 350 },
    { category: 'Lanches', name: 'Kit', cents: 123456 },
    { category: 'Bebidas', name: 'Suco', cents: 500 }
  ])
  parsed.addRow(['Incompleto', -1, 'Lanches'])
  assert.throws(() => sheetToItems(parsed), /Linha 5 inválida/)
})

test('recognizes the Descrição layout and preserves optional discount prices', () => {
  const workbook = new Excel.Workbook()
  const sheet = workbook.addWorksheet('Catálogo')
  sheet.addRows([
    ['CATEGORIA', 'DESCRIÇÃO', 'PREÇO', 'PIX - 2%', '3% (3+ UN.)'],
    ['Bebidas', 'Suco', 10, 9.8, '9,70'],
    ['Lanches', 'Sanduíche', 14, null, ' ']
  ])
  assert.deepEqual(sheetToItems(sheet), [
    { category: 'Bebidas', name: 'Suco', cents: 1000, pixCents: 980, bulkCents: 970 },
    { category: 'Lanches', name: 'Sanduíche', cents: 1400 }
  ])
  sheet.getCell('D2').value = 'inválido'
  assert.throws(() => sheetToItems(sheet), /Linha 2: confira o preço para PIX/)
})

test('restricts publication and preserves the last valid catalog after a restart', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ld-catalog-'))
  const password = 'senha exclusiva dos testes'
  let server
  async function start() {
    server = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, ADMIN_PASSWORD: password, DATABASE_PATH: join(dir, 'test.sqlite'),
        PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'inherit']
    })
    const port = await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.once('exit', code => reject(new Error('Servidor encerrou com código ' + code)))
      server.stdout.on('data', chunk => {
        const match = String(chunk).match(/porta (\d+)/)
        if (match) resolve(match[1])
      })
    })
    return 'http://127.0.0.1:' + port
  }
  async function stop() {
    if (!server || server.exitCode !== null || server.signalCode !== null) return
    const exited = once(server, 'exit')
    server.kill()
    await exited
  }

  try {
    let base = await start()
    const post = (route, input, cookie, marker = '1') => fetch(base + '/api/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LD-Request': marker, ...(cookie && { Cookie: cookie }) },
      body: JSON.stringify(input)
    })
    const items = [{ category: 'Bebidas', name: 'Suco', cents: 500, pixCents: 490, bulkCents: 485 }]
    assert.equal((await post('catalog', { items })).status, 401)
    assert.equal((await fetch(base + '/exceljs.js')).status, 401)
    const login = await post('login', { password })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('Set-Cookie').split(';')[0]
    assert.equal((await post('catalog', { items }, cookie, '0')).status, 403)
    assert.equal((await post('catalog', { items }, cookie)).status, 200)
    assert.equal((await post('catalog', { items: [] }, cookie)).status, 400)
    assert.equal((await post('logout', {}, cookie)).status, 200)
    assert.equal((await post('catalog', { items }, cookie)).status, 401)
    await stop()
    base = await start()
    const response = await fetch(base + '/api/catalog')
    assert.deepEqual((await response.json()).items, items)
    const manifest = await (await fetch(base + '/manifest.webmanifest')).json()
    assert.equal(manifest.display, 'standalone')
    for (const icon of manifest.icons) assert.equal((await fetch(base + icon.src)).status, 200)
    assert.equal((await fetch(base + '/sw.js')).status, 200)
  } finally {
    await stop()
    await rm(dir, { recursive: true, force: true })
  }
})

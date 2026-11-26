import { money, sheetToItems, itemPrices } from './catalog.js'

const byId = id => document.getElementById(id)
const login = byId('login')
const editor = byId('editor')
const upload = byId('upload')
const file = byId('file')
const preview = byId('preview')
const notice = byId('notice')
const publish = byId('publish')
const logout = byId('logout')
let excelLibrary
let items
let busy = false

async function api(route, input) {
  const response = await fetch('/api/' + route, input === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LD-Request': '1' },
    body: JSON.stringify(input)
  })
  const result = await response.json()
  if (response.status === 401 && route !== 'login') setSession(false)
  if (!response.ok) throw new Error(result.error)
  return result
}

function clearPreview() {
  items = null
  preview.hidden = true
}

function setSession(active) {
  login.hidden = active
  editor.hidden = !active
  if (!active) {
    upload.reset()
    clearPreview()
  }
}

async function run(action) {
  if (busy) return
  busy = true
  const controls = [login.querySelector('button'), upload.querySelector('button'), file, publish, logout].filter(Boolean)
  controls.forEach(control => { control.disabled = true })
  notice.textContent = 'Processando…'
  try { notice.textContent = await action() }
  catch (error) { notice.textContent = error.message }
  finally {
    busy = false
    controls.forEach(control => { control.disabled = false })
  }
}

function loadExcel() {
  excelLibrary ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/exceljs.js'
    script.onload = () => resolve(globalThis.ExcelJS)
    script.onerror = () => {
      excelLibrary = undefined
      reject(new Error('Não foi possível abrir o leitor de Excel. Verifique a conexão e a sessão.'))
    }
    document.head.append(script)
  })
  return excelLibrary
}

login.onsubmit = event => {
  event.preventDefault()
  run(async () => {
    const password = byId('password')
    try {
      await api('login', { password: password.value })
      setSession(true)
      return 'Selecione a planilha que deseja importar.'
    } finally { password.value = '' }
  })
}
file.onchange = clearPreview
upload.onsubmit = event => {
  event.preventDefault()
  run(async () => {
    clearPreview()
    const selected = file.files[0]
    if (!selected || !/\.xlsx$/i.test(selected.name) || selected.size > 10 * 1024 * 1024) {
      throw new Error('Selecione um arquivo .xlsx de até 10 MB.')
    }
    const Excel = await loadExcel()
    const workbook = new Excel.Workbook()
    try { await workbook.xlsx.load(await selected.arrayBuffer()) }
    catch { throw new Error('Não foi possível ler o arquivo. Confira se ele é uma planilha .xlsx válida.') }

    items = sheetToItems(workbook.worksheets[0])
    const categories = new Set(items.map(item => item.category))
    byId('preview-count').textContent = `${items.length} itens em ${categories.size} categorias. Até 5 itens exibidos abaixo.`
    const sample = items.slice(0, 5).map(item => {
      const row = document.createElement('li')
      row.textContent = `${item.category} · ${item.name} · ${money.format(item.cents / 100)}`
      for (const { label, cents } of itemPrices(item)) {
        row.textContent += ` · ${label} ${money.format(cents / 100)}`
      }
      return row
    })
    byId('preview-items').replaceChildren(...sample)
    preview.hidden = false
    return 'Planilha validada. Confira a prévia antes de publicar.'
  })
}
publish.onclick = () => run(async () => {
  if (!items) return 'Valide a planilha antes de publicar.'
  const { count } = await api('catalog', { items })
  clearPreview()
  upload.reset()
  return `Catálogo publicado com ${count} itens.`
})
logout.onclick = () => run(async () => {
  await api('logout', {})
  setSession(false)
  return 'Sessão encerrada.'
})
run(async () => {
  const { admin } = await api('session')
  setSession(admin)
  return admin ? 'Selecione a planilha que deseja importar.' : 'Entre para gerenciar o catálogo.'
})

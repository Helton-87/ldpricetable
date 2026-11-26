import { normalize, money, itemPrices } from './catalog.js'

const byId = id => document.getElementById(id)
const install = byId('install')
const promptButton = byId('install-button')
const showButton = byId('show-install')
const installHelp = byId('install-help')
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
let installPrompt

function rememberDismissal() {
  try { localStorage.setItem('ld-install-dismissed', '1') } catch {}
}
function wasDismissed() {
  try { return Boolean(localStorage.getItem('ld-install-dismissed')) } catch { return false }
}
function updateInstall(open = !wasDismissed()) {
  install.hidden = standalone() || !open
  showButton.hidden = standalone() || open
  promptButton.hidden = !installPrompt
  installHelp.textContent = installPrompt
    ? 'Adicione o app à tela inicial para abrir a tabela com um toque.'
    : ios
      ? 'No Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.'
      : 'Abra o menu do navegador e procure Instalar app ou Adicionar à tela inicial. No computador, confira também a barra de endereço.'
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  installPrompt = event
  updateInstall(!install.hidden)
})
window.addEventListener('appinstalled', () => {
  rememberDismissal()
  install.hidden = true
  showButton.hidden = true
  installPrompt = null
})
byId('dismiss-install').onclick = () => {
  rememberDismissal()
  updateInstall(false)
}
showButton.onclick = () => updateInstall(true)
promptButton.onclick = async () => {
  if (!installPrompt) return
  const prompt = installPrompt
  installPrompt = null
  try {
    await prompt.prompt()
    if ((await prompt.userChoice).outcome === 'accepted') {
      rememberDismissal()
      updateInstall(false)
      return
    }
  } catch {}
  updateInstall(true)
}
updateInstall()
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error)

const search = byId('search')
const output = byId('categories')
const status = byId('status')
const sort = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
let catalog
let offline = false

function element(tag, text) {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}

function render() {
  if (!catalog) return
  const query = normalize(search.value)
  const groups = new Map()
  let count = 0
  for (const item of catalog.items) {
    const category = normalize(item.category)
    if (query && !category.includes(query) && !normalize(item.name).includes(query)) continue
    if (!groups.has(category)) groups.set(category, { title: item.category, items: [] })
    groups.get(category).items.push(item)
    count++
  }
  output.replaceChildren()
  const update = catalog.updatedAt
    ? ' · Atualizado em ' + new Date(catalog.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : ''
  status.textContent = (offline ? 'Cópia offline · ' : '') + (count
    ? count + (count === 1 ? ' item' : ' itens') + update
    : query ? 'Nenhum resultado para a busca.' : 'Nenhum catálogo publicado.')
  for (const group of [...groups.values()].sort((a, b) => sort.compare(a.title, b.title))) {
    const section = document.createElement('details')
    section.open = !!query || groups.size === 1
    const title = element('summary', group.title)
    title.append(element('span', String(group.items.length)))
    const list = document.createElement('ul')
    for (const item of group.items.sort((a, b) => sort.compare(a.name, b.name))) {
      const row = document.createElement('li')
      row.append(element('span', item.name), element('strong', money.format(item.cents / 100)))
      const prices = itemPrices(item)
      if (prices.length) {
        const options = document.createElement('dl')
        options.className = 'discounts'
        for (const { label, cents } of prices) {
          options.append(element('dt', label), element('dd', money.format(cents / 100)))
        }
        row.append(options)
      }
      list.append(row)
    }
    section.append(title, list)
    output.append(section)
  }
}

async function load() {
  try {
    const response = await fetch('./catalog.json', { cache: 'no-cache' })
    if (!response.ok) throw new Error()
    catalog = await response.json()
    offline = response.headers.has('X-LD-Offline')
    render()
    updateExportCategories()
  } catch {
    status.textContent = 'Não foi possível carregar o catálogo. Verifique a conexão e recarregue.'
  }
}

const shareFooter = byId('share-footer')
const shareCategories = byId('share-categories')
const shareAll = byId('share-all')
const shareGenerate = byId('share-generate')
const shareWhatsApp = byId('share-whatsapp')
const shareStatus = byId('share-status')
const shareDownloads = byId('share-downloads')
let exportGroups = []
let exportFiles = []
let exportUrls = []
let exportVersion = 0

function clearExport() {
  exportVersion++
  for (const url of exportUrls) URL.revokeObjectURL(url)
  exportUrls = []
  exportFiles = []
  shareWhatsApp.hidden = true
  shareWhatsApp.disabled = false
  shareDownloads.replaceChildren()
  shareStatus.textContent = ''
  shareGenerate.disabled = !shareCategories.querySelector(':checked')
}

function updateExportCategories() {
  const checked = new Set(Array.from(shareCategories.querySelectorAll(':checked'), input => input.value))
  const groups = new Map()
  for (const item of catalog.items) {
    const key = normalize(item.category)
    if (!groups.has(key)) groups.set(key, { key, title: item.category, items: [] })
    groups.get(key).items.push(item)
  }
  exportGroups = [...groups.values()].sort((a, b) => sort.compare(a.title, b.title))
  shareCategories.replaceChildren()
  for (const group of exportGroups) {
    group.items.sort((a, b) => sort.compare(a.name, b.name))
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = group.key
    input.checked = checked.has(group.key)
    const label = document.createElement('label')
    label.append(input, element('span', group.title))
    shareCategories.append(label)
  }
  shareFooter.hidden = exportGroups.length === 0
  clearExport()
}

shareCategories.addEventListener('change', clearExport)
shareAll.onclick = () => {
  for (const input of shareCategories.querySelectorAll('input')) input.checked = true
  clearExport()
}

const exportDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
})

function wrapExportText(ctx, text, width) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word
    if (ctx.measureText(next).width <= width) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const char of word) {
      if (ctx.measureText(line + char).width > width) {
        lines.push(line)
        line = ''
      }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines
}

async function buildExportFiles(groups, isCurrent) {
  const logo = new Image()
  logo.src = new URL('./logo.png', import.meta.url).href
  await logo.decode()
  const stamp = exportDate.format(new Date())
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  const ctx = canvas.getContext('2d')
  const pages = [[]]
  let page = pages[0]
  let used = 0
  for (const group of groups) {
    ctx.font = 'bold 25px system-ui'
    const title = wrapExportText(ctx, group.title, 950)
    const categoryRow = { lines: title, height: 19 + 30 * title.length }
    let needsTitle = true
    for (const [index, item] of group.items.entries()) {
      ctx.font = '25px system-ui'
      const lines = wrapExportText(ctx, item.name, 735)
      const height = Math.max(54, lines.length * 31 + 18)
      if (used + height + (needsTitle ? categoryRow.height : 0) > 1232) {
        page = []
        pages.push(page)
        used = 0
        needsTitle = true
      }
      if (needsTitle) {
        page.push(categoryRow)
        used += categoryRow.height
        needsTitle = false
      }
      page.push({ lines, height, price: money.format(item.cents / 100), index })
      used += height
    }
  }
  const files = []
  for (const [index, rows] of pages.entries()) {
    if (!isCurrent()) return []
    const last = index === pages.length - 1
    canvas.height = 212 + rows.reduce((sum, row) => sum + row.height, 0) + (last ? 94 : 36)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f6f9fc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#09264d'
    ctx.fillRect(0, 0, 1080, 154)
    ctx.fillStyle = '#fff'
    ctx.fillRect(44, 24, 150, 106)
    const scale = Math.min(126 / logo.naturalWidth, 84 / logo.naturalHeight)
    const logoWidth = logo.naturalWidth * scale
    const logoHeight = logo.naturalHeight * scale
    ctx.drawImage(logo, 119 - logoWidth / 2, 77 - logoHeight / 2, logoWidth, logoHeight)
    ctx.font = 'bold 53px system-ui'
    ctx.fillText('Tabela de preços', 222, 78)
    ctx.fillStyle = '#102644'
    ctx.font = 'bold 25px system-ui'
    ctx.fillText('Produto', 62, 185)
    ctx.textAlign = 'right'
    ctx.fillText('Preço', 1018, 185)
    ctx.textAlign = 'left'
    let y = 212
    for (const row of rows) {
      ctx.fillStyle = row.price ? (row.index % 2 ? '#d6e9f9' : '#e9f3fc') : '#09264d'
      ctx.fillRect(44, y, 992, row.height - 2)
      ctx.fillStyle = row.price ? '#102644' : '#fff'
      ctx.font = row.price ? '25px system-ui' : 'bold 25px system-ui'
      const firstLine = y + row.height / 2 - (row.lines.length - 1) * 15.5
      row.lines.forEach((line, i) => ctx.fillText(line, 62, firstLine + i * 31))
      if (row.price) {
        ctx.font = 'bold 25px system-ui'
        ctx.textAlign = 'right'
        ctx.fillText(row.price, 1018, y + row.height / 2)
        ctx.textAlign = 'left'
      }
      y += row.height
    }
    if (last) {
      ctx.fillStyle = '#344e6d'
      ctx.font = '23px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Gerado em ' + stamp + ' (horário de Brasília)', 540, y + 49)
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Não foi possível exportar a imagem.')
    files.push(new File([blob], 'tabela-de-precos-' + (index + 1) + '.png', { type: blob.type }))
  }
  return files
}

shareGenerate.onclick = async () => {
  clearExport()
  const version = exportVersion
  const selected = new Set(Array.from(shareCategories.querySelectorAll(':checked'), input => input.value))
  shareGenerate.disabled = true
  shareStatus.textContent = 'Gerando imagens…'
  try {
    const files = await buildExportFiles(exportGroups.filter(group => selected.has(group.key)), () => version === exportVersion)
    if (version !== exportVersion) return
    exportFiles = files
    for (const [index, file] of files.entries()) {
      const link = element('a', files.length === 1 ? 'Baixar imagem' : 'Baixar página ' + (index + 1))
      const url = URL.createObjectURL(file)
      exportUrls.push(url)
      link.href = url
      link.download = file.name
      shareDownloads.append(link)
    }
    shareWhatsApp.hidden = !navigator.share || !navigator.canShare?.({ files })
    shareStatus.textContent = shareWhatsApp.hidden
      ? 'Baixe as imagens abaixo e anexe no WhatsApp.'
      : 'Toque em Enviar para o WhatsApp e escolha o WhatsApp no menu do celular.'
  } catch {
    if (version === exportVersion) shareStatus.textContent = 'Não foi possível gerar a imagem. Tente novamente.'
  } finally {
    if (version === exportVersion) shareGenerate.disabled = false
  }
}

shareWhatsApp.onclick = async () => {
  const version = exportVersion
  shareWhatsApp.disabled = true
  try {
    await navigator.share({ files: exportFiles })
  } catch (error) {
    if (version === exportVersion && error.name !== 'AbortError') {
      shareStatus.textContent = 'Baixe as imagens abaixo e anexe no WhatsApp.'
    }
  } finally {
    if (version === exportVersion) shareWhatsApp.disabled = false
  }
}

search.addEventListener('input', render)
window.addEventListener('online', load)
load()

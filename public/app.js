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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error)

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
    const response = await fetch('/api/catalog')
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
let exportFile
let exportUrl
let exportVersion = 0

function clearExport() {
  exportVersion++
  if (exportUrl) URL.revokeObjectURL(exportUrl)
  exportUrl = undefined
  exportFile = undefined
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

function makeCatalogPdf(images, width, height) {
  // PDF cross-reference offsets count bytes, including the binary JPEG streams.
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]
  let offset = chunks[0].length
  function append(chunk) {
    chunks.push(chunk)
    offset += typeof chunk === 'string' ? chunk.length : chunk.size
  }
  function object(id, ...parts) {
    offsets[id] = offset
    append(id + ' 0 obj\n')
    for (const part of parts) append(part)
    append('\nendobj\n')
  }

  const pageWidth = 595.28
  const pageHeight = 841.89
  const pageIds = images.map((_, index) => (3 + index * 3) + ' 0 R')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Count ' + images.length + ' /Kids [' + pageIds.join(' ') + '] >>')
  for (const [index, image] of images.entries()) {
    const page = 3 + index * 3
    object(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight +
      '] /Resources << /XObject << /Table ' + (page + 1) + ' 0 R >> >> /Contents ' + (page + 2) + ' 0 R >>')
    object(page + 1, '<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.size +
      ' >>\nstream\n', image, '\nendstream')
    const draw = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Table Do\nQ\n'
    object(page + 2, '<< /Length ' + draw.length + ' >>\nstream\n' + draw + 'endstream')
  }
  const xref = offset
  append('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n')
  for (const position of offsets.slice(1)) append(String(position).padStart(10, '0') + ' 00000 n \n')
  append('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n')
  return new File(chunks, 'tabela-de-precos.pdf', { type: 'application/pdf' })
}

async function buildExportPdf(groups, isCurrent) {
  const logo = new Image()
  logo.src = new URL('./logo.png', import.meta.url).href
  await logo.decode()
  const stamp = exportDate.format(new Date())
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1528
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
      if (used + height + (needsTitle ? categoryRow.height : 0) > 1200) {
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
  const images = []
  for (const [index, rows] of pages.entries()) {
    if (!isCurrent()) return
    const last = index === pages.length - 1
    ctx.textAlign = 'left'
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
      ctx.fillText('Gerado em ' + stamp + ' (horário de Brasília)', 540, canvas.height - 44)
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92))
    if (!blob || blob.type !== 'image/jpeg') throw new Error('Não foi possível renderizar a página.')
    images.push(blob)
  }
  return makeCatalogPdf(images, canvas.width, canvas.height)
}

shareGenerate.onclick = async () => {
  clearExport()
  const version = exportVersion
  const selected = new Set(Array.from(shareCategories.querySelectorAll(':checked'), input => input.value))
  shareGenerate.disabled = true
  shareStatus.textContent = 'Gerando PDF…'
  try {
    const file = await buildExportPdf(exportGroups.filter(group => selected.has(group.key)), () => version === exportVersion)
    if (version !== exportVersion) return
    exportFile = file
    exportUrl = URL.createObjectURL(file)
    const link = element('a', 'Baixar PDF')
    link.href = exportUrl
    link.download = file.name
    shareDownloads.append(link)
    shareWhatsApp.hidden = !navigator.share || !navigator.canShare?.({ files: [file] })
    shareStatus.textContent = shareWhatsApp.hidden
      ? 'Baixe o PDF abaixo e anexe no WhatsApp.'
      : 'Toque em Enviar para o WhatsApp e escolha o WhatsApp no menu do celular.'
  } catch {
    if (version === exportVersion) shareStatus.textContent = 'Não foi possível gerar o PDF. Tente novamente.'
  } finally {
    if (version === exportVersion) shareGenerate.disabled = false
  }
}

shareWhatsApp.onclick = async () => {
  const version = exportVersion
  shareWhatsApp.disabled = true
  try {
    await navigator.share({ files: [exportFile] })
  } catch (error) {
    if (version === exportVersion && error.name !== 'AbortError') {
      shareStatus.textContent = 'Baixe o PDF abaixo e anexe no WhatsApp.'
    }
  } finally {
    if (version === exportVersion) shareWhatsApp.disabled = false
  }
}

search.addEventListener('input', render)
window.addEventListener('online', load)
load()

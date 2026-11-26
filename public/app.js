import { normalize, money } from './catalog.js'

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
  } catch {
    status.textContent = 'Não foi possível carregar o catálogo. Verifique a conexão e recarregue.'
  }
}
search.addEventListener('input', render)
window.addEventListener('online', load)
load()

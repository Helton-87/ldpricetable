import { itemPrices, money, sheetToItems } from '../catalog.js'

const form = document.querySelector('#upload')
const file = document.querySelector('#file')
const notice = document.querySelector('#notice')
const preview = document.querySelector('#preview')
const button = form.querySelector('button')
let items

file.onchange = () => {
  items = undefined
  preview.hidden = true
  notice.textContent = ''
}

form.onsubmit = async event => {
  event.preventDefault()
  items = undefined
  preview.hidden = true
  button.disabled = file.disabled = true
  notice.textContent = 'Lendo a planilha…'
  try {
    const selected = file.files[0]
    if (!selected || !/\.xlsx$/i.test(selected.name) || selected.size > 10 * 1024 * 1024) {
      throw new Error('Selecione uma planilha .xlsx de até 10 MB.')
    }
    await import('./exceljs.min.js')
    const workbook = new globalThis.ExcelJS.Workbook()
    await workbook.xlsx.load(await selected.arrayBuffer())
    items = sheetToItems(workbook.worksheets[0])
    const sample = items.slice(0, 5).map(item => {
      const row = document.createElement('li')
      const prices = itemPrices(item).map(({ label, cents }) => `${label}: ${money.format(cents / 100)}`)
      row.textContent = [item.category, item.name, money.format(item.cents / 100), ...prices].join(' · ')
      return row
    })
    document.querySelector('#items').replaceChildren(...sample)
    notice.textContent = `${items.length} itens validados. Confira abaixo até 5 deles.`
    preview.hidden = false
  } catch (error) {
    notice.textContent = error.message
  } finally {
    button.disabled = file.disabled = false
  }
}

document.querySelector('#download').onclick = () => {
  if (!items) return
  const catalog = JSON.stringify({ items, updatedAt: new Date().toISOString() }, null, 2)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([catalog], { type: 'application/json' }))
  link.download = 'catalog.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

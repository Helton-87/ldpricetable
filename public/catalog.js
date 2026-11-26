export const MAX_ITEMS = 10000
export const normalize = value =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('pt-BR')
export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function validateItem(row) {
  if (!row || typeof row.category !== 'string' || typeof row.name !== 'string') return null
  const category = row.category.trim()
  const name = row.name.trim()
  if (!category || category.length > 100 || !name || name.length > 250) return null
  if (!Number.isSafeInteger(row.cents) || row.cents < 0 || row.cents > 99999999999) return null
  return { category, name, cents: row.cents }
}

export function validateCatalog(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ITEMS) return null
  const items = rows.map(validateItem)
  return items.includes(null) ? null : items
}

export function priceInCents(value) {
  if (typeof value === 'string') {
    const price = value.trim().replace(/^R\$\s*/, '')
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(price)) {
      value = Number(price.replaceAll('.', '').replace(',', '.'))
    } else if (/^\d+([,.]\d{1,2})?$/.test(price)) {
      value = Number(price.replace(',', '.'))
    } else return NaN
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return NaN
  const cents = Math.round(value * 100)
  return Math.abs(value * 100 - cents) < 0.00002 ? cents : NaN
}

export function sheetToItems(sheet) {
  if (!sheet) throw new Error('A planilha está vazia.')
  const headers = new Map()
  sheet.getRow(1).eachCell((cell, col) => {
    const name = normalize(cell.text)
    if (['categoria', 'item', 'preco'].includes(name)) {
      if (headers.has(name)) throw new Error(`Cabeçalho repetido na coluna ${col}.`)
      headers.set(name, col)
    }
  })
  if (headers.size !== 3) throw new Error('Inclua Categoria, Item e Preço na primeira linha.')
  const items = []
  sheet.eachRow((row, line) => {
    if (line === 1) return
    const category = row.getCell(headers.get('categoria')).text.trim()
    const name = row.getCell(headers.get('item')).text.trim()
    const price = row.getCell(headers.get('preco'))
    if (!category && !name && price.value == null) return
    const item = validateItem({
      category, name, cents: priceInCents(price.result ?? price.value)
    })
    if (!item) throw new Error(`Linha ${line} inválida. Confira a categoria, o item e o preço com até duas casas decimais.`)
    items.push(item)
    if (items.length > MAX_ITEMS) throw new Error('A planilha aceita até 10.000 itens.')
  })
  if (!items.length) throw new Error('Inclua pelo menos um item.')
  return items
}

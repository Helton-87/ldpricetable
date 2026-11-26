export const MAX_ITEMS = 10000
export const normalize = value =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('pt-BR')
export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const discounts = [
  { key: 'pixCents', header: 'pix - 2%', label: 'PIX (2% de desconto)' },
  { key: 'bulkCents', header: '3% (3+ un.)', label: 'A partir de 3 unidades (3% de desconto)' }
]

const validCents = value => Number.isSafeInteger(value) && value >= 0 && value <= 99999999999

export function itemPrices(item) {
  return discounts.filter(({ key }) => validCents(item[key]))
    .map(({ key, label }) => ({ label, cents: item[key] }))
}

export function validateItem(row) {
  if (!row || typeof row.category !== 'string' || typeof row.name !== 'string') return null
  const category = row.category.trim()
  const name = row.name.trim()
  if (!category || category.length > 100 || !name || name.length > 250) return null
  if (!validCents(row.cents)) return null
  const item = { category, name, cents: row.cents }
  for (const { key } of discounts) {
    if (row[key] == null) continue
    if (!validCents(row[key])) return null
    item[key] = row[key]
  }
  return item
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
    const header = normalize(cell.text)
    const name = header === 'descricao' ? 'item' : header
    if (['categoria', 'item', 'preco'].includes(name) || discounts.some(({ header }) => header === name)) {
      if (headers.has(name)) throw new Error(`Cabeçalho repetido na coluna ${col}.`)
      headers.set(name, col)
    }
  })
  if (!['categoria', 'item', 'preco'].every(name => headers.has(name))) {
    throw new Error('Inclua Categoria, Descrição (ou Item) e Preço na primeira linha.')
  }
  const discountColumns = discounts.filter(({ header }) => headers.has(header))
    .map(discount => ({ ...discount, column: headers.get(discount.header) }))
  const items = []
  sheet.eachRow((row, line) => {
    if (line === 1) return
    const category = row.getCell(headers.get('categoria')).text.trim()
    const name = row.getCell(headers.get('item')).text.trim()
    const price = row.getCell(headers.get('preco'))
    const optionalPrices = discountColumns.map(option => {
      const cell = row.getCell(option.column)
      return { ...option, value: cell.result ?? cell.value }
    }).filter(({ value }) => value != null && (typeof value !== 'string' || value.trim()))
    if (!category && !name && price.value == null && !optionalPrices.length) return
    const item = validateItem({ category, name, cents: priceInCents(price.result ?? price.value) })
    if (!item) throw new Error(`Linha ${line} inválida. Confira a categoria, o item e o preço com até duas casas decimais.`)
    for (const { key, label, value } of optionalPrices) {
      const cents = priceInCents(value)
      if (!validCents(cents)) throw new Error(`Linha ${line}: confira o preço para ${label}.`)
      item[key] = cents
    }
    items.push(item)
    if (items.length > MAX_ITEMS) throw new Error('A planilha aceita até 10.000 itens.')
  })
  if (!items.length) throw new Error('Inclua pelo menos um item.')
  return items
}

import { makeTableRows } from './table-data'
import './table-bench.css'

declare global {
  interface Window {
    __benosTableBench: { initial: Promise<number> }
  }
}

const size = Number(new URLSearchParams(location.search).get('rows') ?? 5_000)
const rows = makeTableRows(size)
const host = document.querySelector<HTMLElement>('#main')
if (!host) throw new Error('Table benchmark mount is missing')

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

const started = performance.now()
const table = element('table', 'benos-sortable-table')
const caption = element('caption', 'benos-sortable-table__caption')
caption.textContent = 'Benchmark rows'
table.append(caption)

const head = element('thead')
const headerRow = element('tr')
for (const [index, label] of ['Name', 'Region', 'Requests'].entries()) {
  const header = element('th')
  header.scope = 'col'
  header.setAttribute('aria-sort', 'none')
  if (index === 0) {
    const button = element('button', 'benos-sortable-table__sort')
    button.type = 'button'
    button.textContent = label
    const indicator = element('span', 'benos-sortable-table__indicator')
    indicator.setAttribute('aria-hidden', 'true')
    indicator.textContent = '↕'
    button.append(indicator)
    header.append(button)
  } else {
    header.textContent = label
  }
  headerRow.append(header)
}
head.append(headerRow)
table.append(head)

const body = element('tbody')
for (const row of rows) {
  const tr = element('tr')
  for (const [value, className] of [
    [row.name, 'benos-sortable-table__text'],
    [row.region, 'benos-sortable-table__text'],
    [row.requests, 'benos-sortable-table__number'],
  ] as const) {
    const cell = element('td', className)
    cell.dir = 'auto'
    cell.textContent = String(value)
    tr.append(cell)
  }
  body.append(tr)
}
table.append(body)
host.append(table)

window.__benosTableBench = {
  initial: new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve(performance.now() - started)),
    )
  }),
}

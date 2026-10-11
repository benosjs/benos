import { render } from '@benosjs/dom'
import { SortableTable } from '../../../registry/source/components/sortable-table.js'
import type { SortableTableColumn } from '../../../registry/source/components/sortable-table.js'
import { makeTableRows, type TableRow } from './table-data'
import { makeColumns } from './table-model'
import './table-bench.css'

declare global {
  interface Window {
    __benosTableBench: {
      initial: Promise<number>
      sort: () => Promise<{
        elapsed: number
        count: number
        firstName?: string
      }>
    }
  }
}

const size = Number(new URLSearchParams(location.search).get('rows') ?? 5_000)
const columnCount = Number(
  new URLSearchParams(location.search).get('columns') ?? 3,
)
const rows = makeTableRows(size)
const columns: readonly SortableTableColumn<TableRow>[] =
  makeColumns(columnCount)
const host = document.querySelector<HTMLElement>('#main')
if (!host) throw new Error('Table benchmark mount is missing')
const started = performance.now()
render(
  () => (
    <SortableTable
      caption="Benchmark rows"
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
    />
  ),
  host,
)
window.__benosTableBench = {
  initial: new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve(performance.now() - started)),
    )
  }),
  sort: async () => {
    const button = document.querySelector<HTMLButtonElement>(
      '.benos-sortable-table__sort',
    )
    if (!button) throw new Error('Sortable Name header was not rendered.')
    const started = performance.now()
    button.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return {
      elapsed: performance.now() - started,
      count: document.querySelectorAll('tbody tr').length,
      firstName: document.querySelector('tbody tr td')?.textContent,
    }
  },
}

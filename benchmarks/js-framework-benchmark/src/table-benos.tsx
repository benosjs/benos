import { render } from '@benosjs/dom'
import { SortableTable } from '../../../registry/source/components/sortable-table.js'
import type { SortableTableColumn } from '../../../registry/source/components/sortable-table.js'
import { makeTableRows, type TableRow } from './table-data'
import './table-bench.css'

declare global {
  interface Window {
    __benosTableBench: { initial: Promise<number> }
  }
}

const size = Number(new URLSearchParams(location.search).get('rows') ?? 5_000)
const rows = makeTableRows(size)
const columns: readonly SortableTableColumn<TableRow>[] = [
  { key: 'name', label: 'Name', value: (row) => row.name },
  { key: 'region', label: 'Region', value: (row) => row.region },
  {
    key: 'requests',
    label: 'Requests',
    type: 'number',
    value: (row) => row.requests,
  },
]
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
}

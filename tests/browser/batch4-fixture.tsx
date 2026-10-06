import { render } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'
import { SortableTable } from '../../registry/source/components/sortable-table.js'
import type { SortableTableColumn } from '../../registry/source/components/sortable-table.js'
import '../../examples/ui-gallery/src/ui.css'

type Row = { id: string; name: string; score: number }

const rows: readonly Row[] = [
  { id: 'charlie', name: 'Charlie', score: 3 },
  { id: 'alpha', name: 'Alpha', score: 10 },
  {
    id: 'bravo',
    name: 'Bravo with a long display value that should truncate cleanly',
    score: 2,
  },
  { id: 'delta', name: 'Delta', score: 21 },
]
const arabicRow: Row = {
  id: 'arabic',
  name: 'مريم خوري مع اسم طويل للعرض',
  score: 5,
}
const columns: readonly SortableTableColumn<Row>[] = [
  { key: 'name', label: 'Name', value: (row) => row.name },
  { key: 'score', label: 'Score', value: (row) => row.score, type: 'number' },
]
declare global {
  interface Window {
    __benosBatchFour: { dispose: () => void }
  }
}

const host = document.querySelector<HTMLElement>('#batch4-app')
if (!host) throw new Error('Batch 4 fixture host is missing')
const empty = new URLSearchParams(location.search).has('empty')
const rtl = new URLSearchParams(location.search).has('rtl')
const bidi = new URLSearchParams(location.search).has('bidi')
document.documentElement.dir = rtl ? 'rtl' : 'ltr'

function Fixture(): JSX.Element {
  return (
    <div class="batch4-fixture">
      <h1>Sortable table test</h1>
      <SortableTable
        id="members"
        caption="Project members"
        rows={empty ? [] : bidi ? [...rows, arabicRow] : rows}
        rowKey={(row) => row.id}
        columns={columns}
        emptyMessage="No members yet."
      />
    </div>
  )
}

window.__benosBatchFour = { dispose: render(() => <Fixture />, host) }

# SortableTable

`SortableTable<Row>` renders a native table with keyed rows and sortable columns.

**API:** `caption`, `rows`, `rowKey`, and `columns` are required. Each column
has `key`, `label`, `value(row)`, and optional `type: 'text' | 'number'`.
`emptyMessage`, native table attributes, `class`, `id`, and `ref` are supported.

**Variants:** there are no appearance variants; column `type: 'number'` aligns
numeric values to the logical end of the cell.

```tsx
import { SortableTable } from '@/components/ui/sortable-table'
import type { SortableTableColumn } from '@/components/ui/sortable-table'

type Person = { id: number; name: string; visits: number }
const rows: Person[] = [{ id: 1, name: 'Maya', visits: 12 }]
const columns: readonly SortableTableColumn<Person>[] = [
  { key: 'name', label: 'Name', value: (person) => person.name },
  {
    key: 'visits',
    label: 'Visits',
    type: 'number',
    value: (person) => person.visits,
  },
]

export function PeopleTable() {
  return (
    <SortableTable
      caption="People"
      rows={rows}
      rowKey={(person) => person.id}
      columns={columns}
    />
  )
}
```

**Accessibility:** a caption names the table; sortable headings are buttons
whose `aria-sort` reflects ascending, descending, or unsorted state. Keyboard
users activate a header with Enter or Space. Cells use automatic text direction
and numeric columns align logically in RTL.

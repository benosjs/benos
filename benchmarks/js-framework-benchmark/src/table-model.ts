import type { TableRow } from './table-data'

export type BenchColumn = {
  key: string
  label: string
  type?: 'text' | 'number'
  value: (row: TableRow) => string | number
}

export function makeColumns(count: number): BenchColumn[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `column-${index}`,
    label: ['Name', 'Region', 'Requests'][index] ?? `Field ${index + 1}`,
    type: index === 2 ? 'number' : 'text',
    value: (row: TableRow) => {
      if (index === 0) return row.name
      if (index === 1) return row.region
      if (index === 2) return row.requests
      return `${row.name} ${index + 1}`
    },
  }))
}

export function orderRows(
  rows: readonly TableRow[],
  direction: 'ascending' | 'descending' | null,
): readonly TableRow[] {
  if (!direction) return rows
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  const factor = direction === 'ascending' ? 1 : -1
  return [...rows].sort((a, b) => collator.compare(a.name, b.name) * factor)
}

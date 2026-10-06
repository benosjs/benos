export type TableRow = {
  id: string
  name: string
  region: string
  requests: number
}

export function makeTableRows(count: number): TableRow[] {
  return Array.from({ length: count }, (_, index) => {
    const memberNumber = count - index
    return {
      id: `member-${memberNumber}`,
      name: `Member ${memberNumber}`,
      region:
        ['Beirut', 'Tripoli', 'Sidon', 'Byblos'][memberNumber % 4] ?? 'Beirut',
      requests: (memberNumber * 37) % 1_200,
    }
  })
}

export function sortedTableRows(
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

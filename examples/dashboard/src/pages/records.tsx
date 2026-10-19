/** @jsxImportSource @benosjs/dom */

import { computed, signal } from '@benosjs/core'
import { For } from '@benosjs/dom'
import { Button } from '../../../../registry/source/components/button.js'
import { Input } from '../../../../registry/source/components/input.js'

interface Row {
  id: number
  name: string
  team: string
  value: number
}
type SortKey = 'id' | 'name' | 'value'

function makeRows(count: number): Row[] {
  const teams = ['Core', 'DOM', 'Compiler', 'Tooling', 'Examples']
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Record ${String(index + 1).padStart(5, '0')}`,
    team: teams[index % teams.length] ?? 'Core',
    value: ((index * 37) % 997) + 3,
  }))
}

function LargeTable() {
  const rows = signal(makeRows(5000))
  const filter = signal('')
  const sort = signal<SortKey>('id')
  const descending = signal(false)
  const visibleRows = computed(() => {
    const query = filter().trim().toLowerCase()
    const filtered = rows().filter(
      (row) =>
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.team.toLowerCase().includes(query),
    )
    const key = sort()
    const direction = descending() ? -1 : 1
    return filtered.slice().sort((left, right) => {
      const a = left[key]
      const b = right[key]
      return (a < b ? -1 : a > b ? 1 : 0) * direction
    })
  })
  return (
    <section aria-labelledby="records-title">
      <div class="table-toolbar">
        <h2 id="records-title">Records ({visibleRows().length} of 5,000)</h2>
        <Input
          aria-label="Filter records"
          placeholder="Filter by name or team"
          value={filter()}
          onInput={(event) => filter.set(event.currentTarget.value)}
        />
        <select
          aria-label="Sort records"
          value={sort()}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (value === 'id' || value === 'name' || value === 'value')
              sort.set(value)
          }}
        >
          <option value="id">ID</option>
          <option value="name">Name</option>
          <option value="value">Value</option>
        </select>
        <Button
          variant="outline"
          onClick={() => descending.update((value) => !value)}
        >
          {descending() ? 'Ascending' : 'Descending'}
        </Button>
      </div>
      <div class="table-scroll">
        <table class="records-table">
          <caption class="visually-hidden">
            A filterable list of 5,000 project records
          </caption>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Name</th>
              <th scope="col">Team</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            <For each={visibleRows()} by={(row) => row.id}>
              {(row) => (
                <tr>
                  <td>{row().id}</td>
                  <td>{row().name}</td>
                  <td>{row().team}</td>
                  <td>{row().value}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function RecordsPage() {
  return (
    <>
      <p class="eyebrow">Data workspace</p>
      <h1>Sortable records</h1>
      <p class="page-intro">
        A keyed 5,000-row table with filtering and sorting.
      </p>
      <LargeTable />
    </>
  )
}

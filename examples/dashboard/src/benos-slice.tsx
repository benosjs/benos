/** @jsxImportSource @benosjs/dom */

import { computed, signal } from '@benosjs/core'
import { For, render } from '@benosjs/dom'

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

function ComparisonSlice() {
  const name = signal('Ada Lovelace')
  const email = signal('ada@example.test')
  const submitted = signal(false)
  const filter = signal('')
  const sort = signal<SortKey>('id')
  const descending = signal(false)
  const rows = signal(makeRows(5000))
  const errors = computed(() => ({
    name: name().trim().length < 2 ? 'Name needs at least two characters.' : '',
    email: email().includes('@') ? '' : 'Enter an email address.',
  }))
  const visibleRows = computed(() => {
    const query = filter().trim().toLowerCase()
    const result = rows().filter(
      (row) =>
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.team.toLowerCase().includes(query),
    )
    const key = sort()
    const direction = descending() ? -1 : 1
    return result.slice().sort((left, right) => {
      const a = left[key]
      const b = right[key]
      return (a < b ? -1 : a > b ? 1 : 0) * direction
    })
  })
  return (
    <main>
      <h1>Benos comparison slice</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submitted.set(true)
        }}
      >
        <input
          value={name()}
          onInput={(event) => name.set(event.currentTarget.value)}
        />
        <input
          value={email()}
          onInput={(event) => email.set(event.currentTarget.value)}
        />
        <button type="submit">Save</button>
        {submitted() && (
          <output>{errors().name || errors().email || 'Saved locally.'}</output>
        )}
      </form>
      <input
        aria-label="Filter records"
        value={filter()}
        onInput={(event) => filter.set(event.currentTarget.value)}
      />
      <select
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
      <button onClick={() => descending.set(!descending())}>
        {descending() ? 'Ascending' : 'Descending'}
      </button>
      <h2>Records ({visibleRows().length} of 5,000)</h2>
      <table>
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
    </main>
  )
}

const host = document.querySelector('#app')
if (!host) throw new Error('Benos comparison host is missing')
render(() => <ComparisonSlice />, host)
window.__dashboardReady = true

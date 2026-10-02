/** @jsxImportSource solid-js */

import { createMemo, createSignal, For, Show } from 'solid-js'

interface Row {
  id: number
  name: string
  team: string
  value: number
}

function makeRows(count: number): Row[] {
  const teams = ['Core', 'DOM', 'Compiler', 'Tooling', 'Examples']
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Record ${String(index + 1).padStart(5, '0')}`,
    team: teams[index % teams.length] ?? 'Core',
    value: ((index * 37) % 997) + 3,
  }))
}

export function SolidSlice() {
  const [name, setName] = createSignal('Ada Lovelace')
  const [email, setEmail] = createSignal('ada@example.test')
  const [submitted, setSubmitted] = createSignal(false)
  const [filter, setFilter] = createSignal('')
  const [sort, setSort] = createSignal<'id' | 'name' | 'value'>('id')
  const [descending, setDescending] = createSignal(false)
  const [rows] = createSignal(makeRows(5000))
  const errors = createMemo(() => ({
    name: name().trim().length < 2 ? 'Name needs at least two characters.' : '',
    email: email().includes('@') ? '' : 'Enter an email address.',
  }))
  const visibleRows = createMemo(() => {
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
      <h1>Solid comparison slice</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
        }}
      >
        <input
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <input
          value={email()}
          onInput={(event) => setEmail(event.currentTarget.value)}
        />
        <button type="submit">Save</button>
        <Show when={submitted()}>
          <output>{errors().name || errors().email || 'Saved locally.'}</output>
        </Show>
      </form>
      <input
        aria-label="Filter records"
        value={filter()}
        onInput={(event) => setFilter(event.currentTarget.value)}
      />
      <select
        value={sort()}
        onChange={(event) => {
          const value = event.currentTarget.value
          if (value === 'id' || value === 'name' || value === 'value')
            setSort(value)
        }}
      >
        <option value="id">ID</option>
        <option value="name">Name</option>
        <option value="value">Value</option>
      </select>
      <button onClick={() => setDescending((value) => !value)}>
        {descending() ? 'Ascending' : 'Descending'}
      </button>
      <h2>Records ({visibleRows().length} of 5,000)</h2>
      <table>
        <tbody>
          <For each={visibleRows()}>
            {(row) => (
              <tr>
                <td>{row.id}</td>
                <td>{row.name}</td>
                <td>{row.team}</td>
                <td>{row.value}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </main>
  )
}

const host = document.querySelector('#app')
if (!host) throw new Error('Solid comparison host is missing')
host.replaceChildren()
import { render } from 'solid-js/web'
render(() => <SolidSlice />, host)
window.__dashboardReady = true

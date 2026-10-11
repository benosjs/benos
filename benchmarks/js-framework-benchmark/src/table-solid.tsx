import { For, createMemo, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { makeTableRows } from './table-data'
import { makeColumns, orderRows } from './table-model'
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
const columns = makeColumns(columnCount)
const [direction, setDirection] = createSignal<
  'ascending' | 'descending' | null
>(null)
const ordered = createMemo(() => orderRows(rows, direction()))
const started = performance.now()

function App() {
  const activate = () =>
    setDirection((current) =>
      current === null
        ? 'ascending'
        : current === 'ascending'
          ? 'descending'
          : null,
    )
  return (
    <table class="benos-sortable-table">
      <caption class="benos-sortable-table__caption">Benchmark rows</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              scope="col"
              aria-sort={
                column.key === 'column-0' ? (direction() ?? 'none') : 'none'
              }
              dir="auto"
            >
              <button
                class="benos-sortable-table__sort"
                type="button"
                onClick={activate}
              >
                {column.label}
                <span
                  aria-hidden="true"
                  class="benos-sortable-table__indicator"
                >
                  {column.key === 'column-0'
                    ? direction() === 'ascending'
                      ? '↑'
                      : direction() === 'descending'
                        ? '↓'
                        : '↕'
                    : '↕'}
                </span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <For each={ordered()}>
          {(row: TableRow) => (
            <tr>
              {columns.map((column) => (
                <td
                  dir={column.type === 'number' ? undefined : 'auto'}
                  class={
                    column.type === 'number'
                      ? 'benos-sortable-table__number'
                      : 'benos-sortable-table__text'
                  }
                >
                  {column.value(row)}
                </td>
              ))}
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

const host = document.querySelector<HTMLElement>('#main')
if (!host) throw new Error('Table benchmark mount is missing')
render(() => <App />, host)
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
    const start = performance.now()
    button.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return {
      elapsed: performance.now() - start,
      count: document.querySelectorAll('tbody tr').length,
      firstName: document.querySelector('tbody tr td')?.textContent,
    }
  },
}

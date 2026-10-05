import { For, createMemo, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { makeTableRows, sortedTableRows, type TableRow } from './table-data'
import './table-bench.css'

declare global {
  interface Window {
    __benosTableBench: { initial: Promise<number> }
  }
}

const size = Number(new URLSearchParams(location.search).get('rows') ?? 5_000)
const rows = makeTableRows(size)
const [direction, setDirection] = createSignal<
  'ascending' | 'descending' | null
>(null)
const ordered = createMemo(() => sortedTableRows(rows, direction()))
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
          <th scope="col" aria-sort={direction() ?? 'none'}>
            <button
              class="benos-sortable-table__sort"
              type="button"
              onClick={activate}
            >
              Name
              <span aria-hidden="true" class="benos-sortable-table__indicator">
                {direction() === 'ascending'
                  ? '↑'
                  : direction() === 'descending'
                    ? '↓'
                    : '↕'}
              </span>
            </button>
          </th>
          <th scope="col" aria-sort="none">
            Region
          </th>
          <th scope="col" aria-sort="none">
            Requests
          </th>
        </tr>
      </thead>
      <tbody>
        <For each={ordered()}>
          {(row: TableRow) => (
            <tr data-row-key={row.id}>
              <td class="benos-sortable-table__text">{row.name}</td>
              <td class="benos-sortable-table__text">{row.region}</td>
              <td class="benos-sortable-table__number">{row.requests}</td>
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
}

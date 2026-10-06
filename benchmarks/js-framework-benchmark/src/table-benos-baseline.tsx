import { For, render } from '@benosjs/dom'
import { makeTableRows, type TableRow } from './table-data'
import './table-bench.css'

declare global {
  interface Window {
    __benosTableBench: { initial: Promise<number> }
  }
}

const size = Number(new URLSearchParams(location.search).get('rows') ?? 5_000)
const rows = makeTableRows(size)
const host = document.querySelector<HTMLElement>('#main')
if (!host) throw new Error('Table benchmark mount is missing')
const started = performance.now()

render(
  () => (
    <table class="benos-sortable-table">
      <caption class="benos-sortable-table__caption" dir="auto">
        Benchmark rows
      </caption>
      <thead>
        <tr>
          <th scope="col" aria-sort="none" dir="auto">
            <button class="benos-sortable-table__sort" type="button">
              Name
              <span aria-hidden="true" class="benos-sortable-table__indicator">
                ↕
              </span>
            </button>
          </th>
          <th scope="col" aria-sort="none" dir="auto">
            Region
          </th>
          <th scope="col" aria-sort="none" dir="auto">
            Requests
          </th>
        </tr>
      </thead>
      <tbody>
        <For each={rows} by={(row: TableRow) => row.id}>
          {(row) => (
            <tr>
              <td class="benos-sortable-table__text" dir="auto">
                {row().name}
              </td>
              <td class="benos-sortable-table__text" dir="auto">
                {row().region}
              </td>
              <td class="benos-sortable-table__number" dir="auto">
                {row().requests}
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
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

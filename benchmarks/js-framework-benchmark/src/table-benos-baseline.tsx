import { computed, signal } from '@benosjs/core'
import { For, render } from '@benosjs/dom'
import { makeTableRows } from './table-data'
import { makeColumns, orderRows, type BenchColumn } from './table-model'
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
const columns: BenchColumn[] = makeColumns(columnCount)
const direction = signal<'ascending' | 'descending' | null>(null)
const ordered = computed(() => orderRows(rows, direction()))
const host = document.querySelector<HTMLElement>('#main')
if (!host) throw new Error('Table benchmark mount is missing')
const started = performance.now()

function activate(): void {
  direction.update((current) =>
    current === null
      ? 'ascending'
      : current === 'ascending'
        ? 'descending'
        : null,
  )
}

render(
  () => (
    <table class="benos-sortable-table">
      <caption class="benos-sortable-table__caption" dir="auto">
        Benchmark rows
      </caption>
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
        <For each={ordered()} by={(row) => row.id}>
          {(row) => (
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
                  {column.value(row())}
                </td>
              ))}
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
  sort: async () => {
    const button = document.querySelector<HTMLButtonElement>(
      '.benos-sortable-table__sort',
    )
    if (!button) throw new Error('Sortable Name header was not rendered.')
    const started = performance.now()
    button.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return {
      elapsed: performance.now() - started,
      count: document.querySelectorAll('tbody tr').length,
      firstName: document.querySelector('tbody tr td')?.textContent,
    }
  },
}

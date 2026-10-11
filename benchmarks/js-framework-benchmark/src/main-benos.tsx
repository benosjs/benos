/** @jsxImportSource @benosjs/dom */
import { batch, signal } from '@benosjs/core'
import { For, render } from '@benosjs/dom'
import { buildData } from './data.js'
import './styles.css'

type RowData = { id: number; label: string }

const rows = signal<RowData[]>([])
const selected = signal(0)

function removeRow(id: number) {
  rows.update((value) => value.filter((row) => row.id !== id))
}

function Row(props: { row: () => RowData }) {
  return (
    <tr class={selected() === props.row().id ? 'selected' : ''}>
      <td>{props.row().id}</td>
      <td>
        <a onClick={() => selected.set(props.row().id)}>{props.row().label}</a>
      </td>
      <td>
        <button
          data-remove={props.row().id}
          onClick={() => removeRow(props.row().id)}
        >
          remove
        </button>
      </td>
      <td />
    </tr>
  )
}

function toolbarButton(id: string, label: string, handler: () => void) {
  return (
    <button id={id} onClick={handler}>
      {label}
    </button>
  )
}

function App() {
  return (
    <div class="container">
      <h1>Benos keyed benchmark</h1>
      <div class="toolbar">
        {toolbarButton('run', 'Create 1,000 rows', () =>
          rows.set(buildData(1000)),
        )}
        {toolbarButton('runlots', 'Create 10,000 rows', () =>
          rows.set(buildData(10000)),
        )}
        {toolbarButton('add', 'Append 1,000 rows', () =>
          rows.update((value) => value.concat(buildData(1000))),
        )}
        {toolbarButton('update', 'Update every 10th row', () =>
          batch(() =>
            rows.update((value) =>
              value.map((row, index) =>
                index % 10 === 0 ? { ...row, label: row.label + ' !!!' } : row,
              ),
            ),
          ),
        )}
        {toolbarButton('clear', 'Clear', () => rows.set([]))}
        {toolbarButton('swaprows', 'Swap rows', () =>
          rows.update((value) => {
            if (value.length <= 998) return value
            const next = [...value]
            ;[next[1], next[998]] = [next[998], next[1]]
            return next
          }),
        )}
      </div>
      <table>
        <tbody>
          <For each={rows()} by={(row) => row.id}>
            {(row) => <Row row={row} />}
          </For>
        </tbody>
      </table>
    </div>
  )
}

const host = document.querySelector('#main')
if (!host) throw new Error('Benchmark mount is missing')
render(() => <App />, host)
window.__jfbReady = true

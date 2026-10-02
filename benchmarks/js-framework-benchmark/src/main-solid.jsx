import { For, createSignal, batch } from 'solid-js'
import { render } from 'solid-js/web'
import { buildData } from './data.js'
import './styles.css'

function App() {
  const [rows, setRows] = createSignal([])
  const [selected, setSelected] = createSignal(0)
  const removeRow = (id) =>
    setRows((value) => value.filter((row) => row.id !== id))
  const update = () =>
    batch(() =>
      setRows((value) =>
        value.map((row, index) =>
          index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
        ),
      ),
    )
  const swapRows = () =>
    setRows((value) => {
      if (value.length <= 998) return value
      const next = value.slice()
      ;[next[1], next[998]] = [next[998], next[1]]
      return next
    })
  return (
    <div class="container">
      <h1>Solid keyed benchmark</h1>
      <div class="toolbar">
        <button id="run" onClick={() => setRows(buildData(1000))}>
          Create 1,000 rows
        </button>
        <button id="runlots" onClick={() => setRows(buildData(10000))}>
          Create 10,000 rows
        </button>
        <button
          id="add"
          onClick={() => setRows((value) => value.concat(buildData(1000)))}
        >
          Append 1,000 rows
        </button>
        <button id="update" onClick={update}>
          Update every 10th row
        </button>
        <button id="clear" onClick={() => setRows([])}>
          Clear
        </button>
        <button id="swaprows" onClick={swapRows}>
          Swap rows
        </button>
      </div>
      <table>
        <tbody>
          <For each={rows()}>
            {(row) => (
              <tr class={selected() === row.id ? 'selected' : ''}>
                <td>{row.id}</td>
                <td>
                  <a onClick={() => setSelected(row.id)}>{row.label}</a>
                </td>
                <td>
                  <button
                    data-remove={row.id}
                    onClick={() => removeRow(row.id)}
                  >
                    remove
                  </button>
                </td>
                <td />
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

render(() => <App />, document.querySelector('#main'))
window.__jfbReady = true

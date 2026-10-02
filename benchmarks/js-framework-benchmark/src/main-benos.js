import { batch, signal } from '@benosjs/core'
import { For, jsx, render } from '@benosjs/dom'
import { buildData } from './data.js'
import './styles.css'

const rows = signal([])
const selected = signal(0)

function removeRow(id) {
  rows.update((value) => value.filter((row) => row.id !== id))
}

function Row(props) {
  return jsx('tr', {
    get class() {
      return selected() === props.row().id ? 'selected' : ''
    },
    children: [
      jsx('td', { children: props.row().id }),
      jsx('td', {
        children: jsx('a', {
          onClick: () => selected.set(props.row().id),
          get children() {
            return props.row().label
          },
        }),
      }),
      jsx('td', {
        children: jsx('button', {
          'data-remove': props.row().id,
          onClick: () => removeRow(props.row().id),
          children: 'remove',
        }),
      }),
      jsx('td', {}),
    ],
  })
}

function button(id, label, handler) {
  return jsx('button', { id, onClick: handler, children: label })
}

function App() {
  return jsx('div', {
    class: 'container',
    children: [
      jsx('h1', { children: 'Benos keyed benchmark' }),
      jsx('div', {
        class: 'toolbar',
        children: [
          button('run', 'Create 1,000 rows', () => rows.set(buildData(1000))),
          button('runlots', 'Create 10,000 rows', () =>
            rows.set(buildData(10000)),
          ),
          button('add', 'Append 1,000 rows', () =>
            rows.update((value) => value.concat(buildData(1000))),
          ),
          button('update', 'Update every 10th row', () =>
            batch(() =>
              rows.update((value) =>
                value.map((row, index) =>
                  index % 10 === 0
                    ? { ...row, label: `${row.label} !!!` }
                    : row,
                ),
              ),
            ),
          ),
          button('clear', 'Clear', () => rows.set([])),
          button('swaprows', 'Swap rows', () =>
            rows.update((value) => {
              if (value.length <= 998) return value
              const next = value.slice()
              ;[next[1], next[998]] = [next[998], next[1]]
              return next
            }),
          ),
        ],
      }),
      jsx('table', {
        children: jsx('tbody', {
          children: jsx(For, {
            get each() {
              return rows()
            },
            by: (row) => row.id,
            children: (row) => jsx(Row, { row }),
          }),
        }),
      }),
    ],
  })
}

render(() => jsx(App, {}), document.querySelector('#main'))
window.__jfbReady = true

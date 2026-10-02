import { createElement, useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { buildData } from './data.js'
import './styles.css'

const h = createElement

function reducer(state, action) {
  switch (action.type) {
    case 'run':
      return { rows: buildData(1000), selected: 0 }
    case 'runlots':
      return { rows: buildData(10000), selected: 0 }
    case 'add':
      return { ...state, rows: state.rows.concat(buildData(1000)) }
    case 'update':
      return {
        ...state,
        rows: state.rows.map((row, index) =>
          index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
        ),
      }
    case 'clear':
      return { rows: [], selected: 0 }
    case 'swaprows': {
      if (state.rows.length <= 998) return state
      const rows = state.rows.slice()
      ;[rows[1], rows[998]] = [rows[998], rows[1]]
      return { ...state, rows }
    }
    case 'select':
      return { ...state, selected: action.id }
    case 'remove':
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
      }
    default:
      return state
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, { rows: [], selected: 0 })
  const button = (id, label, type) =>
    h('button', { id, onClick: () => dispatch({ type }) }, label)
  return h(
    'div',
    { className: 'container' },
    h('h1', null, 'React keyed benchmark'),
    h(
      'div',
      { className: 'toolbar' },
      button('run', 'Create 1,000 rows', 'run'),
      button('runlots', 'Create 10,000 rows', 'runlots'),
      button('add', 'Append 1,000 rows', 'add'),
      button('update', 'Update every 10th row', 'update'),
      button('clear', 'Clear', 'clear'),
      button('swaprows', 'Swap rows', 'swaprows'),
    ),
    h(
      'table',
      null,
      h(
        'tbody',
        null,
        state.rows.map((row) =>
          h(
            'tr',
            {
              key: row.id,
              className: state.selected === row.id ? 'selected' : '',
            },
            h('td', null, row.id),
            h(
              'td',
              null,
              h(
                'a',
                { onClick: () => dispatch({ type: 'select', id: row.id }) },
                row.label,
              ),
            ),
            h(
              'td',
              null,
              h(
                'button',
                {
                  'data-remove': row.id,
                  onClick: () => dispatch({ type: 'remove', id: row.id }),
                },
                'remove',
              ),
            ),
            h('td'),
          ),
        ),
      ),
    ),
  )
}

createRoot(document.querySelector('#main')).render(h(App))
window.__jfbReady = true

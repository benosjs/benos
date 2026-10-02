import { createApp, h, ref } from 'vue'
import { buildData } from './data.js'
import './styles.css'

const App = {
  setup() {
    const rows = ref([])
    const selected = ref(0)
    const update = () => {
      rows.value = rows.value.map((row, index) =>
        index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
      )
    }
    const swapRows = () => {
      if (rows.value.length <= 998) return
      const next = rows.value.slice()
      ;[next[1], next[998]] = [next[998], next[1]]
      rows.value = next
    }
    const removeRow = (id) => {
      rows.value = rows.value.filter((row) => row.id !== id)
    }
    const button = (id, label, handler) =>
      h('button', { id, onClick: handler }, label)
    return () =>
      h('div', { class: 'container' }, [
        h('h1', 'Vue keyed benchmark'),
        h('div', { class: 'toolbar' }, [
          button(
            'run',
            'Create 1,000 rows',
            () => (rows.value = buildData(1000)),
          ),
          button(
            'runlots',
            'Create 10,000 rows',
            () => (rows.value = buildData(10000)),
          ),
          button(
            'add',
            'Append 1,000 rows',
            () => (rows.value = rows.value.concat(buildData(1000))),
          ),
          button('update', 'Update every 10th row', update),
          button('clear', 'Clear', () => (rows.value = [])),
          button('swaprows', 'Swap rows', swapRows),
        ]),
        h('table', [
          h(
            'tbody',
            rows.value.map((row) =>
              h(
                'tr',
                {
                  key: row.id,
                  class: selected.value === row.id ? 'selected' : '',
                },
                [
                  h('td', row.id),
                  h('td', [
                    h(
                      'a',
                      { onClick: () => (selected.value = row.id) },
                      row.label,
                    ),
                  ]),
                  h('td', [
                    h(
                      'button',
                      {
                        'data-remove': row.id,
                        onClick: () => removeRow(row.id),
                      },
                      'remove',
                    ),
                  ]),
                  h('td'),
                ],
              ),
            ),
          ),
        ]),
      ])
  },
}

createApp(App).mount('#main')
window.__jfbReady = true

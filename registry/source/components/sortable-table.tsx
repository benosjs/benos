import { computed, createUniqueId, signal } from '@benosjs/core'
import { For, Show, mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type SortDirection = 'ascending' | 'descending'

export interface SortableTableColumn<Row> {
  key: string
  label: string
  value: (row: Row) => string | number | null | undefined
  type?: 'text' | 'number'
}

export type SortableTableProps<Row> = Omit<
  JSX.IntrinsicElements['table'],
  'children' | 'class' | 'ref' | 'id' | 'rows'
> & {
  id?: string
  class?: string
  caption: string
  rows: readonly Row[]
  rowKey: (row: Row) => PropertyKey
  columns: readonly SortableTableColumn<Row>[]
  emptyMessage?: string
  ref?: (element: HTMLTableElement) => void
}

export function SortableTable<Row>(props: SortableTableProps<Row>): JSX.Element {
  const merged = mergeProps({ emptyMessage: 'No rows to display.' }, props)
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'caption',
    'rows',
    'rowKey',
    'columns',
    'emptyMessage',
  ] as const)
  const id = local.id ?? createUniqueId()
  const sort = signal<{ key: string; direction: SortDirection } | null>(null)
  const rows = computed(() => {
    const current = sort()
    if (!current) return local.rows
    const column = local.columns.find((candidate) => candidate.key === current.key)
    if (!column) return local.rows
    const collator = new Intl.Collator(undefined, {
      numeric: column.type !== 'text',
      sensitivity: 'base',
    })
    return [...local.rows].sort((left, right) => {
      const a = column.value(left)
      const b = column.value(right)
      const order =
        a == null ? (b == null ? 0 : 1) : b == null ? -1 : collator.compare(String(a), String(b))
      return current.direction === 'ascending' ? order : -order
    })
  })

  function toggleSort(key: string): void {
    const current = sort()
    sort.set(
      !current || current.key !== key
        ? { key, direction: 'ascending' }
        : current.direction === 'ascending'
          ? { key, direction: 'descending' }
          : null,
    )
  }

  return (
    <table
      {...native}
      id={id}
      class={['benos-sortable-table', local.class].filter(Boolean).join(' ')}
      ref={(element) => local.ref?.(element)}
    >
      <caption class="benos-sortable-table__caption" dir="auto">
        {local.caption}
      </caption>
      <thead>
        <tr>
          <For each={local.columns} by={(column) => column.key}>
            {(column) => {
              const currentColumn = column()
              return (
                <th
                  scope="col"
                  dir="auto"
                  aria-sort={
                    sort()?.key === currentColumn.key ? (sort()?.direction ?? 'none') : 'none'
                  }
                >
                  <button
                    class="benos-sortable-table__sort"
                    type="button"
                    onClick={() => toggleSort(currentColumn.key)}
                  >
                    {currentColumn.label}
                    <span aria-hidden="true" class="benos-sortable-table__indicator">
                      {sort()?.key === currentColumn.key
                        ? sort()?.direction === 'ascending'
                          ? '↑'
                          : '↓'
                        : '↕'}
                    </span>
                  </button>
                </th>
              )
            }}
          </For>
        </tr>
      </thead>
      <tbody>
        <Show
          when={rows().length > 0}
          fallback={
            <tr>
              <td colSpan={local.columns.length} class="benos-sortable-table__empty" dir="auto">
                {local.emptyMessage}
              </td>
            </tr>
          }
        >
          <For each={rows()} by={(row) => local.rowKey(row)}>
            {(row) => (
              <tr>
                {local.columns.map((column) => (
                  <td
                    dir={column.type === 'number' ? undefined : 'auto'}
                    class={
                      column.type === 'number'
                        ? 'benos-sortable-table__number'
                        : 'benos-sortable-table__text'
                    }
                  >
                    {column.value(row()) ?? '—'}
                  </td>
                ))}
              </tr>
            )}
          </For>
        </Show>
      </tbody>
    </table>
  )
}

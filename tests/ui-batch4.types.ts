import { expectTypeOf } from 'expect-type'
import type {
  SortableTableColumn,
  SortableTableProps,
} from '../registry/source/components/sortable-table.js'

type Row = { id: string; amount: number }
const columns: readonly SortableTableColumn<Row>[] = [
  {
    key: 'amount',
    label: 'Amount',
    type: 'number',
    value: (row) => row.amount,
  },
]
const props: SortableTableProps<Row> = {
  caption: 'Amounts',
  rows: [{ id: 'one', amount: 1 }],
  rowKey: (row) => row.id,
  columns,
  id: 'amounts',
}

expectTypeOf<SortableTableProps<Row>['id']>().toEqualTypeOf<
  string | undefined
>()
expectTypeOf<SortableTableProps<Row>['rows']>().toEqualTypeOf<readonly Row[]>()
expectTypeOf<SortableTableProps<Row>['columns']>().toEqualTypeOf<
  readonly SortableTableColumn<Row>[]
>()
void props

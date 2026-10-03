import { createTabs } from '@benosjs/primitives/tabs'
import { mergeProps, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { TabsOptions } from '@benosjs/primitives/tabs'

export interface TabsItem {
  value: string
  label: string
  content: Child
  disabled?: boolean
}

export type TabsProps = Pick<
  TabsOptions,
  | 'value'
  | 'defaultValue'
  | 'orientation'
  | 'activationMode'
  | 'loopFocus'
  | 'dir'
  | 'onValueChange'
> & {
  id?: string
  class?: string
  label: string
  items: readonly TabsItem[]
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  ref?: (element: HTMLDivElement) => void
}

export function Tabs(props: TabsProps): JSX.Element {
  const merged = mergeProps(
    {
      orientation: 'horizontal' as const,
      activationMode: 'automatic' as const,
    },
    props,
  )
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'label',
    'items',
    'value',
    'defaultValue',
    'orientation',
    'activationMode',
    'loopFocus',
    'dir',
    'onValueChange',
  ] as const)
  const machine = createTabs(() => {
    const defaultValue = local.defaultValue ?? local.items[0]?.value
    return {
      ...(local.id === undefined ? {} : { id: local.id }),
      ...(local.value === undefined ? {} : { value: local.value }),
      ...(defaultValue === undefined ? {} : { defaultValue }),
      orientation: local.orientation,
      activationMode: local.activationMode,
      ...(local.loopFocus === undefined ? {} : { loopFocus: local.loopFocus }),
      ...(local.dir === undefined ? {} : { dir: local.dir }),
      ...(local.onValueChange === undefined ? {} : { onValueChange: local.onValueChange }),
    }
  })
  const api = machine.api
  const root = api().getRootProps()
  const rootRef = root.ref as ((element: HTMLDivElement) => void) | undefined
  const ref = (element: HTMLDivElement) => {
    rootRef?.(element)
    local.ref?.(element)
  }
  const labelId = `benos-tabs-label-${local.id ?? String(root.id)}`

  return (
    <div
      {...root}
      {...native}
      id={local.id}
      class={['benos-tabs', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <div class="benos-tabs__label" id={labelId}>
        {local.label}
      </div>
      <div class="benos-tabs__list" aria-labelledby={labelId} {...api().getListProps()}>
        {local.items.map((item) => (
          <button
            class="benos-tabs__trigger"
            type="button"
            {...api().getTriggerProps({
              value: item.value,
              disabled: item.disabled,
            })}
          >
            {item.label}
          </button>
        ))}
      </div>
      {local.items.map((item) => (
        <div class="benos-tabs__panel" {...api().getContentProps({ value: item.value })}>
          {item.content}
        </div>
      ))}
    </div>
  )
}

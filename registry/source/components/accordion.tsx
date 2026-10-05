import { createAccordion } from '@benosjs/primitives/accordion'
import { mergeProps, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { AccordionOptions } from '@benosjs/primitives/accordion'

export interface AccordionItem {
  value: string
  title: string
  content: Child
  disabled?: boolean
}

export type AccordionProps = Pick<
  AccordionOptions,
  | 'value'
  | 'defaultValue'
  | 'multiple'
  | 'collapsible'
  | 'disabled'
  | 'orientation'
  | 'dir'
  | 'onValueChange'
> & {
  id?: string
  class?: string
  items: readonly AccordionItem[]
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  ref?: (element: HTMLDivElement) => void
}

export function Accordion(props: AccordionProps): JSX.Element {
  const merged = mergeProps(
    {
      defaultValue: [] as string[],
      multiple: false,
      collapsible: true,
      orientation: 'vertical' as const,
    },
    props,
  )
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'items',
    'value',
    'defaultValue',
    'multiple',
    'collapsible',
    'disabled',
    'orientation',
    'dir',
    'onValueChange',
  ] as const)
  const machine = createAccordion(() => ({
    ...(local.id === undefined ? {} : { id: local.id }),
    ...(local.value === undefined ? {} : { value: local.value }),
    defaultValue: local.defaultValue,
    multiple: local.multiple,
    collapsible: local.collapsible,
    ...(local.disabled === undefined ? {} : { disabled: local.disabled }),
    orientation: local.orientation,
    ...(local.dir === undefined ? {} : { dir: local.dir }),
    ...(local.onValueChange === undefined ? {} : { onValueChange: local.onValueChange }),
  }))
  const api = machine.api
  const root = api().getRootProps()
  const rootRef = root.ref as ((element: HTMLDivElement) => void) | undefined
  const ref = (element: HTMLDivElement) => {
    rootRef?.(element)
    local.ref?.(element)
  }

  return (
    <div
      {...root}
      {...native}
      id={local.id}
      class={['benos-accordion', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      {local.items.map((item) => (
        <section
          class="benos-accordion__item"
          {...api().getItemProps({
            value: item.value,
            disabled: item.disabled,
          })}
        >
          <h3 class="benos-accordion__heading">
            <button
              class="benos-accordion__trigger"
              type="button"
              tabIndex={0}
              {...api().getItemTriggerProps({
                value: item.value,
                disabled: item.disabled,
              })}
            >
              <span>{item.title}</span>
              <span
                class="benos-accordion__indicator"
                aria-hidden="true"
                {...api().getItemIndicatorProps({ value: item.value })}
              />
            </button>
          </h3>
          <div
            class="benos-accordion__content"
            {...api().getItemContentProps({ value: item.value })}
          >
            {item.content}
          </div>
        </section>
      ))}
    </div>
  )
}

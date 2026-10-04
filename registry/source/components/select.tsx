import { createSelect } from '@benosjs/primitives/select'
import { collection } from '@zag-js/select'
import { mergeProps, splitProps } from '@benosjs/dom'
import type { SelectOptions } from '@benosjs/primitives/select'
import type { JSX } from '@benosjs/dom'

export interface SelectItem {
  value: string
  label: string
  disabled?: boolean
}

export type SelectProps = Pick<
  SelectOptions,
  | 'value'
  | 'defaultValue'
  | 'open'
  | 'defaultOpen'
  | 'disabled'
  | 'invalid'
  | 'required'
  | 'readOnly'
  | 'closeOnSelect'
  | 'onValueChange'
  | 'onOpenChange'
  | 'dir'
  | 'name'
  | 'form'
  | 'positioning'
> & {
  id?: string
  class?: string
  label: string
  placeholder?: string
  items: readonly SelectItem[]
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  ref?: (element: HTMLDivElement) => void
}

export function Select(props: SelectProps): JSX.Element {
  const merged = mergeProps({ placeholder: 'Select an option', closeOnSelect: true }, props)
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'label',
    'placeholder',
    'items',
    'value',
    'defaultValue',
    'open',
    'defaultOpen',
    'disabled',
    'invalid',
    'required',
    'readOnly',
    'closeOnSelect',
    'onValueChange',
    'onOpenChange',
    'dir',
    'name',
    'form',
    'positioning',
  ] as const)
  const items = local.items.map((item) => ({ ...item }))
  const selectCollection = collection({ items })
  const machine = createSelect(() => ({
    ...(local.id === undefined ? {} : { id: local.id }),
    collection: selectCollection,
    ...(local.value === undefined ? {} : { value: local.value }),
    ...(local.defaultValue === undefined ? {} : { defaultValue: local.defaultValue }),
    ...(local.open === undefined ? {} : { open: local.open }),
    ...(local.defaultOpen === undefined ? {} : { defaultOpen: local.defaultOpen }),
    ...(local.disabled === undefined ? {} : { disabled: local.disabled }),
    ...(local.invalid === undefined ? {} : { invalid: local.invalid }),
    ...(local.required === undefined ? {} : { required: local.required }),
    ...(local.readOnly === undefined ? {} : { readOnly: local.readOnly }),
    closeOnSelect: local.closeOnSelect,
    ...(local.onValueChange === undefined ? {} : { onValueChange: local.onValueChange }),
    ...(local.onOpenChange === undefined ? {} : { onOpenChange: local.onOpenChange }),
    ...(local.dir === undefined ? {} : { dir: local.dir }),
    ...(local.name === undefined ? {} : { name: local.name }),
    ...(local.form === undefined ? {} : { form: local.form }),
    ...(local.positioning === undefined ? {} : { positioning: local.positioning }),
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
      class={['benos-select', local.class].filter(Boolean).join(' ')}
      data-invalid={local.invalid ? 'true' : 'false'}
      ref={ref}
    >
      <label class="benos-select__label" {...api().getLabelProps()}>
        {local.label}
      </label>
      <div class="benos-select__control" {...api().getControlProps()}>
        <button class="benos-select__trigger" type="button" {...api().getTriggerProps()}>
          <span {...api().getValueTextProps()}>{api().valueAsString || local.placeholder}</span>
          <span aria-hidden="true" class="benos-select__chevron" {...api().getIndicatorProps()} />
        </button>
        <button
          class="benos-select__clear"
          type="button"
          aria-label="Clear selection"
          {...api().getClearTriggerProps()}
        >
          ×
        </button>
      </div>
      <select {...api().getHiddenSelectProps()} />
      <div class="benos-select__positioner" {...api().getPositionerProps()}>
        <div class="benos-select__content" {...api().getContentProps()}>
          <div class="benos-select__list" {...api().getListProps()} role="group">
            {items.map((item) => (
              <div class="benos-select__item" {...api().getItemProps({ item })}>
                <span {...api().getItemTextProps({ item })}>{item.label}</span>
                <span
                  aria-hidden="true"
                  class="benos-select__check"
                  {...api().getItemIndicatorProps({ item })}
                >
                  ✓
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

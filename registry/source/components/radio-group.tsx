import { createRadioGroup } from '@benosjs/primitives/radio-group'
import { mergeProps, splitProps } from '@benosjs/dom'
import type { RadioGroupOptions } from '@benosjs/primitives/radio-group'
import type { JSX } from '@benosjs/dom'

export interface RadioGroupItem {
  value: string
  label: string
  disabled?: boolean
}

export type RadioGroupProps = Pick<
  RadioGroupOptions,
  | 'value'
  | 'defaultValue'
  | 'disabled'
  | 'invalid'
  | 'required'
  | 'readOnly'
  | 'orientation'
  | 'dir'
  | 'name'
  | 'form'
  | 'onValueChange'
> & {
  id?: string
  class?: string
  label: string
  items: readonly RadioGroupItem[]
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  ref?: (element: HTMLDivElement) => void
}

export function RadioGroup(props: RadioGroupProps): JSX.Element {
  const merged = mergeProps({ orientation: 'vertical' as const }, props)
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'label',
    'items',
    'value',
    'defaultValue',
    'disabled',
    'invalid',
    'required',
    'readOnly',
    'orientation',
    'dir',
    'name',
    'form',
    'onValueChange',
  ] as const)
  const machine = createRadioGroup(() => ({
    ...(local.id === undefined ? {} : { id: local.id }),
    ...(local.value === undefined ? {} : { value: local.value }),
    ...(local.defaultValue === undefined ? {} : { defaultValue: local.defaultValue }),
    ...(local.disabled === undefined ? {} : { disabled: local.disabled }),
    ...(local.invalid === undefined ? {} : { invalid: local.invalid }),
    ...(local.required === undefined ? {} : { required: local.required }),
    ...(local.readOnly === undefined ? {} : { readOnly: local.readOnly }),
    orientation: local.orientation,
    ...(local.dir === undefined ? {} : { dir: local.dir }),
    ...(local.name === undefined ? {} : { name: local.name }),
    ...(local.form === undefined ? {} : { form: local.form }),
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
      class={['benos-radio-group', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <span class="benos-radio-group__label" {...api().getLabelProps()}>
        {local.label}
      </span>
      <div class="benos-radio-group__items">
        {local.items.map((item) => (
          <label
            class="benos-radio-group__item"
            {...api().getItemProps({ value: item.value, disabled: item.disabled })}
          >
            <input
              {...api().getItemHiddenInputProps({
                value: item.value,
                disabled: item.disabled,
              })}
            />
            <span
              class="benos-radio-group__control"
              {...api().getItemControlProps({ value: item.value })}
            >
              <span aria-hidden="true" />
            </span>
            <span {...api().getItemTextProps({ value: item.value })}>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

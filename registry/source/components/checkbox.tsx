import { createCheckbox } from '@benosjs/primitives/checkbox'
import { mergeProps, splitProps } from '@benosjs/dom'
import type { CheckboxOptions } from '@benosjs/primitives/checkbox'
import type { JSX } from '@benosjs/dom'

export type CheckboxProps = Omit<JSX.IntrinsicElements['label'], 'class' | 'for' | 'ref'> &
  Pick<
    CheckboxOptions,
    | 'checked'
    | 'defaultChecked'
    | 'disabled'
    | 'invalid'
    | 'required'
    | 'readOnly'
    | 'onCheckedChange'
    | 'name'
    | 'form'
    | 'value'
    | 'dir'
  > & {
    id?: string
    class?: string
    ref?: (element: HTMLLabelElement) => void
  }

export function Checkbox(props: CheckboxProps): JSX.Element {
  const merged = mergeProps({ defaultChecked: false }, props)
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'children',
    'checked',
    'defaultChecked',
    'disabled',
    'invalid',
    'required',
    'readOnly',
    'onCheckedChange',
    'name',
    'form',
    'value',
    'dir',
  ] as const)
  const machine = createCheckbox(() => ({
    ...(local.id === undefined ? {} : { id: local.id }),
    ...(local.checked === undefined ? {} : { checked: local.checked }),
    defaultChecked: local.defaultChecked,
    ...(local.disabled === undefined ? {} : { disabled: local.disabled }),
    ...(local.invalid === undefined ? {} : { invalid: local.invalid }),
    ...(local.required === undefined ? {} : { required: local.required }),
    ...(local.readOnly === undefined ? {} : { readOnly: local.readOnly }),
    ...(local.onCheckedChange === undefined ? {} : { onCheckedChange: local.onCheckedChange }),
    ...(local.name === undefined ? {} : { name: local.name }),
    ...(local.form === undefined ? {} : { form: local.form }),
    ...(local.value === undefined ? {} : { value: local.value }),
    ...(local.dir === undefined ? {} : { dir: local.dir }),
  }))
  const api = machine.api
  const root = api().getRootProps()
  const rootRef = root.ref as ((element: HTMLLabelElement) => void) | undefined
  const ref = (element: HTMLLabelElement) => {
    rootRef?.(element)
    local.ref?.(element)
  }

  return (
    <label
      {...root}
      {...native}
      id={local.id}
      class={['benos-checkbox', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <input {...api().getHiddenInputProps()} />
      <span class="benos-checkbox__control" {...api().getControlProps()}>
        <span aria-hidden="true" {...api().getIndicatorProps()}>
          ✓
        </span>
      </span>
      <span class="benos-checkbox__label" {...api().getLabelProps()}>
        {local.children}
      </span>
    </label>
  )
}

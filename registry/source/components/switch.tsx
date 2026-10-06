import { createSwitch } from '@benosjs/primitives/switch'
import { mergeProps, splitProps } from '@benosjs/dom'
import type { SwitchOptions } from '@benosjs/primitives/switch'
import type { JSX } from '@benosjs/dom'

export type SwitchProps = Omit<JSX.IntrinsicElements['label'], 'class' | 'for' | 'ref'> &
  Pick<
    SwitchOptions,
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
    | 'label'
  > & {
    id?: string
    class?: string
    ref?: (element: HTMLLabelElement) => void
  }

export function Switch(props: SwitchProps): JSX.Element {
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
    'label',
  ] as const)
  const machine = createSwitch(() => ({
    ...(local.id === undefined ? {} : { id: local.id }),
    ...(local.label === undefined ? {} : { label: local.label }),
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
      class={['benos-switch', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <input {...api().getHiddenInputProps()} role="switch" />
      <span class="benos-switch__control" {...api().getControlProps()}>
        <span class="benos-switch__thumb" {...api().getThumbProps()} />
      </span>
      <span class="benos-switch__label" {...api().getLabelProps()}>
        {local.children}
      </span>
    </label>
  )
}

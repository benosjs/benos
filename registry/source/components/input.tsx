import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type InputSize = 'sm' | 'md' | 'lg'
export type InputType = 'email' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'url'

export type InputProps = Omit<JSX.IntrinsicElements['input'], 'class' | 'ref' | 'type'> & {
  id?: string
  class?: string
  size?: InputSize
  type?: InputType
  invalid?: boolean
  ref?: (element: HTMLInputElement) => void
}

export function Input(props: InputProps): JSX.Element {
  const merged = mergeProps({ type: 'text' as const, size: 'md' as const, invalid: false }, props)
  const [local, native] = splitProps(merged, [
    'size',
    'class',
    'invalid',
    'ref',
    'children',
    'aria-invalid',
  ] as const)
  const ariaInvalid =
    local.invalid || local['aria-invalid'] === true || local['aria-invalid'] === 'true'
      ? 'true'
      : (local['aria-invalid'] ?? 'false')
  const ref = (element: HTMLInputElement) => local.ref?.(element)

  return (
    <input
      {...native}
      class={['benos-input', 'benos-input--' + local.size, local.class].filter(Boolean).join(' ')}
      aria-invalid={ariaInvalid}
      data-invalid={ariaInvalid === 'true' ? 'true' : 'false'}
      ref={ref}
    />
  )
}

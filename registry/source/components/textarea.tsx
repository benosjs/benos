import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type TextareaSize = 'sm' | 'md' | 'lg'

export type TextareaProps = Omit<JSX.IntrinsicElements['textarea'], 'class' | 'ref'> & {
  id?: string
  class?: string
  size?: TextareaSize
  invalid?: boolean
  ref?: (element: HTMLTextAreaElement) => void
}

export function Textarea(props: TextareaProps): JSX.Element {
  const merged = mergeProps({ size: 'md' as const, invalid: false }, props)
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
  const ref = (element: HTMLTextAreaElement) => local.ref?.(element)

  return (
    <textarea
      {...native}
      class={['benos-textarea', 'benos-textarea--' + local.size, local.class]
        .filter(Boolean)
        .join(' ')}
      aria-invalid={ariaInvalid}
      data-invalid={ariaInvalid === 'true' ? 'true' : 'false'}
      ref={ref}
    >
      {local.children}
    </textarea>
  )
}

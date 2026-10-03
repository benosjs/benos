import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = Omit<JSX.IntrinsicElements['button'], 'class' | 'ref'> & {
  id?: string
  class?: string
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: (element: HTMLButtonElement) => void
}

export function Button(props: ButtonProps): JSX.Element {
  const merged = mergeProps(
    {
      type: 'button' as const,
      variant: 'primary' as const,
      size: 'md' as const,
    },
    props,
  )
  const [local, native] = splitProps(merged, [
    'variant',
    'size',
    'class',
    'ref',
    'children',
  ] as const)
  const ref = (element: HTMLButtonElement) => local.ref?.(element)

  return (
    <button
      {...native}
      class={[
        'benos-button',
        'benos-button--' + local.variant,
        'benos-button--' + local.size,
        local.class,
      ]
        .filter(Boolean)
        .join(' ')}
      ref={ref}
    >
      {local.children}
    </button>
  )
}

import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type CardVariant = 'default' | 'outlined' | 'raised'

export type CardProps = Omit<JSX.IntrinsicElements['div'], 'class' | 'ref'> & {
  id?: string
  class?: string
  variant?: CardVariant
  ref?: (element: HTMLDivElement) => void
}

export function Card(props: CardProps): JSX.Element {
  const merged = mergeProps({ variant: 'default' as const }, props)
  const [local, native] = splitProps(merged, ['variant', 'class', 'ref', 'children'] as const)
  const ref = (element: HTMLDivElement) => local.ref?.(element)

  return (
    <div
      {...native}
      class={['benos-card', 'benos-card--' + local.variant, local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      {local.children}
    </div>
  )
}

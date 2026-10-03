import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export type BadgeProps = Omit<JSX.IntrinsicElements['span'], 'class' | 'ref'> & {
  id?: string
  class?: string
  tone?: BadgeTone
  ref?: (element: HTMLSpanElement) => void
}

export function Badge(props: BadgeProps): JSX.Element {
  const merged = mergeProps({ tone: 'neutral' as const }, props)
  const [local, native] = splitProps(merged, ['tone', 'class', 'ref', 'children'] as const)
  const ref = (element: HTMLSpanElement) => local.ref?.(element)

  return (
    <span
      {...native}
      class={['benos-badge', 'benos-badge--' + local.tone, local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      {local.children}
    </span>
  )
}

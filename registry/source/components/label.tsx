import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type LabelProps = Omit<JSX.IntrinsicElements['label'], 'class' | 'ref' | 'for'> & {
  id?: string
  class?: string
  for?: string
  ref?: (element: HTMLLabelElement) => void
}

export function Label(props: LabelProps): JSX.Element {
  const merged = mergeProps({}, props)
  const [local, native] = splitProps(merged, ['for', 'class', 'ref', 'children'] as const)
  const ref = (element: HTMLLabelElement) => local.ref?.(element)

  return (
    <label
      {...native}
      for={local.for}
      class={['benos-label', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      {local.children}
    </label>
  )
}

import { mergeProps, splitProps } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'

export type SeparatorOrientation = 'horizontal' | 'vertical'

export type SeparatorProps = Omit<
  JSX.IntrinsicElements['div'],
  'class' | 'ref' | 'role' | 'aria-orientation' | 'aria-hidden'
> & {
  id?: string
  class?: string
  orientation?: SeparatorOrientation
  decorative?: boolean
  ref?: (element: HTMLDivElement) => void
}

export function Separator(props: SeparatorProps): JSX.Element {
  const merged = mergeProps({ orientation: 'horizontal' as const, decorative: false }, props)
  const [local, native] = splitProps(merged, [
    'orientation',
    'decorative',
    'class',
    'ref',
    'children',
  ] as const)
  const ref = (element: HTMLDivElement) => local.ref?.(element)

  return (
    <div
      {...native}
      role={local.decorative ? 'presentation' : 'separator'}
      aria-orientation={local.orientation}
      aria-hidden={local.decorative ? 'true' : 'false'}
      class={['benos-separator', 'benos-separator--' + local.orientation, local.class]
        .filter(Boolean)
        .join(' ')}
      ref={ref}
    />
  )
}

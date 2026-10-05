import { createTooltip } from '@benosjs/primitives/tooltip'
import { mergeProps, Portal, Show, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { TooltipOptions } from '@benosjs/primitives/tooltip'
import { createOverlayHost } from './overlay-host.js'

export type TooltipProps = Pick<
  TooltipOptions,
  | 'open'
  | 'defaultOpen'
  | 'disabled'
  | 'interactive'
  | 'positioning'
  | 'openDelay'
  | 'closeDelay'
  | 'dir'
  | 'onOpenChange'
> & {
  id?: string
  class?: string
  label: string
  trigger: Child
  children: Child
  ref?: (element: HTMLSpanElement) => void
}

/**
 * Tooltip content is supplemental. Keep essential instructions in visible
 * text so they are available on touch and when hover/focus is unavailable.
 */
export function Tooltip(props: TooltipProps): JSX.Element {
  const merged = mergeProps(
    {
      disabled: false,
      interactive: false,
      openDelay: 400,
      closeDelay: 150,
      positioning: {
        placement: 'top',
        strategy: 'fixed',
        flip: true,
        shift: 8,
        overflowPadding: 8,
        fitViewport: true,
      },
    },
    props,
  )
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'label',
    'trigger',
    'children',
    'open',
    'defaultOpen',
    'disabled',
    'interactive',
    'positioning',
    'openDelay',
    'closeDelay',
    'dir',
    'onOpenChange',
  ] as const)
  let rootElement: HTMLSpanElement | undefined
  const target = createOverlayHost(
    () => rootElement,
    () => local.dir,
  )
  const machine = createTooltip(
    () => ({
      ...(local.id === undefined ? {} : { id: local.id }),
      ...(local.open === undefined ? {} : { open: local.open }),
      ...(local.defaultOpen === undefined ? {} : { defaultOpen: local.defaultOpen }),
      disabled: local.disabled,
      interactive: local.interactive,
      openDelay: local.openDelay,
      closeDelay: local.closeDelay,
      positioning: { ...merged.positioning, ...local.positioning },
      ...(local.dir === undefined ? {} : { dir: local.dir }),
      ...(local.onOpenChange === undefined ? {} : { onOpenChange: local.onOpenChange }),
    }),
    () => rootElement,
  )
  const api = machine.api
  const rootRef = api().getTriggerProps().ref as ((element: HTMLButtonElement) => void) | undefined
  const ref = (element: HTMLSpanElement) => {
    rootElement = element
    local.ref?.(element)
  }

  return (
    <span
      {...native}
      id={local.id}
      class={['benos-tooltip', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <button
        class="benos-tooltip__trigger"
        type="button"
        tabIndex={0}
        {...api().getTriggerProps()}
        aria-label={local.label}
        ref={(element) => rootRef?.(element)}
      >
        {local.trigger}
      </button>
      <Show when={api().open}>
        <Portal mount={target()}>
          <div class="benos-tooltip__positioner" {...api().getPositionerProps()}>
            <div class="benos-tooltip__content" {...api().getContentProps()}>
              {local.children}
            </div>
          </div>
        </Portal>
      </Show>
    </span>
  )
}

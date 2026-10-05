import { createPopover } from '@benosjs/primitives/popover'
import { mergeProps, Portal, Show, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { PopoverOptions } from '@benosjs/primitives/popover'
import { createOverlayHost } from './overlay-host.js'

export type PopoverProps = Pick<
  PopoverOptions,
  | 'open'
  | 'defaultOpen'
  | 'modal'
  | 'autoFocus'
  | 'closeOnInteractOutside'
  | 'positioning'
  | 'dir'
  | 'onOpenChange'
> & {
  id?: string
  class?: string
  label: string
  trigger: Child
  children: Child
  closeLabel?: string
  ref?: (element: HTMLDivElement) => void
}

export function Popover(props: PopoverProps): JSX.Element {
  const merged = mergeProps(
    {
      modal: false,
      autoFocus: true,
      closeOnInteractOutside: true,
      closeLabel: 'Close',
      positioning: {
        placement: 'bottom-start',
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
    'closeLabel',
    'open',
    'defaultOpen',
    'modal',
    'autoFocus',
    'closeOnInteractOutside',
    'positioning',
    'dir',
    'onOpenChange',
  ] as const)
  let rootElement: HTMLDivElement | undefined
  const target = createOverlayHost(
    () => rootElement,
    () => local.dir,
  )
  const machine = createPopover(
    () => ({
      ...(local.id === undefined ? {} : { id: local.id }),
      ...(local.open === undefined ? {} : { open: local.open }),
      ...(local.defaultOpen === undefined ? {} : { defaultOpen: local.defaultOpen }),
      modal: local.modal,
      autoFocus: local.autoFocus,
      portalled: true,
      closeOnInteractOutside: local.closeOnInteractOutside,
      positioning: { ...merged.positioning, ...local.positioning },
      ...(local.dir === undefined ? {} : { dir: local.dir }),
      ...(local.onOpenChange === undefined ? {} : { onOpenChange: local.onOpenChange }),
    }),
    () => rootElement,
  )
  const api = machine.api
  const rootRef = api().getTriggerProps().ref as ((element: HTMLButtonElement) => void) | undefined
  const ref = (element: HTMLDivElement) => {
    rootElement = element
    local.ref?.(element)
  }

  return (
    <div
      {...native}
      id={local.id}
      class={['benos-popover', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <div {...api().getAnchorProps()}>
        <button type="button" {...api().getTriggerProps()} ref={(element) => rootRef?.(element)}>
          {local.trigger}
        </button>
      </div>
      <Show when={api().open}>
        <Portal mount={target()}>
          <div class="benos-popover__positioner" {...api().getPositionerProps()}>
            <section
              class="benos-popover__content"
              role="dialog"
              aria-label={local.label}
              {...api().getContentProps()}
            >
              <div class="benos-popover__body">{local.children}</div>
              <button class="benos-popover__close" type="button" {...api().getCloseTriggerProps()}>
                {local.closeLabel}
              </button>
            </section>
          </div>
        </Portal>
      </Show>
    </div>
  )
}

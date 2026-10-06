import { createPopover } from '@benosjs/primitives/popover'
import { mergeProps, Portal, Show, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { PopoverOptions } from '@benosjs/primitives/popover'
import { createOverlayHost } from './overlay-host.js'
import type { ButtonProps } from './button.js'

export type PopoverTriggerRenderProps = Omit<ButtonProps, 'children' | 'variant' | 'size'>
export type PopoverTrigger = Child | ((props: PopoverTriggerRenderProps) => JSX.Element)

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
  trigger: PopoverTrigger
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  triggerSize?: 'sm' | 'md' | 'lg'
  triggerClass?: string
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
      triggerVariant: 'secondary' as const,
      triggerSize: 'md' as const,
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
    'triggerVariant',
    'triggerSize',
    'triggerClass',
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
  const machineTriggerProps = api().getTriggerProps()
  const rootRef = machineTriggerProps.ref as ((element: HTMLButtonElement) => void) | undefined
  const triggerProps = {
    ...machineTriggerProps,
    type: 'button',
    dir: 'auto',
    ref: (element: HTMLButtonElement) => rootRef?.(element),
  } as PopoverTriggerRenderProps
  const trigger =
    typeof local.trigger === 'function' ? (
      local.trigger(triggerProps)
    ) : (
      <button
        {...triggerProps}
        class={[
          'benos-button',
          'benos-button--' + local.triggerVariant,
          'benos-button--' + local.triggerSize,
          local.triggerClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {local.trigger}
      </button>
    )
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
      <div {...api().getAnchorProps()}>{trigger}</div>
      <Show when={api().open}>
        <Portal mount={target()}>
          <div class="benos-popover__positioner" {...api().getPositionerProps()}>
            <section
              class="benos-popover__content"
              role="dialog"
              aria-label={local.label}
              {...api().getContentProps()}
            >
              <div class="benos-popover__body" dir="auto">
                {local.children}
              </div>
              <button
                class="benos-popover__close"
                type="button"
                {...api().getCloseTriggerProps()}
                dir="auto"
              >
                {local.closeLabel}
              </button>
            </section>
          </div>
        </Portal>
      </Show>
    </div>
  )
}

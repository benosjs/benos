import { createDialog } from '@benosjs/primitives/dialog'
import { mergeProps, Portal, Show, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { DialogOptions } from '@benosjs/primitives/dialog'
import { createOverlayHost } from './overlay-host.js'

export type DialogProps = Pick<
  DialogOptions,
  | 'open'
  | 'defaultOpen'
  | 'modal'
  | 'trapFocus'
  | 'preventScroll'
  | 'closeOnEscape'
  | 'closeOnInteractOutside'
  | 'restoreFocus'
  | 'role'
  | 'dir'
  | 'onOpenChange'
> & {
  id?: string
  class?: string
  title: Child
  description?: Child
  trigger: Child
  closeLabel?: string
  children: Child
  'aria-label'?: string
  ref?: (element: HTMLDivElement) => void
}

export function Dialog(props: DialogProps): JSX.Element {
  const merged = mergeProps(
    {
      modal: true,
      trapFocus: true,
      preventScroll: true,
      closeOnEscape: true,
      closeOnInteractOutside: true,
      restoreFocus: true,
      role: 'dialog' as const,
      closeLabel: 'Close dialog',
    },
    props,
  )
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'title',
    'description',
    'trigger',
    'children',
    'closeLabel',
    'open',
    'defaultOpen',
    'modal',
    'trapFocus',
    'preventScroll',
    'closeOnEscape',
    'closeOnInteractOutside',
    'restoreFocus',
    'role',
    'dir',
    'onOpenChange',
    'aria-label',
  ] as const)
  let rootElement: HTMLDivElement | undefined
  const target = createOverlayHost(
    () => rootElement,
    () => local.dir,
  )
  const machine = createDialog(
    () => ({
      ...(local.id === undefined ? {} : { id: local.id }),
      ...(local.open === undefined ? {} : { open: local.open }),
      ...(local.defaultOpen === undefined ? {} : { defaultOpen: local.defaultOpen }),
      modal: local.modal,
      trapFocus: local.trapFocus,
      preventScroll: local.preventScroll,
      closeOnEscape: local.closeOnEscape,
      closeOnInteractOutside: local.closeOnInteractOutside,
      restoreFocus: local.restoreFocus,
      role: local.role,
      ...(local.dir === undefined ? {} : { dir: local.dir }),
      ...(local.onOpenChange === undefined ? {} : { onOpenChange: local.onOpenChange }),
      ...(local['aria-label'] === undefined ? {} : { 'aria-label': local['aria-label'] }),
    }),
    () => rootElement,
  )
  const api = machine.api
  const triggerProps = api().getTriggerProps()
  const machineTriggerRef = triggerProps.ref as ((element: HTMLButtonElement) => void) | undefined
  const triggerRef = (element: HTMLButtonElement) => machineTriggerRef?.(element)
  const ref = (element: HTMLDivElement) => {
    rootElement = element
    local.ref?.(element)
  }

  return (
    <div
      {...native}
      id={local.id}
      class={['benos-dialog', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <button type="button" tabIndex={0} {...triggerProps} ref={triggerRef}>
        {local.trigger}
      </button>
      <Show when={api().open}>
        <Portal mount={target()}>
          <div class="benos-dialog__positioner" {...api().getPositionerProps()}>
            <div class="benos-dialog__backdrop" {...api().getBackdropProps()} />
            <section
              class="benos-dialog__content"
              {...api().getContentProps()}
              {...(local['aria-label'] === undefined ? {} : { 'aria-label': local['aria-label'] })}
            >
              <header class="benos-dialog__header">
                <h2 class="benos-dialog__title" {...api().getTitleProps()}>
                  {local.title}
                </h2>
                {local.description !== undefined && (
                  <p class="benos-dialog__description" {...api().getDescriptionProps()}>
                    {local.description}
                  </p>
                )}
              </header>
              <div class="benos-dialog__body">{local.children}</div>
              <button
                class="benos-dialog__close"
                type="button"
                tabIndex={0}
                {...api().getCloseTriggerProps()}
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

import { createUniqueId, onCleanup, onMount } from '@benosjs/core'
import { createToast } from '@benosjs/primitives/toast'
import { mergeProps, Portal, splitProps } from '@benosjs/dom'
import { createStore, group } from '@zag-js/toast'
import { VanillaMachine } from '@zag-js/vanilla'
import type { Child, JSX } from '@benosjs/dom'
import type { ToastOptions } from '@benosjs/primitives/toast'
import { createOverlayHost } from './overlay-host.js'

export type ToastProps = Omit<
  Pick<
    ToastOptions<Child>,
    | 'title'
    | 'description'
    | 'type'
    | 'duration'
    | 'removeDelay'
    | 'closable'
    | 'action'
    | 'dir'
    | 'onStatusChange'
  >,
  'type'
> & {
  type?: ToastOptions<Child>['type']
  id?: string
  class?: string
  closeLabel?: string
  ref?: (element: HTMLDivElement) => void
}

export function Toast(props: ToastProps): JSX.Element {
  const merged = mergeProps(
    {
      type: 'info',
      duration: 5000,
      removeDelay: 180,
      closable: true,
      closeLabel: 'Dismiss notification',
    },
    props,
  )
  const [local, native] = splitProps(merged, [
    'id',
    'class',
    'ref',
    'title',
    'description',
    'type',
    'duration',
    'removeDelay',
    'closable',
    'action',
    'dir',
    'onStatusChange',
    'closeLabel',
  ] as const)
  let rootElement: HTMLDivElement | undefined
  const target = createOverlayHost(
    () => rootElement,
    () => local.dir,
  )
  const store = createStore({
    placement: 'top-end',
    duration: local.duration,
    removeDelay: local.removeDelay,
    offsets: '1rem',
  })
  const groupId = local.id ? local.id + '-group' : createUniqueId()
  const toastGroup = new VanillaMachine(group.machine, () => ({
    id: groupId,
    store,
    ...(local.dir === undefined ? {} : { dir: local.dir }),
  }))
  onMount(() => toastGroup.start())
  onCleanup(() => toastGroup.stop())

  const toast = createToast<Child>(
    () => ({
      ...(local.id === undefined ? {} : { id: local.id }),
      parent: toastGroup.service,
      ...(local.title === undefined ? {} : { title: local.title }),
      ...(local.description === undefined ? {} : { description: local.description }),
      type: local.type,
      duration: local.duration,
      removeDelay: local.removeDelay,
      closable: local.closable,
      ...(local.action === undefined ? {} : { action: local.action }),
      ...(local.dir === undefined ? {} : { dir: local.dir }),
      ...(local.onStatusChange === undefined ? {} : { onStatusChange: local.onStatusChange }),
    }),
    () => rootElement,
  )
  const api = toast.api
  const ref = (element: HTMLDivElement) => {
    rootElement = element
    local.ref?.(element)
  }

  return (
    <div
      {...native}
      id={local.id}
      class={['benos-toast', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      <Portal mount={target()}>
        <div class="benos-toast__viewport">
          <div class="benos-toast__item" {...api().getRootProps()} aria-live="polite" tabIndex={-1}>
            <div class="benos-toast__copy">
              <strong class="benos-toast__title" {...api().getTitleProps()}>
                {local.title}
              </strong>
              {local.description !== undefined && (
                <p class="benos-toast__description" {...api().getDescriptionProps()}>
                  {local.description}
                </p>
              )}
            </div>
            {local.closable && (
              <button
                class="benos-toast__close"
                type="button"
                tabIndex={0}
                {...api().getCloseTriggerProps()}
              >
                {local.closeLabel}
              </button>
            )}
          </div>
        </div>
      </Portal>
    </div>
  )
}

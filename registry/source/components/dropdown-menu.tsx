import { createMenu } from '@benosjs/primitives/menu'
import { mergeProps, Portal, Show, splitProps } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import type { MenuOptions } from '@benosjs/primitives/menu'
import { createOverlayHost } from './overlay-host.js'
import type { ButtonProps } from './button.js'

export type DropdownMenuTriggerRenderProps = Omit<ButtonProps, 'children' | 'variant' | 'size'>
export type DropdownMenuTrigger = Child | ((props: DropdownMenuTriggerRenderProps) => JSX.Element)

export interface DropdownMenuItem {
  value: string
  label: string
  disabled?: boolean
}

export type DropdownMenuProps = Pick<
  MenuOptions,
  | 'open'
  | 'defaultOpen'
  | 'closeOnSelect'
  | 'loopFocus'
  | 'typeahead'
  | 'positioning'
  | 'dir'
  | 'onOpenChange'
  | 'onSelect'
> & {
  id?: string
  class?: string
  label: string
  trigger: DropdownMenuTrigger
  triggerVariant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  triggerSize?: 'sm' | 'md' | 'lg'
  triggerClass?: string
  items: readonly DropdownMenuItem[]
  ref?: (element: HTMLDivElement) => void
}

export function DropdownMenu(props: DropdownMenuProps): JSX.Element {
  const merged = mergeProps(
    {
      closeOnSelect: true,
      loopFocus: true,
      typeahead: true,
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
    'items',
    'open',
    'defaultOpen',
    'closeOnSelect',
    'loopFocus',
    'typeahead',
    'positioning',
    'dir',
    'onOpenChange',
    'onSelect',
  ] as const)
  let rootElement: HTMLDivElement | undefined
  const target = createOverlayHost(
    () => rootElement,
    () => local.dir,
  )
  const menu = createMenu(
    () => ({
      ...(local.id === undefined ? {} : { id: local.id }),
      'aria-label': local.label,
      ...(local.open === undefined ? {} : { open: local.open }),
      ...(local.defaultOpen === undefined ? {} : { defaultOpen: local.defaultOpen }),
      closeOnSelect: local.closeOnSelect,
      loopFocus: local.loopFocus,
      typeahead: local.typeahead,
      positioning: { ...merged.positioning, ...local.positioning },
      ...(local.dir === undefined ? {} : { dir: local.dir }),
      ...(local.onOpenChange === undefined ? {} : { onOpenChange: local.onOpenChange }),
      ...(local.onSelect === undefined ? {} : { onSelect: local.onSelect }),
    }),
    () => rootElement,
  )
  const api = menu.api
  const machineTriggerProps = api().getTriggerProps()
  const machineTriggerRef = machineTriggerProps.ref as
    ((element: HTMLButtonElement) => void) | undefined
  const triggerRef = (element: HTMLButtonElement) => machineTriggerRef?.(element)
  const triggerProps = {
    ...machineTriggerProps,
    type: 'button',
    dir: 'auto',
    ref: triggerRef,
  } as DropdownMenuTriggerRenderProps
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
      class={['benos-dropdown-menu', local.class].filter(Boolean).join(' ')}
      ref={ref}
    >
      {trigger}
      <Show when={api().open}>
        <Portal mount={target()}>
          <div class="benos-dropdown-menu__positioner" {...api().getPositionerProps()}>
            <div class="benos-dropdown-menu__content" {...api().getContentProps()}>
              {local.items.map((item) => (
                <button
                  class="benos-dropdown-menu__item"
                  type="button"
                  {...api().getItemProps({
                    value: item.value,
                    disabled: item.disabled,
                  })}
                  dir="auto"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  )
}

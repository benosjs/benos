// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsx, render } from '@benosjs/dom'
import { onCleanup, signal } from '@benosjs/core'
import { collection as createListCollection } from '@zag-js/select'
import { createStore, group as toastGroup } from '@zag-js/toast'
import { VanillaMachine } from '@zag-js/vanilla'
import { createAccordion } from '../src/accordion.js'
import { createCheckbox } from '../src/checkbox.js'
import { createDialog } from '../src/dialog.js'
import { createMenu } from '../src/menu.js'
import { createPopover } from '../src/popover.js'
import { createRadioGroup } from '../src/radio-group.js'
import { createSelect } from '../src/select.js'
import { createSwitch } from '../src/switch.js'
import { createTabs } from '../src/tabs.js'
import { createToast } from '../src/toast.js'
import { createTooltip } from '../src/tooltip.js'
import { normalizeProps } from '../src/normalize.js'

type Api = Record<string, unknown>
type Controller = {
  api: () => Api
  state: () => unknown
  send: (event: never) => void
  stop: () => void
}
type Props = Record<string, unknown>
type Descriptor = {
  name: string
  create: (getProps: () => Props) => Controller
  getState: (api: Api) => unknown
  defaultProps: Props
  controlledProps?: (
    value: () => unknown,
    changed: (value: unknown) => void,
  ) => Props
  change: (api: Api) => void
  changedValue: unknown
  initialValue: unknown
}

const collection = createListCollection({
  items: [
    { label: 'Alpha', value: 'alpha' },
    { label: 'Bravo', value: 'bravo' },
  ],
})

function apiMethod(api: Api, name: string, ...args: unknown[]): unknown {
  const method = api[name]
  if (typeof method !== 'function')
    throw new Error(`Primitive API is missing ${name}`)
  return (method as (...values: unknown[]) => unknown)(...args)
}

function rootId(api: Api): string | undefined {
  const method = api.getRootProps ?? api.getContentProps
  if (typeof method !== 'function')
    throw new Error('Primitive API has no root/content props method')
  const props = (method as () => unknown)()
  return (props as Record<string, unknown>).id as string | undefined
}

function createController<Options>(
  create: (getProps: () => Options) => {
    api: () => object
    state: () => unknown
    send: (event: never) => void
    stop: () => void
  },
): Descriptor['create'] {
  return (getProps) => {
    const controller = create(() => getProps() as Options)
    return {
      api: () => controller.api() as unknown as Api,
      state: controller.state,
      send: controller.send as (event: never) => void,
      stop: controller.stop,
    }
  }
}

const descriptors: Descriptor[] = [
  {
    name: 'checkbox',
    create: createController(createCheckbox),
    getState: (api) => api.checked,
    defaultProps: { defaultChecked: false },
    initialValue: false,
    controlledProps: (value, changed) => ({
      checked: value(),
      onCheckedChange: (details: { checked: boolean }) =>
        changed(details.checked),
    }),
    change: (api) => apiMethod(api, 'toggleChecked'),
    changedValue: true,
  },
  {
    name: 'switch',
    create: createController(createSwitch),
    getState: (api) => api.checked,
    defaultProps: { defaultChecked: false },
    initialValue: false,
    controlledProps: (value, changed) => ({
      checked: value(),
      onCheckedChange: (details: { checked: boolean }) =>
        changed(details.checked),
    }),
    change: (api) => apiMethod(api, 'toggleChecked'),
    changedValue: true,
  },
  {
    name: 'radio-group',
    create: createController(createRadioGroup),
    getState: (api) => api.value,
    defaultProps: { defaultValue: 'alpha' },
    initialValue: 'alpha',
    controlledProps: (value, changed) => ({
      value: value(),
      onValueChange: (details: { value: string }) => changed(details.value),
    }),
    change: (api) => apiMethod(api, 'setValue', 'bravo'),
    changedValue: 'bravo',
  },
  {
    name: 'select',
    create: createController(createSelect),
    getState: (api) => api.value,
    defaultProps: { collection, defaultValue: ['alpha'] },
    initialValue: ['alpha'],
    controlledProps: (value, changed) => ({
      collection,
      value: value(),
      onValueChange: (details: { value: string[] }) => changed(details.value),
    }),
    change: (api) => apiMethod(api, 'selectValue', 'bravo'),
    changedValue: ['bravo'],
  },
  {
    name: 'tabs',
    create: createController(createTabs),
    getState: (api) => api.value,
    defaultProps: { defaultValue: 'alpha' },
    initialValue: 'alpha',
    controlledProps: (value, changed) => ({
      value: value(),
      onValueChange: (details: { value: string }) => changed(details.value),
    }),
    change: (api) => apiMethod(api, 'setValue', 'bravo'),
    changedValue: 'bravo',
  },
  {
    name: 'accordion',
    create: createController(createAccordion),
    getState: (api) => api.value,
    defaultProps: { defaultValue: ['alpha'], multiple: true },
    initialValue: ['alpha'],
    controlledProps: (value, changed) => ({
      multiple: true,
      value: value(),
      onValueChange: (details: { value: string[] }) => changed(details.value),
    }),
    change: (api) => apiMethod(api, 'setValue', ['bravo']),
    changedValue: ['bravo'],
  },
  ...(['dialog', 'popover', 'tooltip', 'menu'] as const).map((name) => {
    const create = {
      dialog: createDialog,
      popover: createPopover,
      tooltip: createTooltip,
      menu: createMenu,
    }[name]
    return {
      name,
      create: createController(create),
      getState: (api: Api) => api.open,
      defaultProps: { defaultOpen: false },
      initialValue: false,
      controlledProps: (
        value: () => unknown,
        changed: (value: unknown) => void,
      ) => ({
        open: value(),
        onOpenChange: (details: { open: boolean }) => changed(details.open),
      }),
      change: (api: Api) => apiMethod(api, 'setOpen', true),
      changedValue: true,
    }
  }),
  {
    name: 'toast',
    create: createController(createToast),
    getState: (api) => api.visible,
    defaultProps: {},
    change: (api) => apiMethod(api, 'dismiss'),
    changedValue: false,
    initialValue: true,
  },
]

const rootDisposers: Array<() => void> = []

function mountPrimitive(
  descriptor: Descriptor,
  getProps: () => Props,
): { controller: Controller; dispose: () => void } {
  let controller: Controller | undefined
  const dispose = render(() => {
    controller = createInsideOwner(descriptor, getProps)
    return jsx('div', {})
  }, document.body)
  return {
    get controller() {
      if (!controller) throw new Error('Primitive controller was not created')
      return controller
    },
    dispose,
  }
}

let toastGroupId = 0

function createInsideOwner(
  descriptor: Descriptor,
  getProps: () => Props,
): Controller {
  let extra: Props = {}
  if (descriptor.name === 'toast') {
    const store = createStore()
    const group = new VanillaMachine(toastGroup.machine, () => ({
      id: `test-toast-group-${toastGroupId++}`,
      store,
    }))
    group.start()
    onCleanup(() => group.stop())
    extra = {
      parent: group.service,
      type: 'success',
      title: 'Saved',
      description: 'Your changes were saved',
      duration: Infinity,
      removeDelay: 0,
    }
  }
  return descriptor.create(() => ({ ...getProps(), ...extra }))
}

afterEach(() => {
  while (rootDisposers.length) rootDisposers.pop()?.()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('@benosjs/primitives', () => {
  for (const descriptor of descriptors) {
    it(`${descriptor.name}: supports uncontrolled state and controlled state where Zag exposes it`, async () => {
      const uncontrolled = mountPrimitive(descriptor, () => ({
        ...descriptor.defaultProps,
      }))
      const expectedInitial = descriptor.initialValue
      expect(descriptor.getState(uncontrolled.controller.api())).toEqual(
        expectedInitial,
      )
      descriptor.change(uncontrolled.controller.api())
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(descriptor.getState(uncontrolled.controller.api())).toEqual(
        descriptor.changedValue,
      )
      uncontrolled.dispose()

      if (descriptor.controlledProps) {
        const value = signal(expectedInitial)
        const onChange = vi.fn()
        const controlled = mountPrimitive(descriptor, () => ({
          ...descriptor.controlledProps?.(
            () => value(),
            (next) => onChange(next),
          ),
        }))
        expect(descriptor.getState(controlled.controller.api())).toEqual(
          expectedInitial,
        )
        descriptor.change(controlled.controller.api())
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        expect(onChange).toHaveBeenCalledWith(descriptor.changedValue)
        expect(descriptor.getState(controlled.controller.api())).toEqual(
          expectedInitial,
        )
        value.set(descriptor.changedValue)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        expect(descriptor.getState(controlled.controller.api())).toEqual(
          descriptor.changedValue,
        )
        controlled.dispose()
      }
    })

    it(`${descriptor.name}: honors id overrides and allocates distinct IDs in and across roots`, () => {
      const explicit = mountPrimitive(descriptor, () => ({ id: 'caller-id' }))
      expect(rootId(explicit.controller.api())).toContain('caller-id')
      explicit.dispose()

      const ids: string[] = []
      const firstRoot = render(() => {
        const first = createInsideOwner(descriptor, () => ({}))
        const second = createInsideOwner(descriptor, () => ({}))
        ids.push(rootId(first.api()) ?? '', rootId(second.api()) ?? '')
        return jsx('div', {})
      }, document.body)
      const secondRoot = render(() => {
        const third = createInsideOwner(descriptor, () => ({}))
        ids.push(rootId(third.api()) ?? '')
        return jsx('div', {})
      }, document.body)
      rootDisposers.push(firstRoot, secondRoot)
      expect(ids).toHaveLength(3)
      expect(ids.every(Boolean)).toBe(true)
      expect(new Set(ids).size).toBe(3)
    })

    it(`${descriptor.name}: stops its machine and releases its subscription on owner disposal`, () => {
      const machines: Array<{
        subscriptions: unknown[]
        cleanups: unknown[]
        status: string
      }> = []
      const originalStart = VanillaMachine.prototype.start
      const startSpy = vi
        .spyOn(VanillaMachine.prototype, 'start')
        .mockImplementation(function (...args) {
          machines.push(
            this as unknown as {
              subscriptions: unknown[]
              cleanups: unknown[]
              status: string
            },
          )
          return originalStart.apply(this, args)
        })
      const stopSpy = vi.spyOn(VanillaMachine.prototype, 'stop')
      const mounted = mountPrimitive(descriptor, () => ({
        ...descriptor.defaultProps,
      }))
      expect(startSpy).toHaveBeenCalled()
      mounted.dispose()
      expect(stopSpy).toHaveBeenCalled()
      for (const machine of machines) {
        expect(machine.status).toBe('Stopped')
        expect(machine.subscriptions).toHaveLength(0)
        expect(machine.cleanups).toHaveLength(0)
      }
      expect(() =>
        mounted.controller.send({ type: 'AFTER_DISPOSE' } as never),
      ).not.toThrow()
    })
  }

  it('normalizes Zag React-shaped props at the adapter boundary', () => {
    const onFocus = () => undefined
    const onBlur = () => undefined
    const onChange = () => undefined
    const onDoubleClick = () => undefined
    const onKeyDown = () => undefined
    const onPointerDown = () => undefined
    const style = { color: 'navy' }
    const normalized = normalizeProps.element({
      className: 'field',
      htmlFor: 'name',
      defaultChecked: true,
      defaultValue: 'Ada',
      onFocus,
      onBlur,
      onChange,
      onDoubleClick,
      onKeyDown,
      onPointerDown,
      style,
    })
    expect(normalized.class).toBe('field')
    expect(normalized.for).toBe('name')
    expect(normalized.checked).toBe(true)
    expect(normalized.value).toBe('Ada')
    expect(normalized.onFocusin).toBe(onFocus)
    expect(normalized.onFocusout).toBe(onBlur)
    expect(normalized.onInput).toBe(onChange)
    expect(normalized.onDblClick).toBe(onDoubleClick)
    expect(normalized.onKeydown).toBe(onKeyDown)
    expect(normalized.onPointerdown).toBe(onPointerDown)
    expect(normalized.style).toBe(style)
  })
})

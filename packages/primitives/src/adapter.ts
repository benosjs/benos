import {
  computed,
  createUniqueId,
  effect,
  onCleanup,
  onMount,
  signal,
  untrack,
} from '@benosjs/core'
import { VanillaMachine } from '@zag-js/vanilla'
import type { Machine, MachineSchema, Service } from '@zag-js/core'
import type { PrimitiveController } from './types.js'

type MachineProps<T extends MachineSchema> = {
  [Key in keyof NonNullable<T['props']>]?:
    NonNullable<T['props']>[Key] | undefined
} & { id: string }

export function createMachineController<
  T extends MachineSchema,
  Props extends { id?: string },
  Connected extends object,
>(
  definition: Machine<T>,
  getProps: () => Props,
  connect: (service: Service<T>) => Connected,
): PrimitiveController<
  NonNullable<T['state']>,
  Connected,
  NonNullable<T['event']>
> {
  const initialProps = untrack(getProps)
  const id = initialProps.id ?? createUniqueId()
  let latestProps = { ...initialProps, id } as MachineProps<T>
  const machine = new VanillaMachine<T>(definition, () => latestProps)
  const revision = signal(0)
  const readApi = (): Connected => connect(machine.service)
  const liveApi = new Proxy(Object.create(null) as Connected, {
    get(_target, key) {
      const current = readApi()
      const member = Reflect.get(current as object, key) as unknown
      if (typeof member !== 'function') {
        revision()
        return member
      }
      const methodName = typeof key === 'string' ? key : ''
      if (methodName.startsWith('get') && methodName.endsWith('Props')) {
        return (...args: unknown[]) => {
          const initialApi = readApi()
          const initialMethod = Reflect.get(initialApi as object, key) as
            ((...values: unknown[]) => unknown) | undefined
          if (typeof initialMethod !== 'function') return undefined
          const initialProps = Reflect.apply(initialMethod, initialApi, args)
          if (!initialProps || typeof initialProps !== 'object')
            return initialProps
          const keys = Reflect.ownKeys(initialProps)
          const readProp = (prop: PropertyKey): unknown => {
            revision()
            const latestApi = readApi()
            const latestMethod = Reflect.get(latestApi as object, key) as
              ((...values: unknown[]) => unknown) | undefined
            if (typeof latestMethod !== 'function') return undefined
            const latestProps = Reflect.apply(latestMethod, latestApi, args)
            return Reflect.get(latestProps as object, prop)
          }
          return new Proxy(Object.create(null) as object, {
            ownKeys: () => keys,
            get(_propsTarget, prop) {
              return keys.includes(prop) ? readProp(prop) : undefined
            },
            getOwnPropertyDescriptor(_propsTarget, prop) {
              if (!keys.includes(prop)) return undefined
              return {
                configurable: true,
                enumerable: true,
                get: () => readProp(prop),
              }
            },
          })
        }
      }
      return (...args: unknown[]) => {
        const latestApi = readApi()
        const latestMethod = Reflect.get(latestApi as object, key) as
          ((...values: unknown[]) => unknown) | undefined
        return typeof latestMethod === 'function'
          ? Reflect.apply(latestMethod, latestApi, args)
          : undefined
      }
    },
  })
  const state = computed(() => {
    revision()
    return machine.service.state.get() as NonNullable<T['state']>
  })
  const api = computed(() => liveApi)
  let started = false
  let stopped = false
  let unsubscribe: (() => void) | undefined
  let disposePropsEffect = (): void => undefined

  const stop = (): void => {
    if (stopped) return
    stopped = true
    disposePropsEffect()
    unsubscribe?.()
    unsubscribe = undefined
    if (started) machine.stop()
    started = false
  }

  disposePropsEffect = effect(() => {
    const next = getProps()
    latestProps = { ...next, id } as MachineProps<T>
    if (started && !stopped) machine.updateProps(() => latestProps)
  })

  onMount(() => {
    if (stopped) return
    try {
      unsubscribe = machine.subscribe(() =>
        revision.update((value) => value + 1),
      )
      started = true
      machine.start()
      revision.update((value) => value + 1)
    } catch (error) {
      stop()
      throw error
    }
  })
  onCleanup(stop)

  return {
    state,
    api,
    send(event) {
      if (!stopped) machine.send(event)
    },
    stop,
  }
}

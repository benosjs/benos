import { describe, expect, it, vi } from 'vitest'
import {
  computed,
  createContext,
  createRoot,
  effect,
  getContext,
  onCleanup,
  onMount,
  signal,
} from '../src/index.js'
import {
  createInternalOwner,
  disposeInternalOwner,
  notifyMount,
  runWithOwner,
} from '../src/runtime.js'

describe('ownership', () => {
  it('disposes children in reverse creation order and local cleanups in reverse registration order', () => {
    const order: string[] = []
    const dispose = createRoot((disposeRoot) => {
      onCleanup(() => order.push('root first'))
      onCleanup(() => order.push('root last'))
      const first = createInternalOwner('branch')
      runWithOwner(first, () => onCleanup(() => order.push('first child')))
      const second = createInternalOwner('branch')
      runWithOwner(second, () => onCleanup(() => order.push('second child')))
      return disposeRoot
    })
    dispose()
    dispose()
    expect(order).toEqual([
      'second child',
      'first child',
      'root last',
      'root first',
    ])
  })

  it('unlinks a middle child and does not dispose its siblings', () => {
    const order: number[] = []
    const dispose = createRoot((disposeRoot) => {
      const owners = Array.from({ length: 100 }, () =>
        createInternalOwner('branch'),
      )
      owners.forEach((owner, index) =>
        runWithOwner(owner, () =>
          onCleanup(() => {
            order.push(index)
          }),
        ),
      )
      const middle = owners[50]
      if (!middle) throw new Error('missing middle owner')
      disposeInternalOwner(middle)
      expect(order).toEqual([50])
      return disposeRoot
    })
    dispose()
    expect(order).toHaveLength(100)
    expect(order.at(1)).toBe(99)
  })

  it('replaces an effect run owner and its nested work', () => {
    const value = signal(0)
    const childRuns: number[] = []
    const cleanups: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        const version = value()
        onCleanup(() => cleanups.push(version))
        effect(() => {
          childRuns.push(value())
        })
      })
      return disposeRoot
    })
    value.set(1)
    expect(cleanups).toEqual([0])
    expect(childRuns).toEqual([0, 1])
    dispose()
    expect(cleanups).toEqual([0, 1])
  })

  it('throws for lifecycle registration without a suitable owner', () => {
    expect(() => onCleanup(() => {})).toThrow('active owner')
    expect(() => onMount(() => {})).toThrow('renderer-associated')
    const dispose = createRoot((disposeRoot) => {
      expect(() => onMount(() => {})).toThrow('renderer-associated')
      const nested = computed(() => onCleanup(() => {}))
      expect(() => nested()).toThrow('computed evaluation')
      return disposeRoot
    })
    dispose()
  })

  it('resolves context by logical owner, including explicit undefined and detached roots', () => {
    const context = createContext<number | undefined>(5)
    expect(() => getContext(context)).toThrow('active owner')
    const dispose = createRoot((disposeRoot) => {
      expect(getContext(context)).toBe(5)
      context.Provider({
        value: undefined,
        children: () => {
          expect(getContext(context)).toBeUndefined()
          const branch = createInternalOwner('branch')
          runWithOwner(branch, () =>
            expect(getContext(context)).toBeUndefined(),
          )
        },
      })
      createRoot((disposeInner) => {
        expect(getContext(context)).toBe(5)
        disposeInner()
      })
      return disposeRoot
    })
    dispose()
  })

  it('captures Provider value once and warns once when it changes', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = signal(1)
    const context = createContext(0)
    const values: number[] = []
    const props = {
      get value() {
        return source()
      },
      children: () => {
        effect(() => {
          values.push(getContext(context))
        })
      },
    }
    const dispose = createRoot((disposeRoot) => {
      context.Provider(props)
      return disposeRoot
    })
    source.set(2)
    source.set(3)
    expect(values).toEqual([1])
    expect(warning).toHaveBeenCalledTimes(1)
    warning.mockRestore()
    dispose()
  })

  it('runs mount after eligibility and registers its cleanup', () => {
    let connected = false
    let notifyFirst = () => {}
    const seen: string[] = []
    const dispose = createRoot((disposeRoot) => {
      const owner = createInternalOwner('component', () => connected)
      notifyFirst = () => notifyMount(owner)
      runWithOwner(owner, () =>
        onMount(() => {
          seen.push('mount')
          onCleanup(() => seen.push('mount cleanup'))
        }),
      )
      return disposeRoot
    })
    expect(seen).toEqual([])
    connected = true
    notifyFirst()
    expect(seen).toEqual(['mount'])
    const disposeSecond = createRoot((disposeRoot) => {
      const owner = createInternalOwner('component', () => connected)
      runWithOwner(owner, () => onMount(() => seen.push('second')))
      notifyMount(owner)
      return disposeRoot
    })
    expect(seen).toEqual(['mount', 'second'])
    disposeSecond()
    dispose()
    expect(seen).toEqual(['mount', 'second', 'mount cleanup'])
  })

  it('never mounts a component disposed before attachment', () => {
    let connected = false
    let notify = () => {}
    const mounted = vi.fn()
    const dispose = createRoot((disposeRoot) => {
      const owner = createInternalOwner('component', () => connected)
      notify = () => notifyMount(owner)
      runWithOwner(owner, () => onMount(mounted))
      return disposeRoot
    })
    dispose()
    connected = true
    notify()
    expect(mounted).not.toHaveBeenCalled()
  })

  it('tries all cleanups and throws aggregate errors for explicit disposal', () => {
    const seen: string[] = []
    const dispose = createRoot((disposeRoot) => {
      onCleanup(() => {
        seen.push('first')
        throw new Error('first')
      })
      onCleanup(() => {
        seen.push('second')
        throw new Error('second')
      })
      return disposeRoot
    })
    expect(() => dispose()).toThrow(AggregateError)
    expect(seen).toEqual(['second', 'first'])
    expect(() => dispose()).not.toThrow()
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  batch,
  computed,
  createContext,
  createRoot,
  effect,
  getContext,
  onCleanup,
  onMount,
  signal,
  untrack,
} from '../src/index.js'
import {
  createInternalOwner,
  createRenderEffect,
  disposeInternalOwner,
  inspectInternalQueues,
  inspectInternalSignal,
  notifyMount,
  runWithOwner,
  setInternalErrorHandler,
} from '../src/runtime.js'

describe('remaining Phase 3 contracts', () => {
  it('warns when a computed is created outside an owner', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = computed(() => 1)
    expect(value()).toBe(1)
    expect(warning).toHaveBeenCalledWith(
      'Ownerless computed has a detached lifetime; dispose ownerless effects explicitly.',
    )
    warning.mockRestore()
  })

  it('rejects getContext outside an owner in development', () => {
    const context = createContext('default')
    expect(() => getContext(context)).toThrow(
      'getContext requires an active owner',
    )
  })

  it('increments the state version immediately while a batch defers effects', () => {
    const source = signal(0)
    const values: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        values.push(source())
      })
      return disposeRoot
    })
    batch(() => {
      source.set(1)
      expect(inspectInternalSignal(source).version).toBe(1)
      expect(values).toEqual([0])
      source.set(1)
      expect(inspectInternalSignal(source).version).toBe(1)
    })
    expect(values).toEqual([0, 1])
    dispose()
  })

  it('runs an ownerless effect synchronously and warns about its lifetime', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = signal(0)
    const values: number[] = []
    const stop = effect(() => {
      values.push(source())
    })
    expect(values).toEqual([0])
    expect(warning).toHaveBeenCalledOnce()
    source.set(1)
    expect(values).toEqual([0, 1])
    stop()
    expect(inspectInternalSignal(source).subscribers).toBe(0)
    warning.mockRestore()
  })

  it('detaches an effect that reads no dependencies after its initial run', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let runs = 0
    const stop = effect(() => {
      runs++
    })
    expect(runs).toBe(1)
    expect(warning).toHaveBeenCalledOnce()
    stop()
    expect(runs).toBe(1)
    warning.mockRestore()
  })

  it('untrack excludes direct reads while preserving tracked reads', () => {
    const tracked = signal(1)
    const ignored = signal(10)
    const values: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        values.push(tracked() + untrack(() => ignored()))
      })
      return disposeRoot
    })
    ignored.set(20)
    expect(values).toEqual([11])
    tracked.set(2)
    expect(values).toEqual([11, 22])
    dispose()
  })

  it('rejects every stateful primitive and lifecycle registration within computed evaluation', () => {
    const source = signal(0)
    const dispose = createRoot((disposeRoot) => {
      const cases: Array<() => unknown> = [
        () => signal(1),
        () => computed(() => 1),
        () => effect(() => {}),
        () => createRoot(() => 1),
        () => onCleanup(() => {}),
        () => onMount(() => {}),
        () => source.set(1),
        () => source.update((value) => value + 1),
        () => untrack(() => signal(2)),
      ]
      for (const operation of cases)
        expect(() => computed(operation)()).toThrow('computed evaluation')
      expect(source()).toBe(0)
      return disposeRoot
    })
    dispose()
  })

  it('disposes a root whose setup throws and removes its initial effect from the queue', () => {
    const source = signal(0)
    const cleanup = vi.fn()
    const run = vi.fn(() => {
      source()
    })
    const failure = new Error('setup failed')
    expect(() =>
      createRoot(() => {
        onCleanup(cleanup)
        effect(run)
        throw failure
      }),
    ).toThrow(failure)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
    expect(inspectInternalQueues().user).toBe(0)
    expect(inspectInternalSignal(source).subscribers).toBe(0)
  })

  it('drains render work created during a render callback before user work', () => {
    const source = signal(0)
    const order: string[] = []
    const dispose = createRoot((disposeRoot) => {
      createRenderEffect(() => {
        order.push(`outer ${source()}`)
        createRenderEffect(() => {
          order.push(`inner ${source()}`)
        })
      })
      effect(() => {
        order.push(`user ${source()}`)
      })
      return disposeRoot
    })
    expect(order).toEqual(['outer 0', 'inner 0', 'user 0'])
    order.length = 0
    source.set(1)
    expect(order).toEqual(['outer 1', 'inner 1', 'user 1'])
    dispose()
  })

  it('runs a mount job once without tracking signal reads', () => {
    const source = signal(0)
    const mounted = vi.fn(() => source())
    const dispose = createRoot((disposeRoot) => {
      const owner = createInternalOwner('component', () => true)
      runWithOwner(owner, () => onMount(mounted))
      notifyMount(owner)
      return disposeRoot
    })
    expect(mounted).toHaveBeenCalledOnce()
    expect(inspectInternalSignal(source).subscribers).toBe(0)
    source.set(1)
    expect(mounted).toHaveBeenCalledOnce()
    dispose()
  })

  it('drains a user effect write through render before the next user effect', () => {
    const source = signal(0)
    const order: string[] = []
    const dispose = createRoot((disposeRoot) => {
      createRenderEffect(() => {
        order.push(`render ${source()}`)
      })
      effect(() => {
        const value = source()
        order.push(`first ${value}`)
        if (value === 1) source.set(2)
      })
      effect(() => {
        order.push(`second ${source()}`)
      })
      return disposeRoot
    })
    order.length = 0
    source.set(1)
    expect(order.indexOf('render 2')).toBeLessThan(order.indexOf('second 2'))
    expect(order).not.toContain('second 1')
    dispose()
  })

  it('keeps draining after cleanup failure and reports it after surviving jobs', () => {
    const source = signal(0)
    const order: string[] = []
    const report = vi.spyOn(console, 'error').mockImplementation(() => {
      order.push('reported')
    })
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        source()
        onCleanup(() => {
          throw new Error('cleanup failed')
        })
      })
      effect(() => {
        order.push(`survivor ${source()}`)
      })
      return disposeRoot
    })
    order.length = 0
    expect(() => source.set(1)).not.toThrow()
    expect(order).toEqual(['survivor 1', 'reported'])
    report.mockRestore()
    // The second run installed another failing cleanup; explicit disposal throws.
    expect(() => dispose()).toThrow('cleanup failed')
  })

  it('keeps a batch callback error separate from an effect failure in its flush', () => {
    const source = signal(0)
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        if (source() === 1) throw new Error('effect failure')
      })
      return disposeRoot
    })
    const callbackFailure = new Error('callback failure')
    expect(() =>
      batch(() => {
        source.set(1)
        throw callbackFailure
      }),
    ).toThrow(callbackFailure)
    expect(String(report.mock.calls[0]?.[0])).toContain('effect failure')
    report.mockRestore()
    dispose()
  })

  it('unlinks queued effects in the middle of a large FIFO burst', () => {
    const source = signal(0)
    const runs = new Array<number>(1_000).fill(0)
    const stops: Array<() => void> = []
    const dispose = createRoot((disposeRoot) => {
      for (let index = 0; index < runs.length; index++) {
        stops.push(
          effect(() => {
            source()
            runs[index] = (runs[index] ?? 0) + 1
          }),
        )
      }
      return disposeRoot
    })
    batch(() => {
      source.set(1)
      expect(inspectInternalQueues().user).toBe(1_000)
      for (let index = 0; index < stops.length; index += 2) stops[index]?.()
      expect(inspectInternalQueues().user).toBe(500)
    })
    expect(runs.filter((count) => count === 2)).toHaveLength(500)
    expect(runs.filter((count) => count === 1)).toHaveLength(500)
    expect(inspectInternalQueues().user).toBe(0)
    dispose()
  })

  it('updates a deep computed chain and ignores equal writes', () => {
    const source = signal(0)
    const evaluate = vi.fn((value: number) => value + 1)
    let last!: () => number
    const dispose = createRoot((disposeRoot) => {
      let previous: () => number = source
      for (let index = 0; index < 200; index++) {
        const input = previous
        previous = computed(() => evaluate(input()))
      }
      last = previous
      return disposeRoot
    })
    expect(last()).toBe(200)
    expect(evaluate).toHaveBeenCalledTimes(200)
    source.set(0)
    expect(last()).toBe(200)
    expect(evaluate).toHaveBeenCalledTimes(200)
    source.set(1)
    expect(last()).toBe(201)
    expect(evaluate).toHaveBeenCalledTimes(400)
    dispose()
  })

  it('shadows context in nested providers and keeps a stable signal value without warning', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const context = createContext(0)
    const stable = signal(1)
    const stableContext = createContext(stable)
    const values: number[] = []
    const dispose = createRoot((disposeRoot) => {
      context.Provider({
        value: 1,
        children: () => {
          values.push(getContext(context))
          context.Provider({
            value: 2,
            children: () => {
              values.push(getContext(context))
            },
          })
          values.push(getContext(context))
        },
      })
      stableContext.Provider({
        value: stable,
        children: () => {
          expect(getContext(stableContext)).toBe(stable)
        },
      })
      return disposeRoot
    })
    stable.set(2)
    expect(values).toEqual([1, 2, 1])
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
    dispose()
  })

  it('rejects cleanup registration during cleanup and on a disposed owner', () => {
    let child!: ReturnType<typeof createInternalOwner>
    const dispose = createRoot((disposeRoot) => {
      child = createInternalOwner('branch')
      runWithOwner(child, () =>
        onCleanup(() => {
          expect(() => onCleanup(() => {})).toThrow('active owner')
        }),
      )
      return disposeRoot
    })
    disposeInternalOwner(child)
    expect(() => runWithOwner(child, () => onCleanup(() => {}))).toThrow(
      'disposed',
    )
    dispose()
  })

  it('routes a computed read through the reader boundary and fallback failure outward', () => {
    const source = signal(0)
    const handled: string[] = []
    const dispose = createRoot((disposeRoot) => {
      const derived = computed(() => {
        if (source() === 1) throw new Error('computed failure')
        return source()
      })
      const outer = createInternalOwner('boundary')
      setInternalErrorHandler(outer, (error) =>
        handled.push((error as Error).message),
      )
      runWithOwner(outer, () => {
        const inner = createInternalOwner('boundary')
        setInternalErrorHandler(inner, () => {
          throw new Error('fallback failure')
        })
        runWithOwner(inner, () =>
          effect(() => {
            derived()
          }),
        )
      })
      return disposeRoot
    })
    expect(() => source.set(1)).not.toThrow()
    expect(handled).toEqual(['fallback failure'])
    dispose()
  })

  it('runs all child cleanups before routing their errors to an active boundary', () => {
    const events: string[] = []
    let disposeChild!: () => void
    const dispose = createRoot((disposeRoot) => {
      const boundary = createInternalOwner('boundary')
      setInternalErrorHandler(boundary, (error) => {
        events.push(`handled ${(error as Error).message}`)
      })
      runWithOwner(boundary, () => {
        const child = createInternalOwner('branch')
        runWithOwner(child, () => {
          onCleanup(() => {
            events.push('first cleanup')
            throw new Error('first')
          })
          onCleanup(() => {
            events.push('second cleanup')
            throw new Error('second')
          })
        })
        disposeChild = () => disposeInternalOwner(child)
      })
      return disposeRoot
    })
    expect(() => disposeChild()).not.toThrow()
    expect(events).toEqual([
      'second cleanup',
      'first cleanup',
      'handled second',
      'handled first',
    ])
    dispose()
  })
})

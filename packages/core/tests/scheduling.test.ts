import { describe, expect, it, vi } from 'vitest'
import {
  batch,
  createRoot,
  effect,
  onCleanup,
  onMount,
  signal,
} from '../src/index.js'
import {
  createInternalOwner,
  createRenderEffect,
  runWithOwner,
  setInternalErrorHandler,
} from '../src/runtime.js'

describe('scheduler', () => {
  it('flushes synchronously and orders render before user jobs', () => {
    const value = signal(0)
    const order: string[] = []
    const dispose = createRoot((disposeRoot) => {
      createRenderEffect(() => {
        order.push(`render ${value()}`)
      })
      effect(() => {
        order.push(`user ${value()}`)
      })
      return disposeRoot
    })
    expect(order).toEqual(['render 0', 'user 0'])
    value.set(1)
    expect(order).toEqual(['render 0', 'user 0', 'render 1', 'user 1'])
    dispose()
  })

  it('defers initial effects during setup and nested batches', () => {
    const value = signal(0)
    const seen: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        seen.push(value())
      })
      value.set(1)
      expect(seen).toEqual([])
      return disposeRoot
    })
    expect(seen).toEqual([1])
    batch(() => {
      value.set(2)
      batch(() => value.set(3))
      expect(seen).toEqual([1])
    })
    expect(seen).toEqual([1, 3])
    dispose()
  })

  it('flushes a throwing batch then rethrows its callback error', () => {
    const value = signal(0)
    const seen: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        seen.push(value())
      })
      return disposeRoot
    })
    const failure = new Error('batch callback')
    expect(() =>
      batch(() => {
        value.set(1)
        throw failure
      }),
    ).toThrow(failure)
    expect(seen).toEqual([0, 1])
    dispose()
  })

  it('reports unhandled effect errors without throwing to the writer and keeps draining', () => {
    const value = signal(0)
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        if (value() === 1) throw new Error('effect failure')
      })
      effect(() => {
        seen.push(value())
      })
      return disposeRoot
    })
    expect(() => value.set(1)).not.toThrow()
    expect(seen).toEqual([0, 1])
    expect(report).toHaveBeenCalledTimes(1)
    report.mockRestore()
    dispose()
  })

  it('shields a throwing host error reporter', () => {
    const value = signal(0)
    const host = vi.fn(() => {
      throw new Error('reporter failed')
    })
    vi.stubGlobal('reportError', host)
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        if (value() === 1) throw new Error('effect failed')
      })
      return disposeRoot
    })
    expect(() => value.set(1)).not.toThrow()
    expect(host).toHaveBeenCalledTimes(1)
    dispose()
    vi.unstubAllGlobals()
  })

  it('reports mount errors and continues later jobs', () => {
    const reporter = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: string[] = []
    const dispose = createRoot((disposeRoot) => {
      const owner = createInternalOwner('component', () => true)
      runWithOwner(owner, () => {
        onMount(() => {
          throw new Error('mount failure')
        })
        onMount(() => seen.push('later mount'))
      })
      return disposeRoot
    })
    expect(seen).toEqual(['later mount'])
    expect(reporter).toHaveBeenCalledTimes(1)
    reporter.mockRestore()
    dispose()
  })

  it('routes effect errors to the nearest owner boundary', () => {
    const value = signal(0)
    const handled: unknown[] = []
    const dispose = createRoot((disposeRoot) => {
      const boundary = createInternalOwner('boundary')
      setInternalErrorHandler(boundary, (error) => handled.push(error))
      runWithOwner(boundary, () => {
        effect(() => {
          if (value() === 1) throw new Error('handled')
        })
      })
      return disposeRoot
    })
    value.set(1)
    expect(handled).toHaveLength(1)
    expect((handled[0] as Error).message).toBe('handled')
    dispose()
  })

  it('skips disposed queued effects', () => {
    const value = signal(0)
    const seen: number[] = []
    const disposeRoot = createRoot((disposeRoot) => {
      const disposeEffect = effect(() => {
        seen.push(value())
      })
      batch(() => {
        value.set(1)
        disposeEffect()
      })
      return disposeRoot
    })
    expect(seen).toEqual([])
    disposeRoot()
  })

  it('cleans up only before a genuine rerun', () => {
    const input = signal(0)
    const seen: string[] = []
    const dispose = createRoot((disposeRoot) => {
      const parity = () => input() % 2
      effect(() => {
        seen.push(`run ${parity()}`)
        onCleanup(() => seen.push('cleanup'))
      })
      return disposeRoot
    })
    input.set(2)
    expect(seen).toEqual(['run 0', 'cleanup', 'run 0'])
    dispose()
    expect(seen.at(-1)).toBe('cleanup')
  })

  it('stops a self-writing cycle and reports it', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const value = signal(0, { name: 'cycle-value' })
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        value.set(value() + 1)
      })
      return disposeRoot
    })
    expect(value()).toBe(100)
    expect(report).toHaveBeenCalled()
    expect(String(report.mock.calls[0]?.[0])).toContain('cycle-value')
    report.mockRestore()
    dispose()
  })

  it('keeps the production cycle report short', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const production = await import('../src/runtime.js')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const value = production.signal(0, { name: 'internal-name' })
    const dispose = production.createRoot((disposeRoot) => {
      production.effect(() => value.set(value() + 1))
      return disposeRoot
    })
    expect(String(report.mock.calls[0]?.[0])).toBe(
      'Error: Effect cycle exceeded 100 runs in one flush',
    )
    dispose()
    report.mockRestore()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('does not retain provisional subscriptions after self-disposal', () => {
    const value = signal(0)
    const seen: number[] = []
    const disposeRoot = createRoot((disposeRoot) => {
      let stop = () => {}
      stop = effect(() => {
        seen.push(value())
        if (value() === 1) {
          stop()
          value()
        }
      })
      return disposeRoot
    })
    value.set(1)
    value.set(2)
    expect(seen).toEqual([0, 1])
    disposeRoot()
  })
})

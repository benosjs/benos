import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRoot,
  createUniqueId,
  effect,
  onCleanup,
  signal,
} from '../src/index.js'
import {
  claimInternalOrdinal,
  createInternalOwner,
  createRenderEffect,
  disposeInternalOwner,
  internalRequest,
  runWithOwner,
  type InternalRequest,
} from '../src/runtime.js'

function request(id: string): InternalRequest {
  return { id, mode: 'server', resources: new Map(), queries: new Map() }
}

/** Runs `fn` inside a request root and returns its result and the disposer. */
function withRequest<T>(
  id: string,
  fn: () => T,
): { result: T; dispose: () => void } {
  let dispose!: () => void
  const result = createRoot((done) => {
    dispose = done
    internalRequest(request(id))
    return fn()
  })
  return { result, dispose }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('request records', () => {
  it('is reachable from nested owners and absent outside a request', () => {
    expect(createRoot(() => internalRequest())).toBeUndefined()
    const { result, dispose } = withRequest('r1', () => {
      const component = createInternalOwner('component', () => false)
      return runWithOwner(component, () => {
        const branch = createInternalOwner('branch')
        return runWithOwner(branch, () => internalRequest()?.id)
      })
    })
    expect(result).toBe('r1')
    dispose()
  })
})

describe('createUniqueId under a request', () => {
  function app(): string[] {
    const ids: string[] = []
    const component = createInternalOwner('component', () => false)
    runWithOwner(component, () => {
      ids.push(createUniqueId(), createUniqueId())
      const child = createInternalOwner('component', () => false)
      runWithOwner(child, () => ids.push(createUniqueId()))
    })
    return ids
  }

  it('derives the same ids for the same structure in two requests', () => {
    const first = withRequest('0', app)
    const second = withRequest('0', app)
    expect(first.result).toEqual(second.result)
    expect(first.result).toEqual(['b0-0-0', 'b0-0-1', 'b0-0-2-0'])
    first.dispose()
    second.dispose()
  })

  it('namespaces ids by root id', () => {
    const a = withRequest('a', app)
    const b = withRequest('b', app)
    expect(a.result[0]).toBe('ba-0-0')
    expect(b.result[0]).toBe('bb-0-0')
    a.dispose()
    b.dispose()
  })

  it('keeps the global counter outside a request', () => {
    const outside = createRoot(() => createUniqueId())
    expect(outside).toMatch(/^b\d+$/)
  })

  it('uses an owner key instead of its ordinal when one is set', () => {
    const { result, dispose } = withRequest('0', () => {
      const list = createInternalOwner('component', () => false)
      return runWithOwner(list, () => {
        const item = createInternalOwner('branch', undefined, 'k7')
        return runWithOwner(item, () => createUniqueId())
      })
    })
    expect(result).toBe('b0-0-k7-0')
    dispose()
  })

  it('gives a re-created slot branch the same id as a first render', () => {
    // A slot claims one ordinal when it is created; every branch it mounts
    // reuses that ordinal, so a branch created after a signal settles matches
    // a client that rendered the settled value first.
    function render(initial: boolean): { ids: string[]; flip: () => void } {
      const ids: string[] = []
      const value = signal(initial)
      const component = createInternalOwner('component', () => false)
      let flip = (): void => undefined
      let branch: ReturnType<typeof createInternalOwner> | null = null
      runWithOwner(component, () => {
        createInternalOwner('component', () => false) // an earlier sibling
        const slotOrdinal = claimInternalOrdinal()
        createRenderEffect(() => {
          const ready = value()
          if (branch) disposeInternalOwner(branch)
          runWithOwner(component, () => {
            branch = createInternalOwner(
              'branch',
              undefined,
              undefined,
              slotOrdinal,
            )
            runWithOwner(branch, () => {
              if (ready) ids.push(createUniqueId())
            })
          })
        })
        createInternalOwner('component', () => false) // a later sibling
        flip = () => value.set(true)
      })
      return { ids, flip }
    }
    const server = withRequest('0', () => render(false))
    server.result.flip()
    const client = withRequest('0', () => render(true))
    expect(server.result.ids).toEqual(client.result.ids)
    expect(client.result.ids).toEqual(['b0-0-1-0'])
    server.dispose()
    client.dispose()
  })

  it('gives an effect run owner its effect ordinal, not a fresh one', () => {
    const { result, dispose } = withRequest('0', () => {
      const ids: string[] = []
      const component = createInternalOwner('component', () => false)
      runWithOwner(component, () => {
        createInternalOwner('component', () => false) // ordinal 0
        effect(() => {
          onCleanup(() => undefined) // materializes the run owner
          ids.push(createUniqueId())
        })
        createInternalOwner('component', () => false) // ordinal 2
      })
      return ids
    })
    expect(result).toEqual(['b0-0-1-0'])
    dispose()
  })
})

describe('development warnings during a request', () => {
  it('warns once when a signal created outside the request is written', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const outside = signal(0)
    const { dispose } = withRequest('0', () => {
      const inside = signal(0)
      inside.set(1)
      outside.set(1)
      outside.set(2)
    })
    dispose()
    const messages = warn.mock.calls.map((call) => String(call[0]))
    expect(
      messages.filter((m) => m.includes('outside the request')),
    ).toHaveLength(1)
    outside.set(3)
    expect(warn.mock.calls).toHaveLength(1)
  })

  it('lets a root created inside a request share the request', () => {
    const { result, dispose } = withRequest('0', () =>
      createRoot(() => internalRequest()?.id),
    )
    expect(result).toBe('0')
    dispose()
  })
})

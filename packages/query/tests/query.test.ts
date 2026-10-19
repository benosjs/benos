import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, signal } from '@benosjs/core'
import {
  createQueryCache,
  isTransientError,
  query,
  QueryCacheProvider,
  queryCache,
} from '../src/index.js'
import type { QueryCache, QueryObserver } from '../src/index.js'

interface Call<T> {
  args: unknown
  signal: AbortSignal
  attempt: number
  resolve(value: T): void
  reject(error: unknown): void
}

function controlled<T>() {
  const calls: Call<T>[] = []
  const fetch = (
    args: unknown,
    context: { signal: AbortSignal; attempt: number },
  ) =>
    new Promise<T>((resolve, reject) => {
      calls.push({ args, ...context, resolve, reject })
    })
  const last = (): Call<T> => {
    const call = calls[calls.length - 1]
    if (!call) throw new Error('No fetch call')
    return call
  }
  return { calls, fetch, last }
}

type Fetch = (id: string) => Promise<string>

function httpError(status: number, extra: object = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status }, extra)
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

let cache: QueryCache
const roots: Array<() => void> = []
function mount<T>(create: () => T): { value: T; dispose: () => void } {
  return createRoot((dispose) => {
    roots.push(dispose)
    return { value: create(), dispose }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  cache = createQueryCache()
})
afterEach(() => {
  while (roots.length) roots.pop()?.()
  cache.dispose()
  vi.useRealTimers()
})

describe('keys and identity', () => {
  it('canonicalizes object order, omits undefined fields, and interns keys', () => {
    const q = query({
      fetch: (filter: { owner?: string; archived: boolean }) => filter,
    })
    const a = q.key({ owner: 'ada', archived: false })
    const b = q.key({ archived: false, owner: 'ada' })
    expect(a).toBe(b)
    expect(q.key({ archived: false, owner: undefined })).toBe(
      q.key({ archived: false }),
    )
    expect(q.key({ archived: true })).not.toBe(a)
  })

  it('keeps definitions separate even when arguments match', async () => {
    const users = query({ fetch: (id: string) => `user ${id}` })
    const teams = query({ fetch: (id: string) => `team ${id}` })
    users.prefetch('1', cache)
    teams.prefetch('1', cache)
    await flush()
    expect(users.peek('1', cache)).toBe('user 1')
    expect(teams.peek('1', cache)).toBe('team 1')
    expect(users.key('1')).not.toBe(teams.key('1'))
  })

  it('rejects keys that cannot be canonicalized in development', () => {
    const q = query({
      key: (value: unknown) => value as string,
      fetch: () => 1,
    })
    expect(() => q.key(Number.NaN)).toThrow(/NaN/)
    expect(() => q.key(-0)).toThrow(/0/)
    expect(() => q.key(Infinity)).toThrow(/Infinity/)
    expect(() => q.key(new Date())).toThrow(/non-plain/)
    // eslint-disable-next-line no-sparse-arrays
    expect(() => q.key([1, , 2])).toThrow(/sparse/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => q.key(cyclic)).toThrow(/cyclic/)
    expect(() => q.key(() => 1)).toThrow(/function/)
  })

  it('uses a key function to choose identity', async () => {
    const fetch = vi.fn((input: { id: string; trace: number }) => input.id)
    const q = query({ key: (input) => input.id, fetch })
    q.prefetch({ id: 'a', trace: 1 }, cache)
    await flush()
    expect(q.peek({ id: 'a', trace: 2 }, cache)).toBe('a')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('observers', () => {
  it('moves from pending to ready and exposes fetching', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    expect(o.state()).toEqual({ status: 'pending' })
    expect(o.fetching()).toBe(true)
    expect(o.value()).toBeUndefined()
    io.last().resolve('Alpha')
    await flush()
    expect(o.state()).toEqual({ status: 'ready' })
    expect(o.value()).toBe('Alpha')
    expect(o.read()).toBe('Alpha')
    expect(o.fetching()).toBe(false)
  })

  it('deduplicates one entry across observers and keeps it alive on partial release', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const first = mount(() => withCache(() => q(() => 'a')))
    const second = mount(() => withCache(() => q(() => 'a')))
    expect(io.calls).toHaveLength(1)
    first.dispose()
    expect(io.last().signal.aborted).toBe(false)
    io.last().resolve('Alpha')
    await flush()
    expect(second.value.value()).toBe('Alpha')
  })

  it('aborts the request when its last joiner leaves', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const first = mount(() => withCache(() => q(() => 'a')))
    const second = mount(() => withCache(() => q(() => 'a')))
    first.dispose()
    second.dispose()
    expect(io.last().signal.aborted).toBe(false)
    await flush()
    expect(io.last().signal.aborted).toBe(true)
  })

  it('never shows another argument value across A → B → A', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const id = signal('A')
    const { value: o } = mount(() => withCache(() => q(id)))
    io.calls[0]?.resolve('Alpha')
    await flush()
    expect(o.value()).toBe('Alpha')
    id.set('B')
    expect(o.value()).toBeUndefined()
    expect(o.state()).toEqual({ status: 'pending' })
    const b = io.last()
    id.set('A')
    expect(o.value()).toBe('Alpha')
    expect(o.state()).toEqual({ status: 'ready' })
    await flush()
    expect(b.signal.aborted).toBe(true)
    b.resolve('Beta')
    await flush()
    expect(o.value()).toBe('Alpha')
    expect(q.peek('B', cache)).toBeUndefined()
    expect(io.calls).toHaveLength(2)
  })

  it('lets an owner recreated in the same task rejoin before aborting', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const first = mount(() => withCache(() => q(() => 'a')))
    first.dispose()
    const second = mount(() => withCache(() => q(() => 'a')))
    await flush()
    expect(io.calls).toHaveLength(1)
    expect(io.last().signal.aborted).toBe(false)
    io.last().resolve('Alpha')
    await flush()
    expect(second.value.value()).toBe('Alpha')
  })

  it('drops a late result from a fetch that ignores AbortSignal', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const id = signal('A')
    const { value: o } = mount(() => withCache(() => q(id)))
    const a = io.last()
    id.set('B')
    await flush()
    expect(a.signal.aborted).toBe(true)
    a.resolve('late Alpha')
    io.last().resolve('Beta')
    await flush()
    expect(o.value()).toBe('Beta')
    expect(q.peek('A', cache)).toBeUndefined()
  })

  it('resolves a synchronous fetch with one ready transition', async () => {
    const q = query({ fetch: (id: string) => id.toUpperCase() })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    await flush()
    expect(o.value()).toBe('A')
    expect(o.state()).toEqual({ status: 'ready' })
  })

  it('reports failure only without data and recovers through refresh', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    const error = httpError(404)
    io.last().reject(error)
    await flush()
    expect(o.state()).toEqual({ status: 'failed', error })
    expect(o.error()).toBe(error)
    expect(() => o.read()).toThrow(error)
    const refreshed = o.refresh()
    expect(o.state()).toEqual({ status: 'pending' })
    io.last().resolve('Alpha')
    await expect(refreshed).resolves.toBe('Alpha')
    expect(o.state()).toEqual({ status: 'ready' })
    expect(o.error()).toBeUndefined()
  })

  it('keeps ready state when a background refetch fails', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    io.last().resolve('Alpha')
    await flush()
    const refreshed = o.refresh()
    expect(o.fetching()).toBe(true)
    const error = httpError(400)
    io.last().reject(error)
    await expect(refreshed).resolves.toBeUndefined()
    expect(o.state()).toEqual({ status: 'ready' })
    expect(o.value()).toBe('Alpha')
    expect(o.read()).toBe('Alpha')
    expect(o.error()).toBe(error)
  })

  it('disables on a falsy source and on cancel until refresh', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const id = signal<string | null>(null)
    const { value: o } = mount(() => withCache(() => q(id)))
    expect(o.state()).toEqual({ status: 'disabled' })
    expect(io.calls).toHaveLength(0)
    id.set('a')
    expect(io.calls).toHaveLength(1)
    o.cancel()
    await flush()
    expect(io.last().signal.aborted).toBe(true)
    expect(o.state()).toEqual({ status: 'disabled' })
    const refreshed = o.refresh()
    expect(io.calls).toHaveLength(2)
    io.last().resolve('Alpha')
    await expect(refreshed).resolves.toBe('Alpha')
    expect(o.state()).toEqual({ status: 'ready' })
  })

  it('supports argument-free queries with an enable flag', async () => {
    const q = query({ fetch: () => 'me' })
    const enabled = signal(false)
    const { value: o } = mount(() => withCache(() => q(enabled)))
    expect(o.state()).toEqual({ status: 'disabled' })
    enabled.set(true)
    await flush()
    expect(o.value()).toBe('me')
    expect(q.peek(cache)).toBe('me')
    const { value: always } = mount(() => withCache(() => q()))
    expect(always.value()).toBe('me')
  })
})

describe('staleness, garbage collection, and invalidation', () => {
  it('reuses fresh data and revalidates stale data on attach', async () => {
    const fetch = vi.fn((id: string) => `${id}:${fetch.mock.calls.length}`)
    const q = query({ fetch })
    const first = mount(() => withCache(() => q(() => 'a')))
    await flush()
    expect(first.value.value()).toBe('a:1')
    mount(() => withCache(() => q(() => 'a')))
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_000)
    const late = mount(() => withCache(() => q(() => 'a')))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(late.value.value()).toBe('a:1')
    expect(late.value.fetching()).toBe(true)
    expect(late.value.state()).toEqual({ status: 'ready' })
    await flush()
    expect(late.value.value()).toBe('a:2')
    expect(first.value.value()).toBe('a:2')
  })

  it('collects an unretained entry after gcTime and cancels collection on reuse', async () => {
    const fetch = vi.fn((id: string) => id)
    const q = query({ fetch, gcTime: 1_000, staleTime: Infinity })
    const first = mount(() => withCache(() => q(() => 'a')))
    await flush()
    first.dispose()
    vi.advanceTimersByTime(900)
    const reused = mount(() => withCache(() => q(() => 'a')))
    expect(reused.value.value()).toBe('a')
    reused.dispose()
    vi.advanceTimersByTime(1_000)
    expect(q.peek('a', cache)).toBeUndefined()
    const fresh = mount(() => withCache(() => q(() => 'a')))
    expect(fresh.value.state()).toEqual({ status: 'pending' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refetches retained entries at once and only flags unretained ones', async () => {
    const fetch = vi.fn((id: string) => `${id}:${fetch.mock.calls.length}`)
    const q = query({ fetch, staleTime: Infinity })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    q.prefetch('b', cache)
    await flush()
    expect(fetch).toHaveBeenCalledTimes(2)
    const done = cache.invalidate(q)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(o.value()).toBe('a:1')
    await done
    expect(o.value()).toBe('a:3')
    const b = mount(() => withCache(() => q(() => 'b')))
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(b.value.value()).toBe('b:2')
  })

  it('targets single keys and argument predicates', async () => {
    const fetch = vi.fn((id: string) => `${id}:${fetch.mock.calls.length}`)
    const q = query({ fetch, staleTime: Infinity })
    const a = mount(() => withCache(() => q(() => 'a'))).value
    const b = mount(() => withCache(() => q(() => 'b'))).value
    await flush()
    await cache.invalidate(q.key('a'))
    expect([a.value(), b.value()]).toEqual(['a:3', 'b:2'])
    await cache.invalidate(q.where((id) => id === 'b'))
    expect([a.value(), b.value()]).toEqual(['a:3', 'b:4'])
  })

  it('drops a request that started before invalidation and moves joiners', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    const before = io.last()
    const done = cache.invalidate(q)
    expect(before.signal.aborted).toBe(true)
    before.resolve('before')
    io.last().resolve('after')
    await done
    await flush()
    expect(o.value()).toBe('after')
    expect(o.state()).toEqual({ status: 'ready' })
  })

  it('aborts in-flight work and rejects later use after dispose', () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const local = createQueryCache()
    q.prefetch('a', local)
    local.dispose()
    expect(io.last().signal.aborted).toBe(true)
    expect(() => q.prefetch('a', local)).toThrow(/disposed/)
  })

  it('freezes cached plain data in development', async () => {
    const q = query({ fetch: () => ({ items: [{ id: 1 }] }) })
    q.prefetch(cache)
    await flush()
    const data = q.peek(cache)
    expect(Object.isFrozen(data)).toBe(true)
    expect(Object.isFrozen(data?.items[0])).toBe(true)
  })

  it('resolves the default cache outside a provider', async () => {
    const q = query({ fetch: (id: string) => id })
    q.prefetch('x')
    await flush()
    expect(q.peek('x')).toBe('x')
    expect(q.peek('x', cache)).toBeUndefined()
    expect(queryCache()).not.toBe(cache)
  })
})

describe('retry policy', () => {
  it('classifies transient failures', () => {
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true)
    expect(
      isTransientError(Object.assign(new Error('t'), { name: 'TimeoutError' })),
    ).toBe(true)
    for (const status of [408, 429, 500, 503, 599])
      expect(isTransientError(httpError(status))).toBe(true)
    for (const status of [400, 401, 403, 404, 409, 422, 600])
      expect(isTransientError(httpError(status))).toBe(false)
    expect(isTransientError(new DOMException('x', 'AbortError'))).toBe(false)
    expect(isTransientError(httpError(503, { retryable: false }))).toBe(false)
    expect(
      isTransientError(Object.assign(new Error('x'), { retryable: true })),
    ).toBe(true)
    expect(isTransientError(new Error('parse failure'))).toBe(false)
    expect(isTransientError('offline')).toBe(false)
  })

  it('retries transient failures twice with jittered backoff and stays pending', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    io.last().reject(new TypeError('Failed to fetch'))
    await flush()
    expect(o.state()).toEqual({ status: 'pending' })
    expect(o.error()).toBeUndefined()
    expect(o.failureCount()).toBe(1)
    vi.advanceTimersByTime(299)
    expect(io.calls).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(io.calls).toHaveLength(2)
    expect(io.last().attempt).toBe(1)
    io.last().reject(httpError(503))
    await flush()
    vi.advanceTimersByTime(900)
    expect(io.calls).toHaveLength(3)
    const error = httpError(502)
    io.last().reject(error)
    await flush()
    expect(io.calls).toHaveLength(3)
    expect(o.state()).toEqual({ status: 'failed', error })
    expect(o.failureCount()).toBe(3)
    vi.restoreAllMocks()
  })

  it('keeps jitter between half and all of the base delay', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    mount(() => withCache(() => q(() => 'a')))
    io.last().reject(new TypeError('x'))
    await flush()
    vi.advanceTimersByTime(149)
    expect(io.calls).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(io.calls).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('fails at once on permanent errors', async () => {
    for (const error of [
      httpError(404),
      new Error('bug'),
      httpError(500, { retryable: false }),
    ]) {
      const io = controlled<string>()
      const q = query({ fetch: io.fetch as Fetch })
      const { value: o } = mount(() => withCache(() => q(() => 'a')))
      io.last().reject(error)
      await flush()
      vi.advanceTimersByTime(60_000)
      expect(io.calls).toHaveLength(1)
      expect(o.state()).toEqual({ status: 'failed', error })
    }
  })

  it('honors Retry-After within the cap and fails beyond it', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const { value: o } = mount(() => withCache(() => q(() => 'a')))
    io.last().reject(httpError(429, { retryAfter: 2 }))
    await flush()
    vi.advanceTimersByTime(1_999)
    expect(io.calls).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(io.calls).toHaveLength(2)
    io.last().reject(httpError(503, { retryAfter: '31' }))
    await flush()
    vi.advanceTimersByTime(60_000)
    expect(io.calls).toHaveLength(2)
    expect(o.state().status).toBe('failed')
  })

  it('reads Retry-After as an HTTP date', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    mount(() => withCache(() => q(() => 'a')))
    const at = new Date(Date.now() + 4_000).toUTCString()
    io.last().reject(httpError(503, { retryAfter: at }))
    await flush()
    vi.advanceTimersByTime(3_000)
    expect(io.calls).toHaveLength(1)
    vi.advanceTimersByTime(1_000)
    expect(io.calls).toHaveLength(2)
  })

  it('accepts false, a count, a predicate, and a custom delay', async () => {
    const cases = [
      { retry: false as const, attempts: 1 },
      { retry: 4, attempts: 5 },
      { retry: (count: number) => count < 2, attempts: 2 },
    ]
    for (const { retry, attempts } of cases) {
      const io = controlled<string>()
      const q = query({
        fetch: io.fetch as Fetch,
        retry,
        retryDelay: () => 10,
      })
      mount(() => withCache(() => q(() => 'a')))
      for (let i = 0; i < 8; i++) {
        io.last().reject(new TypeError('offline'))
        await flush()
        vi.advanceTimersByTime(10)
      }
      expect(io.calls).toHaveLength(attempts)
    }
  })

  it('stops pending retries on disposal and never retries cancellation', async () => {
    const io = controlled<string>()
    const q = query({ fetch: io.fetch as Fetch })
    const root = mount(() => withCache(() => q(() => 'a')))
    io.last().reject(new TypeError('x'))
    await flush()
    root.dispose()
    await flush()
    vi.advanceTimersByTime(60_000)
    expect(io.calls).toHaveLength(1)

    const id = signal('b')
    mount(() => withCache(() => q(id)))
    const b = io.last()
    id.set('c')
    b.reject(new DOMException('aborted', 'AbortError'))
    await flush()
    vi.advanceTimersByTime(60_000)
    expect(io.calls.filter((call) => call.args === 'b')).toHaveLength(1)
  })
})

describe('refetch triggers', () => {
  it('only listens for focus and reconnect when a query opts in', async () => {
    const listeners = new Map<string, () => void>()
    const target = {
      addEventListener: (name: string, fn: () => void) =>
        listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    }
    vi.stubGlobal('window', target)
    vi.stubGlobal('document', { ...target, visibilityState: 'visible' })
    const local = createQueryCache()
    const plain = query({ fetch: (id: string) => id })
    const fetch = vi.fn((id: string) => id)
    const focused = query({ fetch, refetchOn: { focus: true }, staleTime: 0 })
    mount(() => withCache(() => plain(() => 'a'), local))
    expect(listeners.size).toBe(0)
    mount(() => withCache(() => focused(() => 'a'), local))
    await flush()
    expect(listeners.has('focus')).toBe(true)
    listeners.get('focus')?.()
    expect(fetch).toHaveBeenCalledTimes(2)
    listeners.get('online')?.()
    expect(fetch).toHaveBeenCalledTimes(2)
    local.dispose()
    expect(listeners.size).toBe(0)
    vi.unstubAllGlobals()
  })
})

/** Creates an observer under a provider for an explicit cache. */
function withCache<T>(
  create: () => QueryObserver<T>,
  local: QueryCache = cache,
): QueryObserver<T> {
  return QueryCacheProvider({
    cache: local,
    children: create,
  }) as unknown as QueryObserver<T>
}

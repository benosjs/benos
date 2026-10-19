import { describe, expect, it } from 'vitest'
import { createRoot, effect, onCleanup, signal } from '@benosjs/core'
import { resource } from '../src/index.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (!item) throw new Error(`Missing item ${index}`)
  return item
}

describe('resource', () => {
  it('keeps the newest A → B → A generation and retains stale value', async () => {
    const key = signal('A')
    const calls: Array<ReturnType<typeof deferred<string>>> = []
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(
        key,
        () => {
          const next = deferred<string>()
          calls.push(next)
          return next.promise
        },
        { initialValue: 'seed' },
      ),
    }))
    expect(created.data.state().status).toBe('pending')
    expect(created.data.read()).toBe('seed')
    key.set('B')
    key.set('A')
    expect(calls).toHaveLength(3)
    at(calls, 0).resolve('old A')
    at(calls, 1).resolve('B')
    await Promise.resolve()
    expect(created.data.value()).toBe('seed')
    at(calls, 2).resolve('new A')
    await Promise.resolve()
    expect(created.data.value()).toBe('new A')
    expect(created.data.state().status).toBe('ready')
    created.dispose()
  })

  it('cancels outstanding refreshes, ignores late failures, and waits for a new key', async () => {
    const key = signal('A')
    const calls: Array<ReturnType<typeof deferred<string>>> = []
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(key, () => {
        const next = deferred<string>()
        calls.push(next)
        return next.promise
      }),
    }))
    const refresh = created.data.refresh()
    created.data.cancel()
    expect(await refresh).toBeUndefined()
    expect(created.data.state().status).toBe('disabled')
    at(calls, 1).reject(new Error('late'))
    await Promise.resolve()
    expect(created.data.state().status).toBe('disabled')
    key.set('A')
    expect(calls).toHaveLength(2)
    key.set('B')
    expect(calls).toHaveLength(3)
    created.dispose()
    at(calls, 2).resolve('late B')
    await Promise.resolve()
    expect(created.data.value()).toBeUndefined()
  })

  it('turns synchronous and asynchronous failures into failed state', async () => {
    const error = new Error('nope')
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(
        () => 'A',
        () => {
          throw error
        },
      ),
    }))
    expect(created.data.state()).toEqual({ status: 'failed', error })
    expect(() => created.data.read()).toThrow(error)
    expect(await created.data.refresh()).toBeUndefined()
    created.dispose()
  })

  it('retains the last success after asynchronous rejection', async () => {
    const key = signal('A')
    const requests = new Map<string, ReturnType<typeof deferred<string>>>()
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(key, (next) => {
        const request = deferred<string>()
        requests.set(next, request)
        return request.promise
      }),
    }))
    requests.get('A')?.resolve('ready A')
    await Promise.resolve()
    key.set('B')
    const failure = new Error('failed B')
    requests.get('B')?.reject(failure)
    await Promise.resolve()
    expect(created.data.value()).toBe('ready A')
    expect(created.data.state()).toEqual({ status: 'failed', error: failure })
    expect(() => created.data.read()).toThrow(failure)
    created.dispose()
  })

  it('disables on nullish and false keys without erasing the last result', async () => {
    const key = signal<string | false | null>('A')
    const seen: string[] = []
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(
        key,
        (next) => {
          seen.push(next)
          return next.toLowerCase()
        },
        { initialValue: 'seed' },
      ),
    }))
    await Promise.resolve()
    expect(created.data.value()).toBe('a')
    key.set(false)
    expect(created.data.state().status).toBe('disabled')
    expect(created.data.value()).toBe('a')
    expect(await created.data.refresh()).toBeUndefined()
    key.set(null)
    expect(seen).toEqual(['A'])
    key.set('B')
    await Promise.resolve()
    expect(created.data.value()).toBe('b')
    created.dispose()
  })

  it('passes an abort signal and never tracks synchronous fetcher reads', async () => {
    const key = signal('A')
    const incidental = signal(1)
    const signals: AbortSignal[] = []
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(key, (_key, context) => {
        incidental()
        signals.push(context.signal)
        return new Promise<string>(() => undefined)
      }),
    }))
    incidental.set(2)
    expect(signals).toHaveLength(1)
    key.set('B')
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    created.dispose()
    expect(signals[1]?.aborted).toBe(true)
  })

  it('reuses Object.is-equal keys and refreshes the current key', async () => {
    const key = signal(Number.NaN)
    const seen: number[] = []
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(key, (next) => {
        seen.push(next)
        return seen.length
      }),
    }))
    await Promise.resolve()
    key.set(Number.NaN)
    expect(seen).toHaveLength(1)
    expect(created.data.value()).toBe(1)
    expect(await created.data.refresh()).toBe(2)
    expect(seen).toHaveLength(2)
    created.dispose()
  })

  it('flushes ready state synchronously at settlement before refresh resolves', async () => {
    const requests = [deferred<string>(), deferred<string>()]
    let index = 0
    const trace: string[] = []
    const created = createRoot((dispose) => {
      const data = resource(
        () => 'A',
        () => at(requests, index++).promise,
      )
      effect(() => trace.push(data.state().status))
      return { dispose, data }
    })
    const refresh = created.data
      .refresh()
      .then(() => trace.push('refresh resolved'))
    at(requests, 1).resolve('ready')
    await refresh
    expect(trace).toEqual(['pending', 'pending', 'ready', 'refresh resolved'])
    at(requests, 0).resolve('ignored initial request')
    created.dispose()
  })

  it('does not retain owner or tracking context across a fetcher await', async () => {
    const key = signal('A')
    const incidental = signal(0)
    const gate = deferred<undefined>()
    let ownerLeaked = false
    let fetches = 0
    const created = createRoot((dispose) => ({
      dispose,
      data: resource(key, async () => {
        fetches++
        await gate.promise
        incidental()
        try {
          onCleanup(() => undefined)
          ownerLeaked = true
        } catch {
          // The async continuation must run without an owner.
        }
        return 'ready'
      }),
    }))
    gate.resolve(undefined)
    await Promise.resolve()
    await Promise.resolve()
    incidental.set(1)
    expect(fetches).toBe(1)
    expect(ownerLeaked).toBe(false)
    created.dispose()
  })
})

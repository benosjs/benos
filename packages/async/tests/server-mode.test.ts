import { describe, expect, it } from 'vitest'
import { createRoot } from '@benosjs/core'
import { internalRequest, type InternalRequest } from '@benosjs/core/internal'
import { resource } from '../src/index.js'

interface Request extends InternalRequest {
  tracked: Promise<unknown>[]
  errors: unknown[]
}

function request(mode: 'server' | 'hydrate'): Request {
  const record: Request = {
    id: '0',
    mode,
    resources: new Map(),
    queries: new Map(),
    tracked: [],
    errors: [],
    track: (promise) => record.tracked.push(promise),
    onError: (error) => record.errors.push(error),
  }
  return record
}

function inRequest<T>(record: InternalRequest, fn: () => T): T {
  return createRoot(() => {
    internalRequest(record)
    return fn()
  })
}

const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (value: { name: string; secret: string }) => ({
    name: value.name,
  }),
  deserialize: (value: unknown) => ({
    ...(value as { name: string }),
    secret: '',
  }),
}

describe('resource under a server request', () => {
  it('never launches a resource without a codec and keeps it pending', async () => {
    let calls = 0
    const record = request('server')
    const data = inRequest(record, () =>
      resource(
        () => 1,
        () => {
          calls++
          return Promise.resolve('x')
        },
      ),
    )
    await Promise.resolve()
    expect(calls).toBe(0)
    expect(data.state()).toEqual({ status: 'pending' })
    expect(record.tracked).toHaveLength(0)
  })

  it('throws when a codec-less pending resource is read outside Suspense', () => {
    const record = request('server')
    expect(() =>
      inRequest(record, () => {
        const data = resource(
          () => 1,
          () => Promise.resolve('x'),
        )
        return data.read()
      }),
    ).toThrow(/Suspense/)
  })

  it('launches a codec resource, tracks it, and records the projection', async () => {
    const record = request('server')
    const data = inRequest(record, () =>
      resource(
        () => 7,
        () => Promise.resolve({ name: 'Ada', secret: 'hunter2' }),
        { ssr: codec },
      ),
    )
    expect(record.tracked).toHaveLength(1)
    await record.tracked[0]
    expect(data.state()).toEqual({ status: 'ready' })
    expect(data.value()).toEqual({ name: 'Ada', secret: 'hunter2' })
    expect([...record.resources]).toEqual([['user\u00007', { name: 'Ada' }]])
  })

  it('keeps a failed codec resource pending, records nothing, reports the error', async () => {
    const record = request('server')
    const failure = new Error('boom')
    const data = inRequest(record, () =>
      resource(
        () => 7,
        () => Promise.reject(failure),
        { ssr: codec },
      ),
    )
    await record.tracked[0]
    expect(data.state()).toEqual({ status: 'pending' })
    expect(record.resources.size).toBe(0)
    expect(record.errors).toEqual([failure])
  })
})

describe('resource under a hydrating request', () => {
  it('seeds from a matching snapshot without fetching and consumes it', async () => {
    const record = request('hydrate')
    record.resources.set('user\u00007', { name: 'Ada' })
    let calls = 0
    const fetcher = (): Promise<{ name: string; secret: string }> => {
      calls++
      return Promise.resolve({ name: 'Grace', secret: '' })
    }
    const [first, second] = inRequest(record, () => [
      resource(() => 7, fetcher, { ssr: codec }),
      resource(() => 7, fetcher, { ssr: codec }),
    ])
    expect(first?.state()).toEqual({ status: 'ready' })
    expect(first?.value()).toEqual({ name: 'Ada', secret: '' })
    expect(second?.state()).toEqual({ status: 'pending' })
    expect(calls).toBe(1)
    expect(record.resources.size).toBe(0)
  })

  it('fetches when the key does not match', () => {
    const record = request('hydrate')
    record.resources.set('user\u00008', { name: 'Ada' })
    let calls = 0
    inRequest(record, () =>
      resource(
        () => 7,
        () => {
          calls++
          return Promise.resolve({ name: 'Grace', secret: '' })
        },
        { ssr: codec },
      ),
    )
    expect(calls).toBe(1)
  })
})

describe('resource outside a request', () => {
  it('ignores the codec and fetches as before', async () => {
    let calls = 0
    const data = createRoot(() =>
      resource(
        () => 7,
        () => {
          calls++
          return Promise.resolve({ name: 'Ada', secret: 's' })
        },
        { ssr: codec },
      ),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(1)
    expect(data.state()).toEqual({ status: 'ready' })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from '@benosjs/core'
import {
  createQueryCache,
  mutation,
  query,
  QueryCacheProvider,
} from '../src/index.js'
import type { QueryCache } from '../src/index.js'

interface Project {
  id: string
  name: string
  starred: boolean
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

let cache: QueryCache
const roots: Array<() => void> = []
function scoped<T>(create: () => T): { value: T; dispose: () => void } {
  return createRoot((dispose) => {
    roots.push(dispose)
    const value = QueryCacheProvider({
      cache,
      children: create,
    }) as unknown as T
    return { value, dispose }
  })
}

function setup() {
  const server = new Map<string, Project>([
    ['p1', { id: 'p1', name: 'One', starred: false }],
  ])
  const fetches: string[] = []
  const projectQuery = query({
    fetch: (id: string) => {
      fetches.push(id)
      const project = server.get(id)
      if (!project) throw Object.assign(new Error('missing'), { status: 404 })
      return Promise.resolve({ ...project })
    },
    staleTime: Infinity,
  })
  const listQuery = query({
    fetch: () => {
      fetches.push('list')
      return Promise.resolve([...server.keys()])
    },
    staleTime: Infinity,
  })
  return { server, fetches, projectQuery, listQuery }
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

describe('mutation results', () => {
  it('never rejects: success, rejection, and synchronous throw', async () => {
    const ok = mutation({ run: (n: number) => n * 2 })
    await expect(ok.run(2, cache)).resolves.toEqual({ ok: true, value: 4 })
    const error = new Error('denied')
    const rejected = mutation({ run: () => Promise.reject(error) })
    await expect(rejected.run(undefined, cache)).resolves.toEqual({
      ok: false,
      error,
      cancelled: false,
    })
    const thrown = mutation({
      run: (): number => {
        throw error
      },
    })
    await expect(thrown.run(undefined, cache)).resolves.toEqual({
      ok: false,
      error,
      cancelled: false,
    })
  })

  it('reports a throwing writes callback without rejecting or leaking', async () => {
    const { projectQuery } = setup()
    const error = new Error('bad writes')
    const broken = mutation({
      run: () => 'saved',
      optimistic: () => [
        projectQuery.key('p5').set({ id: 'p5', name: 'Five', starred: false }),
      ],
      writes: (): never => {
        throw error
      },
    })
    await expect(broken.run(undefined, cache)).resolves.toEqual({
      ok: false,
      error,
      cancelled: false,
    })
    vi.advanceTimersByTime(300_000)
    expect(projectQuery.peek('p5', cache)).toBeUndefined()
  })
})

describe('writes and affects', () => {
  it('writes the saved value and refreshes only what it affects', async () => {
    const { server, fetches, projectQuery, listQuery } = setup()
    const project = scoped(() => projectQuery(() => 'p1')).value
    const list = scoped(() => listQuery()).value
    await flush()
    expect(fetches).toEqual(['p1', 'list'])
    const save = mutation({
      run: (input: { id: string; name: string }) => {
        const current = server.get(input.id)
        if (!current) throw new Error('missing')
        const next = { ...current, name: input.name }
        server.set(input.id, next)
        return Promise.resolve(next)
      },
      writes: (input, saved) => [projectQuery.key(input.id).set(saved)],
      affects: () => [listQuery],
    })
    const result = await save.run({ id: 'p1', name: 'Renamed' }, cache)
    expect(result.ok).toBe(true)
    expect(project.value()?.name).toBe('Renamed')
    expect(fetches).toEqual(['p1', 'list', 'list'])
    expect(list.value()).toEqual(['p1'])
  })

  it('waits for retained affected refetches unless told not to', async () => {
    const { fetches, projectQuery } = setup()
    const slow = deferred<Project>()
    let first = true
    const tracked = query({
      fetch: (id: string) => {
        fetches.push(id)
        if (first) {
          first = false
          return Promise.resolve({ id, name: 'One', starred: false })
        }
        return slow.promise
      },
    })
    const observer = scoped(() => tracked(() => 'p1')).value
    await flush()
    let settled = false
    const waits = mutation({
      run: () => 'saved',
      affects: () => [tracked.key('p1')],
    })
    void waits.run(undefined, cache).then(() => (settled = true))
    await flush()
    expect(settled).toBe(false)
    expect(observer.fetching()).toBe(true)
    slow.resolve({ id: 'p1', name: 'Fresh', starred: false })
    await flush()
    expect(settled).toBe(true)
    expect(observer.value()?.name).toBe('Fresh')

    const fast = mutation({
      run: () => 'saved',
      affects: () => [tracked.key('p1')],
      awaitRefetch: false,
    })
    await expect(fast.run(undefined, cache)).resolves.toEqual({
      ok: true,
      value: 'saved',
    })
    void projectQuery
  })

  it('does not refresh anything after a failed run', async () => {
    const { fetches, projectQuery } = setup()
    scoped(() => projectQuery(() => 'p1'))
    await flush()
    const fail = mutation({
      run: () => Promise.reject(new Error('denied')),
      affects: () => [projectQuery],
    })
    await fail.run(undefined, cache)
    await flush()
    expect(fetches).toEqual(['p1'])
  })

  it('keeps written data fresh and ignores updates without data', async () => {
    const { fetches, projectQuery } = setup()
    cache.write(projectQuery.key('p2').update((p) => ({ ...p, name: 'x' })))
    expect(projectQuery.peek('p2', cache)).toBeUndefined()
    cache.write(
      projectQuery.key('p2').set({ id: 'p2', name: 'Two', starred: false }),
    )
    const observer = scoped(() => projectQuery(() => 'p2')).value
    expect(observer.value()?.name).toBe('Two')
    expect(observer.state()).toEqual({ status: 'ready' })
    await flush()
    expect(fetches).toEqual([])
  })

  it('lets a write win over a request that started before it', async () => {
    const pending = deferred<Project>()
    const q = query({
      fetch: (id: string) => pending.promise.then((p) => ({ ...p, id })),
    })
    const observer = scoped(() => q(() => 'p1')).value
    const refreshed = observer.refresh()
    cache.write(q.key('p1').set({ id: 'p1', name: 'Written', starred: false }))
    pending.resolve({ id: 'p1', name: 'Old server copy', starred: false })
    await flush()
    expect(observer.value()?.name).toBe('Written')
    expect(observer.fetching()).toBe(false)
    expect(observer.state()).toEqual({ status: 'ready' })
    await expect(refreshed).resolves.toEqual({
      id: 'p1',
      name: 'Written',
      starred: false,
    })
  })
})

describe('optimistic updates', () => {
  function star(projectQuery: ReturnType<typeof setup>['projectQuery']) {
    const calls: Array<ReturnType<typeof deferred<Project>>> = []
    const toggle = mutation({
      run: (input: { id: string; starred: boolean }) => {
        void input
        const call = deferred<Project>()
        calls.push(call)
        return call.promise
      },
      optimistic: (input) => [
        projectQuery
          .key(input.id)
          .update((p) => ({ ...p, starred: input.starred })),
      ],
      affects: (input) => [projectQuery.key(input.id)],
    })
    return { toggle, calls }
  }

  it('applies at once, rolls back on failure, and refreshes on success', async () => {
    const { server, fetches, projectQuery } = setup()
    const observer = scoped(() => projectQuery(() => 'p1')).value
    await flush()
    const { toggle, calls } = star(projectQuery)
    const failed = toggle.run({ id: 'p1', starred: true }, cache)
    expect(observer.value()?.starred).toBe(true)
    calls[0]?.reject(new Error('denied'))
    await expect(failed).resolves.toMatchObject({ ok: false, cancelled: false })
    expect(observer.value()?.starred).toBe(false)
    expect(fetches).toEqual(['p1'])

    const saved = toggle.run({ id: 'p1', starred: true }, cache)
    expect(observer.value()?.starred).toBe(true)
    server.set('p1', { id: 'p1', name: 'One', starred: true })
    calls[1]?.resolve({ id: 'p1', name: 'One', starred: true })
    await saved
    expect(fetches).toEqual(['p1', 'p1'])
    expect(observer.value()?.starred).toBe(true)
  })

  it('drops an earlier fetch result while an optimistic value is shown', async () => {
    const pending = deferred<Project>()
    let calls = 0
    const q = query({
      fetch: (id: string) =>
        ++calls === 1
          ? Promise.resolve({ id, name: 'One', starred: false })
          : pending.promise,
    })
    const observer = scoped(() => q(() => 'p1')).value
    await flush()
    void observer.refresh()
    const { toggle } = star(q)
    void toggle.run({ id: 'p1', starred: true }, cache)
    pending.resolve({ id: 'p1', name: 'One', starred: false })
    await flush()
    expect(observer.value()?.starred).toBe(true)
  })

  it('invalidates instead of restoring when a newer write landed', async () => {
    const { fetches, projectQuery } = setup()
    const observer = scoped(() => projectQuery(() => 'p1')).value
    await flush()
    const { toggle, calls } = star(projectQuery)
    const rename = mutation({
      run: (name: string) => deferred<string>().promise.then(() => name),
      optimistic: (name) => [
        projectQuery.key('p1').update((p) => ({ ...p, name })),
      ],
    })
    const first = toggle.run({ id: 'p1', starred: true }, cache)
    void rename.run('Second', cache)
    calls[0]?.reject(new Error('denied'))
    await first
    await flush()
    expect(observer.value()).toEqual({ id: 'p1', name: 'One', starred: false })
    expect(fetches).toEqual(['p1', 'p1'])
  })

  it('retains optimistic entries until the run settles', async () => {
    const q = query({
      fetch: (id: string) => ({ id, name: 'One', starred: false }),
      gcTime: 10,
    })
    const viewer = scoped(() => q(() => 'p1'))
    await flush()
    const { toggle, calls } = star(q)
    void toggle.run({ id: 'p1', starred: true }, cache)
    viewer.dispose()
    vi.advanceTimersByTime(100)
    expect(q.peek('p1', cache)?.starred).toBe(true)
    calls[0]?.resolve({ id: 'p1', name: 'One', starred: true })
    await flush()
    vi.advanceTimersByTime(100)
    expect(q.peek('p1', cache)).toBeUndefined()
  })
})

describe('mutation handles', () => {
  it('tracks the latest run state and pending count', async () => {
    const calls: Array<ReturnType<typeof deferred<string>>> = []
    const save = mutation({
      run: (value: string) => {
        void value
        const call = deferred<string>()
        calls.push(call)
        return call.promise
      },
    })
    const handle = scoped(() => save()).value
    expect(handle.state()).toEqual({ status: 'idle' })
    void handle.run('a')
    void handle.run('b')
    expect(handle.pending()).toBe(true)
    expect(handle.state()).toEqual({ status: 'pending' })
    calls[1]?.resolve('B')
    await flush()
    expect(handle.state()).toEqual({ status: 'succeeded', value: 'B' })
    expect(handle.pending()).toBe(true)
    calls[0]?.reject(new Error('late'))
    await flush()
    expect(handle.state()).toEqual({ status: 'succeeded', value: 'B' })
    expect(handle.pending()).toBe(false)
    handle.reset()
    expect(handle.state()).toEqual({ status: 'idle' })
    void handle.run('c')
    const error = new Error('denied')
    calls[2]?.reject(error)
    await flush()
    expect(handle.state()).toEqual({ status: 'failed', error })
  })

  it('cancels with rollback and refreshes what may have changed', async () => {
    const { fetches, projectQuery } = setup()
    const observer = scoped(() => projectQuery(() => 'p1')).value
    await flush()
    const signals: AbortSignal[] = []
    const affects = vi.fn((input: { id: string }, output?: Project) => {
      expect(output).toBeUndefined()
      return [projectQuery.key(input.id)]
    })
    const toggle = mutation({
      run: (_input: { id: string }, { signal }) => {
        signals.push(signal)
        return new Promise<Project>((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        )
      },
      optimistic: (input) => [
        projectQuery.key(input.id).update((p) => ({ ...p, starred: true })),
      ],
      affects,
    })
    const handle = scoped(() => toggle()).value
    const result = handle.run({ id: 'p1' })
    expect(observer.value()?.starred).toBe(true)
    handle.cancel()
    await expect(result).resolves.toMatchObject({ ok: false, cancelled: true })
    expect(signals[0]?.aborted).toBe(true)
    expect(observer.value()?.starred).toBe(false)
    expect(handle.state()).toEqual({ status: 'idle' })
    expect(affects).toHaveBeenCalledTimes(1)
    await flush()
    expect(fetches).toEqual(['p1', 'p1'])
  })

  it('runs the success path when a cancelled run still resolves', async () => {
    const { projectQuery } = setup()
    const pending = deferred<Project>()
    const save = mutation({
      run: () => pending.promise,
      writes: (_input, saved) => [projectQuery.key(saved.id).set(saved)],
    })
    const handle = scoped(() => save()).value
    const result = handle.run(undefined)
    handle.cancel()
    pending.resolve({ id: 'p9', name: 'Kept', starred: false })
    await expect(result).resolves.toMatchObject({ ok: true })
    expect(projectQuery.peek('p9', cache)?.name).toBe('Kept')
  })

  it('keeps cache effects after its owner is disposed', async () => {
    const { server, fetches, projectQuery } = setup()
    const observer = scoped(() => projectQuery(() => 'p1')).value
    await flush()
    const pending = deferred<string>()
    const signals: AbortSignal[] = []
    const save = mutation({
      run: (id: string, { signal }) => {
        signals.push(signal)
        return pending.promise.then(() => id)
      },
      affects: (id) => [projectQuery.key(id)],
    })
    const editor = scoped(() => save())
    const result = editor.value.run('p1')
    editor.dispose()
    expect(signals[0]?.aborted).toBe(false)
    server.set('p1', { id: 'p1', name: 'Saved', starred: false })
    pending.resolve('ok')
    await expect(result).resolves.toEqual({ ok: true, value: 'p1' })
    expect(fetches).toEqual(['p1', 'p1'])
    expect(observer.value()?.name).toBe('Saved')
    expect(editor.value.state()).toEqual({ status: 'pending' })
  })
})

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsx, render } from '@benosjs/dom'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  route,
  RouterOutlet,
} from '@benosjs/router'
import { createQueryCache, mutation, query } from '../src/index.js'
import type { QueryCache } from '../src/index.js'

interface Project {
  id: string
  name: string
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const roots: Array<() => void> = []
const caches: QueryCache[] = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  while (caches.length) caches.pop()?.dispose()
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** A project editor route whose loader reads through the query cache. */
function setup(
  options: { staleTime?: number; gcTime?: number; manual?: boolean } = {},
) {
  const cache = createQueryCache()
  caches.push(cache)
  const server = new Map<string, Project>([
    ['a', { id: 'a', name: 'Alpha' }],
    ['b', { id: 'b', name: 'Beta' }],
    ['c', { id: 'c', name: 'Gamma' }],
  ])
  const fetches: string[] = []
  const signals: AbortSignal[] = []
  const pending = new Map<string, ReturnType<typeof deferred<Project>>>()
  const projectQuery = query({
    fetch: (id: string, { signal }) => {
      fetches.push(id)
      signals.push(signal)
      if (options.manual) {
        const request = deferred<Project>()
        pending.set(id, request)
        return request.promise
      }
      const project = server.get(id)
      return project
        ? Promise.resolve({ ...project })
        : Promise.reject(Object.assign(new Error('missing'), { status: 404 }))
    },
    staleTime: options.staleTime ?? Infinity,
    gcTime: options.gcTime ?? 300_000,
  })
  const projectRoute = route('/projects/:projectId', {
    loader: ({ params, signal }) =>
      projectQuery.load(params.projectId, signal, cache),
  })
  let mounts = 0
  const shown: string[] = []
  const router = createRouter({
    history: memoryHistory({ initialEntries: ['/projects/a'] }),
    routes: [
      mountRoute(projectRoute, {
        component: () => {
          mounts++
          const match = projectRoute.match()
          return jsx('p', {
            get children() {
              const text = `${match.params().projectId}:${match.data().value().name}`
              shown.push(text)
              return text
            },
          })
        },
        error: ({ retry }) =>
          jsx('button', { onClick: retry, children: 'Retry' }),
      }),
    ],
  })
  roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
  const text = () => document.querySelector('p')?.textContent
  const go = (projectId: string) =>
    router.navigate({ to: projectRoute, params: { projectId } })
  return {
    cache,
    server,
    fetches,
    signals,
    pending,
    projectQuery,
    projectRoute,
    router,
    shown,
    text,
    go,
    mounts: () => mounts,
  }
}

describe('route loaders through the query cache', () => {
  it('commits the loaded entry and changes records without remounting', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    await app.go('b')
    expect(app.text()).toBe('b:Beta')
    expect(app.mounts()).toBe(1)
    expect(app.shown).not.toContain('b:Alpha')
    expect(app.fetches).toEqual(['a', 'b'])
  })

  it('resolves a revisit from the cache without fetching', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    await app.go('b')
    expect((await app.go('a')).status).toBe('committed')
    expect(app.text()).toBe('a:Alpha')
    expect(app.fetches).toEqual(['a', 'b'])
  })

  it('shows time-stale data at once and updates it in place', async () => {
    const app = setup({ staleTime: 0, manual: true })
    await vi.waitFor(() => expect(app.pending.has('a')).toBe(true))
    app.pending.get('a')?.resolve({ id: 'a', name: 'Alpha' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const toB = app.go('b')
    await vi.waitFor(() => expect(app.pending.has('b')).toBe(true))
    app.pending.get('b')?.resolve({ id: 'b', name: 'Beta' })
    await toB
    app.pending.delete('a')
    await app.go('a')
    expect(app.text()).toBe('a:Alpha')
    expect(app.pending.has('a')).toBe(true)
    app.pending.get('a')?.resolve({ id: 'a', name: 'Alpha 2' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha 2'))
    expect(app.fetches).toEqual(['a', 'b', 'a'])
    expect(app.mounts()).toBe(1)
  })

  it('refreshes committed route data in place after a mutation', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const rename = mutation({
      run: (input: { id: string; name: string }) => {
        app.server.set(input.id, { id: input.id, name: input.name })
        return Promise.resolve(input.id)
      },
      affects: (input) => [app.projectQuery.key(input.id)],
    })
    const result = await rename.run({ id: 'a', name: 'Renamed' }, app.cache)
    expect(result.ok).toBe(true)
    expect(app.text()).toBe('a:Renamed')
    expect(app.router.navigation().status).toBe('idle')
    expect(app.mounts()).toBe(1)
  })

  it('never shows the pre-save record after saving it from elsewhere', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    await app.go('b')
    const rename = mutation({
      run: (id: string) => {
        app.server.set(id, { id, name: 'Saved' })
        return Promise.resolve(id)
      },
      affects: (id) => [app.projectQuery.key(id)],
    })
    await rename.run('a', app.cache)
    expect(app.fetches).toEqual(['a', 'b'])
    const before = app.shown.length
    await app.go('a')
    expect(app.text()).toBe('a:Saved')
    expect(app.shown.slice(before)).toEqual(['a:Saved'])
    expect(app.fetches).toEqual(['a', 'b', 'a'])
  })

  it('releases a superseded candidate and aborts its request', async () => {
    const app = setup({ manual: true, gcTime: 1_000 })
    await vi.waitFor(() => expect(app.pending.has('a')).toBe(true))
    app.pending.get('a')?.resolve({ id: 'a', name: 'Alpha' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    vi.useFakeTimers()
    void app.go('b')
    await vi.waitFor(() => expect(app.pending.has('b')).toBe(true))
    const toC = app.go('c')
    await vi.waitFor(() => expect(app.pending.has('c')).toBe(true))
    await vi.advanceTimersByTimeAsync(0)
    expect(app.signals[1]?.aborted).toBe(true)
    app.pending.get('c')?.resolve({ id: 'c', name: 'Gamma' })
    expect((await toC).status).toBe('committed')
    expect(app.text()).toBe('c:Gamma')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(app.projectQuery.peek('a', app.cache)).toBeUndefined()
    expect(app.projectQuery.peek('c', app.cache)?.name).toBe('Gamma')
  })

  it('keeps the committed entry alive past gcTime', async () => {
    const app = setup({ gcTime: 1_000 })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(app.projectQuery.peek('a', app.cache)?.name).toBe('Alpha')
    void app.cache.invalidate(app.projectQuery.key('a'))
    app.server.set('a', { id: 'a', name: 'Still tracked' })
    await vi.advanceTimersByTimeAsync(0)
    expect(app.text()).toBe('a:Alpha')
    await vi.waitFor(() => expect(app.fetches).toHaveLength(2))
  })

  it('sends a load failure to the route error view and retries', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    await app.go('missing')
    expect(document.querySelector('button')?.textContent).toBe('Retry')
    app.server.set('missing', { id: 'missing', name: 'Found' })
    document.querySelector('button')?.click()
    await vi.waitFor(() => expect(app.text()).toBe('missing:Found'))
  })

  it('holds an imperatively loaded entry only until gcTime', async () => {
    vi.useFakeTimers()
    const cache = createQueryCache()
    caches.push(cache)
    const q = query({ fetch: (id: string) => id, gcTime: 1_000 })
    const entry = await q.load('x', undefined, cache)
    expect(entry.value()).toBe('x')
    await expect(q.load('x', undefined, cache)).resolves.toBe(entry)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(q.peek('x', cache)).toBeUndefined()
  })
})

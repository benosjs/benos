// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onCleanup } from '@benosjs/core'
import { ErrorBoundary, jsx, render } from '@benosjs/dom'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  route,
  RouterOutlet,
} from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('route loaders', () => {
  it('starts before the route component and shows the initial pending view', async () => {
    const request = deferred<string>()
    const events: string[] = []
    const home = route('/', {
      loader: () => {
        events.push('loader')
        return request.promise
      },
    })
    const router = createRouter({
      history: memoryHistory(),
      routes: [
        mountRoute(home, {
          pending: () => jsx('p', { id: 'pending', children: 'Loading view' }),
          component: () => {
            events.push('component')
            return jsx('h1', { children: 'Loaded' })
          },
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await settle()
    expect(events).toEqual(['loader'])
    expect(document.querySelector('#pending')?.textContent).toBe('Loading view')
    expect(document.querySelector('[data-router-status]')?.textContent).toBe(
      'Loading page',
    )
    request.resolve('ready')
    await vi.waitFor(() =>
      expect(document.querySelector('h1')?.textContent).toBe('Loaded'),
    )
    expect(events).toEqual(['loader', 'component'])
    expect(router.matches()[0]?.data).toBe('ready')
  })

  it('passes the immutable router context to loaders', async () => {
    const context = { tenant: { id: 'team-7' } }
    let received: unknown
    const contextualRoute = route('/context', {
      loader: ({ context: value }) => {
        received = value
        return (value as typeof context).tenant.id
      },
    })
    const router = createRouter({
      context,
      history: memoryHistory({ initialEntries: ['/context'] }),
      routes: [mountRoute(contextualRoute, { component: () => null })],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await vi.waitFor(() => expect(router.matches()[0]?.data).toBe('team-7'))
    expect(received).toBe(context)
    expect(Object.isFrozen(received)).toBe(true)
    expect(Object.isFrozen((received as typeof context).tenant)).toBe(true)
  })

  it('keeps the route owner and commits params with matching loader data', async () => {
    const requests = new Map<string, ReturnType<typeof deferred<string>>>()
    const item = route('/items/:id', {
      loader: ({ params }) => {
        const request = deferred<string>()
        requests.set(params.id, request)
        return request.promise
      },
    })
    let mounts = 0
    const snapshots: string[] = []
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/items/a'] }),
      routes: [
        mountRoute(item, {
          component: () => {
            mounts++
            const match = item.match()
            return jsx('p', {
              get children() {
                const value = `${match.params().id}:${match.data()}`
                snapshots.push(value)
                return value
              },
            })
          },
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await vi.waitFor(() => expect(requests.has('a')).toBe(true))
    requests.get('a')?.resolve('A')
    await vi.waitFor(() =>
      expect(document.querySelector('p')?.textContent).toBe('a:A'),
    )

    const navigation = router.navigate({ to: item, params: { id: 'b' } })
    await vi.waitFor(() => expect(requests.has('b')).toBe(true))
    expect(document.querySelector('p')?.textContent).toBe('a:A')
    expect(router.navigation().status).toBe('loading')
    requests.get('b')?.resolve('B')
    await navigation
    expect(document.querySelector('p')?.textContent).toBe('b:B')
    expect(mounts).toBe(1)
    expect(snapshots).not.toContain('b:A')
  })

  it('aborts superseded loaders and ignores a stale A → B → A completion', async () => {
    const calls: Array<{
      id: string
      signal: AbortSignal
      request: ReturnType<typeof deferred<string>>
    }> = []
    const item = route('/items/:id', {
      loader: ({ params, signal }) => {
        const request = deferred<string>()
        calls.push({ id: params.id, signal, request })
        return request.promise
      },
    })
    const router = createRouter({
      history: memoryHistory(),
      routes: [mountRoute(item, { component: () => null })],
    })
    const firstA = router.navigate({ to: item, params: { id: 'a' } })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const b = router.navigate({ to: item, params: { id: 'b' } })
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    const lastA = router.navigate({ to: item, params: { id: 'a' } })
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[0]?.signal.aborted).toBe(true)
    expect(calls[1]?.signal.aborted).toBe(true)
    calls[2]?.request.resolve('latest A')
    await expect(lastA).resolves.toEqual({
      status: 'committed',
      location: '/items/a',
    })
    calls[0]?.request.resolve('stale A')
    calls[1]?.request.resolve('stale B')
    await expect(firstA).resolves.toEqual({ status: 'superseded' })
    await expect(b).resolves.toEqual({ status: 'superseded' })
    expect(router.matches()[0]?.data).toBe('latest A')
  })

  it('aborts an in-flight loader when the outlet owner is disposed', async () => {
    let loaderSignal: AbortSignal | undefined
    const request = deferred<string>()
    const home = route('/', {
      loader: ({ signal }) => {
        loaderSignal = signal
        return request.promise
      },
    })
    const router = createRouter({
      history: memoryHistory(),
      routes: [mountRoute(home, { component: () => null })],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await vi.waitFor(() => expect(loaderSignal).toBeDefined())
    expect(loaderSignal?.aborted).toBe(false)
    roots.pop()?.()
    expect(loaderSignal?.aborted).toBe(true)
    request.resolve('late result')
    await settle()
    expect(router.matches()).toEqual([])
  })

  it('shows a route error and retries its failed loader', async () => {
    let calls = 0
    const retryRoute = route('/retry', {
      loader: () => {
        calls++
        return calls === 1
          ? Promise.reject(new Error('temporary failure'))
          : Promise.resolve('recovered')
      },
    })
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/retry'] }),
      routes: [
        mountRoute(retryRoute, {
          component: () => jsx('p', { children: retryRoute.match().data() }),
          error: ({ error, retry }) =>
            jsx('button', {
              id: 'retry',
              onClick: retry,
              children: `Retry: ${(error as Error).message}`,
            }),
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await vi.waitFor(() =>
      expect(document.querySelector('#retry')).not.toBeNull(),
    )
    expect(router.location()).toBe('/retry')
    expect(document.querySelector('[data-router-status]')?.textContent).toBe(
      'Page failed to load',
    )
    document.querySelector<HTMLButtonElement>('#retry')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('p')?.textContent).toBe('recovered'),
    )
    expect(calls).toBe(2)
  })

  it('routes lazy import failures to the nearest route error view and retries', async () => {
    let attempts = 0
    const lazyRoute = route('/lazy')
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/lazy'] }),
      routes: [
        mountRoute(lazyRoute, {
          lazy: async () => {
            attempts++
            if (attempts === 1) throw new Error('chunk missing')
            return { default: () => jsx('p', { children: 'Lazy ready' }) }
          },
          error: ({ error, retry }) =>
            jsx('button', {
              id: 'retry-lazy',
              onClick: retry,
              children: `Retry: ${(error as Error).message}`,
            }),
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await vi.waitFor(() =>
      expect(document.querySelector('#retry-lazy')).not.toBeNull(),
    )
    document.querySelector<HTMLButtonElement>('#retry-lazy')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('p')?.textContent).toBe('Lazy ready'),
    )
    expect(attempts).toBe(2)
  })

  it('keeps render errors in the DOM ErrorBoundary instead of route loader UI', async () => {
    let routeErrorCalls = 0
    const renderRoute = route('/render-error')
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/render-error'] }),
      routes: [
        mountRoute(renderRoute, {
          component: () => {
            throw new Error('render failure')
          },
          error: () => {
            routeErrorCalls++
            return jsx('p', { children: 'Route loader error' })
          },
        }),
      ],
    })
    roots.push(
      render(
        () =>
          jsx(ErrorBoundary, {
            children: jsx(RouterOutlet, { router }),
            fallback: () =>
              jsx('p', { id: 'dom-error', children: 'DOM error' }),
          }),
        document.body,
      ),
    )
    await vi.waitFor(() =>
      expect(document.querySelector('#dom-error')?.textContent).toBe(
        'DOM error',
      ),
    )
    expect(routeErrorCalls).toBe(0)
  })

  it('delegates loader failures without a route error view to the DOM ErrorBoundary', async () => {
    const failedRoute = route('/unhandled-loader', {
      loader: () => Promise.reject(new Error('loader failure')),
    })
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/unhandled-loader'] }),
      routes: [mountRoute(failedRoute, { component: () => null })],
    })
    roots.push(
      render(
        () =>
          jsx(ErrorBoundary, {
            children: jsx(RouterOutlet, { router }),
            fallback: (error: unknown) =>
              jsx('p', {
                id: 'dom-loader-error',
                children: (error as Error).message,
              }),
          }),
        document.body,
      ),
    )
    await vi.waitFor(() =>
      expect(document.querySelector('#dom-loader-error')?.textContent).toBe(
        'loader failure',
      ),
    )
    expect(router.location()).toBe('/unhandled-loader')
  })
})

describe('loader owner contract', () => {
  it('runs loader cleanup on supersession, replacement, and router disposal', async () => {
    const requests = new Map<string, ReturnType<typeof deferred<string>>>()
    const cleaned: string[] = []
    let owned = true
    const item = route('/items/:id', {
      loader: ({ params }) => {
        try {
          onCleanup(() => cleaned.push(params.id))
        } catch {
          owned = false
        }
        const request = deferred<string>()
        requests.set(params.id, request)
        return request.promise
      },
    })
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/items/a'] }),
      routes: [
        mountRoute(item, {
          component: () => jsx('p', { children: 'item' }),
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await vi.waitFor(() => expect(requests.has('a')).toBe(true))
    requests.get('a')?.resolve('A')
    await vi.waitFor(() => expect(router.matches()[0]?.data).toBe('A'))
    expect(owned).toBe(true)

    void router.navigate({ to: item, params: { id: 'b' } })
    await vi.waitFor(() => expect(requests.has('b')).toBe(true))
    const toC = router.navigate({ to: item, params: { id: 'c' } })
    await vi.waitFor(() => expect(requests.has('c')).toBe(true))
    expect(cleaned).toEqual(['b'])

    requests.get('c')?.resolve('C')
    await toC
    expect(cleaned).toEqual(['b', 'a'])

    router.dispose()
    expect(cleaned).toEqual(['b', 'a', 'c'])
  })
})

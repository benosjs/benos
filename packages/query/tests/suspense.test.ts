// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { effect, signal } from '@benosjs/core'
import { ErrorBoundary, jsx, render } from '@benosjs/dom'
import { startTransition, Suspense } from '@benosjs/async'
import { createQueryCache, query, QueryCacheProvider } from '../src/index.js'
import type { QueryCache } from '../src/index.js'

const roots: Array<() => void> = []
const caches: QueryCache[] = []
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}
afterEach(() => {
  while (roots.length) roots.pop()?.()
  while (caches.length) caches.pop()?.dispose()
  document.body.replaceChildren()
})

function setup() {
  const cache = createQueryCache()
  caches.push(cache)
  const requests = new Map<string, (value: string) => void>()
  const failures = new Map<string, (error: unknown) => void>()
  const fetched: string[] = []
  const project = query({
    fetch: (id: string) =>
      new Promise<string>((resolve, reject) => {
        fetched.push(id)
        requests.set(id, resolve)
        failures.set(id, reject)
      }),
    staleTime: Infinity,
  })
  return { cache, requests, failures, fetched, project }
}

function mount(cache: QueryCache, app: () => unknown): void {
  roots.push(
    render(
      () => jsx(QueryCacheProvider, { cache, children: app }),
      document.body,
    ),
  )
}

describe('query observers with Suspense', () => {
  it('shows the fallback until the entry is ready and gates effects', async () => {
    const { cache, requests, project } = setup()
    const seen: string[] = []
    function Content() {
      const data = project(() => 'a')
      effect(() => seen.push(`effect:${String(data.value())}`))
      return jsx('p', {
        get children() {
          return data.read() ?? 'preparing'
        },
      })
    }
    mount(cache, () =>
      jsx(Suspense, {
        fallback: jsx('span', { children: 'Loading' }),
        children: jsx(Content, {}),
      }),
    )
    expect(document.body.textContent).toBe('Loading')
    expect(seen).toEqual([])
    requests.get('a')?.('Alpha')
    await flushAsync()
    expect(document.body.textContent).toBe('Alpha')
    expect(seen).toContain('effect:Alpha')
  })

  it('switches to a cached entry without showing the fallback', async () => {
    const { cache, requests, fetched, project } = setup()
    const id = signal('a')
    function Content() {
      const data = project(id)
      return jsx('p', {
        get children() {
          return data.read() ?? 'preparing'
        },
      })
    }
    mount(cache, () =>
      jsx(Suspense, {
        fallback: jsx('span', { children: 'Loading' }),
        children: jsx(Content, {}),
      }),
    )
    requests.get('a')?.('Alpha')
    await flushAsync()
    id.set('b')
    // B's value is never shown as A's; the boundary re-suspends a microtask later.
    expect(document.body.textContent).toBe('preparing')
    await flushAsync()
    expect(document.body.textContent).toBe('Loading')
    requests.get('b')?.('Beta')
    await flushAsync()
    expect(document.body.textContent).toBe('Beta')
    id.set('a')
    expect(document.body.textContent).toBe('Alpha')
    await flushAsync()
    expect(document.body.textContent).toBe('Alpha')
    // Re-suspension recreates the content owner; it rejoins B's request.
    expect(fetched).toEqual(['a', 'b'])
  })

  it('keeps the committed view during a transition to an uncached entry', async () => {
    const { cache, requests, project } = setup()
    const id = signal('a')
    function App() {
      const data = project(id)
      function Content() {
        return jsx('p', {
          get children() {
            return data.read() ?? 'pending'
          },
        })
      }
      return jsx(Suspense, {
        fallback: jsx('span', { children: 'Loading' }),
        children: jsx(Content, {}),
      })
    }
    mount(cache, () => jsx(App, {}))
    requests.get('a')?.('Alpha')
    await flushAsync()
    expect(document.body.textContent).toBe('Alpha')
    const transition = startTransition(() => id.set('b'))
    expect(document.body.textContent).toBe('Alpha')
    await flushAsync()
    expect(document.body.textContent).toBe('Alpha')
    requests.get('b')?.('Beta')
    await transition
    expect(document.body.textContent).toBe('Beta')
  })

  it('sends a failure without data to the nearest error boundary', async () => {
    const { cache, failures, project } = setup()
    function Content() {
      const data = project(() => 'a')
      return jsx('p', {
        get children() {
          return data.read() ?? 'preparing'
        },
      })
    }
    mount(cache, () =>
      jsx(ErrorBoundary, {
        fallback: jsx('span', { children: 'Failed' }),
        children: jsx(Suspense, {
          fallback: jsx('span', { children: 'Loading' }),
          children: jsx(Content, {}),
        }),
      }),
    )
    failures.get('a')?.(Object.assign(new Error('missing'), { status: 404 }))
    await flushAsync()
    expect(document.body.textContent).toBe('Failed')
  })

  it('scopes entries to the provided cache', async () => {
    const first = setup()
    const other = createQueryCache()
    caches.push(other)
    function Content() {
      const data = first.project(() => 'a')
      return jsx('p', {
        get children() {
          return data.value() ?? 'none'
        },
      })
    }
    mount(first.cache, () => jsx(Content, {}))
    first.requests.get('a')?.('Alpha')
    await flushAsync()
    expect(first.project.peek('a', first.cache)).toBe('Alpha')
    expect(first.project.peek('a', other)).toBeUndefined()
  })
})

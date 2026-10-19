import { signal } from '@benosjs/core'
import { render } from '@benosjs/dom'
import { startTransition, Suspense } from '@benosjs/async'
import { createQueryCache, query, QueryCacheProvider } from '@benosjs/query'

const host = document.querySelector<HTMLElement>('#app')
if (!host) throw new Error('Query fixture host is missing')
const id = signal('a')
const requests = new Map<string, (value: string) => void>()
let fetches = 0
const project = query({
  fetch: (key: string) => {
    fetches++
    return new Promise<string>((resolve) => requests.set(key, resolve))
  },
  staleTime: Infinity,
})
let cache = createQueryCache()
let dispose: (() => void) | null = null

function Card(): JSX.Element {
  const data = project(id)
  return <p id="content">{data.read() ?? 'preparing'}</p>
}

function mount(): void {
  dispose?.()
  cache.dispose()
  cache = createQueryCache()
  fetches = 0
  requests.clear()
  id.set('a')
  host.replaceChildren()
  dispose = render(
    () => (
      <QueryCacheProvider cache={cache}>
        <Suspense fallback={<span id="fallback">Loading</span>}>
          <Card />
          <Card />
        </Suspense>
      </QueryCacheProvider>
    ),
    host,
  )
}

function resolve(key: string, value: string): void {
  requests.get(key)?.(value)
}

function select(key: string): void {
  id.set(key)
}

function transition(key: string): Promise<void> {
  return startTransition(() => id.set(key))
}

declare global {
  interface Window {
    __benosQuery?: {
      mount: typeof mount
      resolve: typeof resolve
      select: typeof select
      transition: typeof transition
      fetches: () => number
    }
  }
}

window.__benosQuery = {
  mount,
  resolve,
  select,
  transition,
  fetches: () => fetches,
}

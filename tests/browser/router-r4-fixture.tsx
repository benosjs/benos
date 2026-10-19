import { ErrorBoundary, render } from '@benosjs/dom'
import {
  browserHistory,
  createRouter,
  Link,
  mountRoute,
  Outlet,
  route,
  RouterOutlet,
} from '@benosjs/router'

const host = document.querySelector<HTMLElement>('#app')
if (!host) throw new Error('Router R4 fixture host is missing')

const layoutRoute = route('/')
const homeRoute = route('/tests/browser/router-r4-fixture.html')
const itemRoute = route('/r4/items/:id', {
  loader: (context) =>
    new Promise<string>((resolve, reject) => {
      requests.push({
        id: context.params.id,
        signal: context.signal,
        resolve,
        reject,
        complete: false,
      })
    }),
})
const renderErrorRoute = route('/r4/render-error')
const lazyErrorRoute = route('/r4/lazy-error')
const requests: Array<{
  id: string
  signal: AbortSignal
  resolve(value: string): void
  reject(error: Error): void
  complete: boolean
}> = []
let lazyAttempts = 0
let itemMounts = 0

function Layout(): JSX.Element {
  return (
    <main>
      <Outlet />
      <div style={{ height: '1600px' }} />
    </main>
  )
}

function Home(): JSX.Element {
  return (
    <>
      <h1 id="home-heading" data-route-focus>
        Home page
      </h1>
      <Link
        id="item-link"
        to={itemRoute}
        params={{ id: 'a' }}
        style={{ position: 'fixed', top: '12px', insetInlineStart: '12px' }}
      >
        Open item
      </Link>
      <Link id="render-error-link" to={renderErrorRoute}>
        Open render error
      </Link>
    </>
  )
}

function Item(): JSX.Element {
  itemMounts++
  const match = itemRoute.match()
  return (
    <>
      <h1 id="item-heading" data-route-focus>
        Item {match.params().id}
      </h1>
      <p id="item-data">{match.data()}</p>
    </>
  )
}

function RenderFailure(): JSX.Element {
  throw new Error('component render failure')
}

const router = createRouter({
  history: browserHistory(),
  routes: [
    mountRoute(layoutRoute, {
      component: Layout,
      children: [
        mountRoute(homeRoute, { component: Home }),
        mountRoute(itemRoute, {
          component: Item,
          pending: () => <p id="item-pending">Loading item…</p>,
          error: (errorProps) => (
            <section>
              <p role="alert">
                Could not load item: {(errorProps.error as Error).message}
              </p>
              <button id="item-retry" onClick={errorProps.retry}>
                Retry item
              </button>
            </section>
          ),
        }),
        mountRoute(renderErrorRoute, { component: RenderFailure }),
        mountRoute(lazyErrorRoute, {
          lazy: async () => {
            lazyAttempts++
            if (lazyAttempts === 1) throw new Error('chunk unavailable')
            return { default: () => <p id="lazy-ready">Lazy route ready</p> }
          },
          error: (errorProps) => (
            <section>
              <p id="lazy-error" role="alert">
                Lazy route failed: {String(errorProps.error)}
              </p>
              <button id="lazy-retry" onClick={errorProps.retry}>
                Retry lazy route
              </button>
            </section>
          ),
        }),
      ],
    }),
  ],
})
const dispose = render(
  () => (
    <ErrorBoundary
      fallback={(error) => (
        <p id="outer-route-error" role="alert">
          DOM boundary: {String(error)}
        </p>
      )}
    >
      <RouterOutlet router={router} />
    </ErrorBoundary>
  ),
  host,
)

declare global {
  interface Window {
    __routerR4?: {
      count(id: string): number
      complete(id: string, value: string): void
      fail(id: string, message: string): void
      signalAborted(id: string, index: number): boolean
      lazyAttempts(): number
      itemMounts(): number
      openItem(id: string, replace?: boolean): void
      openRenderError(): Promise<void>
      openLazyError(): Promise<void>
      dispose(): void
    }
  }
}

window.__routerR4 = {
  count: (id) => requests.filter((request) => request.id === id).length,
  complete(id, value) {
    const request = requests.find((entry) => entry.id === id && !entry.complete)
    if (!request) throw new Error(`No pending request for ${id}`)
    request.complete = true
    request.resolve(value)
  },
  fail(id, message) {
    const request = requests.find((entry) => entry.id === id && !entry.complete)
    if (!request) throw new Error(`No pending request for ${id}`)
    request.complete = true
    request.reject(new Error(message))
  },
  signalAborted(id, index) {
    return (
      requests.filter((request) => request.id === id)[index]?.signal.aborted ??
      false
    )
  },
  lazyAttempts: () => lazyAttempts,
  itemMounts: () => itemMounts,
  openItem: (id, replace) => {
    void router
      .navigate({
        to: itemRoute,
        params: { id },
        ...(replace === undefined ? {} : { replace }),
      })
      .catch(() => undefined)
  },
  openRenderError: async () => {
    await router.navigate({ to: renderErrorRoute })
  },
  openLazyError: async () => {
    await router.navigate({ to: lazyErrorRoute })
  },
  dispose,
}

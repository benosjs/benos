import { render } from '@benosjs/dom'
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
    new Promise<string>((resolve) => {
      requests.push({
        id: context.params.id,
        signal: context.signal,
        resolve,
        complete: false,
      })
    }),
})
const requests: Array<{
  id: string
  signal: AbortSignal
  resolve(value: string): void
  complete: boolean
}> = []

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
    </>
  )
}

function Item(): JSX.Element {
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
      ],
    }),
  ],
})
const dispose = render(() => <RouterOutlet router={router} />, host)

declare global {
  interface Window {
    __routerR4?: {
      count(id: string): number
      complete(id: string, value: string): void
      signalAborted(id: string, index: number): boolean
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
  signalAborted(id, index) {
    return (
      requests.filter((request) => request.id === id)[index]?.signal.aborted ??
      false
    )
  },
  dispose,
}

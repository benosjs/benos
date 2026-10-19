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
if (!host) throw new Error('Router fixture host is missing')

const rootRoute = route('/')
const homeRoute = route('/tests/browser/router-fixture.html')
const itemRoute = route('/router/items/:id')
let layoutMounts = 0
let itemMounts = 0

function Layout(): JSX.Element {
  layoutMounts++
  return (
    <main>
      <nav>
        <Link id="root-link" to={rootRoute} active="descendant">
          Root
        </Link>
        <Link id="item-link" to={itemRoute} params={{ id: 'a' }}>
          Item A
        </Link>
        <Link
          id="target-link"
          to={itemRoute}
          params={{ id: 'a' }}
          target="_blank"
        >
          New tab
        </Link>
        <Link id="download-link" to={itemRoute} params={{ id: 'a' }} download>
          Download
        </Link>
      </nav>
      <Outlet />
    </main>
  )
}

function Item(): JSX.Element {
  itemMounts++
  const match = itemRoute.match()
  return <p id="item-id">{match.params().id}</p>
}

const router = createRouter({
  history: browserHistory(),
  routes: [
    mountRoute(rootRoute, {
      component: Layout,
      children: [
        mountRoute(homeRoute, {
          component: () => <p id="home">Home</p>,
        }),
        mountRoute(itemRoute, { component: Item }),
      ],
    }),
  ],
  notFound: () => <p id="missing">Missing</p>,
})
const dispose = render(() => <RouterOutlet router={router} />, host)

declare global {
  interface Window {
    __benosRouter?: {
      go(id: string): Promise<void>
      counts(): { layouts: number; items: number }
      dispose(): void
    }
  }
}
window.__benosRouter = {
  async go(id) {
    await router.navigate({ to: itemRoute, params: { id } })
  },
  counts: () => ({ layouts: layoutMounts, items: itemMounts }),
  dispose,
}

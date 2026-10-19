# @benosjs/router

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Typed routes and navigation for Benos. Params are inferred from the path
string, loaders run before a route renders, nested layouts stay mounted, and
navigation manages focus, announcements, and scroll position.

```tsx
import { render } from '@benosjs/dom'
import {
  Link,
  RouterOutlet,
  browserHistory,
  createRouter,
  mountRoute,
  route,
} from '@benosjs/router'

const homeRoute = route('/')
const userRoute = route('/users/:userId', {
  loader: async ({ params, signal }) => {
    const response = await fetch(`/api/users/${params.userId}`, { signal })
    return (await response.json()) as { name: string }
  },
})

const router = createRouter({
  history: browserHistory(),
  routes: [
    mountRoute(homeRoute, {
      component: () => (
        <Link to={userRoute} params={{ userId: '1' }}>
          First user
        </Link>
      ),
    }),
    mountRoute(userRoute, {
      component: () => <h1>{userRoute.match().data().name}</h1>,
    }),
  ],
})

render(() => <RouterOutlet router={router} />, document.querySelector('#app')!)
```

The router uses [`@benosjs/async`](../async/README.md) for loaders. Read the
[router guide](../../docs/router.md) and the
[router design](../../docs/architecture/router.md).

MIT licensed. See [LICENSE](LICENSE).

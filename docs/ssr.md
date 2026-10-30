# Server rendering guide

`@benosjs/server` renders a Benos app to HTML on any runtime with Web APIs
(Node 20+, Bun, Deno, edge workers), and `@benosjs/dom/hydrate` makes that
HTML interactive in the browser by claiming the server's nodes instead of
creating new ones. The same components run on both sides; data crosses to
the browser only when you opt it in.

```sh
npm install @benosjs/server
```

The [architecture document](architecture/ssr.md) holds the full contract;
[docs/ssr-findings.md](ssr-findings.md) has the measurements.

## Render on the server

`renderToString` takes an **app factory**, not an element: it runs once per
request inside a request root, so a router, a query cache, or any other state
created inside it is private to that request.

```tsx
import { renderToString } from '@benosjs/server'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  route,
  RouterOutlet,
} from '@benosjs/router'
import type { RouterHistory } from '@benosjs/router'

const home = route('/')
const Home = () => <h1>Hello from the server</h1>
const createAppRouter = (history: RouterHistory) =>
  createRouter({ history, routes: [mountRoute(home, { component: Home })] })

export async function handle(request: Request, template: string) {
  const url = new URL(request.url)
  const { html, status, headers } = await renderToString(
    () => (
      <RouterOutlet
        router={createAppRouter(
          memoryHistory({ initialEntries: [url.pathname + url.search] }),
        )}
      />
    ),
    { signal: request.signal },
  )
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(
    template.replace('<div id="app"></div>', `<div id="app">${html}</div>`),
    { status, headers },
  )
}
```

`html` is the app's markup between two root markers, followed by a
`<script type="application/json" data-benos="…">` with the serialized data.
Put it inside the element you will hydrate. `status` is `200`, or what the
router set: `404` when the not-found view rendered, `302` with a `Location`
header for a route `redirect`. Aborting `signal` disposes the request and
rejects the promise. An error thrown during setup rejects too; answer with
your own error page.

The example in [`examples/dashboard`](../examples/dashboard) wires this
handler to `node:http` in sixty lines (`scripts/serve.mjs`); Bun runs the
same file.

## Hydrate in the browser

```tsx
import { hydrate } from '@benosjs/dom/hydrate'
import { render } from '@benosjs/dom'
import {
  browserHistory,
  createRouter,
  mountRoute,
  route,
  RouterOutlet,
} from '@benosjs/router'

const home = route('/')
const Home = () => <h1>Hello from the server</h1>
const host = document.querySelector<HTMLElement>('#app') ?? document.body
const app = () => (
  <RouterOutlet
    router={createRouter({
      history: browserHistory(),
      routes: [mountRoute(home, { component: Home })],
    })}
  />
)

// A server-rendered page starts with the root marker.
const serverRendered =
  host.firstChild?.nodeType === Node.COMMENT_NODE &&
  (host.firstChild as Comment).data.startsWith('benos:')
const dispose = serverRendered ? hydrate(app, host) : render(app, host)
```

`hydrate` claims the server's nodes positionally while it runs the same
setup the server ran, attaches event handlers exactly once, and keeps what
the user typed into a field before the page became interactive. User
effects and `onMount` run after the claim. When the app starts a router,
hydration keeps claiming until the router's loaders settle, so routed content
reuses the server's nodes too. Events dispatched before hydration are not
replayed; the browser's defaults apply. It returns the same disposer as
`render`.

If something does not match (the server rendered different markup, or the
page was edited), the nearest dynamic range is client rendered and
`onMismatch` receives `{ path, expected, actual, recovered }`; development
also logs it. Without root markers the whole app is client rendered.

## Opt data in

A resource or query is serialized only when its definition says how. The
server waits for it, records the projection, and the browser seeds the
value before the first render, so it never fetches again.

```tsx
import { signal } from '@benosjs/core'
import { resource } from '@benosjs/async'
import { query } from '@benosjs/query'

interface Project {
  id: string
  name: string
  secret: string
}
interface User {
  name: string
}
declare function getProject(id: string, signal: AbortSignal): Promise<Project>
declare function fetchUser(id: string): Promise<User>

const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
  ssr: {
    id: 'project',
    serialize: (project) => ({ id: project.id, name: project.name }),
    deserialize: (raw) => raw as Project,
  },
})

const userId = signal('1')
const user = resource(() => userId(), fetchUser, {
  ssr: {
    id: 'user',
    key: (id) => id,
    serialize: (user) => ({ name: user.name }),
    deserialize: (raw) => raw as User,
  },
})
```

`id` names the definition across the whole app; a resource's `key` turns its
source into a string the browser checks before it trusts a snapshot.
`serialize` returns the JSON-compatible data you want on the page and nothing
else: a fetched object's private fields never leave the server unless you
copy them. Anything without `ssr` renders its Suspense fallback on the server
and loads in the browser. A fetch that fails on the server also renders the
fallback; the browser retries, and `onError` receives the error.

Route loaders run on the server and, through `projectQuery.load`, fill the
same entries, so a loader-backed page hydrates with its data. A query the
server fetched for a loader without `ssr` is simply loaded again in the
browser.

## Build

Build the client as usual and the server entry with Vite's SSR mode:

```sh
vite build
vite build --ssr src/entry-server.tsx --outDir dist/server
```

`@benosjs/vite` compiles both environments the same way. Keep it that way:
the server renders what the client's components would render, and the two
builds must agree on where every dynamic position is.

## Rules worth knowing

- Create per-request state inside the app factory. Development warns when a
  signal created outside a request is written during one.
- Text inside `<title>` and `<textarea>` may be dynamic; `<script>`,
  `<style>`, and `<noscript>` may not. Structures the HTML parser repairs,
  such as a `<tr>` outside a table section or a block inside `<p>`, are
  rejected in development.
- `<Portal>` content is rendered in the browser, not on the server.
- Ids from `createUniqueId()` and form field ids are the same on both sides.
- There is no streaming in 0.6.0: the page waits for its opted-in data, then
  renders in one piece.

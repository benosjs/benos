# Router guide

`@benosjs/router` adds typed routes, nested layouts, route loaders, pending
navigation, and accessible client navigation to a Benos app. Route params are
inferred from the path string, so a misspelled param or a missing one is a
type error.

```sh
npm install @benosjs/router @benosjs/async
```

The router builds on `@benosjs/async` for loaders, so install both. The
[architecture document](architecture/router.md) holds the full semantics.

## A list and detail app

Routes are declared in two parts. A **route reference** made with `route()`
holds the path, search codec, and loader. A **manifest** made with
`mountRoute()` attaches views and nesting. Keep references in a module that
imports no pages, so pages can import references without creating cycles.

```tsx
import { For, render } from '@benosjs/dom'
import {
  Link,
  Outlet,
  RouterOutlet,
  browserHistory,
  createRouter,
  mountRoute,
  navigation,
  route,
} from '@benosjs/router'

interface Project {
  id: string
  name: string
}

async function fetchProjects(signal: AbortSignal): Promise<Project[]> {
  const response = await fetch('/api/projects', { signal })
  return (await response.json()) as Project[]
}

async function fetchProject(id: string, signal: AbortSignal): Promise<Project> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    signal,
  })
  if (!response.ok) throw new Error(`Project ${id} failed: ${response.status}`)
  return (await response.json()) as Project
}

// routes/refs.ts: references only, no page imports.
const rootRoute = route('/')
const homeRoute = route('/')
const projectsRoute = route('/projects')
const projectListRoute = route('/projects', {
  loader: ({ signal }) => fetchProjects(signal),
})
const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => fetchProject(params.projectId, signal),
})

// layouts and pages
function AppLayout() {
  const pending = navigation()
  return (
    <div class="app">
      <nav>
        <Link to={homeRoute} active="exact">
          Home
        </Link>
        <Link to={projectsRoute}>Projects</Link>
      </nav>
      <p role="status">{pending().status === 'loading' ? 'Loading…' : ''}</p>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

function ProjectsLayout() {
  return (
    <section>
      <h1 data-route-focus>Projects</h1>
      <Outlet />
    </section>
  )
}

function ProjectList() {
  const match = projectListRoute.match()
  return (
    <ul>
      <For each={match.data()} by={(project) => project.id}>
        {(project) => (
          <li>
            <Link to={projectRoute} params={{ projectId: project().id }}>
              {project().name}
            </Link>
          </li>
        )}
      </For>
    </ul>
  )
}

function ProjectDetail() {
  const match = projectRoute.match()
  return (
    <article>
      <h2>{match.data().name}</h2>
      <p>ID: {match.params().projectId}</p>
    </article>
  )
}

// routes/manifest.tsx
const router = createRouter({
  history: browserHistory(),
  routes: [
    mountRoute(rootRoute, {
      component: AppLayout,
      pending: () => <p role="status">Loading…</p>,
      children: [
        mountRoute(homeRoute, {
          index: true,
          component: () => <h1 data-route-focus>Home</h1>,
        }),
        mountRoute(projectsRoute, {
          component: ProjectsLayout,
          children: [
            mountRoute(projectListRoute, {
              index: true,
              component: ProjectList,
            }),
            mountRoute(projectRoute, {
              component: ProjectDetail,
              error: (failure) => (
                <div role="alert">
                  <p>{String(failure.error)}</p>
                  <button onClick={failure.retry}>Retry</button>
                </div>
              ),
            }),
          ],
        }),
      ],
    }),
  ],
  notFound: () => <h1 data-route-focus>Page not found</h1>,
})

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <RouterOutlet router={router} />, host)
```

A few things to notice:

- `params={{ projectId: project.id }}` is checked against the path. Writing
  `params={{ id: project.id }}` or omitting `params` fails to type-check.
- `match.data()` has the loader's awaited return type. It is never
  `undefined` inside a committed route, so no non-null assertion is needed.
- Both projects routes render inside `ProjectsLayout` through its `<Outlet>`.
  The layout stays mounted while you move between the list and a project.

In a real app, replace `component` with `lazy: () => import('./pages/x.js')`
so each page is a separate chunk. A lazy module must export the component as
`default`.

## Read route state in bindings

Components run once. `route.match()` returns accessors, and those accessors
only stay live when they are read inside JSX or an effect.

```tsx
import { effect } from '@benosjs/core'
import { route } from '@benosjs/router'

const projectRoute = route('/projects/:projectId')

export function ProjectHeader() {
  const match = projectRoute.match()

  // Snapshot: this value never changes after setup.
  const firstId = match.params().projectId
  void firstId

  // Live: this effect reruns when navigation changes the param.
  effect(() => {
    document.title = `Project ${match.params().projectId}`
  })

  // Live: this binding updates in place without remounting the component.
  return <h1>Project {match.params().projectId}</h1>
}
```

Navigating from `/projects/a` to `/projects/b` keeps the same component
instance. Params, search, and loader data update together in one batch, so a
binding never sees the new param with the old data.

## Search params

A route can declare a codec. Links and `navigate()` then require the parsed
type, and `match.search()` returns it.

```tsx
import { Link, route } from '@benosjs/router'

type Tab = 'details' | 'members'

const projectRoute = route('/projects/:projectId', {
  search: {
    parse: (raw: URLSearchParams): { tab: Tab } => ({
      tab: raw.get('tab') === 'members' ? 'members' : 'details',
    }),
    stringify: (value: { tab: Tab }) => new URLSearchParams({ tab: value.tab }),
  },
})

export function MembersLink(props: { projectId: string }) {
  return (
    <Link
      to={projectRoute}
      params={{ projectId: props.projectId }}
      search={{ tab: 'members' }}
    >
      Members
    </Link>
  )
}
```

If `parse` throws, the navigation is rejected and the current page stays
visible.

## Navigate from code

Capture the router during component setup, then use it in event handlers.
`navigate()` resolves to `committed`, `redirected`, or `superseded`. A newer
navigation supersedes an older one instead of throwing.

```tsx
import { getRouter, route } from '@benosjs/router'

const projectRoute = route('/projects/:projectId')

export function OpenProject(props: { projectId: string }) {
  const router = getRouter()
  async function open() {
    const result = await router.navigate({
      to: projectRoute,
      params: { projectId: props.projectId },
    })
    if (result.status === 'committed') console.info('Opened', result.location)
  }
  return <button onClick={() => void open()}>Open</button>
}
```

## Loading, errors, and boundaries

The first load shows the nearest route `pending` view. Later navigations keep
the current page visible and set `navigation().status` to `loading` until the
destination's loaders and lazy imports finish. Screen readers hear a polite
status message while loading.

Errors go to one of two places:

| Error source                       | Where it goes                                      |
| ---------------------------------- | -------------------------------------------------- |
| A loader rejects                   | The nearest matched route `error` view, with retry |
| A lazy import fails                | The nearest matched route `error` view, with retry |
| Search `parse` throws              | Navigation is rejected and the old page stays      |
| A component throws while rendering | The nearest DOM `<ErrorBoundary>`                  |
| A route has no `error` view        | The nearest DOM `<ErrorBoundary>` at the outlet    |

`failure.retry()` starts a fresh attempt for the same destination.

## Accessibility and scrolling

After each committed navigation, focus moves to the element marked with
`data-route-focus`, or to the outlet if none exists. The router announces the
focused heading, or the document title, in a polite live region. Push
navigation scrolls to the top or to the URL hash. Back and forward restore
the saved scroll position for that history entry.

`<Link>` renders a real `<a href>`. Modified clicks, middle clicks, `target`,
and `download` keep native browser behavior. The current link gets
`aria-current="page"`. Set `active="exact"` to match only the exact path.

## Test routes without a browser

`memoryHistory()` runs the router in Vitest without `window.location`.

```tsx
import { render } from '@benosjs/dom'
import {
  RouterOutlet,
  createRouter,
  memoryHistory,
  mountRoute,
  route,
} from '@benosjs/router'

const userRoute = route('/users/:userId')

export async function renderUserPage(host: HTMLElement) {
  const history = memoryHistory({ initialEntries: ['/users/1'] })
  const router = createRouter({
    history,
    routes: [
      mountRoute(userRoute, {
        component: () => <p>User {userRoute.match().params().userId}</p>,
      }),
    ],
  })
  const dispose = render(() => <RouterOutlet router={router} />, host)
  await router.navigate({ to: userRoute, params: { userId: '2' } })
  return { dispose, text: host.textContent }
}
```

## Limits in 0.4

- Loader results are not cached or deduplicated across navigations. The
  planned query package will add caching and invalidation.
- Optional params and regex segments are not supported. A terminal named
  splat such as `/files/*path` is.
- Server rendering is not implemented. The router reads no browser globals at
  import time, so it can be server rendered later.

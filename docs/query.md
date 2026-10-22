# Query guide

`@benosjs/query` is a typed cache for server data. A query definition names
one cache entry per argument. Components and route loaders that ask for the
same entry share one request and one value; mutations say which entries they
change, and the cache refreshes them.

```sh
npm install @benosjs/query
```

The [architecture document](architecture/query.md) holds the full semantics.

## Define a query

`query()` takes a `fetch` function. Its first parameter is the argument that
identifies an entry; its return type is the entry's data. Both are inferred.

```tsx
import { query } from '@benosjs/query'

interface Project {
  id: string
  name: string
}

export const projectQuery = query({
  fetch: async (id: string, { signal }) => {
    const response = await fetch(`/api/projects/${id}`, { signal })
    if (!response.ok)
      throw Object.assign(new Error(response.statusText), {
        status: response.status,
      })
    return (await response.json()) as Project
  },
})
```

The definition object is the cache namespace, so two queries can both take an
`id` without colliding, and there are no string keys to keep in sync.
Arguments are compared by value: object fields are sorted, and fields set to
`undefined` are ignored. An argument that is not plain data, such as a
`Date`, needs a `key` function that returns plain data.

A query without arguments leaves its first parameter unannotated:
`query({ fetch: (_, { signal }) => loadSettings(signal) })`. It is called
with no argument.

## Read a query in a component

Call the definition with a tracked source, like `resource()`. Returning
`false`, `null`, or `undefined` from the source disables the query.

```tsx
import { signal } from '@benosjs/core'
import { Show } from '@benosjs/dom'
import { query } from '@benosjs/query'

interface Project {
  id: string
  name: string
}

const projectQuery = query({
  fetch: async (id: string, { signal }) => {
    const response = await fetch(`/api/projects/${id}`, { signal })
    return (await response.json()) as Project
  },
})

export function ProjectCard() {
  const projectId = signal('p-1')
  const project = projectQuery(() => projectId())
  return (
    <section>
      <Show when={project.state().status === 'failed'}>
        <p role="alert">Could not load the project.</p>
      </Show>
      <Show when={project.value()} fallback={<p>Loading…</p>}>
        {(current) => <h2>{current().name}</h2>}
      </Show>
      <p>{project.fetching() ? 'Refreshing…' : ''}</p>
      <button onClick={() => void project.refresh()}>Reload</button>
    </section>
  )
}
```

An observer is a `resource()` too: `read()` works with `<Suspense>`, and an
argument change inside `startTransition()` keeps the current view until the
next entry is ready.

| Observer field   | Meaning                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `value()`        | The current argument's data, or `undefined`. Never another argument's data.                            |
| `state()`        | `disabled`, `pending` (no data yet), `ready` (has data, even while refreshing), or `failed` (no data). |
| `fetching()`     | True during any request, including background refreshes and retries.                                   |
| `error()`        | The last request error, even while older data is still shown.                                          |
| `failureCount()` | Failed attempts of the current request, for a "Retrying…" message.                                     |

A failed background refresh keeps `state()` at `ready` and the old data on
screen; it is reported through `error()`.

## Freshness and garbage collection

| Option      | Default      | Meaning                                                            |
| ----------- | ------------ | ------------------------------------------------------------------ |
| `staleTime` | `5_000` ms   | How long data is fresh. Fresh data is reused without a request.    |
| `gcTime`    | `300_000` ms | How long an unused entry stays cached.                             |
| `refetchOn` | none         | `{ focus: true, reconnect: true }` refreshes stale entries in use. |

Stale data is shown at once and refreshed in the background when a component
starts using it, when a route loads it, or when it is invalidated. The 5 s
default avoids fetching twice when a route loader and a component read the
same entry. Mutations invalidate what they affect immediately, so the window
never shows data that a mutation made stale.

## Retries

Queries retry **transient** failures up to two times, after about 300 ms and
900 ms with jitter. Mutations never retry. A fetcher reports an HTTP status
by attaching a numeric `status` to the error it throws, as the examples
above do; `retryAfter` (seconds, or the raw `Retry-After` header) is honored
up to 30 s.

| Failure                                                 | Retried |
| ------------------------------------------------------- | ------- |
| `TypeError` from `fetch` (offline, DNS, CORS)           | Yes     |
| `TimeoutError`, HTTP 408, 429, and 500–599              | Yes     |
| Other 4xx, `AbortError`, errors with `retryable: false` | No      |
| Any other error                                         | No      |

`retry: false`, `retry: 4`, or `retry: (failureCount, error) => boolean`
changes the policy per query; `isTransientError(error)` exposes the default
classification for your own predicate. An observer stays `pending` between
attempts. Retries are new in 0.5 and apply to queries only; `resource()` still
never retries.

## Use queries in route loaders

`load()` resolves to the cache entry once it has data. Return it from a
route loader:

```tsx
import { route } from '@benosjs/router'
import { query } from '@benosjs/query'

interface Project {
  id: string
  name: string
}

const projectQuery = query({
  fetch: async (id: string, { signal }) => {
    const response = await fetch(`/api/projects/${id}`, { signal })
    return (await response.json()) as Project
  },
})

export const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})

export function ProjectPage() {
  const match = projectRoute.match()
  return <h1>{match.data().value().name}</h1>
}
```

`match.data()` is the entry and `value()` is its live data, typed as
`Project`. Because route data comes from the cache:

- A revisit with fresh data commits without a request; stale data commits at
  once and refreshes in place.
- An entry a mutation invalidated waits for fresh data, so the page never
  shows the version from before a save.
- A mutation that affects the current page updates `value()` in place,
  without a navigation or a remount.
- The router still commits params and data together, so one record's data is
  never shown with another record's params.

The route keeps its entry cached while it is shown. Loaders use the default
cache; pass another as the third argument, `load(id, signal, cache)`.

## Change data with mutations

A mutation declares its effects on the cache instead of calling it:

- `writes` stores values the server returned, typed by the query.
- `affects` lists entries to refresh: a query (all its entries), a
  `query.key(args)`, or `query.where(predicate)`. Raw strings and arrays are
  type errors.
- `optimistic` writes values immediately. They are rolled back if the run
  fails, unless something newer has changed the entry, in which case the
  entry is refreshed instead.

```tsx
import { signal } from '@benosjs/core'
import { mutation, query } from '@benosjs/query'

interface Project {
  id: string
  name: string
  starred: boolean
}

async function send(url: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: 'PUT',
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok)
    throw Object.assign(new Error(response.statusText), {
      status: response.status,
    })
  return (await response.json()) as Project
}

const projectQuery = query({
  fetch: async (id: string, { signal }) => {
    const response = await fetch(`/api/projects/${id}`, { signal })
    return (await response.json()) as Project
  },
})
const projectsQuery = query({
  fetch: async (_, { signal }) => {
    const response = await fetch('/api/projects', { signal })
    return (await response.json()) as Project[]
  },
})

const renameProject = mutation({
  run: (input: { id: string; name: string }, { signal }) =>
    send(`/api/projects/${input.id}`, { name: input.name }, signal),
  writes: (input, saved) => [projectQuery.key(input.id).set(saved)],
  affects: () => [projectsQuery],
})

const starProject = mutation({
  run: (input: { id: string; starred: boolean }, { signal }) =>
    send(`/api/projects/${input.id}/star`, input, signal),
  optimistic: (input) => [
    projectQuery
      .key(input.id)
      .update((project) => ({ ...project, starred: input.starred })),
  ],
  affects: (input) => [projectQuery.key(input.id), projectsQuery],
})

export function RenameForm(props: { id: string; name: string }) {
  const rename = renameProject()
  const star = starProject()
  const name = signal(props.name)
  const status = () => {
    const state = rename.state()
    if (state.status === 'pending') return 'Saving…'
    if (state.status === 'failed') return 'Could not save.'
    return state.status === 'succeeded' ? 'Saved.' : ''
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void rename.run({ id: props.id, name: name() })
      }}
    >
      <input
        value={name()}
        onInput={(event) => name.set(event.currentTarget.value)}
      />
      <button type="submit" disabled={rename.pending()}>
        Save
      </button>
      <button
        type="button"
        onClick={() => void star.run({ id: props.id, starred: true })}
      >
        Star
      </button>
      <p role="status">{status()}</p>
    </form>
  )
}
```

`run()` never rejects. It resolves to `{ ok: true, value }` or
`{ ok: false, error, cancelled }`, and the handle's `state()` and
`pending()` signals describe the latest run, so event handlers need no
`try/catch`. A failed run refreshes nothing. `cancel()` aborts a run; if the
server's outcome is unknown, optimistic writes roll back and the affected
entries refresh, with `affects` receiving `output` as `undefined`. Unmounting
a component never aborts its runs: a save that finishes after navigation
still updates the cache. Outside components, call `renameProject.run(input)`.

## Caches

The browser has one default cache. `createQueryCache()` makes an isolated
one, for tests or for several apps on a page; provide it with
`<QueryCacheProvider cache={cache}>`. `queryCache()` returns the cache in
scope, whose `invalidate(...targets)` and `write(...writes)` handle events
from outside the app, such as a websocket message. `dispose()` aborts its
requests and timers.

## Coming from TanStack Query

| TanStack Query                                   | Benos                                                         |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `useQuery({ queryKey, queryFn })`                | `projectQuery(() => id())` with a `query()` definition        |
| `queryClient.ensureQueryData(options)` in loader | `projectQuery.load(id, signal)`; route data is the entry      |
| `invalidateQueries({ queryKey })`                | `affects: () => [projectQuery.key(id)]` on the mutation       |
| `setQueryData` in `onSuccess`                    | `writes: (input, saved) => [projectQuery.key(id).set(saved)]` |
| `onMutate` / `onError` rollback                  | `optimistic` writes with automatic rollback                   |
| `mutateAsync` with `try/catch`                   | `run()` resolves to `{ ok, … }`; read `state()`               |
| `staleTime: 0`, 3 retries on any error           | `staleTime: 5_000`, 2 retries of transient failures           |

## Limits in 0.5

There are no infinite or paginated queries, `select` projections (use
`computed`), structural sharing, persistence, polling intervals, or
devtools. Server rendering is not implemented; the cache API reserves it with
the same opt-in serialization rule as `resource()`.

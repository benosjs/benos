# Async guide

`@benosjs/async` connects promises to Benos signals. It provides
`resource()` for owned, cancellable data loading, `<Suspense>` for loading
fallbacks, and `startTransition()` for keeping the current view while new
content prepares.

```sh
npm install @benosjs/async
```

The [architecture document](architecture/async.md) holds the full semantics.

## Load data with `resource()`

A resource takes a tracked **source** and a **fetcher**. When the source
changes, the resource aborts the previous request and starts a new one. Only
the newest request can write its result, so a slow response for an old key
never overwrites a newer one.

```tsx
import { signal } from '@benosjs/core'
import { Show } from '@benosjs/dom'
import { resource } from '@benosjs/async'

interface User {
  id: string
  name: string
}

export function UserCard() {
  const userId = signal('1')
  const user = resource(
    () => userId(),
    async (id, { signal }) => {
      const response = await fetch(`/api/users/${id}`, { signal })
      if (!response.ok) throw new Error(`User ${id}: ${response.status}`)
      return (await response.json()) as User
    },
  )

  return (
    <section>
      <button onClick={() => userId.set(String(Number(userId()) + 1))}>
        Next user
      </button>
      <Show when={user.state().status === 'failed'}>
        <p role="alert">Could not load the user.</p>
      </Show>
      <Show when={user.value()} fallback={<p>Loading…</p>}>
        {(current) => <h2>{current().name}</h2>}
      </Show>
      <button onClick={() => void user.refresh()}>Reload</button>
    </section>
  )
}
```

`state()` is one of four values:

| `status`   | Meaning                                                   |
| ---------- | --------------------------------------------------------- |
| `disabled` | The source returned `false`, `null`, or `undefined`.      |
| `pending`  | A request for the current key is in flight.               |
| `ready`    | The latest request succeeded.                             |
| `failed`   | The latest request failed. `state().error` has the cause. |

`value()` keeps the last successful value through `pending`, `failed`, and
`disabled`, so the UI can show stale data while it reloads.

The resource belongs to the component that created it. When that component
is removed, any in-flight request is aborted and its result is ignored. Pass
the `signal` from the fetcher context to `fetch` so the network request
actually stops.

## Skip loading until a key exists

Return `false`, `null`, or `undefined` from the source to pause the resource.

```tsx
import { signal } from '@benosjs/core'
import { resource } from '@benosjs/async'

export function SearchResults() {
  const query = signal('')
  const results = resource(
    () => (query().length >= 2 ? query() : null),
    async (text, { signal }) => {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(text)}`,
        {
          signal,
        },
      )
      return (await response.json()) as string[]
    },
    { initialValue: [] },
  )
  return (
    <div>
      <input
        value={query()}
        onInput={(event) => query.set(event.currentTarget.value)}
      />
      <p>{results.value().length} results</p>
    </div>
  )
}
```

`initialValue` makes `value()` return `string[]` instead of
`string[] | undefined`.

## Show a fallback with `<Suspense>`

`read()` is like `value()`, but it also tells the nearest `<Suspense>` that
this part of the page is still loading. The boundary shows its fallback until
every resource read inside it is ready, then reveals the content all at once.

```tsx
import { Suspense, resource } from '@benosjs/async'

function Profile() {
  const profile = resource(
    () => 'me',
    async (_key, { signal }) => {
      const response = await fetch('/api/me', { signal })
      return (await response.json()) as { name: string }
    },
  )
  return <h1>{profile.read()?.name}</h1>
}

export function ProfilePage() {
  return (
    <Suspense fallback={<p>Loading profile…</p>}>
      <Profile />
    </Suspense>
  )
}
```

Effects and `onMount` callbacks inside a boundary wait until its content is
revealed. If a resource read with `read()` fails, the error goes to the
nearest `<ErrorBoundary>`.

## Keep the current view with `startTransition()`

Wrap a state change in `startTransition()` to keep the already visible
content on screen while the new content loads behind it. Without a
transition, the boundary would switch back to its fallback.

```tsx
import { signal } from '@benosjs/core'
import { Suspense, resource, startTransition } from '@benosjs/async'

function Tab(props: { name: string }) {
  const content = resource(
    () => props.name,
    async (name, { signal }) => {
      const response = await fetch(`/api/tabs/${name}`, { signal })
      return response.text()
    },
  )
  return <article>{content.read()}</article>
}

export function Tabs() {
  const tab = signal('overview')
  return (
    <div>
      <button onClick={() => void startTransition(() => tab.set('activity'))}>
        Activity
      </button>
      <Suspense fallback={<p>Loading…</p>}>
        <Tab name={tab()} />
      </Suspense>
    </div>
  )
}
```

The promise from `startTransition()` resolves after the new content is
revealed. A newer transition replaces an older one that has not finished.

## Limits in 0.4

- There is no shared cache, deduplication, or retry policy. Each resource
  owns its own request. The planned query package adds those.
- A resource has no write method. Change its source or call `refresh()`.
- Server rendering and resource serialization are designed but not
  implemented.

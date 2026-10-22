# @benosjs/query

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

A typed query cache for Benos. A query definition names a shared cache entry
per argument, deduplicates requests, serves fresh data from the cache,
revalidates stale data in the background, and retries transient failures.
Observers work with `<Suspense>` and transitions like a `resource()`.

```tsx
import { Suspense } from '@benosjs/async'
import { query } from '@benosjs/query'

const projectQuery = query({
  fetch: async (id: string, { signal }) => {
    const response = await fetch(`/api/projects/${id}`, { signal })
    if (!response.ok)
      throw Object.assign(new Error(response.statusText), {
        status: response.status,
        retryAfter: response.headers.get('Retry-After') ?? undefined,
      })
    return (await response.json()) as { name: string }
  },
})

function Project(props: { id: string }) {
  const project = projectQuery(() => props.id)
  return <h1>{project.read()?.name}</h1>
}

export const App = () => (
  <Suspense fallback={<p>Loading…</p>}>
    <Project id="p-1" />
  </Suspense>
)
```

Defaults: data is fresh for 5 seconds, unused entries are kept for 5 minutes,
and queries retry network errors, timeouts, and HTTP 408, 429, and 5xx up to
two times. Other errors fail at once. Mutations, cache writes, and route
loader integration are in progress for 0.5.0. The design is in
[docs/architecture/query.md](https://github.com/benosjs/benos/blob/main/docs/architecture/query.md).

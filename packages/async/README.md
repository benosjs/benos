# @benosjs/async

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Owned async resources, Suspense, and transitions for Benos. A resource loads
data from a tracked key, aborts superseded requests, keeps stale values while
it reloads, and stops when its owner is disposed.

```tsx
import { signal } from '@benosjs/core'
import { Suspense, resource } from '@benosjs/async'

function User(props: { id: string }) {
  const user = resource(
    () => props.id,
    async (id, { signal }) => {
      const response = await fetch(`/api/users/${id}`, { signal })
      return (await response.json()) as { name: string }
    },
  )
  return <h1>{user.read()?.name}</h1>
}

const id = signal('1')
export const App = () => (
  <Suspense fallback={<p>Loading…</p>}>
    <User id={id()} />
  </Suspense>
)
```

Read the [async guide](../../docs/async.md) and the
[async design](../../docs/architecture/async.md).

MIT licensed. See [LICENSE](LICENSE).

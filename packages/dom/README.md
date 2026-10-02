# @benosjs/dom

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/benos-logo.png)

The fine-grained DOM renderer and component runtime for Benos. It provides
`render`, JSX control flow, props helpers, portals, error boundaries, refs,
delegated events, and owner-scoped cleanup.

```tsx
import { For, render, Show } from '@benosjs/dom'

function App() {
  return (
    <Show when={true} fallback={<p>Loading</p>}>
      <For each={[1, 2]}>{(item) => <span>{item()}</span>}</For>
    </Show>
  )
}

render(() => <App />, document.querySelector('#app')!)
```

Use it with the [Benos Vite plugin](../vite/README.md) and compiler. See the
[renderer design](../../docs/architecture/renderer.md).

MIT licensed. See [LICENSE](LICENSE).

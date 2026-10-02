# v0.1 API reference

Application code imports only the package roots listed here. The
`@benosjs/dom/internal` and `@benosjs/core/internal` subpaths are compiler/runtime
implementation seams and are rejected by the application import CI check.

## `@benosjs/core`

### Signals and derivations

- `signal<T>(initial, options?)` returns a callable `Signal<T>` with `set`,
  `update`, and `readonly` methods. `SignalOptions` accepts an `equals`
  comparator and an optional debug `name`.
- `computed<T>(read)` returns a lazy, cached `ReadonlySignal<T>`.
- `effect(read)` registers a user-tier effect and returns its disposer. Effects
  that read no sources after their first run are detached.
- `batch(fn)` groups writes into one scheduler flush and returns `fn`'s value.
- `untrack(fn)` runs a read without adding dependencies.

```tsx
import { batch, computed, effect, signal } from '@benosjs/core'

const first = signal('Ada')
const last = signal('Lovelace')
const full = computed(() => `${first()} ${last()}`)
const dispose = effect(() => console.log(full()))
batch(() => {
  first.set('Grace')
  last.set('Hopper')
})
dispose()
```

### Ownership and lifecycle

- `createRoot(fn)` creates an owner and passes `fn` a disposer. Child effects,
  computeds, contexts, listeners, refs, and cleanups belong to that owner.
- `onCleanup(fn)` registers teardown for the current owner. It is called in
  reverse registration order.
- `onMount(fn)` runs after the associated component range is in the live
  document. A detached host makes this asynchronous; disposing first cancels
  it.
- `createContext<T>(defaultValue)` returns a typed context with a `Provider`
  component. `getContext(context)` reads the nearest owner value and throws
  outside an owner. Provider reads its value once and warns if that value later
  changes.

## `@benosjs/dom`

### Root rendering and descriptors

- `render(app, host)` mounts one owned range and returns a disposer.
- `Child`, `Component<P>`, `JSX.Element`, `Fragment`, `jsx`, `jsxs`, and
  `jsxDEV` describe elements and components. The compiler emits these helpers;
  application code normally writes TSX.
- `template`, `instantiate`, `component`, and `dynamicChild` are the public
  descriptor helpers used by compiler integrations.
- `splitProps(props, keys...)` returns live getter-backed views and a rest view;
  literal key arrays retain their literal types.
- `mergeProps(...sources)` uses rightmost-source precedence and preserves
  getter reads.
- `children(source)` memoizes a child accessor and reports development-time
  double mounting of the same child value.

### Control flow

- `<Show when fallback?>` selects a child; a function child receives a typed
  accessor for the narrowed value.
- `<For each by? fallback?>` reconciles keyed items. Its child receives
  `item()` and `index()` accessors; index access is lazy.
- `<Switch fallback?>` selects the first truthy `<Match when>` child.
- `<Dynamic component>` renders an intrinsic tag or component selected by a
  binding.
- `<Portal mount>` places children in another `Node` while retaining owner
  lifetime at the declaration site.
- `<ErrorBoundary fallback resetKeys?>` routes descendant errors to a value or
  `(error, reset)` callback. Reset remounts the child scope.

```tsx
import { ErrorBoundary, For, Show, render } from '@benosjs/dom'

function List(props: { ready: boolean; rows: readonly string[] }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <button onClick={reset}>{String(error)}</button>
      )}
    >
      <Show when={props.ready} fallback={<p>Loading</p>}>
        <For each={props.rows} by={(row) => row} fallback={<p>Empty</p>}>
          {(row, index) => (
            <p>
              {index()}: {row()}
            </p>
          )}
        </For>
      </Show>
    </ErrorBoundary>
  )
}

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <List ready rows={['a', 'b']} />, host)
```

### JSX attributes and refs

Intrinsic types are generated from standard HTML, SVG, MathML, and ARIA
registries. Use `class`, `for`, `aria-*`, and `data-*`; `className` and
`htmlFor` are diagnostics. `value`, `checked`, and `selected` update DOM
properties. URL-bearing attributes reject dangerous schemes. A callback `ref`
receives one concrete, non-null element and registers teardown with
`onCleanup`; it is never called with `null`.

## `@benosjs/compiler`

- `transformJsx(source, { filename, development?, optimization? })` returns
  compiled code, a source map, and diagnostics. `optimization` is `'none'` or
  `'safe'`; both modes share behavior fixtures.
- `formatDiagnostics(diagnostics)` formats source locations.
- `Optimization`, `TransformOptions`, `SourceLocation`, `Diagnostic`,
  `RawSourceMap`, and `TransformResult` are exported types.

Development plans are readable objects. Production plans use compact tuples.
The transform preserves source positions and rejects already-lowered JSX and
`await`/`yield` in synchronous bindings.

## `@benosjs/vite`

`benos(options?)` returns a Vite plugin with `include`, `exclude`, and
`optimization` options. It runs with `enforce: 'pre'`, composes source maps,
and forwards development diagnostics. Put it before any other JSX transform.

## `@benosjs/eslint-plugin`

The default export contains `no-props-destructuring`. Enable it in an ESLint
flat configuration:

```ts
import benos from '@benosjs/eslint-plugin'

export default [
  {
    plugins: { benos },
    rules: { 'benos/no-props-destructuring': 'error' },
  },
]
```

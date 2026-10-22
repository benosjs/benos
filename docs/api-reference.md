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
- `createUniqueId()` returns a stable-format unique string and requires an
  active owner. The client implementation uses a module-wide monotonic counter,
  shared by all roots in that core instance. The no-argument signature is
  reserved for deterministic server IDs derived from a request/root namespace,
  owner-tree path, and per-owner call ordinal during future SSR.
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
  accessor for the narrowed value. While `when` stays present, the branch is
  kept and the accessor tracks the latest value.
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

### Styled registry components

`Dialog`, `Popover`, and `DropdownMenu` render a native trigger button styled
with the same Button classes by default (`secondary`, medium). Set
`triggerVariant`, `triggerSize`, and `triggerClass` to choose another default
style. Their `trigger` prop can also be a render callback when you need to use a
custom Button component. Spread the supplied button props onto the custom
button so the primitive's ARIA attributes, handlers, and ref stay connected:

```tsx
import { Button } from '@/components/button'
import { Dialog } from '@/components/dialog'

;<Dialog
  title="Edit profile"
  trigger={(triggerProps) => (
    <Button {...triggerProps} variant="outline">
      Edit profile
    </Button>
  )}
>
  <p>Update your profile details.</p>
</Dialog>
```

The registry installer adds the Button stylesheet dependency for these
triggers. Tooltip triggers are keyboard-focusable buttons with a visible info
icon. Table captions, headers, empty messages, and cells use automatic text
direction so mixed Arabic and English text keeps its natural reading direction.

### JSX attributes and refs

Intrinsic types are generated from standard HTML, SVG, MathML, and ARIA
registries. Use `class`, `for`, `aria-*`, and `data-*`; `className` and
`htmlFor` are diagnostics. `value`, `checked`, and `selected` update DOM
properties. URL-bearing attributes reject dangerous schemes. A callback `ref`
receives one concrete, non-null element and registers teardown with
`onCleanup`; it is never called with `null`.

## `@benosjs/router`

- `route(path, options?)` creates a typed route reference. Optional search
  codecs infer the accepted link/search shape. A loader receives typed params,
  parsed search, an `AbortSignal`, and the router context; its awaited return
  type is exposed by `route.match().data()` inside that route's rendered owner.
- `mountRoute(ref, { component, lazy, children, pending, error })` attaches
  presentation and nested route definitions. Route components render only
  after their matched loaders and lazy imports are ready. A same-route params
  update keeps the route owner and updates params, search, and data together.
- `createRouter({ routes, history, context?, notFound? })` creates an
  instance. `context` is frozen before it is passed to loaders. `memoryHistory`
  is available for tests and non-browser use; `browserHistory` supplies links,
  back/forward, and per-entry scroll restoration.
- `<RouterOutlet router>` provides route context and renders the active route.
  `<Outlet>` renders a child route. `route.match()` reads only from the owner
  belonging to that route reference.
- `<Link to params? search? hash? replace?>` renders a real anchor with `href`
  and `aria-current`. Modified clicks, non-primary clicks, downloads, and
  non-self targets keep native browser behavior. After client navigation the
  router announces the route heading, focuses `[data-route-focus]` (or the
  main landmark), and scrolls to the top or hash; browser back/forward restores
  the saved scroll position.
- A route `pending` view appears during the first load. Later navigation keeps
  the current view visible and exposes `navigation().status === 'loading'`.
  Loader and lazy-import failures render the nearest route `error` view with a
  `retry()` callback. Without one, errors reach the DOM `ErrorBoundary`.
  Search parse failures reject navigation and preserve the last committed
  route.
- Loader data is exposed read-only, but function members stay callable, so a
  loader may return a query entry whose `value()` is live. A loader runs under
  a per-match owner: `onCleanup` registered while it runs fires when the
  navigation is superseded, the match is replaced, or the router is disposed.

```tsx
import {
  browserHistory,
  createRouter,
  Link,
  mountRoute,
  route,
  RouterOutlet,
} from '@benosjs/router'

const projectRoute = route('/projects/:projectId', {
  loader: async ({ params, signal }) => {
    const response = await fetch(`/api/projects/${params.projectId}`, {
      signal,
    })
    if (!response.ok) throw new Error('Project could not be loaded')
    return (await response.json()) as { name: string }
  },
})

const router = createRouter({
  history: browserHistory(),
  routes: [
    mountRoute(projectRoute, {
      component: ProjectPage,
      pending: () => <p>Loading project…</p>,
      error: ({ error, retry }) => (
        <button onClick={retry}>{String(error)} — retry</button>
      ),
    }),
  ],
})

function ProjectPage() {
  const project = projectRoute.match()
  return (
    <main>
      <h1 data-route-focus>{project.data().name}</h1>
      <Link to={projectRoute} params={{ projectId: 'next' }}>
        Next project
      </Link>
    </main>
  )
}

;<RouterOutlet router={router} />
```

## `@benosjs/query`

- `query({ fetch, key?, staleTime?, gcTime?, retry?, retryDelay?, refetchOn? })`
  defines a cached query. `fetch(args, { signal, attempt })` infers the
  argument and data types; leave its first parameter unannotated for a query
  without arguments. Defaults: `staleTime` 5,000 ms, `gcTime` 300,000 ms, and
  two retries of transient failures (network `TypeError`, `TimeoutError`, and
  errors whose numeric `status` is 408, 429, or 5xx).
- Calling a definition with a tracked source, `projectQuery(() => id())`,
  returns an owner-bound observer that extends `Resource<T>` with
  `fetching()`, `error()`, and `failureCount()`. It never shows another
  argument's data.
- `projectQuery.load(args, signal?, cache?)` resolves to a `QueryEntry<T>`
  (`value()`, `fetching()`, `error()`, `refresh()`) for route loaders.
  `prefetch(args)` warms an entry; `peek(args)` reads it without fetching.
- `projectQuery.key(args)` is a typed `QueryKey<T>`. It is a cache target and
  makes typed writes with `set(value)` and `update(fn)`. A definition and
  `projectQuery.where(predicate)` are also targets.
- `mutation({ run, writes?, affects?, optimistic?, awaitRefetch? })` defines a
  mutation. Calling it in a component returns a handle with `run(input)`,
  `state()`, `pending()`, `cancel()`, and `reset()`; outside components use
  `definition.run(input, cache?)`. `run` resolves to `{ ok, … }` and never
  rejects.
- `createQueryCache()`, `<QueryCacheProvider cache>`, and `queryCache()`
  create, provide, and resolve caches. A cache has `invalidate(...targets)`,
  `write(...writes)`, and `dispose()`. `isTransientError(error)` is the
  default retry classification.

See the [query guide](./query.md) for examples.

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

## `@benosjs/primitives` (U2, optional package)

Each machine adapter is a separate public subpath so apps import only the
behavior they use. The package root exports the shared `PrimitiveController`
type only; runtime imports use a machine subpath. Every options type accepts
`id?: string`; a supplied value
overrides the ID generated by `createUniqueId()`.

| Subpath                           | Factory                      |
| --------------------------------- | ---------------------------- |
| `@benosjs/primitives/accordion`   | `createAccordion(getProps)`  |
| `@benosjs/primitives/checkbox`    | `createCheckbox(getProps)`   |
| `@benosjs/primitives/dialog`      | `createDialog(getProps)`     |
| `@benosjs/primitives/menu`        | `createMenu(getProps)`       |
| `@benosjs/primitives/popover`     | `createPopover(getProps)`    |
| `@benosjs/primitives/radio-group` | `createRadioGroup(getProps)` |
| `@benosjs/primitives/select`      | `createSelect(getProps)`     |
| `@benosjs/primitives/switch`      | `createSwitch(getProps)`     |
| `@benosjs/primitives/tabs`        | `createTabs(getProps)`       |
| `@benosjs/primitives/toast`       | `createToast(getProps)`      |
| `@benosjs/primitives/tooltip`     | `createTooltip(getProps)`    |

Factories return an owner-bound controller with readonly `state` and `api`
signals plus `send(event)` and idempotent `stop()`. Create them inside a
component/root owner. They start their Zag service from `onMount`, subscribe to
service changes, track getter-backed controlled props, and stop/unsubscribe on
owner cleanup. `createToast` additionally requires the public Zag toast-group
`parent` service in its options. Zag's public connected API and option types
are preserved; factories do not expose Benos-internal imports.

## CLI packages

### `benos`

The `benos` executable supports `--version`/`-v` and `--help`/`-h` at the
top level. Each command also accepts `--help`/`-h` (for example,
`benos add --help`). `benos info` reports the CLI version, Node version,
package manager, and operating system. Inside a Benos project it also lists
the installed `@benosjs/*` package versions and warns when those versions do
not match. Outside a project it prints the CLI and environment details only.

```sh
npx benos --version
npx benos add --help
npx benos info
```

### `create-benos`

The `create-benos` executable supports `--version`/`-v` and `--help`/`-h`.
The version is the installed scaffolder package version.

```sh
npm create benos@latest -- --help
npm create benos@latest -- --version
```

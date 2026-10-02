# Components and control flow

**Status:** Phase 4a approved design, **required for v0.1**. `@benosjs/dom` implementation is Phase 4b. This document fixes component, prop, child, and control-flow behavior before renderer code is written.

## Goal and boundary

Benos components are plain TypeScript functions invoked once per mounted identity. Reactive reads in their bodies select initial structure; reactive expressions in JSX install bindings or explicit control-flow scopes that update later. There are no hook call-order rules, dependency arrays, component rerenders, or automatic rewriting of destructured props. A plain `if` or `.map()` in a component body runs once; `<Show>`, `<For>`, and the other controls below own later changes.

This is a DOM package design. It does not add async resources, Suspense, SSR, hydration, a router, or generic user-defined renderer plugins to v0.1. [async.md](./async.md) and [ssr.md](./ssr.md) reserve future seams only.

## Package placement and public shape

`splitProps`, `mergeProps`, and `children` are public exports of **`@benosjs/dom`**, alongside `render` and the control-flow components. They are component helpers, even though the first two have no direct browser calls. `@benosjs/core` is already about 3.7 KB against a 4 KB minified and gzipped limit; putting three helpers there would consume its remaining space and couple a DOM-free graph package to JSX child identity. The combined core + DOM budget is 10 KB, leaving room for these helpers in DOM. A later non-DOM renderer could use the internal helper implementation without making this provisional placement a second public package now. This changes the provisional export inventory in [reactivity.md](./reactivity.md); the package boundary is hard to reverse after v0.1.

Conceptual signatures (the published types must use no `any`):

```ts
type Child =
  JSX.Element | string | number | boolean | null | undefined | readonly Child[]
type Component<P extends object> = (props: Readonly<P>) => Child

type SplitViews<
  T extends object,
  G extends readonly (readonly (keyof T)[])[],
> = {
  [I in keyof G]: G[I] extends readonly (keyof T)[]
    ? Pick<T, G[I][number]>
    : never
}

function splitProps<
  T extends object,
  G extends readonly (readonly (keyof T)[])[],
>(
  props: T,
  ...groups: G
): [...viewsForGroups: SplitViews<T, G>, rest: Omit<T, G[number][number]>]

function mergeProps<T extends readonly object[]>(
  ...sources: T
): MergeRightToLeft<T>
function children(source: () => Child): () => Child
```

`MergeRightToLeft` is a mapped, right-biased overwrite type; both it and the `SplitViews` tuple above are conceptual declaration sketches whose exact constraints and inference are type-tested in 4b. No helper writes to its source object. `splitProps` snapshots the **key partition** when called and returns views whose property getters read the original props on every access. The rest view contains keys not claimed by a group. `mergeProps` snapshots the source objects and enumerable key set, applies rightmost-source precedence, and reads the winning property's current value through a getter. A newly appearing key requires a new helper call; a disappeared key reads as `undefined`. This stable-shape rule prevents a run-once component from silently changing its prop interface. Symbols are included; getters are never invoked just to enumerate keys. Compiler-created spreads follow the same rule, and development warns if a reactive spread changes its key set.

## Component invocation and props

The compiler emits an inert component descriptor, then the renderer creates one child owner and invokes the function exactly once when that descriptor is materialized. It passes a stable, read-only, getter-backed props object. A dynamic prop getter evaluates its original JSX expression when read; a literal prop can be a fixed value. Thus `props.name` read inside a render binding tracks signals, while reading it in the component body takes only an initial snapshot. A change to the getter's result never reinvokes the component. A component function called directly as `Card({...})` is an ordinary function call and does not get compiler-created ownership or getter-backed props.

```tsx
function Greeting(props: { name: string }) {
  // This executes once. The text expression below remains reactive.
  return <p>Hello {props.name}</p>
}

;<Greeting name={firstName()} />
```

The compiler must preserve JSX attribute and spread evaluation order. Explicit props to the right override earlier spreads; later spreads override earlier props. It evaluates a spread expression once during descriptor creation to determine its stable key set, but forwards accessor properties through getters. A dynamic expression for an individual prop is not evaluated during descriptor creation solely to make a getter. `props.children` is lazy: nested component descriptors are not materialized before the parent has a chance to read or ignore them. Source-level props destructuring snapshots a value and is never rewritten. Phase 4c supplies a development diagnostic for statically visible destructuring patterns, and Phase 5a adds the `@benosjs/eslint-plugin` rule for component parameters and props aliases. Neither is a runtime claim to detect every alias.

`createContext`'s `Provider` is a component with the same run-once rules. It captures `value` once under `untrack`; a changed value prop warns once in development and does not recreate children. Pass a stable signal as the context value when consumers need updates. Its children remain under a logical provider owner, including when they render through a portal.

## Child identity and `children()`

JSX creates inert child descriptors. Text, arrays, and nested descriptors are normalized lazily into an owned child range at the point of insertion. Arrays flatten recursively in order; `null`, `undefined`, and booleans render no nodes; strings and numbers render text. A promise is an error in v0.1. An already mounted range cannot be inserted at a second location; development reports the duplicate use instead of silently moving it.

`children(() => props.children)` is an owner-bound lazy memo. Its first read resolves the child descriptor under one child owner; repeated reads of the same value return the same resolved handle and do not create a component twice. Tracked changes to the source select a new descriptor; the renderer disposes the prior child scope and replaces its range in its render tier. The selection uses the ordinary computed graph only for **inert descriptors**; component invocation and DOM creation occur later under a renderer owner, outside computed evaluation. This respects the kernel rule forbidding ownership side effects inside public `computed`. A `children()` accessor is bound to the owner in which it was created and cannot be mounted in two places simultaneously. Its owner disposal releases the cached range.

The compiler wraps reactive JSX child expressions as descriptors containing thunks, so `<Wrapper>{flag() ? <A /> : <B />}</Wrapper>` can change without rerunning `Wrapper`. Manually calling component functions inside a `children` source does not get this behavior. Explicit control flow remains clearer for branches with independent lifetime.

## Control-flow contracts

All controls are exported from `@benosjs/dom`, have stable owned ranges, and create child owners only for the active branch or item. Singleton element ranges use the element itself and need no anchor; multi-node and empty ranges retain the minimum anchors required for replacement. Their prop expressions are getter-backed. A missing value means `null`, `undefined`, or `false`; `0`, `''`, and `NaN` are present values. This deliberately preserves valid dashboard numbers and empty strings. The presence rule is shared by `<Show>` and `<Match>` and is hard to reverse.

| Control                                                         | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Show when={value} fallback={...}>`                            | Renders one branch. A change between present and missing disposes the old branch before mounting the new one. While present remains present, the branch owner and DOM remain; a function child receives a read-only accessor for the latest `when` value. A plain child is created once for that branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `<Switch fallback={...}><Match when={...}>...</Match></Switch>` | Tests matches in source order and mounts only the first present match. `<Match>` is a descriptor and is an error outside `<Switch>`. Changing the selected match disposes its scope before mounting the next; changing the value of the same match preserves its owner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `<For each={items} by={key}>`                                   | Reconciles in O(n log n) worst case with a keyed map. It first consumes the common prefix and suffix, then uses a longest-increasing-subsequence pass over reused middle entries to minimize DOM moves; swaps and reversals preserve keyed ranges and owners. Default key is item identity (`Object.is`); `by` returns a stable `PropertyKey`. The internal key table preserves `Object.is` semantics (`NaN` matches itself and `-0` remains distinct from `+0`) rather than relying on a raw `Map`'s SameValueZero corner cases. Each key owns one range and one child owner. Moves preserve that owner, DOM nodes, refs, context, and mount state. The item callback runs once per new key and receives `item(): T` and `index(): number` accessors; replacing an object under the same custom key updates `item()` without rerunning the callback. Removed keys dispose before their DOM ranges are removed. Duplicate keys warn in development and use a deterministic first-wins/extra-items-unkeyed fallback, so duplicates never alias one owner. |
| `<Dynamic component={Component} ... />`                         | Accepts an intrinsic tag name or component reference. A component/tag identity change disposes the old scope and mounts a new one. Stable identity preserves a component owner while getter-backed props change. `null`/`undefined`/`false` renders empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `<Portal mount={target}>`                                       | Moves a child range to the target while retaining the declaration site's logical owner and context. A target change moves existing nodes without remounting; a detached target delays `onMount` until connected. An already fired `onMount` does not fire again after a move. Disposal removes only the portal-owned range.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `<ErrorBoundary fallback={(error, reset) => child}>`            | Owns a content scope. On a component, binding, effect, or computed-read failure, disposes that scope, then creates fallback under a separate scope outside its own handler. Fallback failure reaches the next outer boundary. `reset()` discards fallback and creates fresh content; optional `resetKeys` retries when its array changes by length or `Object.is` at an index. Event-handler errors do not activate this boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

For `<For>`, a missing/empty collection renders its optional `fallback` under a separate scope. Default identity means duplicate primitive values are duplicates too; `by` should be supplied when duplicates are meaningful. The duplicate-key fallback is intentionally correct but forfeits move preservation for the extras. A keyed item with the same key and changed value retains its owner, so consumers should read the `item()` accessor in bindings rather than snapshotting it in setup.

```tsx
<For each={rows()} by={(row) => row.id} fallback={<p>No rows</p>}>
  {(row, index) => <Row value={row()} position={index()} />}
</For>

<ErrorBoundary fallback={(error, reset) => <button onClick={reset}>Retry</button>}>
  <Dashboard />
</ErrorBoundary>
```

## Timing, failures, and future seams

The renderer commits DOM before the root setup flush. Render bindings run before user effects; `onMount` runs once after a component's anchor is in a **live document**, including later branches. A prepared async branch is not eligible until commit. A detached host or portal target may delay `onMount` asynchronously through the shared `MutationObserver` in [scheduling.md](./scheduling.md). `onCleanup` follows [ownership.md](./ownership.md); refs and events are specified in [renderer.md](./renderer.md).

An unhandled flush error is reported after surviving jobs and never thrown to the signal writer. A synchronous component setup error can be handled by an ancestor boundary; otherwise its incomplete root is disposed and the error reaches the render caller. Resetting an error boundary is a new content scope, not a resurrection of disposed nodes. Future Suspense/transition regions may prepare scopes without mounting them, and SSR may materialize the same descriptors through an HTML host, as described in [async.md](./async.md) and [ssr.md](./ssr.md).

## Trade-offs and tests

Solid's [control flow](https://docs.solidjs.com/reference/components/for) also keeps item identity while updating fine-grained reads. Benos explicitly provides accessors for both current keyed item and index and keeps the 4 KB graph package free of component helpers. The extra descriptors and owner scopes cost memory; they make run-once behavior and disposal visible and testable.

Phase 4b happy-dom tests cover stable component invocation, dynamic props, helper getter forwarding, lazy children reads, reactive child replacement, `<For>` insertion/removal/moves/sorts, common prefix/suffix trimming, swap and reverse reorder cases, LIS-minimized moves, context through portals, `<Dynamic>` identity, `<Switch>` first match, boundary fallback/reset/fallback failure, refs, provider warnings, and owner/listener disposal. Phase 4d browser tests are limited to live-document attachment timing, focus behavior, parser behavior, accessibility, and keyboard/RTL fixtures.

**Hard-to-reverse decisions:** run-once component invocation, getter-backed and stable-shape props, helper package placement, children identity, missing-value truth rule, keyed item accessors, duplicate-key behavior, boundary reset semantics, and portal ownership.

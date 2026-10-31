# Async resources, Suspense, and transitions

**Status:** Implemented in 0.4.0. The user guide is [docs/async.md](../async.md). The original resource and renderer contracts below remain the baseline. [The router design](./router.md) defines their integration.

## Goals and boundary

An async result must join the existing signal graph without making signal reads, writes, computed values, or `batch` promise-aware. A resource needs explicit loading, error, refresh, cancellation, and last-writer-wins behavior. Suspense coordinates what the renderer reveals; transitions keep an already visible view in place while a replacement becomes ready. All async work belongs to an owner and must stop affecting the graph after disposal.

No implicit network cache, retries, promise-throwing render convention, concurrent scheduler, or automatic owner/context propagation across `await` is proposed. Router loaders use this package's resource and reveal machinery through an internal adapter; there is no public router dependency in `@benosjs/async`.

The selected public package is **`@benosjs/async`**, with a **4,096 byte** minified + gzip cap for its production entry when core/DOM are externalized. The cap is separate from the 7,168 B router cap: resources, Suspense, and transitions remain visible in accounting. The [router size comparison](./router.md#comparable-production-measurements) gives peer measurements and caveats. The R1 baseline was core **4,108 / 4,608 B** and core + DOM **10,580 / 11,264 B**. At R2, the measured sizes are core **4,303 B**, core + DOM **10,977 B**, async with core/DOM external **1,644 / 4,096 B**, and the fully bundled core + DOM + async **12,217 B**. Internal core/DOM changes are described in [router.md](./router.md) and accounted for in [the R2 checkpoint](../checkpoints/ra-r2.md).

## 0.4 API

The approved public `@benosjs/async` surface is:

```ts
interface Resource<T> {
  value: ReadonlySignal<T | undefined>
  state: ReadonlySignal<ResourceState>
  read(): T | undefined
  refresh(): Promise<T | undefined>
  cancel(): void
}

type ResourceState =
  | { status: 'disabled' }
  | { status: 'pending' }
  | { status: 'ready' }
  | { status: 'failed'; error: unknown }

interface InitializedResource<T> extends Omit<Resource<T>, 'value' | 'read'> {
  value: ReadonlySignal<T>
  read(): T
}

interface ResourceOptions<S, T> {
  initialValue?: T
  ssr?: {
    id: string
    key(source: S): string
    serialize(value: T): unknown
    deserialize(value: unknown): T
  }
}

function resource<S, T>(
  source: () => S | false | null | undefined,
  fetcher: (key: S, context: { signal: AbortSignal }) => T | Promise<T>,
  options: ResourceOptions<S, T> & { initialValue: T },
): InitializedResource<T>

function resource<S, T>(
  source: () => S | false | null | undefined,
  fetcher: (key: S, context: { signal: AbortSignal }) => T | Promise<T>,
  options?: ResourceOptions<S, T>,
): Resource<T>

function Suspense(props: { fallback: unknown; children: unknown }): unknown
function startTransition(fn: () => void): Promise<void>
```

`source` is a tracked synchronous accessor. A `false`, `null`, or `undefined` key disables fetching, aborts the current request, sets `state` to `disabled`, and retains the last successful `value` as stale data; this retention is deliberate and must be documented in the eventual API. `initialValue` seeds `value` before the first fetch and is retained through disable, cancellation, and failure until a success replaces it. Providing it selects the overload whose `read()` and `value()` return `T`, rather than `T | undefined`. Keys use `Object.is` to decide whether a source change starts a new request. `refresh()` starts a new request for the current enabled key even when the key is unchanged; when disabled it resolves to `undefined`. Expected fetch failures set the `failed` state and make `refresh()` resolve to `undefined`, avoiding an unobserved rejection when a caller ignores the returned promise. `read()` throws the `failed` state's error to its caller (and therefore an enclosing error boundary during rendering). Cancellation and disposal resolve an outstanding `refresh()` to `undefined`.

The optional `ssr` contract is implemented by the 0.6.0 server renderer ([ssr.md](./ssr.md)). Its `id` is stable within an app, `key` turns the current source into a deterministic validation key, and the codec projects and restores only data intentionally exposed to the browser. Under a server root, a resource without it never launches: it stays pending with a token that never settles, its boundary serializes as fallback, and the client fetches after hydration; reading it outside Suspense during server rendering throws. A resource with it launches, is awaited by the renderer, and is recorded as `[id, key, serialize(value)]` on success; on failure it also stays pending with a permanent token, records nothing, and reports the error to the renderer's `onError`, so server fetch failures never render error UI. Under a hydrating root, a matching `[id, key]` snapshot seeds `value` and the `ready` state without a fetch. This avoids serializing an entire fetched object by accident.

`value()` is an ordinary signal read and never suspends. `read()` is the renderer-aware read: while a request is pending, it registers that request with the nearest Suspense boundary associated with the current render owner, then returns the latest value or `undefined`. Outside such a render owner, `read()` behaves as an imperative value/error read without suspension. This distinction keeps data inspection independent of UI fallback behavior. A resource does not expose a writable signal. The API may later add an explicit mutation method, but it is excluded from this first contract.

## Resource state machine and algorithm

| `state().status` | `state().error`  | `value()`                                   | Entry                                                        |
| ---------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `disabled`       | No `error` field | Last success, initial value, or `undefined` | Source is disabled or `cancel()` is called.                  |
| `pending`        | No `error` field | Last success, initial value, or `undefined` | New key or `refresh()`.                                      |
| `ready`          | No `error` field | New result                                  | Latest request fulfills.                                     |
| `failed`         | Rejection reason | Last success, initial value, or `undefined` | Latest request rejects for a reason other than cancellation. |

1. `resource` requires an active owner. It reads its source and launches the initial request **during component setup**, before a Suspense boundary decides what to commit, except that a nonserializable resource remains in fallback without fetching on the server. An internal render-tier source watcher tracks later key changes under that owner; it is not a public user `effect`. The fetcher is called **untracked** with a fresh `AbortSignal`. Neither a fetcher's synchronous reads nor its promise continuation becomes a dependency of the source watcher.
2. Each launch increments a generation number and aborts the previous controller. It records the owner and key, sets `state` to `pending`, and registers one pending token with every boundary that observes `read()` for that generation. The state changes are grouped in an ordinary `batch`.
3. On fulfillment or rejection, the continuation first checks owner liveness, generation, and cancellation. Only the current generation writes signals, in one `batch`; older results and errors are ignored. A rejected current request sets `state` to `{ status: 'failed', error }` without erasing stale `value`. Completion removes its pending token from observing boundaries.
4. `cancel()` invalidates the generation, aborts the controller, sets `state` to `disabled`, and removes pending tokens; it retains `value`. Owner cleanup performs the same invalidation. Abort is advisory: the generation check is the final guard against a fetcher that ignores `AbortSignal`.
5. Fetcher settlement is an external async callback, so its signal writes obey the ordinary synchronous write/flush contract **when that callback runs**. A fetch error stored in the `failed` state is not itself an unhandled scheduler error. If a render binding calls `read()` after rejection, that direct read throws into the reader's error boundary, per [ownership.md](./ownership.md).

The fetcher's `context` deliberately contains no owner object. Callers needing context after `await` capture a value synchronously before launching work. Internal continuations use an explicit retained owner token for disposal and boundary bookkeeping; they do not leave the global current-owner stack active across a promise. A request-scoped server root uses the same generation and abort rules.

## Suspense and transitions

The nearest logical Suspense owner records `(resource identity, generation)` tokens when `read()` occurs in a render binding or component setup. Duplicate reads add one token. A token disappears on settle, cancellation, disposal, or when the observing branch stops reading it. The boundary is pending while its current branch owns any token. A nested boundary owns its own tokens: its fallback or ready content is a committed unit as far as the outer boundary is concerned. A fallback runs outside that boundary's pending-content scope, so it cannot hold its own boundary open; it may register with an outer boundary. Errors are **not** Suspense results: `read()` rethrows them to the nearest `<ErrorBoundary>`, whose failed scope disposal removes pending tokens.

On an initial render, pending content is prepared under a child owner but remains outside the live document; the fallback is committed. When all current tokens settle successfully, render work commits the prepared branch, disposes the fallback, and only then releases eligible user effects and `onMount` jobs. New tokens discovered while preparing or updating that branch delay reveal. A branch removed before reveal is disposed; late completions cannot reveal it. This internal eligibility gate for prepared branches is specified in [scheduling.md](./scheduling.md); it changes no public effect or batch primitive.

`startTransition(fn)` opens a synchronous transition transaction. `fn` may change source signals, and those writes still update the ordinary graph synchronously. For UI regions whose replacement suspends, the renderer retains the currently committed DOM and owner, **gates that region's render and user jobs** so new signal values cannot mutate or be observed against its old DOM, prepares a replacement in a staging owner, and commits that replacement only when its current pending tokens settle. Unaffected roots and regions continue to flush normally. The staged owner is disposed on supersession, failure, or root disposal. State reads outside the retained UI see the latest values immediately; the promise resolves when all transition-owned staged regions commit or are superseded. A thrown `fn` error propagates to its caller after its synchronous writes flush. If `fn` returns a promise, only the synchronous portion is transition-scoped. Failed staged content is offered to its error boundary; the old UI remains visible until that boundary commits a fallback or a later transition replaces it. If no boundary can commit a recovery view, the retained region is ungated and catches up to current state in one render-first flush. Initial suspension without prior committed content uses the Suspense fallback. This is a renderer reveal policy, not delayed signal writes.

The scheduler retains its render-before-user order at every commit. No user effect or `onMount` in an uncommitted prepared owner may run merely because its signal dependencies changed. When the owner becomes live, eligible effects run after the commit's render work, then `onMount` after connected insertion. Ordinary nontransition updates continue to flush synchronously and may show a fallback on suspension.

## R1 router integration and package seam

A route loader is started by the router's candidate-match coordinator before any candidate route component is invoked. It receives a snapshot of typed params/search and an `AbortSignal`; the router owns one resource generation per candidate match. The loader does not inherit the current owner across `await`. Its result becomes a **ready-only** loader-data signal exposed by `route.match()` after commit. This is distinct from a general `resource.value()`, which may contain stale data while pending. The router must never publish B's params with A's stale loader value. On a same-route navigation A → B, the committed A match and component owner remain visible while B loads; at commit, params, search, and data switch in one batch. On A → B → A, the first A generation still cannot win. An explicit reload keeps the committed identity and stale data visible; its failure enters route error recovery without erasing the last good value. No cross-route request cache or hidden retries are added in 0.4.

The router may subscribe to resource state/tokens through an **internal**, owner-bound adapter. It must not spoof a render read merely to acquire a Suspense token, and it must remove its token on redirect, abort, supersession, or disposal. `<Suspense>` remains useful for resources inside a route and for an initial route fallback. A route's `pending`/`error` views are router policy layered on top of the same owned staging and failure machinery. A loader rejection goes to the route error view; a `resource.read()` failure in ordinary route content follows the nearest DOM `<ErrorBoundary>` unless the route provides the enclosing error scope. Browser event-handler throws retain current DOM reporting semantics.

`cancel()` on an enabled standalone resource intentionally leaves it disabled until `refresh()` or a **different** source key appears; it does not schedule an immediate retry for the same key. A disabled source returns `undefined` from `refresh()` and retains its last value. A synchronous fetcher throw follows the same failed-state path as a promise rejection, and `refresh()` resolves to `undefined`. These rules prevent cancellation loops and unhandled rejections. `AbortSignal` is advisory; generation and owner checks remain mandatory at every settle path.

The package exposes no query-cache, mutation, form, or navigation API. In 0.5, a query adapter can provide the fetcher and typed cache identity to a route loader without changing this resource contract. That adapter must make cache refresh an explicit mutation policy, as [the flagship target](./flagship-integration.md) specifies.

## SSR compatibility check

Implemented in 0.6.0 as [ssr.md](./ssr.md) specifies. The server runs only resources with the opt-in `ssr` codec under a request root; the rest leave fallback HTML and are fetched on the client. No async continuation keeps a global current-owner stack across `await`; the renderer settles in rounds and reenters owners synchronously. Route data reuses opted-in query entries keyed by the query's ID and key hash; a mismatched key refetches rather than hydrating stale data. No router or async module reads `window` or `document` during import. Server mode suppresses user effects and `onMount` through the request root's gate; render-tier bindings run so staged content shows settled values. The Suspense internal control receives its marker, insertion, and staging operations from the mounting host, so one mount function serves the DOM and server hosts.

Streaming (0.7.0, [ssr.md](./ssr.md), _Streaming_) adds two seams and changes no public API. A resource read that observes a pending token also calls `request.pendingRead?.()`, which the server's binding frame uses to decide whether a binding needs a live effect (the server fast path). Under a hydrating root, `Suspense` asks `request.pendingOf?.(marker)` after claiming its marker; a streamed boundary (its fallback marked `<!--b:0:ID-->`) commits the claimed fallback and defers staging its content until `request.whenPatched(ID, continue)` runs the continuation, so no owner, binding, or resource exists for that content until its data is on the page; the end of the stream runs the continuation without a patch, which is the 0.6.0 missing-payload path.

## Failure and race cases

- A source changes A → B → A: each launch has a new generation. The first A result cannot overwrite the final A result even though keys match.
- An aborting fetcher can reject after the new generation succeeds. The old rejection is ignored and never routed to `reportError`.
- Several resources in one boundary require all current tokens to settle; a nested boundary can reveal independently without blocking its parent shell.
- A resource can resolve synchronously. Its completion still follows one generation check and one batched state transition; a reentrant launch cannot make an older result current.
- A boundary may dispose while fetches continue. Cleanup aborts where it owns the resources; shared resources outside the boundary simply lose that boundary's tokens and continue for other consumers.
- A missing Suspense boundary does not turn a promise into a thrown value. `read()` returns stale data, the initial value, or `undefined` while pending, and `state().status` provides explicit UI state.
- A resource error is reported only when a reader throws it without a boundary; this follows ordinary direct-read or scheduler error routing. It is not reported again merely because the `failed` state is inspected.

## Prior art and trade-offs

[Solid's `createResource`](https://docs.solidjs.com/reference/basic-reactivity/create-resource) combines state, refresh, and Suspense-aware reads; [Solid Suspense](https://docs.solidjs.com/reference/components/suspense) demonstrates nearest-boundary coordination, while [Solid transitions](https://docs.solidjs.com/reference/reactive-utilities/start-transition) keep earlier UI visible. Benos makes `value()` and `read()` distinct to avoid a read unexpectedly suspending in ordinary data code. This adds an API choice but makes the boundary crossing explicit. Vue's [Suspense](https://vuejs.org/guide/built-ins/suspense.html) is renderer oriented and experimental; Benos keeps the async state machine below its renderer and delays only UI reveal.

## Test plan before implementation

1. Source tracking, disabled keys, `Object.is` key reuse, refresh, last-success and `initialValue` retention, `read()` type overloads, and sync resolution.
2. Out-of-order fulfill/reject, ignored abort, disposal, A → B → A generations, and no unhandled promise rejection.
3. `read()` inside/outside a boundary, multiple resources, duplicate reads, nested boundaries, fallback reads, and error boundary routing.
4. Initial fallback and later reveal; a branch removed before reveal; user effects and `onMount` waiting for a live committed branch.
5. Transition keeps old DOM and owner until commit, superseded transition cleanup, rejected staged content, and writes after an `await` outside transition scope.
6. Resource completion uses ordinary synchronous signal flush at settlement, with no tracking or owner stack leaking across `await`.
7. Router-adapter contract tests: candidate loader token is released on redirect/supersession/disposal; param/data commit is atomic; stale resource value cannot be exposed as new route data; direct `read()` still follows the nearest boundary.
8. Run browser Suspense, transition, mount/effect gating, and nested-boundary tests in Chromium, Firefox, and WebKit. Type-level tests cover the initialized and uninitialized overloads without `any` in public declarations.

R4 completes item 7's router-adapter checks. [`packages/router/tests/router.test.ts`](../../packages/router/tests/router.test.ts) verifies redirects are resolved before a redirect route's loader can start, so a redirect candidate owns no resource token. [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts) verifies superseded generations are aborted and ignored, outlet disposal aborts the loader, and params/data commit atomically without exposing stale values. [`packages/async/tests/suspense.test.ts`](../../packages/async/tests/suspense.test.ts) verifies a failed `read()` reaches the nearest error boundary. The router-wide R4 coverage table is in [`router.md`](./router.md#r4-coverage).

## Hard-to-reverse decisions

The distinction between `value()` and `read()`, the `initialValue` type overload, discriminated state shape, stale-value retention, error propagation, generation semantics, nested-boundary ownership, and transition DOM reveal are public behavior. R1 selected the async package name and budget; R2 implements these under the approved internal core/DOM eligibility and staging seams. The measured bytes and verification are in [the R2 checkpoint](../checkpoints/ra-r2.md). Existing core/DOM public APIs and documented synchronous behavior remain unchanged.

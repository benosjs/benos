# Reactivity design

**Status:** Phase 1 design; kernel primitives implemented in Phase 3. Provisional Phase 4 exports remain designs.

## Problem and goals

Data-heavy interfaces need derived values and DOM bindings that update from explicit state without rerunning component functions. The kernel must work without a DOM, keep dynamic dependency graphs correct, avoid diamond glitches, and release graph edges when an owner is disposed. A read must return the current value synchronously. Signal writes and computed evaluations have observable timing, so these rules are hard to reverse.

## Non-goals

- Proxy-based object tracking, implicit reactivity for plain variables, and deep mutation tracking.
- Async values, Suspense, transitions, and SSR implementation in v0.1.
- A public graph inspection API or custom computed equality in v0.1.
- Treating a signal as a stream of every intermediate value. A batch deliberately coalesces states.

## Proposed public API

```ts
export interface ReadonlySignal<T> {
  (): T
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void
  update(fn: (previous: T) => T): void
  readonly(): ReadonlySignal<T>
}

export interface SignalOptions<T> {
  equals?: false | ((previous: T, next: T) => boolean)
  name?: string
}

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>
export function computed<T>(fn: () => T): ReadonlySignal<T>
export function effect(fn: () => void): () => void
export function batch<T>(fn: () => T): T
export function untrack<T>(fn: () => T): T
export function onCleanup(fn: () => void): void
export function onMount(fn: () => void): void
export function createRoot<T>(fn: (dispose: () => void) => T): T
export function createContext<T>(defaultValue: T): Context<T>
export function getContext<T>(context: Context<T>): T
```

`Context<T>` and the ownership functions are specified in [ownership.md](./ownership.md). `effect` returns an idempotent disposer. `readonly()` returns the same stable read-only wrapper on every call. It is a capability boundary in the TypeScript API, not a security boundary against casts. `signal()` is an explicit tracked read; a plain variable is never reactive. `set` and `update` return `void` so callers do not rely on a value whose meaning may later be ambiguous.

### Complete proposed v0.1 export inventory

| Package                  | Public value exports and entry points                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@benosjs/core`          | `signal`, `computed`, `effect`, `batch`, `untrack`, `onCleanup`, `onMount`, `createRoot`, `createContext`, `getContext`. Public types: `Signal`, `ReadonlySignal`, `SignalOptions`, `Context`. Core intentionally has no component or DOM helpers so it can remain within the 4 KB budget.                                    |
| `@benosjs/dom`           | `render`, `Show`, `For`, `Switch`, `Match`, `Dynamic`, `Portal`, `ErrorBoundary`, `splitProps`, `mergeProps`, `children`; JSX types and required `jsx-runtime`/`jsx-dev-runtime` entry points. The Phase 4a component, prop, and renderer contracts are in [components.md](./components.md) and [renderer.md](./renderer.md). |
| `@benosjs/compiler`      | A standalone `transformJsx` entry point, provisional name until the Phase 4 compiler design.                                                                                                                                                                                                                                  |
| `@benosjs/vite`          | A `benos` plugin factory, provisional name until Phase 4.                                                                                                                                                                                                                                                                     |
| `@benosjs/eslint-plugin` | The plugin's default export, with the `no-props-destructuring` rule implemented in Phase 5a.                                                                                                                                                                                                                                  |

This is the intended **v0.1** surface, not a claim that these exports exist in the Phase 0 scaffolds. Tooling signatures and JSX types must be frozen in their design documents before implementation; no router, forms, query, registry, or other later module is included.

## Proposed internal graph

The types below describe relationships, not implementation code or public exports.

```ts
type Producer = StateNode<unknown> | ComputedNode<unknown>
type Consumer = ComputedNode<unknown> | EffectNode
type Status = 'clean' | 'check' | 'running' | 'disposed'
type Cache<T> =
  | { kind: 'uninitialized' }
  | { kind: 'value'; value: T }
  | { kind: 'error'; error: unknown }

interface StateNode<T> {
  value: T
  version: number
  equals: false | ((previous: T, next: T) => boolean)
  firstSink: Dependency | null
  lastSink: Dependency | null
  sinkCount: number
  name?: string
}

interface Dependency {
  source: Producer
  consumer: Consumer
  seenVersion: number
  seenEpoch: number
  prevSource: Dependency | null
  nextSource: Dependency | null
  prevSink: Dependency | null
  nextSink: Dependency | null
  active: boolean
}

interface ComputedNode<T> {
  evaluate: () => T
  cached: Cache<T>
  version: number
  lastCheckedWriteVersion: number
  status: Status
  firstSource: Dependency | null // first-read order after reconciliation
  lastSource: Dependency | null
  sourceMap: Map<Producer, Dependency> | null // allocated above four sources
  firstSink: Dependency | null
  lastSink: Dependency | null
  sinkCount: number
  live: boolean // has a path to an active effect
  owner: Owner
  name?: string
}

interface EffectNode {
  run: () => void
  firstSource: Dependency | null
  lastSource: Dependency | null
  sourceMap: Map<Producer, Dependency> | null
  tier: 'render' | 'user'
  queued: boolean
  prevQueue: EffectNode | null // O(1) removal during disposal
  nextQueue: EffectNode | null // intrusive O(1) FIFO link
  hasRun: boolean
  owner: Owner
}
```

Every dependency is one shared node linked into its consumer's ordered source list and, while active, its producer's sink list. It records the version observed by the consumer. A global `writeVersion` increments on every successful state write, including `equals: false` writes; equal writes leave it unchanged. An owner holds computations; producers link **only live** consumers. A computed with no path to an effect retains its source/version list for its next read, but its edges are inactive on the producers, so an otherwise unreachable computed is not kept alive by a global signal. When its first sink appears, it subscribes to its sources recursively; when its last sink disappears, it unsubscribes recursively. An effect that completes its initial run with zero tracked dependencies is detached immediately: it is removed from its owner's computation set and has no future scheduler or disposal work. Effects that track a dependency remain live until disposed. This bookkeeping is necessary for the requested garbage-collection property. The [TC39 Signals proposal](https://github.com/tc39/proposal-signals/blob/main/README.md) also distinguishes watched from unwatched computed signals.

## Tracking and update algorithm

The algorithm is **push invalidation, pull evaluation**. A write marks live downstream nodes as needing a check; it never evaluates a computed just to propagate the mark. An actual read checks source versions and reevaluates only when needed. This permits equality at an upstream computed to stop work in descendants and prevents a diamond from evaluating its sink against one old branch and one new branch.

```text
read(producer):
  remember the active caller consumer
  try: if producer is computed, ensureFresh(producer)
  finally: if tracking is enabled and there is a caller consumer:
    find or create the caller's edge to producer
    if it has not been seen in this evaluation:
      stamp and order the edge; record producer.version
      if caller is live, install the producer-side link immediately
  return current value or rethrow its cached error

write(state, next):
  reject if any computed is evaluating on this synchronous stack
  calculate next and compare before mutating state
  if equal, return
  if state.version or global writeVersion cannot increment safely, throw before mutation
  store next; increment state.version and global writeVersion
  mark each live downstream computed as check; enqueue reached effects once
  flush at the write boundary unless a batch or flush is active

ensureFresh(computed):
  if already running, throw a computed-cycle error
  if clean and live, return cached result
  if unobserved and initialized and lastCheckedWriteVersion == global writeVersion:
    return cached result
  recursively ensureFresh each previous source, in source order
  if initialized and all source versions match:
    set lastCheckedWriteVersion = global writeVersion; mark clean; return cached result
  evaluate under this computed as the active tracking consumer
  reconcile: subscribe newly read sources first, then unsubscribe removed old sources
  cache result (or error); increment version on changed value or failed reevaluation
  set lastCheckedWriteVersion = global writeVersion; mark clean
  return result or throw cached error
```

An unobserved computed cannot trust a `clean` flag because it receives no push notifications. Its `lastCheckedWriteVersion` gives an O(1) fast path when **no state anywhere** has changed since its last full check. After any write, it checks its recorded sources recursively; an unrelated write costs a source scan but does not reevaluate the callback. A live computed can return its cached value immediately while clean. A cached error uses the same fast path and is rethrown. Moving from live to unobserved never sets `lastCheckedWriteVersion` unless its sources have actually been validated at that version.

Each evaluation increments a consumer-local epoch. An edge stamped with that epoch is a duplicate read; unchanged dependencies reuse their existing edge nodes. For up to four sources, lookup scans at most four links, which is O(1); a consumer with more sources allocates a map for expected O(1) lookup. The source list preserves first-read order for deterministic reconciliation. One detached edge may be retained for reuse on later branch switches, with its former producer reference cleared. The edge's `seenVersion` is captured **after** `ensureFresh`, including when that read rethrows a cached error. Effect reads install provisional subscriptions immediately, so an effect that reads and then writes the same signal during its first run is queued for another pass. On successful evaluation, new sources are subscribed (and liveness propagated) **before** removed old sources are unsubscribed; retained sources update their version snapshots. This order avoids briefly dropping a shared upstream producer from live to unobserved and then reactivating it during a branch switch. Afterward, dependencies absent from the new list are removed. A failed computed evaluation retains the union of old and newly read sources until the next successful evaluation, so either branch can trigger a retry; it caches the error to rethrow on reads. A failed reevaluation advances the computed version even if it throws again, so an observing effect can reach its boundary. The failed-evaluation edge policy has direct regression tests because it affects both recovery and memory.

The active consumer and active owner are separate stacks. `untrack(fn)` suppresses recording reads in the surrounding consumer. A computed called within `untrack` still tracks its own sources; only the caller's edge to that computed is omitted. Stack state is restored in `finally`, including when user code throws.

## Semantics and edge cases

- State equality defaults to `Object.is`: `NaN` equals itself; `0` and `-0` differ. `equals: false` notifies on every write. Custom comparators run before mutation; if one throws, the state and graph remain unchanged. `update(fn)` receives the current value and is one write.
- A computed is lazy, cached, read-only, dynamically tracked, and compared with `Object.is` after reevaluation. Its callback must be pure. A write during computed evaluation throws in **both** development and production; a development error adds graph names/path. Allowing it in production would give different application behavior across builds.
- Creating `signal`, `computed`, or `effect` inside a computed evaluation throws in both builds. These primitives have state or lifetime; allocating them on every reevaluation would leak or produce unstable identities. `createRoot`, `onCleanup`, and `onMount` are also rejected there because they create ownership or lifecycle side effects. A separate computed-evaluation guard remains active through `untrack`, so `untrack` cannot bypass this rule. Create those primitives in a component/root and read them from the computed instead.
- Recursive computed reads throw immediately. Effects may write a dependency; the scheduler queues a subsequent run and enforces the cycle limit described in [scheduling.md](./scheduling.md).
- Reading a computed inside a batch may evaluate it against the values written so far. Only automatically scheduled effects are deferred. The renderer automatically batches every event handler, so multiple synchronous writes in one handler share an effect flush; see [scheduling.md](./scheduling.md). Promising that _all_ observers see only the final batch value would contradict synchronous explicit reads; [Solid's batch documentation](https://docs.solidjs.com/reference/reactive-utilities/batch) makes the same distinction.
- If a state changes and returns to its starting value inside a batch, a directly dependent effect may still run once because the state version changed; it reads only the final value. An equal computed result can still suppress effects downstream of that computed.
- A cached computed error is rethrown until a recorded dependency changes. Error routing belongs to the executing owner and is specified in [ownership.md](./ownership.md).
- A `readonly()` view observes the same node; it does not clone state. Mutating an object held inside a signal does not notify unless a subsequent `set` occurs, including `set(sameObject)` with `equals: false`.
- State, computed, and global write versions are internal monotonic counters. A write when its state or the global counter is at `Number.MAX_SAFE_INTEGER` must fail before mutation rather than silently make an old version snapshot appear current. This limit is far beyond realistic application writes, but the failure rule is deterministic.

## Prior art and trade-offs

- [Solid's memo](https://docs.solidjs.com/reference/basic-reactivity/create-memo) uses derived read-only values and equality to suppress downstream work. Benos keeps callable reads but chooses lazy first evaluation and `Object.is`, and does not expose custom memo equality yet.
- [Vue's runtime reactivity](https://vuejs.org/guide/extras/reactivity-in-depth.html) tracks reads and triggers effects, but its proxy/ref mix is broader than this small explicit kernel. Benos does not make object properties reactive by default.
- [Preact Signals](https://preactjs.com/guide/v10/signals/) has lazy computed values and disposable effects. Benos chooses callable reads rather than `.value`, and ownership is a kernel concern rather than solely a component integration concern.
- The [TC39 proposal](https://github.com/tc39/proposal-signals/blob/main/README.md) motivates lazy, cached, glitch-free computed values and watched-only reverse edges. Benos cannot promise API compatibility with a proposal still in progress: callable accessors and synchronous effect scheduling remain framework choices. An internal adapter could later use native signal storage without changing Benos' public read syntax.

## Test plan for Phase 3

1. Reads, writes, `update`, `readonly`, `Object.is` (`NaN`, signed zero), custom equality, comparator throws, and `equals: false`.
2. Lazy first read, global write-version cache hit for an unobserved computed, an unrelated global write that scans but does not reevaluate, equal computed output, conditional dependency removal, nested computed chains, and an A → B/C → D diamond with no intermediate D value.
3. Explicit reads during nested batches; `untrack` around a computed and around a direct signal read.
4. Repeated reads of one source produce one edge in first-read order; dynamic branch switching subscribes additions before removing old edges, with no transient liveness churn on shared upstream sources.
5. Computed recursion; writes and creation of signals/effects/computeds/roots/lifecycle registrations during a computed; cached error and recovery when old or newly read dependencies change.
6. An effect that switches branches, then disposal: external signals retain no edge to its effect or now-unreachable computed. Use `WeakRef`/`FinalizationRegistry` tests only where GC can be driven reliably, with deterministic edge-count tests as the primary proof.
7. Deep graphs and repeated equal writes as microbenchmarks; record allocations and peak subscriber counts, not just throughput.

## Future implications and hard-to-reverse decisions

The callable read/set syntax, `Object.is` default, synchronous reads, computed purity, and dependency lifetime are hard to reverse. Async `resource()` should expose an ordinary value signal plus one discriminated state signal and schedule completion writes through this graph; async callbacks do not inherit a tracking stack across `await`. SSR should create per-request roots and dispose them, with no DOM dependency in this package. Graph names are optional metadata so later diagnostics and DevTools can identify nodes without making graph internals public.

# Scheduling design

**Status:** Phase 1 design; core scheduler implemented in Phase 3. DOM event and mount integration belongs to Phase 4.

## Problem and goals

One state write can invalidate many computed nodes and DOM bindings. Benos needs a precise order that coalesces work, avoids inconsistent derived values, and lets a user effect inspect DOM produced by earlier writes. Timing is public behavior: a later move to microtasks would change tests and application code.

## Non-goals

- Concurrent rendering, priorities, transitions, or yielding in v0.1.
- A public scheduler API or a public `flushSync` escape hatch.
- Preserving every intermediate write as an event stream.
- Promise-aware batches. A batch is synchronous even if its callback returns a promise.

## API and internal work queues

Public `signal.set`, `signal.update`, `batch`, and `effect` have the signatures in [reactivity.md](./reactivity.md). The renderer can create an **internal** render-tier effect; application code can create only user-tier effects. `onMount(fn)` adds a one-shot user-tier job to a renderer-associated component owner. This internal tier is not a second public effect API.

```ts
interface Scheduler {
  batchDepth: number
  setupDepth: number
  flushing: boolean
  renderQueue: EffectQueue
  userQueue: EffectQueue
  mountQueue: MountQueue
  pendingMounts: Set<MountJob>
  flushVersion: number
  pendingErrors: unknown[]
}

interface EffectQueue {
  head: EffectNode | null
  tail: EffectNode | null
}

interface MountQueue {
  head: MountJob | null
  tail: MountJob | null
}
```

Queues are FIFO by first invalidation or registration and deduplicate by node identity. Each effect and mount job stores intrusive `previous` and `next` queue pointers. Head/tail links make enqueue and dequeue O(1) without allocating a queue entry for each enqueue; the previous pointer also makes disposal of a queued node O(1). A node's queued flag prevents duplicate entries and clears when dequeued or removed. A running effect invalidated by its own write is queued for a later pass, never called recursively. Computed nodes are not queued for evaluation; they are checked on demand.

The flush version increments once per flush. Each effect stores the version and its execution count for that version, so cycle detection needs no per-flush map. Invalidation uses each consumer's last marked write version to deduplicate diamonds without allocating a traversal `Set`.

## Numbered guarantees

1. `set` computes the next value and applies the comparator before changing a state node. Equal writes do nothing. A successful write stores the value and increments its state version and the global `writeVersion` **immediately**, as specified in [reactivity.md](./reactivity.md).
2. The write marks live downstream computed nodes as needing a check, then enqueues reached render effects and user effects once. No computed callback runs during this marking walk. A computed with no active effect downstream receives no push notification and checks its stored source versions on its next read.
3. Outside a batch, root setup, or an existing flush, the write starts a flush before `set` returns. There is no microtask or animation-frame delay in v0.1. A write within `batch` or root setup only marks and queues work.
4. A flush first drains render effects. Before an effect runs, all of its sources are brought current by pull evaluation. If every observed source version is unchanged, the queued effect is skipped without running cleanup. A running render effect may register more render effects; these join the same drain.
5. Once the render queue is empty, the flush runs one user effect or **eligible** `onMount` job. Its callback begins after prior render work from that flush. If it writes state, the scheduler drains newly queued render effects **before** starting the next user job. An `onMount` job is eligible only after its component anchor is connected to a live document and render work for that insertion is finished, including for later branches. Detached jobs remain in `pendingMounts`. `onMount` is one-shot and untracked unless it explicitly creates an effect.
6. A user effect's own write during its callback is queued without reentering the scheduler. Thus DOM is current **at entry** to each user effect, but code later in the _same_ callback can see DOM from before its own write until the callback returns. This narrows the starting phrase “user effects always see an up-to-date DOM” to a guarantee the scheduler can honor without recursive effect execution. The same caveat applies inside an explicit batch.
7. An effect re-runs only after a dependency's observed version changes. Its first run is identified by `hasRun = false` and runs without a version comparison. Immediately before a real re-run, its previous run scope is disposed depth-first, including cleanups; then the callback runs under a new tracking scope. Initial runs have no prior cleanup. An effect may change its dependency list. Reads subscribe provisionally during execution so a self-write in the first run is not lost. If the completed initial run read no dependencies, the effect is detached from its owner and scheduler after that run; its returned disposer is an idempotent no-op, and there is no later cleanup or disposal work for that effect node.
8. The flush repeats render-first passes until its runnable queues are empty. An unhandled effect, computed-read, mount, or cleanup error does not strand unrelated jobs: the scheduler records it, finishes surviving work, then passes each error to an internal nonthrowing `reportError` path. **No unhandled flush error throws to the signal writer.** A handled boundary error disposes its failed child scope and is not reported as unhandled.
9. An effect that executes more than 100 times in one flush is stopped and disposed, and a cycle error is routed through its owner. If unhandled, it is reported after surviving jobs finish rather than thrown to the writer. The development error includes available graph names/IDs and the write path; production retains a short error. Recursive computed reads fail immediately and do not use this limit.
10. After an outermost `batch` or root setup completes, one flush runs before control returns to its caller. Nested batches do not flush independently. A thrown **batch callback** still exits the batch and flushes already committed writes in `finally`, then its own error is rethrown to the batch caller. Unhandled errors produced by that flush are reported separately and do not replace or aggregate with the callback error. Comparator, updater, and direct computed-read errors outside a flush likewise propagate to their direct callers.
11. The DOM renderer wraps **every** event handler, delegated or native, in `batch` automatically. Multiple synchronous writes in one handler cause one flush after the handler finishes, including if it throws; nested explicit batches share that boundary. A handler returning a promise ends this automatic batch when it returns, so writes after an `await` form a later transaction. The renderer catches a handler exception after the batch flush and sends it to `reportError`, not a component boundary.

Explicit signal and computed reads inside `batch` return current in-progress values and may pull a computed more than once if the batch performs more writes. The guarantee that “downstream observes final state” applies to **automatically scheduled effects and DOM bindings**, not imperative reads made inside the batch. This matches the observable behavior described by [Solid's batch API](https://docs.solidjs.com/reference/reactive-utilities/batch) and [Preact Signals' batch API](https://preactjs.com/guide/v10/signals/).

## Creation and mount sequence

`effect(fn)` registers one initial run. Outside any setup or batch it flushes synchronously before `effect` returns. Inside `createRoot`, `batch`, or `render` setup, the initial run is deferred to that setup's closing flush; it still runs in the same call stack, not a microtask. This deliberately narrows “run once on creation”: running a user effect before a component's DOM exists would violate the render-before-user guarantee. A root callback can therefore create signals, components, and effects; initial user effects see the completed initial DOM and final setup values before `createRoot` returns. An effect with no tracked dependencies is dropped after its initial run, so it does not remain in the root's computation set. An unhandled initial-effect failure is reported, not thrown from `effect` or `createRoot` via the flush.

If the `createRoot` setup callback itself throws, the incomplete root is disposed and its queued jobs are cancelled before that creation error is rethrown. This is outside a scheduler flush and does not use the flush `reportError` path.

`render(() => <App />, host)` opens a root setup, creates and inserts nodes, and closes setup. Render-tier bindings run before user effects and eligible `onMount` jobs; `render` returns only after that synchronous initial flush. If `host` is detached, its mount jobs remain pending until its anchor joins a live document. The same eligibility check applies when a later branch or portal creates nodes. At most one shared `MutationObserver` per document is installed **only while jobs already committed into a detached host are pending**; it watches for external attachment, queues newly eligible jobs, and is disconnected as soon as no such job remains, including after disposal. Jobs in a future uncommitted Suspense or transition branch do not install this observer until that branch commits. An externally attached host is noticed in an observer callback, so its `onMount` is **asynchronous relative to `render` and attachment**. This does not make signal writes asynchronous. A plain core-only root has no mount anchor, so `onMount` there throws at registration. This does not mean a component function reruns on later writes: only installed binding effects do. The renderer must not create a new scheduler per DOM node; scheduling is shared for graphs that can observe the same signal.

## Pseudocode

```text
set(state, next):
  if inside computed evaluation: throw
  if comparator says equal: return
  state.value = next; state.version += 1; globalWriteVersion += 1
  markLiveSinksAndQueueEffects(state)
  if batchDepth == 0 and setupDepth == 0 and not flushing: flush()

flush():
  flushing = true
  try:
    while work exists:
      while renderQueue has work:
        runJobAndRouteErrors(renderQueue.dequeue())
      if userQueue has work:
        runJobAndRouteErrors(userQueue.dequeue())
      else if mountQueue has work:
        runJobAndRouteErrors(mountQueue.dequeue())
  finally:
    flushing = false
  for each unhandled error recorded: reportError(error) without throwing
```

`runJobAndRouteErrors` pulls each effect source first. It skips an effect whose computed dependency recomputed to an equal value and no other dependency changed. It also prevents a diamond from exposing a half-updated result. Head/tail linked queues are the default implementation; an alternative must preserve O(1) dequeue, FIFO ordering, and identity deduplication.

## Edge cases and errors

- A self-writing effect can schedule itself after its current run; it never interrupts its own callback. The 100-run limit is per effect per flush, not per signal or per application lifetime.
- A signal written to a different value and then back inside one batch can still cause one run of a directly dependent effect; it sees the final value. A computed that returns to an equal cached value suppresses work downstream of it.
- A render effect that writes state is legal but suspect; it can restart render work. The cycle limit applies. A later diagnostic may recommend moving the write out of rendering.
- `batch(async () => { ... })` ends its batch when the promise is returned, before the first `await` continuation. Code after `await` executes in a separate write transaction. We will document this explicitly rather than retain global batch state across unrelated async work.
- An effect queued and then disposed before its turn does not run. A computed that becomes equal after a source write prevents dependent effects from rerunning.
- Cleanup and comparator callbacks may throw. Cleanup failure during a flush does not prevent remaining cleanups or unrelated effects and is reported if unhandled; comparator failure before mutation throws to the direct writer. Error routing follows [ownership.md](./ownership.md).
- Every renderer event handler runs in an automatic synchronous batch. Its writes coalesce into one flush at handler exit; event handler _exceptions_ use the internal `reportError` path rather than an owner boundary, because the handler runs on a later browser call stack outside component creation/effect evaluation.

## Prior art and trade-offs

- [Solid](https://docs.solidjs.com/reference/basic-reactivity/create-effect) uses fine-grained computations and effect scheduling tied to render setup. Benos specifies synchronous public writes and two explicit internal effect tiers so DOM observation has one documented order.
- [Vue](https://vuejs.org/guide/essentials/watchers.html) offers pre, post, and sync watcher flush modes. Benos has fewer knobs: render bindings first, application effects second, with no user-selectable flush mode in v0.1. This trades flexibility for predictable component behavior.
- [Preact Signals](https://preactjs.com/guide/v10/signals/) supports batched updates and immediate reads. Benos adds owner cleanup and a renderer tier as kernel concepts.
- The [TC39 Signals proposal](https://github.com/tc39/proposal-signals/blob/main/README.md) separates synchronous invalidation notification from pull evaluation and leaves effect scheduling to frameworks. Benos makes a synchronous policy choice without changing the pure computed model.

## Test plan for Phase 3 and Phase 4

1. Same-value write produces no jobs; one write flushes before `set` returns; nested batches flush once at the outer boundary.
2. Initial effect inside and outside root setup, initial render binding before user effect, and `onMount` after insertion.
3. A → B/C → D diamond with an effect and a DOM binding: both see only D's final value per flush.
4. Equal computed output suppresses user-effect cleanup and rerun; conditional dependencies switch correctly.
5. A user effect writes state: its current callback is not reentered, render work runs before the next user effect, and a self-write cycle is stopped and reported after the limit is exceeded without throwing to the writer.
6. A callback-throwing batch still flushes and rethrows its callback error; unhandled flush failures are reported separately and never thrown to the signal writer. A disposed queued effect is skipped.
7. Initial and later branch mount jobs wait for connected insertion; detached-host jobs run asynchronously after observed attachment, the observer exists only while they are pending, and disposal cancels jobs and disconnects it.
8. Delegated and native handlers each batch multiple writes into one flush, including when a handler throws; a write after `await` triggers a separate flush.
9. A large queued burst dequeues in linear total time, with O(1) work per dequeue. A real-browser test checks that a user effect reads updated DOM at entry after a write and records the deliberate same-callback caveat.

## Future implications and hard-to-reverse decisions

Synchronous write flushing, render-before-user ordering, nonthrowing flush error reporting, automatic event-handler batching, batch boundaries, and initial effect timing are hard-to-reverse public contracts. Async resources will complete by ordinary writes. A later transition mode must gate render and user jobs owned by a staged or temporarily retained UI region until commit or recovery; it cannot let those jobs mutate or inspect an old region against new signal values while promising that the old UI remains visible. Other roots and regions keep the v0.1 synchronous schedule. A later server-render mode must suppress **user effects as well as DOM render effects and mount jobs**, while keeping synchronous component setup and computed reads; the server host evaluates binding expressions once to produce HTML. Suppressed effect nodes are disposed with their request root, never replayed on the server. Hydration must install render bindings before user effects are allowed to observe the reused DOM. Signal writes do not queue microtasks; the detached-host mount observer is a separate DOM-attachment mechanism.

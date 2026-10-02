# Ownership, context, and errors

**Status:** Phase 1 design; core ownership and context implemented in Phase 3. Renderer and compiler entries below remain provisional Phase 4 contracts.

## Problem and goals

Reactive graph edges are only one part of resource lifetime. Components, effects, conditional branches, event listeners, and future async work need one disposal tree. Context and error boundaries must follow that same logical tree even when a portal moves DOM elsewhere. A component runs once; it cannot depend on a later component rerun to repair leaked work.

## Non-goals

- A public `getOwner`/`runWithOwner` API in v0.1.
- Cross-request async owner propagation or automatic context after `await`.
- Catching browser event-handler exceptions in a component boundary.
- Implementing control flow, refs, JSX, or a DOM renderer in Phase 1.

## Proposed API and owner shape

```ts
export function createRoot<T>(fn: (dispose: () => void) => T): T
export function onCleanup(fn: () => void): void
export function onMount(fn: () => void): void

export interface Context<T> {
  readonly Provider: (props: { value: T; children?: unknown }) => unknown
}

export function createContext<T>(defaultValue: T): Context<T>
export function getContext<T>(context: Context<T>): T
```

The `Context<T>` signature is a core-level semantic sketch; the DOM package narrows its `Provider` children and return types to the `Child`/`JSX.Element` contract in [components.md](./components.md) and [compiler.md](./compiler.md), without introducing `any` into the public API. The first v0.1 overload requires a default. A no-default overload should be added only if the dashboard exposes a real need, because it forces every consumer to handle `undefined` or introduces a throw variant. A context identity is an internal symbol, never a user-supplied string.

```ts
interface Owner {
  parent: Owner | null
  firstChild: Owner | null
  lastChild: Owner | null
  prevSibling: Owner | null
  nextSibling: Owner | null
  cleanups: Array<() => void> | null
  contexts: Map<symbol, unknown> | null
  errorHandler?: (error: unknown) => void
  disposed: boolean
  kind: 'root' | 'component' | 'branch' | 'effect-run' | 'boundary'
}
```

This is a proposed internal type, not a public export. The child links form an intrusive doubly linked list in creation order; a parent holds only its head and tail. `cleanups` and `contexts` start as `null` and are allocated only when `onCleanup` or a provider first needs them. A separate current-owner stack is restored in `finally` after synchronous owner callbacks. Each computation records its creating owner. A root created by `createRoot` is detached and top-level even if called inside another owner; callers must pass values explicitly. Components, branch bodies, provider children, effects, and fallback bodies use **internal** child owners. This keeps `createRoot`'s disposal responsibility clear and avoids an undocumented detached-owner option.

## Ownership and disposal algorithm

1. `createRoot` creates an owner, calls `fn(dispose)` under it, closes its setup transaction, flushes initial jobs, and returns `fn`'s result. The captured `dispose` is idempotent. If creation throws without a matching boundary, the root is disposed before the error escapes.
2. An internal child owner is appended at the tail of its parent's linked list in O(1). A component function executes once under its component owner. Its DOM bindings and event registrations belong to that owner or descendants.
3. Disposal marks an owner disposed before invoking callbacks. It repeatedly disposes `lastChild`, visiting children in **reverse creation order**, depth-first. Each child unlinks itself from its parent by updating at most two sibling links and the parent's head/tail in O(1), including when a keyed list removes one item from the middle. Disposing an entire tree still takes O(number of owners), as it must. The child keeps its parent link through cleanup/error routing, then clears it after unlinking.
4. After children, disposal detaches/disposes computations directly owned by the owner, removing graph subscriptions and queued jobs, and runs its lazily allocated `onCleanup` callbacks in **reverse registration order**. The owner then releases its context map and handler references. Reentrant disposal of the same owner is a no-op.
5. All cleanup callbacks are attempted even if one throws. Errors are collected and sent to the nearest still-active ancestor boundary after traversal. An unhandled error from explicit disposal outside a scheduler flush throws one error or an `AggregateError`; during a flush it is reported after surviving jobs finish, without throwing to the signal writer.
6. Each effect has a stable owner link and a replaceable child **run owner**. Before a genuine rerun, an old run owner with children, cleanups, computations, or other owned resources is disposed (including nested effects and `onCleanup` callbacks), then a new run owner is created. An empty run owner is reused; this has the same observable lifetime because it has nothing to dispose. A skipped queued effect does not clean up. If the initial run tracks no dependencies, the effect node is removed from the owner's computation set and its empty run owner is unlinked immediately; the returned disposer becomes a no-op. This prevents nested effects from accumulating on every rerun without allocating an owner on resource-free reruns.
7. `onCleanup` registers on the current owner, allocating its cleanup array on first use. Calling it without an owner, on a disposed owner, or while that owner is being cleaned up throws in both builds; a development message explains the missing scope. Silent success would guarantee a leak.
8. `onMount` registers one job on a renderer-associated component owner. It is cancelled if the owner is disposed before its turn. It runs under that owner only after the component's representative nodes or anchor have been inserted into a **live document**, including when a later `<Show>`, `<For>`, `<Dynamic>`, or portal branch appears. Cleanup registered inside an `onMount` callback belongs to the component owner and runs on disposal. A core-only root with no renderer mount anchor cannot satisfy this contract, so `onMount` there throws at registration.

### Mount eligibility

The renderer gives each component owner a mount anchor or range and signals the scheduler after initial and later branch commits. A mount job is eligible only when its anchor is connected to a live document (`isConnected`) and render work for that commit has finished. A component with no visible element still has a renderer anchor. If a host or portal target is detached, the job stays pending; one shared observer per document is installed only while jobs already committed into a detached host are pending, watches for external attachment, and is disconnected when none remain. An uncommitted prepared branch does not install the observer. It queues newly eligible jobs after attachment. Thus `onMount` for an externally attached host is asynchronous relative to `render` and attachment, running after the `MutationObserver` callback rather than in the original render call stack. Disposal cancels the job and releases observer interest. A branch removed before eligibility never mounts.

### Ownerless computations

The starting rule says computations outside an owner **warn** in development. Throwing would make module-level computed values awkward, so an ownerless `computed` or `effect` gets a synthetic detached owner and a development warning. A detached computed with no effect downstream has no reverse subscriptions and can be garbage-collected when its accessor becomes unreachable. An ownerless effect that tracks a dependency remains live until its returned disposer is called; an effect that tracks no dependencies detaches after its initial run and its disposer is a no-op. Production uses the same lifetime semantics without the warning. `signal()` itself is state, not a computation, and may be module-level without a warning. This exception reconciles the warning rule with “every computation belongs to an owner.”

## Context resolution

`createContext(defaultValue)` creates an opaque identity and stores the default, even if the default is `undefined`. `Provider` reads `props.value` **once** during creation under `untrack`, creates a child owner, lazily allocates that owner's context map, and stores the captured value. The untracked capture prevents an enclosing render effect from accidentally subscribing to a value that the provider will not update. `getContext` walks current owner → parent until it finds a provider; `null` maps are skipped, and a map with an explicit `undefined` value shadows the default. If no provider is found, it returns the default. Looking up a context outside an owner throws in **both** builds; the proposed development-only throw would make server and production behavior diverge and hide misplaced calls.

Context is a typed reference to a value, not a reactive variable by itself. A consumer that needs changing data should receive a signal or a stable object containing signals. A changed `props.value` does **not** replace the captured context or recreate the provider subtree. In development, a diagnostic tracking effect observes the prop getter and warns once per provider if its value later differs by `Object.is`; production omits that diagnostic. Mutating a signal passed as the stable context value does not warn. A caller that deliberately needs a new provider value can explicitly remount the provider through keyed control flow. This follows the run-once component model and is illustrated by the Provider contract in [components.md](./components.md). A portal preserves its logical owner parent, so context follows where the component was declared, not the DOM destination.

## Error propagation

- Component creation and effect callbacks execute under an owner. A thrown value travels from that execution owner to the nearest ancestor boundary handler. If the handler throws, routing continues at the boundary's parent. An unhandled **synchronous component/root creation** error outside a scheduler flush disposes the failed root and throws to its caller. An unhandled error during a scheduler flush is collected while remaining jobs run, then sent to the internal `reportError` reporter; it never throws to the signal writer.
- A computed error is cached by the graph and rethrown on read. When a component or effect reads it, that **reader's execution owner** determines the boundary. A direct imperative read with no active owner throws to its caller. This makes a shared computed catchable by the boundary around the UI that consumes it, rather than by an unrelated owner where it was first defined.
- The DOM `<ErrorBoundary>` will own a child content scope. On a handled error it disposes that scope before creating fallback under a separate scope. An error in the fallback is offered to the next outer boundary. A later retry must create a fresh child scope; the exact retry trigger is Phase 4 design work.
- The renderer wraps every browser event handler in a synchronous `batch`, so multiple writes in one handler cause one flush after it finishes. Handler exceptions are caught after that flush and sent through the same internal `reportError` path; they are **not** routed to an owner boundary. This prevents a click handler from unexpectedly replacing a component subtree and separates event failure from rendering failure. The internal reporter delegates to `globalThis.reportError` when present and otherwise uses `console.error`; it shields a throwing host reporter so reporting never throws back into a signal writer. The public reporter API, if any, is deferred to Phase 4.
- Disposal errors follow the same owner walk after all cleanup callbacks run. A boundary that is itself being disposed is skipped as a handler, avoiding fallback creation inside a dying subtree.

## Remaining Section 6 decisions: provisional Phase 4 contracts

The following decisions are reviewed now because they influence owner and graph primitives. They are **required for v0.1** except where marked “designed now, built later.” No renderer or compiler code is added in Phase 1.

| Area                 | Decision, reason, and hard-to-reverse point                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Components and props | Confirm plain functions that run once. JSX props should be getter-backed so `props.name` can track a signal in a binding. Destructuring snapshots a value and must not be silently rewritten. `splitProps` and `mergeProps` should return getter-preserving views; an ESLint rule and compiler development diagnostic can catch syntactically visible destructuring. Runtime cannot reliably detect all destructuring. Component execution semantics and props behavior are hard to reverse.                                                                |
| Children             | Confirm `children(() => props.children)` as an owner-bound lazy memo of child resolution. It prevents duplicate child creation when read twice and gives each created branch a disposal scope. Phase 4a fixes the child value and recursive array-normalization rules in [components.md](./components.md); the exact declaration-level generics are implemented and type-tested in Phase 4b. Children behavior is hard to reverse.                                                                                                                          |
| Lifecycle            | Confirm only `onMount` and `onCleanup` publicly. Mount waits for the component's anchor in a live document, including later branches; cleanup has deterministic depth-first order. No hook call-order rules or dependency arrays.                                                                                                                                                                                                                                                                                                                           |
| Refs                 | Confirm callback refs only. A ref is called with its non-null element after creation, under that element's owner, and is **never** called with `null` on teardown. Code needing teardown registers `onCleanup` in that owner; the renderer still removes its own listeners when the owner disposes. This preserves the supplied `ref={el => (input = el)}` type and makes ref behavior hard to reverse.                                                                                                                                                     |
| Renderer interface   | Confirm core contains no DOM types or imports. The small internal host/owner/binding contract is documented in [renderer.md](./renderer.md), leaving non-DOM renderers possible. It remains an unsupported internal subpath until a second renderer validates it; package boundaries and public exports are hard to reverse.                                                                                                                                                                                                                                |
| Control flow         | Keep `<Show>` and `<Switch>/<Match>` for conditional branch owner creation/disposal; `<For>` for keyed identity, movement, and per-item owners; `<Dynamic>` for replacing component scopes; `<Portal>` for moving DOM while preserving logical ownership; `<ErrorBoundary>` for owner-based error recovery. Plain `if` and `.map()` run only once inside a component and cannot reconcile later collection/branch changes by themselves. `<For>` uses item identity by default; `by` supplies custom stable keys. Duplicate keys get a development warning. |
| DOM details          | Confirm standard `class` and `for`, delegated listeners for common bubbling events, native listeners otherwise, automatic `batch` around every handler, and cleanup on owner disposal. Attribute names and event semantics are hard to reverse. Accessibility and RTL tests must be in Phase 4.                                                                                                                                                                                                                                                             |
| JSX/compiler         | Confirm JSX transform is required, optimizations optional and behavior-preserving. [compiler.md](./compiler.md) selects Babel for the v0.1 transform because of ecosystem maturity and source-map/debuggability, with SWC/Oxc comparison after fixture parity. Vite 8's bundler does not require the JSX compiler to use the same parser. Source maps and readable development output are required. JSX output format and dev/prod parity are hard to reverse.                                                                                              |

## Prior art and trade-offs

- [Solid's roots](https://docs.solidjs.com/reference/reactive-utilities/create-root), [cleanup](https://docs.solidjs.com/reference/lifecycle/on-cleanup), [context](https://docs.solidjs.com/reference/component-apis/create-context), and [error scopes](https://docs.solidjs.com/reference/reactive-utilities/catch-error) show why ownership belongs below the DOM layer. Benos makes a detached `createRoot` the only public root variant, and specifies cleanup/error ordering more narrowly.
- [Vue effect scopes](https://vuejs.org/api/reactivity-advanced.html) offer explicit capture/disposal of reactive effects; Vue also has component lifecycle and watcher flush modes. Benos uses one owner tree for component, effect-run, branch, and context lifetime.
- [Preact Signals effects](https://preactjs.com/guide/v10/signals/) return a disposer but its component integration can rerender components. Benos returns a disposer as well while keeping run-once components and owner-based subtree disposal.

## Test plan for Phase 3 and Phase 4

1. Root disposal is idempotent; descendants dispose in reverse creation, depth-first order; removing one middle child from a large keyed list unlinks in O(1); local cleanups run in reverse registration order even when one throws.
2. Nested effects created during an effect run are disposed before its next run; no old listener or subscription survives. An effect that reads no dependencies is detached after its initial run and is not retained for later disposal.
3. Disposed nodes disappear from signal subscriber sets and scheduler queues. A retained external signal cannot keep a disposed component/effect alive.
4. Owners without providers or cleanups allocate neither map nor array. Context shadowing, explicit `undefined` provider, default fallback, detached root isolation, and `getContext` outside an owner.
5. Provider captures its value once; a changed reactive value prop warns once in development without remounting or changing context; a stable signal value does not warn.
6. Component/effect/computed-read errors select the nearest **reader** boundary; fallback failure reaches the parent. Unhandled flush errors report after surviving jobs and never throw to the writer; explicit disposal errors still complete traversal before throwing.
7. An event-handler throw is reported once and does not activate a component error boundary.
8. Initial and later-branch `onMount` runs only after connected insertion; detached-host attachment and pre-mount disposal are covered. Callback refs never receive `null`, and user teardown registered through `onCleanup` runs.
9. Phase 4 integration tests for `<Show>`, keyed `<For>` movements, `<Portal>` logical context, refs, event cleanup, and a component that never reruns when its signal changes.

## Future implications and hard-to-reverse decisions

Ownership must be established before async or SSR is built. A future resource will register cancellation on its owner; late promise settlement after disposal must be ignored. Suspense and transitions will create boundary scopes and schedule state changes without changing `onCleanup`'s order. Prepared branches own their effects and mount jobs, but those jobs remain ineligible until the branch commits to a live document. A retained visible branch in a transition remains owned and subscribed, while its region's render and user jobs are gated until commit or recovery so its DOM stays coherent. A server render gets one detached renderer root per request and disposes it when rendering completes or aborts. A public `createRoot` invoked synchronously during server rendering remains **detached for context and ownership**, but inherits the request's server execution mode and is registered for request-end disposal even if its caller forgets its disposer. Server mode accepts lifecycle registration in renderer-associated component owners but suppresses user effects, DOM render effects, and `onMount` execution; their nodes are disposed with their roots. Streaming continuations will require an **explicit** owner token/continuation mechanism rather than pretending the synchronous current-owner stack survives `await`. Hydration must reconstruct logical owners around reused DOM; portals and error boundaries must preserve those owners. The public owner API, context lookup semantics, error routing, and disposal order are hard-to-reverse commitments.

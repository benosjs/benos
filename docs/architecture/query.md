# Query cache, mutations, and invalidation

**Status:** Q1 design for review. Nothing here is implemented. [The track brief](../query-plan.md) sets scope; [the flagship target](./flagship-integration.md) is the compatibility test; [async.md](./async.md) and [router.md](./router.md) define the contracts this package builds on.

## Goals and boundary

A query is a typed, shared, cached view of server state. It must join the existing signal graph the way a `resource()` does: synchronous reads, completion by ordinary batched writes, owner-bound lifetime, and no promise-throwing render convention. On top of that it adds what a resource deliberately lacks: identity shared across components and routes, deduplication, staleness, garbage collection, retries, and declarative invalidation from mutations.

Design rules:

1. **Identity is a typed reference.** A cache entry is named by `(query definition, normalized arguments)`. The definition object is the namespace, so there is no global string-key space. Invalidation targets are references produced by a definition; a raw string or array is a type error.
2. **No stale identity.** An observer whose arguments change from A to B never presents A's value as B's. Keeping old UI during a change is the job of transitions and route loaders, which already do it atomically.
3. **Explicit defaults.** No retries, no window-focus refetching, and no global listeners unless a query opts in. 0.4 promised "no hidden retries"; 0.5 keeps that promise.
4. **Declarative mutation effects.** A mutation states which entries it `affects`, which values it `writes`, and how it updates entries `optimistic`ally. Components do not call `invalidate`.
5. **Request-local on the server.** The default page-global cache exists only in the browser. Server rendering (not part of 0.5) must use an explicit request cache, and only opted-in data is serialized.

Not in 0.5: infinite or paginated queries, `select` projections (use `computed`), structural sharing, persistence, polling intervals, devtools, and the SSR implementation.

## Package boundary and size budget

The new public package is **`@benosjs/query`**. It depends on `@benosjs/core` (public API only) and `@benosjs/async` (public `resource` for Suspense participation). It does **not** import `@benosjs/router` or `@benosjs/dom`: the loader adapter is a plain function that a route loader calls, typed structurally. No module reads `window` or `document` at import; the opt-in focus and reconnect triggers attach listeners only when the first query that enables them gets an observer.

Proposed cap: **3,584 bytes** minified + gzip for the production entry with core, DOM, and async external, measured by a new `pnpm size` row on the same basis as the async and router caps. `pnpm size` should also print the fully bundled `core + dom + async + query` and `core + dom + async + router + query` totals so externalization cannot hide application cost.

Estimate by part, after compression: key normalization and interning 300–380 B; entries, deduplicated fetch and reference-counted abort 500–600 B; stale/gc timers 180–220 B; retries and backoff 120–160 B; observers over `resource` 300–380 B; cache scope and context 150–200 B; mutations and their state 300–380 B; `affects` targets and invalidation 200–260 B; writes, optimistic layers and rollback 260–340 B; `load` adapter 120–160 B; opt-in focus/reconnect 100–130 B. Total **2,530–3,210 B**. The cap leaves room for the high estimate plus test-driven fixes. If Q2 + Q3 cannot fit, stop with measured alternatives instead of dropping behavior silently.

### Comparable production measurements

On 2026-10-19, an isolated temporary npm install (`--ignore-scripts`) measured the packages below with esbuild 0.28.2: `bundle`, `minify`, `treeShaking`, `platform: 'browser'`, `format: 'esm'`, `target: 'es2022'`, production/browser conditions, no legal comments, default Node gzip. `solid-js` was external; each package's own dependencies were bundled.

| Comparable public surface                                                                                                                                                  | Minified bytes | Gzip bytes |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------: | ---------: |
| `@tanstack/query-core` 5.104.4: `QueryClient, QueryCache, MutationCache, QueryObserver, MutationObserver, hashKey, matchQuery, dehydrate, hydrate`                         |         35,141 | **10,167** |
| `@tanstack/solid-query` 5.104.4 (core bundled): `QueryClient, QueryClientProvider, useQuery, createQuery, useMutation, createMutation, useQueryClient, dehydrate, hydrate` |         38,751 | **11,594** |
| `@solidjs/router` 1.0.0 data subset: `query, createAsync, action, useAction, useSubmission, revalidate, reload`                                                            |          6,993 |  **3,197** |

These are named-export surface measurements, not feature-for-feature benchmarks. TanStack includes infinite queries, structural sharing, persisters' hooks, and much more. Solid's subset pulls in router-coupled action and navigation code, but has no retries, garbage-collection options, or optimistic rollback. The proposed **3,584 B** cap is **6,583 B below query-core** and **387 B above Solid's data subset**, and buys retries, rollback, typed writes, and gc policy that Solid leaves to applications.

## Defining a query

```ts
type KeyPart =
  | string
  | number
  | boolean
  | null
  | readonly KeyPart[]
  | { readonly [name: string]: KeyPart }

interface QueryOptions<A, T> {
  fetch(
    args: A,
    context: { signal: AbortSignal; attempt: number },
  ): T | Promise<T>
  key?(args: A): KeyPart // defaults to args itself; required when A is not a KeyPart
  staleTime?: number // ms; default 5_000; Infinity means never stale by time
  gcTime?: number // ms an unretained entry survives; default 300_000
  retry?: number | ((attempt: number, error: unknown) => boolean) // default 0
  retryDelay?: (attempt: number) => number // default min(1_000 * 2 ** attempt, 30_000)
  refetchOn?: { focus?: boolean; reconnect?: boolean } // default none
  ssr?: {
    id: string
    serialize(value: T): unknown
    deserialize(value: unknown): T
  }
}

function query<A = void, T = unknown>(
  options: QueryOptions<A, T>,
): Query<A, Awaited<T>>
```

`A` is inferred from the annotation on `fetch`'s first parameter, `T` from its return type. A query without arguments declares `fetch: (_: void, { signal }) => …` and is called with no argument. Several arguments are passed as one object; this keeps one inference site and one key function.

```ts
const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
})
const projectsQuery = query({
  key: (filter: { owner?: string; archived: boolean }) => filter,
  fetch: (filter, { signal }) => listProjects(filter, signal),
  staleTime: 30_000,
})
```

The `Query<A, T>` definition is stateless and safe to declare at module level. It holds no entries; entries live in a cache.

```ts
interface Query<A, T> {
  // owner-bound observer; source is tracked like resource()'s
  (source: () => A | false | null | undefined): QueryObserver<T>
  key(args: A): QueryKey<T>
  where(match: (args: A) => boolean): QueryTarget
  load(
    args: A,
    signal?: AbortSignal,
    cache?: QueryCache,
  ): Promise<QueryEntry<T>>
  prefetch(args: A, cache?: QueryCache): void
  peek(args: A, cache?: QueryCache): T | undefined
}
```

For `A = void`, the observer call accepts an optional `() => boolean` enable source and `key()` takes no argument. A `Query` is itself a `QueryTarget` meaning "every entry of this definition".

## Keys and identity

The identity of an entry is the pair (definition object, canonical key string). The canonical string is a stable serialization of `key(args)`: arrays keep order, object keys are sorted, `undefined` object properties are omitted. Development builds reject `NaN`, `±Infinity`, `-0`, sparse arrays, and non-plain objects (dates, maps, class instances) with a message naming the definition; production builds do not check, because the key type already excludes them. Because the definition is part of the identity, two queries can both use `id` as their key without colliding, and minification cannot merge them.

`projectQuery.key('p-1')` returns an **interned** `QueryKey<T>` per cache-independent identity, so `projectQuery.key('p-1') === projectQuery.key('p-1')`. Interned keys are held in a map per definition and released with the last entry that uses them, so keys do not leak across long sessions. A `QueryKey<T>` carries its data type as a phantom brand and offers typed write descriptors:

```ts
interface QueryKey<T> extends QueryTarget {
  set(value: T): QueryWrite
  update(fn: (previous: T) => T): QueryWrite // no-op when the entry has no data
}
```

`QueryTarget` and `QueryWrite` are opaque branded types. Only a definition, `where()`, or `key()` can create a target, and only `set()`/`update()` can create a write. That is what makes "invalidate by typed reference" enforceable: `affects: () => ['project', id]` does not type-check, and neither does `projectQuery.key(42)` or `projectQuery.key(id).set(someUser)`.

Why not string keys: TanStack's array keys are flexible and prefix matching is powerful, but a typo in an invalidation key fails silently, and the key and the fetcher can drift apart. Solid's `query(fn, name)` keys by `name + hashKey(args)`, which is closer, but invalidation still uses strings (`revalidate(key)`) and names can collide. Benos gives up ad hoc prefix matching across unrelated queries; `where()` covers the common "all project lists for this owner" case with a typed predicate over the arguments.

## Cache scope

```ts
function createQueryCache(options?: { snapshot?: QuerySnapshot }): QueryCache
function QueryCacheProvider(props: {
  cache: QueryCache
  children: unknown
}): unknown

interface QueryCache {
  invalidate(...targets: QueryTarget[]): Promise<void>
  write(...writes: QueryWrite[]): void
  dispose(): void
}
```

Resolution order for every operation: an explicit `cache` argument, then the nearest `QueryCacheProvider` in the current owner context, then the **default cache**, created lazily on first use in the browser. Tests and multi-app pages pass their own cache. On the server, resolving the default cache throws: request isolation cannot be implicit ([ssr.md](./ssr.md), request and owner lifetime, rule 4).

`cache.invalidate` and `cache.write` are imperative escapes for external events such as a websocket push. Component code is expected to use mutations instead. `dispose()` aborts every in-flight fetch, clears every timer and focus listener, and marks the cache dead; later operations against it throw.

## Entries and their lifecycle

Each entry holds: its key, the arguments that first created it, a `value` signal, a `fetching` signal, an `error` signal, `updatedAt`, an `invalidated` flag, a generation counter, the in-flight request (promise, shared `AbortController`, joiner count), a retainer count, and a gc timer.

```ts
interface QueryEntry<T> {
  readonly key: QueryKey<T>
  readonly value: ReadonlySignal<T> // always has data: entries are handed out only once ready
  readonly fetching: ReadonlySignal<boolean>
  readonly error: ReadonlySignal<unknown> // last refresh error, undefined after a success
  refresh(): Promise<T | undefined>
}
```

A `QueryEntry` handle is given out only by `load()`, after the entry has data, so its `value` is typed `T`, not `T | undefined`. Entries never lose data while retained: there is no public remove or reset in 0.5, and gc removes only unretained entries.

**Retention.** An entry is retained by each live observer currently pointing at it, each loader retention (see below), and each pending mutation that holds an optimistic layer on it. When the retainer count reaches zero, a gc timer of `gcTime` starts; a new retainer cancels it. On expiry the entry is removed and its interned key released. Fake-timer tests pin this. On the server, timers are never created; the request cache is disposed with the request.

**Staleness.** An entry is stale when it is `invalidated` or when `now - updatedAt >= staleTime`. Staleness is evaluated **lazily** at a trigger; there is no reactive "is stale" signal and no timer per entry, which keeps the graph free of clock-driven writes. A stale entry refetches, if no fetch is already in flight, at these triggers:

1. An observer attaches to it (component setup or an argument change).
2. `load()` or `prefetch()` names it.
3. It is invalidated while retained (immediate background refetch). An unretained invalidated entry is only flagged and refetches at its next trigger.
4. A window `focus`/`visibilitychange` to visible, or an `online` event, for queries with `refetchOn` enabled, for retained entries only.
5. An explicit `refresh()`, which refetches even when fresh.

A refetch of an entry that has data is stale-while-revalidate: `value` keeps the old data, `fetching()` is true, and the new value replaces it in one batch. The 5,000 ms default `staleTime` is chosen so that a route loader followed immediately by a component observer of the same entry does not fetch twice (TanStack's default of 0 does), and matches Solid's preload reuse window. It is an open decision in the checkpoint.

**Deduplication.** At most one request per entry is in flight. Any trigger, `load()`, or observer that needs data while a request is in flight **joins** it, incrementing the joiner count. The request's `AbortController` is shared. A joiner that goes away (observer argument change, observer disposal, loader supersession through its `AbortSignal`) decrements the count; when the count reaches zero **and** the entry has no other retainer waiting for data, the request is aborted. Abort is advisory; the generation check below is the guard.

**Generations.** Every request and every cache write increments the entry generation. A request may write its result only if the generation it started with is still current. So a refetch that started before a mutation's write, an optimistic update, or a newer refetch can never overwrite it. This is the query-level counterpart to the resource A → B → A rule in [async.md](./async.md).

**Failure and retries.** A rejection after `signal.aborted` is a cancellation, not a failure: no retry, no `error`. Otherwise, while `retry` allows it, the request waits `retryDelay(attempt)` and calls `fetch` again with `attempt + 1` and the same signal; the entry stays `fetching`. Abort during backoff clears the timer and settles as cancelled. When retries are exhausted, the entry keeps its last data (if any), sets `error`, and clears `invalidated` only on success. Retries never run on the server. Mutations never retry in 0.5, because their `run` is not assumed to be idempotent.

**Values are treated as immutable.** Replacement uses `Object.is`; there is no structural sharing. Development builds deep-freeze plain objects and arrays placed into the cache, so an accidental in-place mutation fails loudly instead of desynchronizing observers. Production builds do not freeze.

## Observers in components

```ts
interface QueryObserver<T> extends Resource<T> {
  fetching: ReadonlySignal<boolean>
  error: ReadonlySignal<unknown>
}
```

`projectQuery(() => match.params().projectId)` must run under an owner, like `resource()`. Its source is tracked; `false`, `null`, or `undefined` disables it. Because it extends `Resource<T>`, an observer works anywhere a resource does, including `<Suspense>` and `startTransition`.

| Observer field | Meaning                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value()`      | The current argument's entry value, or `undefined` if that entry has no data yet. **Never another argument's value.**                                                                                                       |
| `state()`      | `disabled`; `pending` while the current entry has no data and a request is in flight; `ready` while it has data (including during a background refetch); `failed` only when it has **no** data and its last request failed. |
| `read()`       | Like `resource.read()`: registers with the nearest Suspense boundary while `pending`, throws the error while `failed`, otherwise returns `value()`.                                                                         |
| `fetching()`   | True during any request for the current entry, including background refetches and retry backoff.                                                                                                                            |
| `error()`      | The current entry's last request error, even when stale data is still shown; `undefined` after a success.                                                                                                                   |
| `refresh()`    | Refetches the current entry even if fresh, joining an in-flight request if one exists. Resolves to the new value, or `undefined` on failure, cancellation, or when disabled. Never rejects.                                 |
| `cancel()`     | Releases this observer's interest: leaves the request (aborting it if it was the last joiner) and disables the observer until `refresh()` or a different argument, as `resource.cancel()` does.                             |

A background refetch failure keeps `state()` at `ready` and reports through `error()`. Throwing it from `read()` would replace a working screen with an error boundary because a revalidation failed; TanStack makes the same split between `status` and `error`.

This differs from `resource()` in one deliberate way: a resource keeps its last successful value while a **new key** is pending, while a query observer does not. A resource is a single slot, so "last value" is unambiguous. A cache has a value per key, and showing A's cached data under B's arguments is exactly the stale-identity bug the flagship redesign removed. To keep A's UI on screen while B loads, wrap the argument change in `startTransition` (the retained region stays on A's DOM until B is ready) or let the route loader do it. A future `placeholder: 'previous'` option can be added if the validation app proves a need.

**Implementation seam.** An observer is built from public pieces: a `resource()` whose source is the observer's source and whose fetcher returns the entry's value synchronously when it has data, or joins its in-flight request otherwise. That resource supplies Suspense tokens, transition staging, `AbortSignal` on key change, and owner disposal exactly as 0.4 tests them. The observer's `value` is a `computed` over the current entry's value signal, so cache writes, optimistic updates, and background refetches reach it without a new resource generation. No internal async API is required.

**Owner disposal.** The observer registers `onCleanup` on its owner: it leaves any request it joined, releases its retention (which may start the gc timer), and stops tracking its source. A late completion after disposal writes only cache signals, which no disposed binding observes.

## Mutations

```ts
interface MutationOptions<I, O> {
  run(input: I, context: { signal: AbortSignal }): O | Promise<O>
  affects?(input: I, output: Awaited<O>): readonly QueryTarget[]
  writes?(input: I, output: Awaited<O>): readonly QueryWrite[]
  optimistic?(input: I): readonly QueryWrite[]
  awaitRefetch?: boolean // default true
}

type MutationResult<O> =
  { ok: true; value: O } | { ok: false; error: unknown; cancelled: boolean }

interface Mutation<I, O> {
  (): MutationHandle<I, O> // owner-bound state, created during setup
  run(input: I, cache?: QueryCache): Promise<MutationResult<O>>
}

interface MutationHandle<I, O> {
  run(input: I): Promise<MutationResult<O>>
  state: ReadonlySignal<
    | { status: 'idle' }
    | { status: 'pending' }
    | { status: 'succeeded'; value: O }
    | { status: 'failed'; error: unknown }
  >
  pending: ReadonlySignal<boolean>
  cancel(): void
  reset(): void
}

function mutation<I, O>(options: MutationOptions<I, O>): Mutation<I, Awaited<O>>
```

`I` is inferred from `run`'s first parameter and `O` from its return type; `affects` and `writes` receive both, so a create mutation can target the server-assigned ID:

```ts
const saveProject = mutation({
  run: (input: { projectId: string; values: EditProject }, { signal }) =>
    putProject(input.projectId, input.values, signal),
  writes: (input, saved) => [projectQuery.key(input.projectId).set(saved)],
  affects: () => [projectsQuery],
})
const toggleStar = mutation({
  run: (input: { id: string; starred: boolean }, { signal }) =>
    putStar(input.id, input.starred, signal),
  optimistic: (input) => [
    projectQuery
      .key(input.id)
      .update((p) => ({ ...p, starred: input.starred })),
  ],
  affects: (input) => [projectQuery.key(input.id)],
})
```

**Run algorithm.**

1. Resolve the cache (captured at handle creation for `saveProject()`, resolved at call time for `saveProject.run`). Start a fresh `AbortController`. Set the handle's state to `pending`.
2. If `optimistic` is present, evaluate it and apply its writes in one `batch`. Each write records an optimistic layer on its entry: the previous value and the generation it produced. Applying a write bumps the entry generation, so an in-flight fetch for that entry cannot land on top of the optimistic value. Layers retain their entries.
3. Call `run` untracked. A synchronous throw follows the failure path.
4. **Success:** in one `batch`, apply `writes`, discard optimistic layers (their values are superseded by writes or by the refetch), and mark every `affects` target invalidated. Retained affected entries refetch immediately; others refetch at their next trigger. A written entry is not refetched unless it is also in `affects`. If `awaitRefetch` is true, the result promise waits for the refetches of retained affected entries to settle; a refetch failure is reported on that entry's `error()` and does not fail the mutation.
5. **Failure:** roll back each optimistic layer whose entry generation still equals the layer's generation (nothing newer has touched it), restoring the previous value. A layer that something else has since overwritten (another mutation, a refetch that started later, a cache write) is not restored blindly: its entry is invalidated instead, so the server decides. No `affects` invalidation runs on failure; the flagship requires that a failed save does not refresh.
6. **Cancellation** (`cancel()` or owner disposal of the handle aborts the signal): if `run` still resolves, the success path runs; abort is advisory and the server may have committed. If it rejects, optimistic layers roll back as in step 5 **and** the `affects` targets are invalidated, because the server state is unknown. The result is `{ ok: false, cancelled: true }`.
7. The returned promise **never rejects**. Browser event handlers can call `void save.run(input)` without producing unhandled rejections, and the flagship form reads `state()` instead of using `try/catch`.

**Owner disposal.** Disposing the handle's owner aborts nothing by default and stops only the handle's own state signals; the cache effects in steps 4–6 still happen. This is what lets the flagship save finish after navigation and still refresh the saved record. `cancel()` is the explicit way to abort. Concurrent `run` calls on one handle are allowed: `state()` reflects the latest run, `pending()` is true while any run is pending, and every run applies its own cache effects.

## Router loaders share identity with queries

The flagship route stays as written:

```ts
const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
```

`load(args, signal)` resolves to the entry's `QueryEntry<T>` handle once the entry has data:

- **Fresh cached entry:** resolves immediately, without fetching. Back navigation to a visited project no longer waits on the network. This closes the "Loader caching is not included" finding.
- **Stale cached entry:** resolves immediately with the cached handle and starts a background refetch.
- **No data:** joins or starts the request; resolves when it succeeds; rejects with the request error so the router shows its route error view and `retry` starts a new navigation generation.
- **Supersession:** the router aborts the loader's `signal`; `load` leaves the request (aborting it only if it was the last joiner) and rejects with the router's cancellation, which the router already ignores.

Because the loader resolves to a **handle**, `match.data()` is a `QueryEntry<Project>`. The router keeps its 0.4 guarantee unchanged: `params` and `data` switch at commit in one batch, so A's handle is never shown with B's params. After commit, `match.data().value()` is a live cache signal, which gives the flagship form exactly the sources it needs:

- A background refetch or a mutation's `writes`/`affects` for the **same** record updates `match.data().value()` in place without a router reload, so pristine fields update and dirty fields are kept by the form.
- A **different** record arrives only as a new handle at navigation commit, which is the form's reset signal.
- A late result for A can only write A's entry. B's handle cannot change because of it.

**Loader retention.** A route needs its entry kept for as long as the match is committed, or a later invalidation would miss it after gc. The router runs each loader synchronously inside a per-match root (`createRoot` in `loadRecord`), and disposes that root when a candidate is superseded, when a committed match is replaced, and when the router is disposed. `load` therefore registers its retention with `onCleanup` on the current owner when one exists. Without an owner (imperative prefetch code), the entry is held only by the gc timer. This uses existing router behavior, but it is not documented today, so Q4 must document it as a router contract and pin it with tests (see the change table).

The loader cache: `load` resolves the cache from its explicit argument or the default cache. The loader root is detached, so a `QueryCacheProvider` above the outlet is not visible to loaders. Apps that need an isolated cache with loaders pass it explicitly, for example through the router `context`: `loader: ({ params, signal, context }) => projectQuery.load(params.projectId, signal, context.cache)`. Q4 decides whether a typed router context makes that pleasant enough.

A page that does not use a loader can still observe the same entry with `projectQuery(() => match.params().projectId)`; both paths see one entry, one request, and one invalidation.

## Type inference and type errors

```ts
const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal), // Promise<Project>
})
// projectQuery: Query<string, Project>
// projectQuery(() => id()): QueryObserver<Project>
// projectQuery.key('p-1'): QueryKey<Project>
// projectQuery.load('p-1'): Promise<QueryEntry<Project>>
// projectRoute.match().data(): QueryEntry<Project> (after the router type change below)
```

Type-level tests in Q2–Q4 (with `expect-type` and `@ts-expect-error`, included by `pnpm typecheck:types`) must cover:

- `A` and `T` inference from `fetch`, including `void` arguments and synchronous `fetch`.
- A missing `key` when `A` is not a `KeyPart` (for example a `Date` or a class) is an error; a `key` returning a function or `Map` is an error.
- `projectQuery.key(42)` with `A = string` is an error; `where()`'s predicate receives `A`.
- `affects: () => ['project', id]` and `affects: () => ['project']` are errors; any definition, `key()`, or `where()` is accepted.
- `projectQuery.key(id).set(user)` with a non-`Project` value is an error; `update`'s callback receives `Project`.
- `I` and `O` inference from `run`, and `affects`/`writes` receiving `(I, Awaited<O>)`.
- `MutationResult<O>` narrows on `ok`; `state()` narrows on `status`.
- The route loader returning `projectQuery.load(...)` makes `match.data()` a `QueryEntry<Project>` whose `value()` returns `Project`.

## Required changes outside `@benosjs/query`

| Package | Change                                                                                                                                                                                                                                                                                                                  | Public impact                   | Gzip estimate |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------: |
| core    | None. Observers, entries, and mutations use public `signal`, `computed`, `batch`, `untrack`, `onCleanup`, `createContext`, and `getContext`.                                                                                                                                                                            | None                            |           0 B |
| DOM     | None. The query package does not render.                                                                                                                                                                                                                                                                                | None                            |           0 B |
| async   | None. Observers wrap public `resource()` for Suspense and transitions.                                                                                                                                                                                                                                                  | None                            |           0 B |
| router  | **Type-only:** the internal `Immutable<T>` used by `MatchHandle.data` maps every object, so a callable such as `ReadonlySignal<T>` loses its call signature and `match.data().value()` cannot type-check. Add a first branch that leaves function types unchanged. This also fixes loaders that return functions today. | `MatchHandle` data type changes |   0 B (types) |
| router  | **Contract only:** document and test that a loader is called synchronously under a per-match owner whose cleanup runs on supersession, replacement, and router disposal. This is current behavior.                                                                                                                      | Documentation and tests         |           0 B |

Fallback if Q4 shows the owner contract is too implicit to rely on: add `onRelease(fn)` to the loader input, called at the same three points. Estimate **+24–40 B** in the router (current headroom **819 B**). It would also change the flagship loader line to pass the loader input to `load`. This is not proposed now.

At Q1, `pnpm size` on the 0.4.0 `main` build measures core **4,303 / 4,608 B**, core + DOM **11,010 / 11,264 B**, async **1,644 / 4,096 B**, router **6,349 / 7,168 B**, core + DOM + async **12,246 B**, and core + DOM + async + router **17,871 B**. Q1 adds no bytes to any package.

## Flagship sketch amendments

The [flagship target](./flagship-integration.md) works on this design with these adjustments. They are listed for approval rather than applied, because flagship-integration.md is the shared target for the forms track too.

1. `fetch` receives `(args, { signal, attempt })`, matching `resource()`'s fetcher context, instead of `(args, signal)`. The flagship line becomes `fetch: (id: string, { signal }) => getProject(id, signal)`.
2. The `key: (id) => ['project', id] as const` line is valid but redundant: the definition is already the namespace. The shorter form omits `key`.
3. `projectRoute.match().data()` is a `QueryEntry<Project>`; `formModel` reads `.value()` for its source and treats a new handle as a new identity. The editor code is unchanged.
4. `mutation.run` may take a second `{ signal }` argument; the flagship's one-argument `run` stays valid. `affects: (input) => [projectQuery.key(input.projectId)]` is unchanged.

With these, the flagship's editor block is still 13 lines and its shared setup loses one line (the redundant `key`).

## SSR serialization compatibility

SSR is not implemented in 0.5, but the API reserves it with the same opt-in rule as the [resource codec](./async.md):

- A definition opts in with `ssr: { id, serialize, deserialize }`. `id` is stable within the app, and the canonical key string is the validation key, so no separate `key()` codec is needed. Definitions without `ssr` are client-only: on the server their observers stay `pending` inside Suspense fallback and do not hold the stream open, and their loaders are a server error unless the route is client-only.
- A request cache (`createQueryCache()` under the request owner) collects ready entries of opted-in definitions. The snapshot holds `{ version, id, key, value }` per entry, with `value` from `serialize`. Errors, in-flight requests, and optimistic layers are never serialized. The payload is escaped and bounded per [ssr.md](./ssr.md).
- The client creates its cache with `createQueryCache({ snapshot })` **before** hydrate setup. Observers and loaders claim matching entries without fetching. A missing, mismatched, or invalid entry is ignored and fetched on the client.
- `updatedAt` for a hydrated entry is the client's hydration time, not the server's clock, so clock skew cannot make it immediately stale or fresh forever.
- On the server: no timers, no retries, no focus listeners, and no default cache.

## Failure and race cases

- An observer's argument changes A → B → A while requests are in flight: A's first request may still fill A's entry (it is A's data), but the observer only ever presents the entry for its current argument, and B's request is left when the observer moves back to A.
- Two components and a loader need the same missing entry in one navigation: one request, three joiners. Superseding the navigation removes one joiner; the request continues for the components.
- A refetch starts, then a mutation writes the entry, then the refetch resolves: the generation check drops the refetch result. The mutation's `affects` refetch, which starts after the write, is the one that lands.
- Two optimistic mutations on one entry, the first fails after the second applied: the first layer is not restored, because its generation is no longer current; the entry is invalidated instead.
- A save finishes after its editor is disposed: the handle state is gone, the cache still applies writes and invalidation, and the retained route entry (if the user is still on that record) refetches.
- A `fetch` ignores `AbortSignal`: its late result is dropped by the generation check, or, if it is still the current generation, it is valid data for its own key.
- An entry is invalidated while unretained, then gc'd before use: nothing refetches; the next use fetches fresh.
- `cache.dispose()` with pending mutations: their run promises still settle (as cancelled if their `run` rejects after abort) and their cache effects become no-ops.
- A fetch resolves synchronously: completion still uses one generation check and one batch, like a resource.

## Prior art and trade-offs

**TanStack Query** ([important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys), [optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)) is the reference for cache semantics: stale-while-revalidate, dedup, gc, retries, focus refetch, and `onMutate`/`onError`/`onSettled` rollback. Benos borrows the entry lifecycle almost directly. It differs in four ways: typed references instead of array keys (no typo-invalidations, no ad hoc prefix matching); declarative `affects`/`writes`/`optimistic` instead of callbacks that call `queryClient` (rollback and generation guards are the library's job, not the app's); explicit defaults (TanStack defaults to `staleTime: 0`, three client retries, and focus refetching); and no structural sharing, `select`, or infinite queries in 0.5. TanStack is far broader, and its 10,167 B core is the price of that.

**Solid's `query`/`createAsync`/`action`** is the closest fine-grained design. The behavior below was read from the published `@solidjs/router` 1.0.0 source (`dist/data/query.js` and `dist/data/action.js`). `query(fn, name)` keys entries by `name + hashKey(args)`, reuses a settled entry for 5 s after a preload, evicts unobserved entries after 180 s on a 5-minute sweep interval that starts at import in the browser, and uses a per-request cache on the server. An action without explicit keys revalidates **every** cached query. That default is safe but refetches unrelated data; Benos requires each mutation to say what it affects, and makes the type system check it. Solid's cache is coupled to its router; Benos keeps the cache router-free, with the router only seeing a loader that returns a handle. Solid has no built-in retries or optimistic rollback; its `useSubmission` pattern leaves optimistic UI to components.

**Costs of the Benos choices.** Typed references need a definition object to be importable wherever invalidation happens; with route refs already in a `refs.ts`-style module, that is the existing import graph. Not retaining the previous key's value means a plain argument change without a transition shows a pending state; transitions and loaders are the answer. A 5,000 ms default `staleTime` means a remount within five seconds shows cached data without revalidating. And `match.data().value()` is one call longer than a plain data signal.

## Test plan before implementation

1. Key canonicalization (order, nesting, omitted `undefined`), development rejections, interning and release, and cross-definition isolation.
2. Entry lifecycle with fake timers: stale triggers, gc start and cancel, invalidation of retained versus unretained entries, and dispose.
3. Deduplication: joins from observers and loaders, partial release, last-joiner abort, and a fetch that ignores abort.
4. Generations: refetch versus write, refetch versus newer refetch, and A → B → A observers.
5. Retries: count and predicate, backoff timing, abort during backoff, no retry on cancellation or on the server.
6. Observer semantics: the state table above, no cross-key value, background failure keeping `ready`, Suspense reveal, transition retention, and owner disposal; browser tests in Chromium, Firefox, and WebKit.
7. Mutations: result shape never rejecting, writes, `affects`, `awaitRefetch`, optimistic apply and rollback, rollback skipped after a newer write, cancellation, concurrent runs, and owner disposal before settle.
8. Router integration: fresh, stale, and missing entries in `load`; supersession; retention while committed and release on replacement; mutation refresh of committed `match.data()` without remount; R4 loader gates unchanged.
9. Type-level tests listed above, and a size row for the query package.

## Hard-to-reverse decisions

The typed-reference identity model and the ban on raw keys, the observer's no-cross-key-value rule, the `Resource`-compatible observer shape, the entry generation rule, `MutationResult` never rejecting, rollback-or-invalidate on conflicting optimistic layers, cache effects surviving owner disposal, `load` resolving to a handle, and the defaults (`staleTime` 5,000 ms, `gcTime` 300,000 ms, no retries, no focus refetching) are public behavior. The SSR snapshot shape is reserved but not frozen until the SSR track.

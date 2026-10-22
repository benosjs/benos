# Q1 — Query design review

**Status:** Q1 approved on 2026-10-19. The user's words: "Approve all eight query design decisions, apply the flagship amendments now, and start Q2." Both defaults were decided earlier in the review. Q2 has begun.

## Deliverables

- [The track plan](../query-plan.md) is the source of truth for Q0–Q6, in the format of the router and async track.
- [Query architecture](../architecture/query.md) specifies `query()` and `mutation()`, typed-reference cache identity, entries, deduplication, generations, stale and gc policy, retries, cancellation, observers with Suspense, optimistic updates and rollback, owner disposal, router loader identity sharing, SSR serialization, type inference and type errors, package boundary and budget, external changes, flagship amendments, and trade-offs against TanStack Query and Solid's `query`/`createAsync`/`action`.

## Decisions proposed for approval

1. **New package `@benosjs/query`** with a **3,584 B** minified + gzip cap (core, DOM, and async external). The estimate is 2,610–3,330 B (was 2,530–3,210 B before the retry classifier was added). It depends on public core and async APIs only and does not import the router or DOM.
2. **Typed references for identity.** An entry is `(definition, canonical key)`. `affects` accepts only a definition, `key()`, or `where()`; raw strings and arrays are type errors. Writes are typed by `key().set()`/`update()`.
3. **Observers never show another key's value.** This departs from `resource()`'s keep-last-value rule on purpose; transitions and loaders keep old UI instead. Observers extend `Resource<T>`, so Suspense and transitions work unchanged.
4. **Defaults (decided):** `staleTime` 5,000 ms, `gcTime` 300,000 ms, two retries of transient failures only for queries, no focus or reconnect refetching. Mutations never retry by default; `resource()` keeps no retries.
5. **Declarative mutations:** `affects`, `writes`, and `optimistic`. A failed run rolls back optimistic layers and does not refresh (as the flagship requires). A rollback that would overwrite a newer write invalidates instead. A cancelled run with unknown server state rolls back and invalidates. `run` never rejects. Cache effects survive owner disposal.
6. **`load()` resolves to a `QueryEntry<T>` handle**, so `match.data()` is a live cache entry. Route data updates in place after a mutation without a router reload, and the router's atomic params/data commit is unchanged. Cached revisits resolve immediately, which closes the "Loader caching is not included" router finding.
7. **Changes outside the package:** none in core, DOM, or async. The router needs one **type-only** change (`Immutable<T>` must keep function types) and one **documented contract** (loaders run synchronously under a per-match owner that is disposed on supersession, replacement, and router disposal; this is current behavior). The fallback, if Q4 finds that contract too implicit, is an `onRelease` loader input at +24–40 B.
8. **Flagship amendments** (listed in query.md, not yet applied to flagship-integration.md): `fetch` takes `(args, { signal })`; the `key` line is redundant; `formModel` reads `match.data().value()`. The editor block stays at 13 lines.

## Size and repository boundary

At Q1, `pnpm size` on a fresh build of `main` (0.4.0) measured core **4,303 / 4,608 B**, core + DOM **11,010 / 11,264 B**, async **1,644 / 4,096 B**, router **6,349 / 7,168 B**, core + DOM + async **12,246 B**, and core + DOM + async + router **17,871 B**. Q1 is documentation only: **0 B added to any package**. The design expects 0 B in core, DOM, and async, and 0 B of runtime code in the router.

Peer surface measurements, made in an isolated temporary install with the router track's esbuild settings: `@tanstack/query-core` 5.104.4 **10,167 B**, `@tanstack/solid-query` 5.104.4 **11,594 B**, and the `@solidjs/router` 1.0.0 data subset **3,197 B** gzip. Method and export lists are in query.md.

No dependency, configuration, source code, or public API was changed. The branch `query` holds only the three documents.

## Validation and open risks

- Prettier checked the new documents. The router type claim was checked with the compiler: today's `Immutable<T>` turns a callable into `{}` ("has no call signatures"), and adding a function-type branch fixes it. No runtime tests ran, because Q1 is design only.
- **Default `staleTime` — decided: 5,000 ms.** The user's basis was "do whatever is better than all the other frameworks or at least the same". 5 s avoids TanStack's well-known double fetch at its default of 0, sits between SWR's 2 s dedupe and RTK Query/Apollo's cache-until-invalidated, and matches Solid Router's roughly 5 s reuse. Mutations still invalidate affected entries immediately, so the window never shows data made stale by a mutation. Rationale and peers are in [query.md](../architecture/query.md).
- **Default retries — decided: transient-only, 2 retries.** Same basis. Queries retry network `TypeError`s, `TimeoutError`s, and HTTP 408, 429, and 5xx, read from a numeric `status` on the error; other 4xx, `AbortError`, `retryable: false`, and unclassified errors fail at once. Backoff is 300 ms then 900 ms with jitter, `Retry-After` is honored up to 30 s, and every pending retry stops on cancellation, supersession, or disposal. Observers stay `pending` between attempts and expose `failureCount()`. Mutations never retry. This changes 0.4's "no hidden retries" statement for queries only; `resource()` is unchanged. The classifier adds an estimated 80–120 B, which stays within the 3,584 B cap. The [retry policy](../architecture/query.md#retry-policy) compares TanStack (3 retries on every error, including 404) and Solid/RTK (no retries).
- **Loader cache scope.** Loader roots are detached, so loaders don't see a `QueryCacheProvider`. An isolated cache must be passed through the router `context`. Q4 should decide whether that needs a typed router context.
- **Observer over `resource()`.** Building observers on the public resource avoids async changes, but costs an extra resource per observer. Q2 must measure memory and bytes; if the wrapper is too heavy, the alternative is an internal async seam for Suspense tokens, which would need its own approval.
- **Ergonomics of `match.data().value()`.** It is one call longer than a plain data signal. The alternative, a router that unwraps signal-bearing loader results, would be a runtime router change and is not proposed.

All eight decisions are approved and both defaults are decided. The flagship amendments are applied to [flagship-integration.md](../architecture/flagship-integration.md). Q1 is complete.

# Q2 — Query cache core

**Status:** Q2 approved on 2026-10-19. The user's words: "if all is good all is approved". The condition was met: all 38 CI checks passed on `76ef3c7`, including `verify` (unit and browser suites). The cap stays at 3,584 B and Q2 is not trimmed. Q3 has begun.

## Delivered

- **`@benosjs/query`** in [`packages/query`](../../packages/query): `query()` definitions with argument and data inference, typed `QueryKey`/`QueryTarget` references, canonical key hashing and interning, per-cache entries, deduplicated requests, request generations, `staleTime` (default 5,000 ms) and `gcTime` (default 300,000 ms), the transient-only retry policy, cancellation, owner-bound observers that extend `Resource<T>`, `createQueryCache`, `QueryCacheProvider`, `queryCache()`, `cache.invalidate` for definitions, keys, and `where()` predicates, `prefetch`, `peek`, opt-in focus and reconnect refetching, and `isTransientError`.
- **Wiring:** build script, TypeScript project reference, a `pnpm size` row with the 3,584 B cap plus the two fully bundled totals, type tests in `pnpm typecheck:types`, and a browser fixture with its Vite alias.
- **Docs:** [query.md](../architecture/query.md) records the [Q2 implementation notes](../architecture/query.md#q2-implementation-notes), and the [track plan](../query-plan.md) status is updated.

The package is not yet added to the publish list, release workflow, or packed-metadata check; that belongs to Q6.

## Tests

| Area                                                                                                                                                                                                                                                                                                                              | Verifying test(s)                                                                      | Result                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| Key canonicalization, interning, separate definitions, `key` functions, development rejections (`NaN`, `-0`, `Infinity`, dates, sparse, cyclic, functions)                                                                                                                                                                        | [`query.test.ts`](../../packages/query/tests/query.test.ts) › keys and identity        | Pass                                  |
| Pending → ready, deduplication with partial release, last-joiner abort, rejoin in the same task, A → B → A without cross-key values, a fetch that ignores `AbortSignal`, synchronous fetch, failure only without data and `refresh()` recovery, background failure keeping `ready`, disable and `cancel()`, argument-free queries | `query.test.ts` › observers                                                            | Pass                                  |
| Fresh reuse and stale revalidation on attach, gc timing and cancellation, invalidation of retained versus unretained entries, key and predicate targets, invalidation dropping an earlier request, cache disposal, development freezing, default cache                                                                            | `query.test.ts` › staleness, garbage collection, and invalidation                      | Pass                                  |
| Retry classification table, two retries with 300/900 ms jittered backoff and no `failed` flash, jitter bounds, permanent errors, `Retry-After` (seconds, HTTP date, 30 s cap), `false`/count/predicate/custom delay, abort during backoff, no retry on cancellation                                                               | `query.test.ts` › retry policy                                                         | Pass                                  |
| Focus/reconnect listeners only when a query opts in, and removed on dispose                                                                                                                                                                                                                                                       | `query.test.ts` › refetch triggers                                                     | Pass                                  |
| Suspense fallback and gated effects, cached switch without fallback, re-suspension rejoining one request, transition keeping the committed view, error boundary for failure without data, provider scoping                                                                                                                        | [`suspense.test.ts`](../../packages/query/tests/suspense.test.ts) (happy-dom)          | Pass                                  |
| Inference of `A` and `T`, `Resource` compatibility, rejected argument types, raw string/array targets rejected, `Date` argument needs `key`, `key` must return a key part, `retry` option types                                                                                                                                   | [`types.test.ts`](../../packages/query/tests/types.test.ts) via `pnpm typecheck:types` | Pass                                  |
| Deduplicated Suspense reveal, cached switch with exactly two fetches, transition retention                                                                                                                                                                                                                                        | [`tests/browser/query.spec.ts`](../../tests/browser/query.spec.ts)                     | Pass in Chromium, Firefox, and WebKit |

Totals: `pnpm test` **374 / 374** (36 files; 38 in the query package), `pnpm test:browser` **456 / 456** (Chromium, Firefox, and WebKit), `pnpm typecheck:types`, `pnpm lint`, `pnpm check:public-imports`, and `pnpm check:doc-examples` pass. One unit run made while the browser suite was running at the same time reported a single failure that did not reproduce in two isolated runs; this matches the overlapping-suite timeout flake recorded in [router.md](../architecture/router.md), which is why CI runs the suites in sequence.

One bug was found and fixed during Q2 with a regression test. A Suspense boundary that re-suspends disposes its content and sets it up again in the same task; aborting the shared request synchronously when its last observer left made the recreated observer fetch again (3 fetches instead of 2 in the browser test). The abort is now deferred to the end of the task and skipped if a joiner rejoined.

## Size

| Bundle                                |              Q1 baseline |          Q2 |      Cap |
| ------------------------------------- | -----------------------: | ----------: | -------: |
| core                                  |                  4,303 B |     4,303 B |  4,608 B |
| core + DOM                            |                 11,010 B |    11,010 B | 11,264 B |
| async                                 |                  1,644 B |     1,644 B |  4,096 B |
| **query** (core, DOM, async external) |                        — | **2,620 B** |  3,584 B |
| router                                |                  6,349 B |     6,349 B |  7,168 B |
| core + DOM + async + query            |                        — |    14,358 B |        — |
| core + DOM + async + router + query   | 17,871 B (without query) |    19,994 B |        — |

**0 B were added to core, DOM, async, or router.** No public API of an existing package changed.

**Budget risk.** The Q2 parts were estimated at 1,930–2,450 B and measure 2,620 B, 170 B above the high estimate. That leaves **964 B** for Q3 and Q4, whose parts were estimated at 680–880 B (mutations and state, writes and optimistic layers, `load`). It fits, but with little margin. Q3 will measure each part as it lands and stop with options if the cap is at risk, rather than raise it.

## Deviations from the approved design

All are recorded in [Q2 implementation notes](../architecture/query.md#q2-implementation-notes):

1. The last-joiner abort is deferred by one microtask (the bug fix above).
2. Key interning uses `WeakRef`, so `===` holds while a key for that identity is reachable.
3. A top-level `true` argument is the enable flag of an argument-free query; a query whose only argument is a boolean is not supported.
4. Any `TypeError` counts as transient, because a fetch network failure is a bare `TypeError`.
5. `queryCache()` and `isTransientError()` are added exports.
6. `QueryCacheProvider` uses a type-only `JSX` import, so `@benosjs/dom` is a declared dependency with no runtime import.
7. Server rejection of the default cache and `createQueryCache({ snapshot })` wait for the SSR track.

## Next

Q3 adds `mutation()`, `QueryKey.set`/`update`, `cache.write`, optimistic layers and rollback, and generation bumps on writes. Q4 adds `query.load`, the router `Immutable<T>` type change, and the loader-owner contract tests.

# Q4 — Router loader integration

**Status:** Q4 approved on 2026-10-20. The user's words: "Q4 is approved. Start Q5 (validation app) and stop at the Q5 checkpoint." CI passed on `198dfaa`. Q5 has begun.

## Delivered

- **`query.load(args, signal?, cache?)`** resolves to a stable `QueryEntry<T>` handle once the entry has data. A route loader written as `loader: ({ params, signal }) => projectQuery.load(params.projectId, signal)` makes `match.data()` a live cache entry: `match.data().value()` updates in place after a refetch, a `writes` result, or an `affects` invalidation, without a router reload or a remount.
- **Cached revisits:** a fresh entry resolves without fetching; a time-stale entry resolves at once and revalidates in the background; an entry a mutation invalidated waits for fresh data, so the pre-save record is never shown.
- **Retention:** `load` holds its entry through the loader's per-match owner, so a committed route's entry survives `gcTime` and is released on supersession, replacement, or router disposal.
- **Router (approved Q1 decision 7):** `Immutable<T>` keeps function types callable (type-only, 0 B), and the loader owner contract is documented in [router.md](../architecture/router.md#matching-and-navigation-state) and pinned by a test. No router runtime code changed.
- **Docs:** [Q4 implementation notes](../architecture/query.md#q4-implementation-notes), the [track plan](../query-plan.md) status, and the "Loader caching is not included" row of [router-findings.md](../router-findings.md), which now points to this work.

## Tests

| Area                                                                                                                                      | Verifying test(s)                                                                                            | Result                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Loader `onCleanup` runs on supersession, replacement, and router disposal                                                                 | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts) › loader owner contract | Pass                                  |
| Loaded entry commits; A → B changes record without remount and never shows B's params with A's data                                       | [`packages/query/tests/router.test.ts`](../../packages/query/tests/router.test.ts)                           | Pass                                  |
| Revisit from cache without fetching; time-stale revisit shows cached data at once and updates in place                                    | `router.test.ts`                                                                                             | Pass                                  |
| A mutation refreshes committed route data in place (no navigation, no remount)                                                            | `router.test.ts`                                                                                             | Pass                                  |
| A record saved from another page is never shown in its pre-save form on the next visit                                                    | `router.test.ts`                                                                                             | Pass                                  |
| A superseded candidate's request is aborted and its entry released; the committed entry survives `gcTime` and still receives invalidation | `router.test.ts`                                                                                             | Pass                                  |
| A load failure reaches the route error view, and retry loads the fixed record                                                             | `router.test.ts`                                                                                             | Pass                                  |
| An imperative `load` (no owner) is held only by `gcTime` and returns one handle per entry                                                 | `router.test.ts`                                                                                             | Pass                                  |
| `load` signatures, `match.data().value()` typed as the query data, callable loader data members                                           | [`types.test.ts`](../../packages/query/tests/types.test.ts) via `pnpm typecheck:types`                       | Pass                                  |
| The router type change is required: with the 0.4 `Immutable<T>`, the loader type tests fail with 4 errors                                 | Manual check: restored the 0.4 router source, ran `pnpm typecheck:types`, then restored the change           | Confirmed                             |
| R4 loader, pending, focus, scroll, and error gates                                                                                        | Existing router unit tests and [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts)          | Pass in Chromium, Firefox, and WebKit |

Totals, run one after another: `pnpm test` **400 / 400** (38 files; 63 in the query package, 10 router loader tests), `pnpm test:browser` **459 / 459** (Chromium, Firefox, and WebKit). `pnpm typecheck:types`, `pnpm lint`, `pnpm check:public-imports`, and `pnpm check:doc-examples` pass. CI on the Q3 commit (`2c78d5e`) passed, including `verify`.

## Size

| Bundle                                |       Q3 |          Q4 |      Cap |
| ------------------------------------- | -------: | ----------: | -------: |
| core                                  |  4,303 B |     4,303 B |  4,608 B |
| core + DOM                            | 11,010 B |    11,010 B | 11,264 B |
| async                                 |  1,644 B |     1,644 B |  4,096 B |
| **query** (core, DOM, async external) |  3,344 B | **3,498 B** |  3,584 B |
| router                                |  6,349 B |     6,349 B |  7,168 B |
| core + DOM + async + query            | 15,046 B |    15,197 B |        — |
| core + DOM + async + router + query   | 20,696 B |    20,845 B |        — |

Q4 added **154 B** to query (estimate 120–160 B). **0 B were added to core, DOM, async, or router.** All planned query features now fit, with **86 B** of headroom under the 3,584 B cap.

**Budget note for later work.** 86 B is enough for bug fixes found in Q5, not for new features. If Q5 needs more, the options are dropping the opt-in focus/reconnect triggers (about 100 B) or asking to raise the cap; I would bring measurements before either.

## Clarifications of the approved design

Recorded in [Q4 implementation notes](../architecture/query.md#q4-implementation-notes):

1. `load` waits for a refetch when the entry was invalidated, instead of resolving with known-outdated data; time-stale data still resolves at once.
2. `load` returns one handle per entry.
3. Without an owner, `load` holds its entry only through `gcTime`.
4. `@benosjs/router` is a dev dependency of `@benosjs/query`, for integration tests only.
5. Loaders pass a non-default cache explicitly, because a `QueryCacheProvider` is not visible from the router's detached loader roots.

## Next

Q5 extends `examples/dashboard` with cached list and detail routes, an edit mutation with `affects`, and an optimistic toggle, adds dashboard browser tests, and writes `docs/query-findings.md` from the perspective of a React developer who uses TanStack Query.

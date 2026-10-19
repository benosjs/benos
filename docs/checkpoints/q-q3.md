# Q3 — Mutations and invalidation

**Status:** Ready for review. Stopped at the Q3 checkpoint; Q4 (router loader integration) does not start without approval.

## Delivered

- **`mutation()`** with `run(input, { signal })`, declarative `writes`, `affects`, and `optimistic`, and `awaitRefetch` (default true). `run` never rejects; it resolves to `MutationResult<O>`.
- **Owner-bound handles** (`saveProject()`): `run`, `state` (`idle | pending | succeeded | failed`), `pending`, `cancel`, and `reset`. The definition also has `saveProject.run(input, cache?)` for code outside components.
- **Typed cache writes:** `QueryKey.set(value)` and `QueryKey.update(fn)` return opaque `QueryWrite` descriptors; `cache.write(...writes)` applies them imperatively.
- **Entry generations:** every write bumps the entry generation, so a request that started before a write cannot overwrite it.
- **Optimistic layers:** applied in one batch before `run`, retained until the run settles, discarded on success, restored on failure only if nothing newer touched the entry, and otherwise replaced by a refetch.
- **Docs:** [Q3 implementation notes](../architecture/query.md#q3-implementation-notes) in query.md, and the [track plan](../query-plan.md) status.

## Tests

| Area                                                                                                                                                                                                                                                                        | Verifying test(s)                                                                                             | Result                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `run` never rejects (success, rejection, synchronous throw, throwing `writes` callback without leaking retained entries)                                                                                                                                                    | [`mutation.test.ts`](../../packages/query/tests/mutation.test.ts) › mutation results                          | Pass                                  |
| `writes` update observers without a refetch; `affects` refreshes only its targets; `awaitRefetch` waits for retained refetches or not; a failed run refreshes nothing                                                                                                       | `mutation.test.ts` › writes and affects                                                                       | Pass                                  |
| `cache.write` creates fresh entries and ignores `update` without data; a write wins over a request that started before it, whose joiners receive the written value                                                                                                          | `mutation.test.ts` › writes and affects                                                                       | Pass                                  |
| Optimistic apply, rollback on failure, refresh on success; an earlier fetch cannot replace an optimistic value; a newer write makes rollback invalidate instead; optimistic entries are retained until settle                                                               | `mutation.test.ts` › optimistic updates                                                                       | Pass                                  |
| Handle state follows the latest run, `pending` covers all runs, `reset`; `cancel` rolls back, invalidates, calls `affects` without output, and returns to `idle`; a cancelled run that resolves still succeeds; owner disposal does not abort and cache effects still apply | `mutation.test.ts` › mutation handles                                                                         | Pass                                  |
| Overlapping invalidation targets refetch an entry once                                                                                                                                                                                                                      | [`query.test.ts`](../../packages/query/tests/query.test.ts) › staleness, garbage collection, and invalidation | Pass                                  |
| Inference of `I` and `O`, `writes` receiving `O` and `affects` receiving `O \| undefined`, result and state narrowing, rejected input, mistyped `set`/`update`, raw values in `cache.write`, raw keys in `affects`, non-writes in `writes`                                  | [`types.test.ts`](../../packages/query/tests/types.test.ts) via `pnpm typecheck:types`                        | Pass                                  |
| Optimistic write updates the DOM, rolls back on failure, and keeps a confirmed value                                                                                                                                                                                        | [`tests/browser/query.spec.ts`](../../tests/browser/query.spec.ts)                                            | Pass in Chromium, Firefox, and WebKit |

Totals, run one after another: `pnpm test` **390 / 390** (37 files; 54 in the query package), `pnpm test:browser` **459 / 459** (Chromium, Firefox, and WebKit). `pnpm typecheck:types`, `pnpm lint`, `pnpm check:public-imports`, and `pnpm check:doc-examples` pass.

Two bugs were found during Q3 and fixed with regression tests:

1. A cancelled optimistic mutation refetched its entry twice, because the rolled-back layer and `affects` both named it. `invalidate` now refetches each entry once per call.
2. A throwing `writes` or `affects` callback made `run` reject and left optimistic entries retained forever. Layers are now released first and callback errors become `{ ok: false }` results.

## Size

| Bundle                                |       Q2 |          Q3 |      Cap |
| ------------------------------------- | -------: | ----------: | -------: |
| core                                  |  4,303 B |     4,303 B |  4,608 B |
| core + DOM                            | 11,010 B |    11,010 B | 11,264 B |
| async                                 |  1,644 B |     1,644 B |  4,096 B |
| **query** (core, DOM, async external) |  2,620 B | **3,344 B** |  3,584 B |
| router                                |  6,349 B |     6,349 B |  7,168 B |
| core + DOM + async + query            | 14,358 B |    15,046 B |        — |
| core + DOM + async + router + query   | 19,994 B |    20,696 B |        — |

Q3 added **724 B** to query, against an estimate of 560–720 B for mutations, writes, and optimistic layers. **0 B were added to core, DOM, async, or router.**

**Budget for Q4:** **240 B** remain, and the `load` adapter was estimated at 120–160 B. It should fit. If it does not, Q4 stops with measured options (for example dropping the opt-in focus/reconnect triggers, about 100 B) instead of raising the cap.

## Clarifications of the approved design

All are recorded in [Q3 implementation notes](../architecture/query.md#q3-implementation-notes):

1. Owner disposal never aborts a mutation; only `cancel()` does. The approved text contradicted itself here, and this follows the flagship requirement.
2. `affects` receives `output?`, which is undefined only after a cancelled run with an unknown outcome.
3. A request that was in flight when a write landed resolves its joiners with the written value.
4. Optimistic writes do not reset freshness; confirmed writes do.
5. `invalidate` refetches each entry once per call.
6. Callback errors after a successful `run` are reported as failures.
7. A cancelled run returns the handle to `idle`.

## Next

Q4 adds `query.load(args, signal?, cache?)` resolving to a `QueryEntry<T>` handle, loader retention through the loader's owner, the router `Immutable<T>` type change, and router tests for cached revisits, A → B commits, and mutation refresh of committed route data.

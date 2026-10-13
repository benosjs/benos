# R2 — Async resources and Suspense

**Status:** Implementation complete; coverage and full test-runner follow-up verified on 2026-10-13.

## Delivered

- Added `@benosjs/async` with owned `resource()`, discriminated state, stale-value retention, initialized overloads, refresh, cancellation, abort signals, generation checks, and an opt-in SSR codec type. Fetches start during setup and their continuations do not retain the global owner stack.
- Added `<Suspense>` with detached content preparation, fallback/reveal, nested boundary ownership, multiple-resource token tracking, and token release when a staged reader stops observing a pending request. Rejections follow the nearest DOM error boundary.
- Added `startTransition()` with committed-view retention while a replacement is pending, supersession, recovery on staged failure, and cleanup of discarded stages. Unaffected regions resume without replacement.
- Added private core owner eligibility levels and a private DOM staging/control seam. No existing core or DOM public signature was changed. The async package's internal imports use the shared public DOM instance to avoid duplicate owner runtimes in browser bundles.
- Added a three-browser fixture for fallback, reveal, nested boundaries, effect/mount gating, ordinary updates, and transitions. The circular-prone router fixture remains at R1 for R3.

## Production size gate

The repository's size script bundles minified production entries for browser ESM and gzips the result. The async package cap externalizes core and DOM; the combined figure bundles all three. Gzip contributions are not strictly additive.

| Surface                  | R1 baseline | R2 measured | Change |    Fixed cap | Headroom |
| ------------------------ | ----------: | ----------: | -----: | -----------: | -------: |
| Core                     |     4,108 B |     4,303 B | +195 B |      4,608 B |    305 B |
| Core + DOM               |    10,580 B |    10,964 B | +384 B |     11,264 B |    300 B |
| Async, core/DOM external |           — |     1,644 B |      — |      4,096 B |  2,452 B |
| Core + DOM + async       |           — |    12,203 B |      — | No track cap |        — |

Core's +195 B pays for owner eligibility, delayed jobs, and detection of gated render work. The incremental combined increase beyond the core delta is **189 B**; it pays for detached DOM staging, commit/disposal, and private control registration. This 189 B is a marginal gzip difference, not a separately measured DOM package size. Neither fixed core/DOM cap was raised.

## Verification

- `pnpm build` and `node scripts/check-size.mjs` passed.
- Full `pnpm test`: **27 files, 299 tests passed**. The same command completed on local `main` (**22 files, 271 tests**) and repeatedly on `router-async` (before the added tests: **27 files, 292 tests**). The earlier apparent stall was a failed run: its saved log ended with `ELIFECYCLE` after the newly added async type fixture registered zero runtime tests. That fixture now registers a runtime assertion, while `pnpm typecheck:types` checks its compile-time assertions. No pending timer or open async handle was reproduced.
- Async browser suite: **15/15 passed**, five cases each in Chromium, Firefox, and WebKit.
- `pnpm lint`, `pnpm check:packed`, `pnpm check:public-imports`, `pnpm check:engines`, `pnpm typecheck:types`, the R1 circular-import fixture, and `git diff --check` passed.

## Async test-plan coverage

The numbers follow [async.md's test plan](../architecture/async.md#test-plan-before-implementation). Browser cases run in all three engines.

| Item                                                    | Coverage       | Tests                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Source, keys, refresh, retention, types, sync result | Covered        | `resource.test.ts`: “keeps the newest A → B → A generation”, “disables on nullish and false keys”, “reuses Object.is-equal keys and refreshes”, “turns synchronous and asynchronous failures”; `types.test.ts`: initialized/uninitialized overloads and `pnpm typecheck:types`                                                                                                 |
| 2. Out-of-order, abort, disposal, rejection             | Covered        | `resource.test.ts`: A → B → A, cancellation/late failure, abort signal/disposal, asynchronous rejection; `suspense.test.ts`: A → B → A; browser: “A → B → A ignores the old request in the DOM”. Vitest rejects unhandled promise rejections.                                                                                                                                  |
| 3. Reads and boundaries                                 | Covered        | `resource.test.ts`: imperative pending and failed `read()`; `suspense.test.ts`: multiple/duplicate reads, nested boundaries, fallback read, nearest error boundary, staged failure recovery; browser: nested boundary case                                                                                                                                                     |
| 4. Fallback, reveal, disposal, effect/mount gating      | Covered        | `suspense.test.ts`: initial fallback/reveal, disposed pending branch, gated effects and mounts; browser: “Suspense fallback, reveal, and gated effects”                                                                                                                                                                                                                        |
| 5. Transition owner/DOM, supersession, failure, await   | Covered        | `suspense.test.ts`: retained content, old-owner cleanup timing, superseded transition, staged failure recovery, continuation after await; browser: retained content and “superseded transition and staged failure recover the DOM”                                                                                                                                             |
| 6. Synchronous flush and context isolation              | Covered        | `resource.test.ts`: “flushes ready state synchronously at settlement before refresh resolves”, “does not retain owner or tracking context across a fetcher await”                                                                                                                                                                                                              |
| 7. Router adapter contract                              | **R4 pending** | The async-side staged reader token release is covered by `suspense.test.ts`: “releases a pending token when the staged binding stops reading it”. Redirect/supersession/disposal of a _router candidate_, atomic param/data commit, and stale route-data exclusion need the R4 adapter; no such adapter exists at R2/R3. These remain required R4 tests, not claimed coverage. |
| 8. Three-browser behavior and public types              | Covered        | `async.spec.ts`: fallback/reveal and gated effect/mount, nested boundaries, transitions, A → B → A, staged failure in Chromium/Firefox/WebKit; `types.test.ts` and `pnpm typecheck:types`; no public `any`                                                                                                                                                                     |

## Limits and next checkpoint

R2 does not implement server rendering or the router loader adapter. The resource's `ssr` codec contract is present for a later server renderer; R4 must validate route-loader tokens and atomic match commits against this async seam. The remaining core/DOM headroom is small, so later work must continue measuring production bundles and must stop at either fixed cap.

R1/R2 are ready for the authorized branch commit and CI run. No merge, tag, or publication is part of this checkpoint.

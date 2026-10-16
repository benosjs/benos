# R4 — Loaders, pending state, and accessibility

**Status:** R4 implementation and local verification are complete on `router-async`. R4 changes are uncommitted and have not been pushed. R3 remains committed at `e6baa90` and its full CI run is green.

## Delivered

- Added typed route loaders. Their awaited return type appears on `route.match().data()` only for routes with loaders. Root and nested routes infer params, parsed search, and loader data from inline callbacks.
- Added `createRouter({ context })`; loaders receive that router context as a frozen value alongside typed params/search and the resource `AbortSignal`.
- Loaders start before route components. Initial navigation can render the nearest pending view; later navigation keeps the committed view while exposing `navigation().status === 'loading'` and a polite status announcement.
- Same-route navigation retains the route component owner and batches params, search, and data together. Candidate resources abort on supersession or disposal, and generation checks prevent stale A → B → A results from committing.
- Added route-level loader/lazy-import error views with `retry()`. Failures without a route error view and synchronous component render errors continue to reach the DOM `ErrorBoundary`.
- Added route-heading focus, live announcements using the focused heading/document title, push-to-top/hash scrolling, and per-entry browser scroll restoration for back/forward. Scroll recording pauses during `popstate` until the destination position is restored, preventing browser-generated scroll events from replacing the destination entry's saved position.
- Added router API documentation and an R4 test-coverage table in [router.md](../architecture/router.md). Expanded documentation-example path mappings so the router API example type-checks against built package declarations.

## R4 coverage

The complete gate-to-test mapping is in [router.md](../architecture/router.md#r4-coverage). It maps all loader ordering, context, atomic update, cancellation, error/retry, accessibility, focus, RTL, and browser-history gates to named unit, type-level, and browser tests.

| Suite                                                                                      |                                                                      Result |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------: |
| Vitest unit suite                                                                          |                                                  32 files, 329 tests passed |
| Router type-level checks                                                                   | Passed, including inline search/loader inference for root and nested routes |
| Playwright browser suite                                                                   |                           435 tests passed in Chromium, Firefox, and WebKit |
| Documentation examples                                                                     |           29 TSX files compiled in both optimization modes and type-checked |
| Build, lint, registry, packed metadata, engines, public imports, JSX types, template audit |                                                                      Passed |
| Production kernel benchmark guard                                                          |                          Passed; maximum measured workload was 1.82× Preact |

The full browser suite passed after the per-entry scroll race was fixed. R3's workflow runs `pnpm test` before `pnpm test:browser` in the same CI verification job, so the suites cannot overlap.

## Production sizes

Sizes use the repository's minified + gzip production size check. Core and DOM were not modified during R4.

| Surface                         | Measured | Fixed cap | Headroom |
| ------------------------------- | -------: | --------: | -------: |
| Core                            |  4,303 B |   4,608 B |    305 B |
| Core + DOM                      | 10,977 B |  11,264 B |    287 B |
| Async, core/DOM external        |  1,644 B |   4,096 B |  2,452 B |
| Router, core/DOM/async external |  6,349 B |   7,168 B |    819 B |
| Core + DOM + async              | 12,217 B |         — |        — |
| Core + DOM + async + router     | 17,840 B |         — |        — |

All three enforced budgets pass. No core or DOM bytes were added.

## Notes and deviations

- The public `RouterHistory` interface gained an optional `completeScrollRestoration()` coordination method. `browserHistory()` uses it to resume scroll recording after pop restoration; existing custom history implementations need not implement it.
- The architecture text now states the implemented R3 search parse-failure behavior: parsing rejects navigation before commit and leaves the last committed route visible. Loader and lazy-import failures use route error views. This corrects the earlier contradictory description that grouped search parsing with route error handling.
- The worktree is intentionally left uncommitted at this checkpoint. No R4 CI run was started; the green CI run belongs to the pushed R3 commit.

# R3 — Router core checkpoint

**Status:** R3 implementation is complete for the approved core scope in the local `router-async` working tree. The router package and checkpoint remain uncommitted. `origin/router-async` now includes main through merge commit `0a62b15`; the R3 working changes were not included in that merge or its CI run.

## Delivered

- Added `@benosjs/router` with typed route references, relative child paths, required named params, terminal named splats, typed search codecs, sorted URL construction, and immutable reactive match snapshots.
- Added `route.match()` for owner-scoped params/search. It gives a clear error outside the matching route owner. Added `getRouter()` so components can capture their instance during setup for use from later DOM event callbacks.
- Added registered route trees, specificity ordering (static, named, catch-all), nested and pathless layouts, index routes, not-found rendering, route redirects with cycle/limit checks, and instance-scoped navigation.
- Added memory and browser history, lazy component imports after a URL matches, an outlet built on R2's existing DOM staging seam, and `Link` anchors with normal anchor attributes, reactive `aria-current`, and native modified-click/target/download behavior.
- Expanded the circular-prone fixture into a typed and runtime test. The manifest imports route refs statically and page/layout modules dynamically; pages/layouts import refs only. Manifest construction loads no views, matching `/projects/p-1` loads only that branch, and the same detail view updates when the param changes.
- Kept R3 to route/search/navigation behavior. Loader execution and data handles, per-route pending/error views, focus announcements, and scroll restoration remain R4 work; their route options are not exposed as no-op placeholders.

The implementation and test changes use the existing core/DOM internals. No core or DOM source/API changes were needed for R3.

## Production size gate

Measurements use the production entries, minification, browser ESM, and gzip from `pnpm size`. Router dependencies are externalized for the router row; the final row bundles all four packages together.

| Surface                         | Measured | Fixed cap | Headroom |
| ------------------------------- | -------: | --------: | -------: |
| Core                            |  4,303 B |   4,608 B |    305 B |
| Core + DOM                      | 10,977 B |  11,264 B |    287 B |
| Async, core/DOM external        |  1,644 B |   4,096 B |  2,452 B |
| Router, core/DOM/async external |  4,025 B |   7,168 B |  3,143 B |
| Core + DOM + async              | 12,217 B |         — |        — |
| Core + DOM + async + router     | 15,584 B |         — |        — |

Neither fixed core/DOM cap nor the 7,168 B router cap was exceeded or raised. If R4 needs a core or DOM change that would exceed the remaining **305 B core** or **287 B combined** headroom, stop with the measured bytes and alternatives as requested.

## Verification

- `pnpm build` and `pnpm size` passed with the measurements above: core **4,303 B**, core + DOM **10,977 B**, async **1,644 B**, router **4,025 B**, and combined core + DOM + async + router **15,584 B**.
- `pnpm test`: **31 files, 320 tests passed** in 53.3 seconds when run without browser tests competing for CPU. The added test verifies that a throwing search serializer leaves history and committed location unchanged.
- `pnpm typecheck:types`, `pnpm lint`, `pnpm check:packed`, `pnpm check:public-imports`, `pnpm check:engines`, `pnpm check:jsx-types`, `pnpm check:doc-examples`, and `pnpm audit:template` passed.
- `node --test tests/fixtures/router-circular/import-graph.test.mjs`: **3/3 passed**; the Vitest circular fixture also passes in the full unit suite.
- `pnpm test:browser`: **432 passed** in Chromium, Firefox, and WebKit in 12.8 minutes. The router-only browser coverage is **6/6** across those engines. Unit and browser suites run serially in the same CI `verify` job; the CI steps wait for each command to exit before starting the next.
- The main-merge CI run [38708350250](https://github.com/benosjs/benos/actions/runs/38708350250) completed successfully, including the three-OS npm 10/11 matrix. It verifies the merge commit and 0.3.2 fix, not the uncommitted R3 working changes; those were verified locally above.

## Updated documents

- [Router architecture](../architecture/router.md) now records the implemented R3/R4 boundary, `getRouter()` callback usage, measured R2 core/DOM seam, and the R3 test-to-gate coverage table.
- [Async architecture](../architecture/async.md) now matches the verified R2 combined sizes.
- The async test-coverage table in [ra-r2](./ra-r2.md) is complete: R2 items 1–6 and 8 are covered; the router-adapter contract is explicitly reserved for R4.
- [Circular-prone fixture README](../../tests/fixtures/router-circular/README.md) describes the executed type/runtime coverage and the remaining R4 loader scope.

R4 has not started. This is the R3 stop point.

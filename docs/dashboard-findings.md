# Dashboard findings

Phase 5c validation was run on 2026-10-01 from a React developer's point of
view. The application in `examples/dashboard/src/main.tsx` uses only the public
`@benosjs/core` and `@benosjs/dom` entry points. The Vite aliases used to build the
example point at workspace development artifacts, but application source does
not import an internal subpath.

## What was built

The dashboard includes mock sign-in state, hash navigation, a validated profile
form, nested components, a 5,000-row sortable and filterable table, fetch-backed
loading/ready/error state with cancellation, a modal, and an error boundary.
The representative comparison slice contains the same 5,000-row table and
form in Benos and Solid.

## Benos versus Solid slice

Both slices were production Vite builds and were exercised by the same
Chromium script. The update measurement types `DOM` into the filter, waits for
the next animation frame, and checks that rows were rendered. Seven samples
were collected; the table below reports median and the observed min–max spread.
The bundle column is the gzip size of the JavaScript bundle.

| Slice | Source LOC | Nonblank LOC |      JS gzip | Filter update median |       Spread |
| ----- | ---------: | -----------: | -----------: | -------------------: | -----------: |
| Benos |        116 |          110 | 11,320 bytes |              43.0 ms | 33.9–50.8 ms |
| Solid |        113 |          108 |  6,560 bytes |              13.1 ms | 11.0–18.1 ms |

Benos is 1.73× the Solid gzip size and 3.28× the median filter update in this
small, equivalent slice. This is a dashboard validation measurement, not a
replacement for the interleaved js-framework-benchmark protocol. The remaining
update cost is consistent with Benos's general descriptor, owner, dependency,
and DOM update work; the slice does not hide that cost in a framework-specific
adapter.

The requested checkpoint run was 43.0 ms versus 13.1 ms (3.28×). A clean
production rebuild after profiling measured 33.7 ms versus 11.8 ms (2.86×)
with no source change. The two runs use the same seven-sample harness and show
the paint-boundary variance; the profile below explains the stable work behind
the gap rather than treating one noisy sample as a regression.

## Filter profile

The 3.28× result was profiled with Chromium's sampling CPU profiler while
performing one `DOM` filter update from 5,000 rows. The comparison itself used
the minified production bundles. A second production-mode build with minification
disabled was used only to retain function names in the profile; it does not
change the measured operation or the shipped bundle.

The Benos profile attributes the extra work to the keyed `<For>` reconciliation
and its per-row ownership lifecycle:

- `mountFor`/`reconcile` scans keys, builds the old-entry map, and updates the
  keyed middle range.
- Filtering out 4,000 rows calls `collectDisposal` for each removed row owner,
  then `removeRange`, which removes each row node through `removeChild`.
- For this measured 5,000-to-1,000 update, surviving keyed entries are reused;
  the dominant churn is disposal and removal of 4,000 rows. Returning to an
  unfiltered list or switching to a different query also adds template cloning
  and new row-range mounts, which is why the repeated production trace includes
  both creation and disposal work.

The source-attributed profile's largest named Benos frames were `reconcile`
(3.356 ms sampled self time), `collectDisposal` (1.731 ms plus another 1.259 ms
sampled frame), and `removeRange`; repeated native `removeChild` samples were
the largest DOM cost. Solid's corresponding profile concentrated on its
specialized `reconcileArrays`, `cleanNode`, and `insertExpression` paths with
less per-row owner disposal. This explains the gap as per-row ownership/range
bookkeeping plus DOM removals and mounts, rather than signal evaluation alone.
No optimization was applied in response to this profile. After building both
slices, the profile harness is `node examples/dashboard/scripts/profile-filter.mjs`;
set `DASHBOARD_PROFILE=1` on the two Vite builds when source-level function names
are needed.

## Findings and proposed disposition

Each item records what was observed while building the dashboard. Proposed
fixes are intentionally not applied in Phase 5c.

| Finding from a React perspective                                                           | Evidence in the build                                                                                                                                                                                           | Disposition and proposed fix                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common JSX tags and attributes are missing from the public type surface.                   | TypeScript rejected `header`, `strong`, `b`, `small`, `output`, `role`, `placeholder`, and `scope` in the Benos slice. The same form is accepted by Solid's JSX types.                                          | **v0.1 fix.** Expand intrinsic element and accessibility/property types, with compiler fixtures for each spelling.                                                                                                                                                                  |
| React's `className` spelling is not accepted.                                              | Benos uses `class`; a React-style `className` prop is rejected and receives the documented development diagnostic.                                                                                              | **Accepted v0.1 contract.** Keep it rejected; document the diagnostic and the deliberate `class` spelling.                                                                                                                                                                          |
| React's `htmlFor` spelling is not accepted.                                                | The public type uses `for`; a React-style `htmlFor` prop is rejected and receives the documented development diagnostic.                                                                                        | **Accepted v0.1 contract.** Keep it rejected; document the diagnostic and the deliberate `for` spelling.                                                                                                                                                                            |
| Raw HTML attributes do not have the breadth a React developer expects.                     | The dashboard had to avoid several ordinary DOM attributes even though the renderer can set many properties at runtime.                                                                                         | **v0.1 fix.** Generate a broader, element-aware attribute/property map and keep raw-attribute diagnostics separate from property diagnostics.                                                                                                                                       |
| `Show`, `For`, and `ErrorBoundary` return `unknown` in their public component type.        | The dashboard needed local `unknown` casts (`ShowControl`, `ForControl`, and `ErrorBoundaryControl`) to compose their children in TSX.                                                                          | **v0.1 fix.** Publish generic control-flow prop types that preserve `JSX.Element` and callback result types.                                                                                                                                                                        |
| A keyed `<For>` callback receives an item accessor rather than the item value.             | The Benos table uses `row()`; the equivalent Solid callback uses `row`. This is sound but surprising when moving from React or Solid.                                                                           | **v0.1 fix.** Keep the accessor semantics, but make the type and migration example prominent in the API reference.                                                                                                                                                                  |
| `splitProps` type inference loses the selected property in a normal destructuring pattern. | `DataCard` required a local type assertion after `splitProps(props, ['title'])` to read `title`.                                                                                                                | **v0.1 fix.** Improve tuple inference for literal key arrays and add a typed component example.                                                                                                                                                                                     |
| The compiler/runtime helper surface is not fully aligned.                                  | A trial use of public `mergeProps` caused compiler output to import `__benos_merge_props` from `@benosjs/dom/internal`, where the helper export was absent; the dashboard workaround removed `mergeProps`.      | **v0.1 fix.** Make compiler-generated helper exports and the documented public helper path a tested contract before approval.                                                                                                                                                       |
| Component functions run once, so React-style destructuring can become stale.               | `function Card({ title })` captures the initial getter value; using `props.title` keeps the reactive read. The compiler warning points to the original line and column.                                         | **v0.1 fix.** Keep the warning, add an ESLint autofix or codemod suggestion, and add a React migration section explaining run-once components.                                                                                                                                      |
| The ownership model is unfamiliar when diagnosing an externally attached listener.         | A listener rendered by Benos was removed with the owner; a listener added directly to `window` is outside that owner and has no automatic cleanup.                                                              | **Roadmap item.** Add development instrumentation that identifies external listeners created while an owner is active, or document an explicit `onCleanup` wrapper pattern.                                                                                                         |
| Navigation is hand-rolled.                                                                 | The dashboard uses hash links and a route signal; there is no router or route-parameter API.                                                                                                                    | **Roadmap item.** Keep routing out of core and provide a separately packaged router with typed route parameters.                                                                                                                                                                    |
| Fetch state requires a hand-written resource wrapper.                                      | The dashboard combines `fetch`, `AbortController`, an async generation check, and a discriminated signal for `disabled`, `pending`, `ready`, and `failed`.                                                      | **Roadmap item.** Add the planned async/resource package rather than growing the synchronous core.                                                                                                                                                                                  |
| Form validation is manual.                                                                 | The profile form owns field signals, computed errors, submit state, and event wiring directly.                                                                                                                  | **Roadmap item.** Provide a typed forms package with schema validation and submission state.                                                                                                                                                                                        |
| Modal behavior is manual.                                                                  | The example controls visibility with a signal; focus return, Escape handling, focus trapping, and a portal are not automatic.                                                                                   | **Roadmap item.** Provide an accessibility-aware modal primitive in the UI package; keep the renderer primitive small.                                                                                                                                                              |
| Ref support is callback-only.                                                              | The dashboard uses a callback ref and cleanup semantics; React object refs are not part of the public API.                                                                                                      | **Accepted trade-off.** Preserve the callback-only, never-`null` contract for v0.1 and document the `onCleanup` pattern.                                                                                                                                                            |
| `children()` is powerful but not idiomatic to React developers.                            | Lazy children are read through `children(() => props.children)()`. The development double-mount warning was implemented in Phase 5a and fires when the same lazy value is mounted twice.                        | **Roadmap item.** Add a React-oriented children guide; retain the implemented Phase 5a diagnostic.                                                                                                                                                                                  |
| Error-boundary recovery needs an explicit state transition.                                | The existing `ErrorBoundary` reset callback was verified by `packages/dom/tests/dom.test.ts` (`renders ErrorBoundary fallback, supports reset, and forwards fallback failure`) and by the dashboard smoke test. | **Accepted v0.1 contract.** The dashboard clears `shouldFail` before calling `retry()` because reset remounts the boundary's child but cannot mutate the external signal that caused the child to throw; without clearing that signal, the remounted child fails immediately again. |
| Event delegation and native event ordering need explanation.                               | Common events work through delegated handlers, but the renderer's native-listener ordering and `stopPropagation` interaction are not obvious from JSX alone.                                                    | **v0.1 fix.** Add an event-ordering table and examples for native listeners, delegated listeners, and propagation stops.                                                                                                                                                            |
| Stable event expressions still carry per-instance wrapper/getter overhead.                 | The Phase 5b heap comparison found roughly two extra closures per handler per row and about 5.8× Solid's per-row JavaScript memory.                                                                             | **Phase 6 roadmap item.** Emit stable function handlers without per-instance getter and wrapper closures after the planned benchmark guard is in place.                                                                                                                             |
| The public package does not include a router, query cache, SSR, or hydration layer.        | The dashboard did not need those modules and implemented only the synchronous public renderer/core surface.                                                                                                     | **Accepted scope trade-off.** Keep these outside v0.1 core and track them in the plan rather than adding implicit APIs.                                                                                                                                                             |
| Documentation must explain public versus internal imports.                                 | The app stayed on `@benosjs/core` and `@benosjs/dom`; only Vite aliases reference development files so the workspace can build before packing.                                                                  | **v0.1 fix.** Add a consumer-project example that fails CI if application source imports an internal subpath.                                                                                                                                                                       |

## Risk 8 diagnosis drill

The following is an automated reproduce-and-locate drill, not a human usability
study. Each run transforms an intentionally stale destructured prop and then
mounts a button, dispatches one event, disposes its owner, and dispatches again.
The listener count is checked to distinguish an owner-managed listener from a
listener that was leaked outside ownership. Five fresh Node processes were
run with `node examples/dashboard/scripts/diagnose.mjs`.

| Diagnosis target        |    Median |          Min–max | Observable result                                  |
| ----------------------- | --------: | ---------------: | -------------------------------------------------- |
| Stale destructured prop | 29.826 ms | 28.438–33.219 ms | `props-destructuring` warning at line 1, column 29 |
| Leaked listener check   |  2.120 ms |   1.918–2.607 ms | Calls changed 1 → 1 after owner disposal           |

These timings measure the repeatable reproduction and source-path lookup. They
do not claim that a developer can understand a bug in the same number of
milliseconds. The stale-prop warning is actionable today; an external listener
diagnostic remains a proposed roadmap improvement.

## Reproduction

```sh
pnpm --filter @benosjs/dashboard exec tsc --noEmit
pnpm exec tsc -p examples/dashboard/tsconfig.solid.json --noEmit
pnpm --filter @benosjs/dashboard build:compare
node examples/dashboard/scripts/diagnose.mjs
```

`comparison-results.json` contains the last seven-sample slice measurement.

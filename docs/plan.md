# Benos build plan

This document is the source of truth for Benos scope and phase status. The master prompt establishes the initial architecture; this plan records the approved execution order and later corrections. Work stops at each checkpoint for review. As of 0.7.0, all thirteen packages are published; the optional UI system and the async, router, query, forms, and server-rendering modules, streaming included, are complete and shipped. Later package releases still require explicit approval.

## Phase 0 — Workspace — complete

- Scaffold the pnpm monorepo, TypeScript project references, Vitest, ESLint, Prettier, and production bundle-size checks.
- Set the minimum Node version to `^22.18.0 || ^24.11.0 || >=26.0.0` and use current stable Vite and Vitest versions.
- Create the architecture and roadmap documentation structure.
- Verify install, tests, build, lint, and size checks.

## Phase 1 — Kernel design documents — complete

Write and review `docs/architecture/reactivity.md`, `scheduling.md`, and `ownership.md`. Freeze signal, computed, effect, scheduling, ownership, context, cleanup, error, and renderer handoff semantics before implementation. The documents include numbered guarantees and test plans.

## Phase 2 — Forward-looking design and risks — complete

Write and review `docs/architecture/async.md`, `ssr.md`, and `risks.md`. Preserve the synchronous v0.1 kernel while reserving ownership and renderer seams for resources, Suspense, transitions, SSR, streaming, and hydration. Keep the flagship integration type-level sketch as a v0.1 gate.

## Phase 3 — Reactive kernel — complete

- Implement `@benosjs/core`: signals, computeds, effects, batching, untracking, cleanup, roots, ownership, context, errors, cycle limits, and intrusive dependency/queue structures.
- Test each primitive, deterministic disposal, scheduler properties, and fast-check reference-model behavior.
- Profile and optimize production hot paths without changing the public API or documented semantics.
- Compare production builds with Preact Signals Core, Alien Signals, and Solid's reactive core.
- Keep `@benosjs/core` within 4 KB minified and gzipped and record sizes and benchmark medians at every checkpoint.

## Phase 4 — Renderer and compiler — complete

### 4a — Design — complete

Review and approve `components.md`, `renderer.md`, and `compiler.md`, including the renderer interface, run-once props and children semantics, control flow, events, refs, attributes, JSX types, tuple template plans, and compiler diagnostics.

### 4b — `@benosjs/dom` — complete

Implement the DOM renderer, ownership-aware control flow, delegated and native events, refs, portals, error boundaries, provider behavior, template prototype caching, and component helpers. Keep core plus DOM within 10 KB minified and gzipped.

### 4c — Compiler and Vite — complete

Implement `@benosjs/compiler` and `@benosjs/vite` with readable development plans, compact production tuples, source maps, diagnostics, optimization parity, JSX-runtime guards, and packed-consumer coverage.

### 4d — Browser validation — complete

Run Playwright coverage in Chromium, Firefox, and WebKit for live-document attachment, portals, detached-host observation, disposal before attachment, focus, parser-sensitive DOM, accessibility, keyboard navigation, and RTL. Keep all Phase 4 rows closed in `test-traceability.md` and run the browser suite in CI.

## Phase 5 — Diagnostics, benchmarks, and validation — complete

### 5a — Development diagnostics — complete

Cover destructured props, computations outside an owner, writes inside computeds, cycles, duplicate `<For>` keys, `getContext` outside an owner, and the deferred `children()` double-mount warning. Provide `@benosjs/eslint-plugin` with the `no-props-destructuring` rule. Production bundles must remain byte-for-byte unchanged at the established size checkpoints.

### 5b — Framework benchmark — complete

Integrate the official js-framework-benchmark workload protocol with a Benos implementation and equivalent production builds for Solid, Svelte, Vue, and React. Report the local environment, framework versions, benchmark operations, medians, methodology limits, and where Benos is slower with evidence-based explanations. Record results in `benchmarks/README.md`.

The local production-build adapter and report are complete. The interleaved production trace protocol, median plus spread reporting, and kernel guard are recorded in `benchmarks/README.md`.

### 5c — Dashboard validation — complete

Build `examples/dashboard` with mock authentication, hand-rolled navigation, forms, a large sortable table, async data using `fetch` plus signals, modals, error states, and nested components. Write `docs/dashboard-findings.md` listing every awkward or confusing API interaction and the resulting fixes or explicit trade-offs. The dashboard and an equivalent Solid table/form slice are built and measured; the checkpoint is ready for review.

### 5d — Flagship integration type sketch — complete

Write the type-level sketch required by risk 1 in `risks.md`: one typed declaration connecting route params, query data, form schema, validation, mutation, and cache invalidation using typed references rather than string keys. Confirm that the current core types can support the integration without implementing the out-of-scope modules. See [flagship-integration.md](architecture/flagship-integration.md).

## Phase 6 — v0.1 readiness — complete

- Reconcile Phase 5 findings and fix only approved v0.1 issues.
- Verify bundle budgets, coverage, benchmark records, and agreement between implementation and architecture documents.
- Write the getting-started guide and API reference for the v0.1 surface.
- The initial v0.1 readiness work ended before publication; the approved v0.2.0, v0.2.1, and v0.2.2 releases are now published.

### 6a — v0.1 blockers — complete

- Fix the `mergeProps` compiler helper import and add a packed consumer test that compiles and runs every public helper and control-flow component: `splitProps`, `mergeProps`, `children`, `<Show>`, `<For>`, `<Switch>`, `<Match>`, `<Dynamic>`, `<Portal>`, and `<ErrorBoundary>`.
- Complete JSX intrinsic element and attribute types generated from machine-readable WHATWG HTML, SVG2, and WAI-ARIA standard registries rather than a hand-maintained list, covering all HTML, SVG, and ARIA names.
- Publish generic prop and child types for `<Show>`, `<For>`, `<Switch>`, `<Match>`, `<Dynamic>`, `<Portal>`, and `<ErrorBoundary>`; none may expose `unknown` as their component return type.
- Fix `splitProps` inference for literal key arrays.
- Add `expect-type` type-level tests for the helper, control-flow, intrinsic-element, attribute, and `splitProps` contracts above.
- Add a CI check that fails when application source imports an internal subpath such as `@benosjs/core/internal` or `@benosjs/dom/internal`.

### 6b — Performance candidates — complete

- Emit stable event handlers without per-instance getter and wrapper closures.
- Add a two-ended swap check in `<For>` before the general keyed path.
- Re-measure the full-parent clear fast path with the interleaved protocol, restoring it only if it measurably helps.
- Reduce large-row removal cost with contiguous DOM removal and cheaper per-row disposal. Measure every change with the interleaved benchmark protocol and dashboard filter slice; retain only measurable improvements.

### 6c — Documentation — complete

- Write a React migration guide covering run-once components, accessor callbacks in `<For>`, and the deliberate rejection diagnostics for `className` and `htmlFor`.
- Add an event-ordering table covering native listeners, delegated listeners, `stopPropagation`, and the delegated event set.
- Write the getting-started guide and the complete v0.1 API reference. Every code example must compile and type-check in CI.

### 6d — `create-benos` — complete

- Implement the full `create-benos` requirements below, including end-to-end tests that scaffold into a temporary directory, install packed packages, and verify type-check, build, test, and lint. The package was later published in the approved v0.2.x releases.

### 6e — Final verification — complete

- Run unit, type-level, browser, consumer, and `create-benos` tests; verify bundle budgets, benchmark records, complete traceability, and architecture/implementation consistency.
- Write `docs/checkpoints/v0.1-readiness.md` with release state, the known Solid performance gap, and open roadmap items.

### `create-benos` readiness requirements

- Add a separately packaged `create-benos` npm package so `npm create benos@latest` scaffolds a new TypeScript/TSX Benos application using the documented `@benosjs/core`, `@benosjs/dom`, `@benosjs/compiler`, and `@benosjs/vite` surface.
- Detect npm, pnpm, Yarn, and Bun invocation so generated scripts and install instructions use the caller's package manager.
- Support a non-interactive project name/template path suitable for CI, with a clear interactive default for local use. Refuse to write into a non-empty directory unless the user explicitly confirms the overwrite.
- Generate a TypeScript/TSX project with ESLint, Prettier, Vitest, and an example app that exercises signals, components, `<Show>`, and `<For>`.
- Generated projects must support Windows, macOS, and Linux, use the Node.js `^22.18.0 || ^24.11.0 || >=26.0.0` range, and pass end-to-end type-check, build, test, and lint checks against packed Benos packages.
- Git initialization is opt-in through an explicit `--git` flag; scaffolding never initializes Git implicitly.
- Include the minimal scripts and JSX configuration needed for a first render, and keep router, forms, query, SSR, UI primitives, and other out-of-scope modules out of the generated starter.
- Recheck npm name and scope availability immediately before publication; publishing remains explicitly deferred until approval.

## Phase 7 — Row creation at Solid's level — planned

Close the remaining initial-render gap with Solid. The 0.3.0 performance track ([perf-plan.md](./perf-plan.md)) took creation from about 1.6× to about 1.4× Solid with compiled direct output and lazy owners; this phase goes after the rest. The brief will be `docs/row-perf-plan.md`, with checkpoints `docs/checkpoints/rp-<step>.md`.

**Goal.** On the js-framework-benchmark operations, Benos's median is at or below Solid's, or within 5% with overlapping spreads, under the interleaved production protocol in `benchmarks/README.md`:

| Workload                                   | Last recorded (0.3.0) | Target                              |
| ------------------------------------------ | --------------------: | ----------------------------------- |
| Create 1,000 rows                          |                 1.39× | ≤ 1.05×                             |
| Replace 1,000 rows                         |                 1.40× | ≤ 1.05×                             |
| Create 10,000 rows                         |                 1.36× | ≤ 1.05×                             |
| Append 1,000 rows                          |                 1.22× | ≤ 1.05×                             |
| Clear rows                                 |                 2.07× | ≤ 1.10×                             |
| Sortable table initial mount (5k and 10k)  |            1.64–1.74× | ≤ 1.15×                             |
| Retained objects, arrays, closures per row |        44.2 / 19 / 19 | within 1.5× of Solid's 10.1 / 2 / 7 |
| Update, select, swap, remove, sort         |            0.94–1.44× | no regression                       |

Targets are goals, not results to force: each step reports the honest number, and a target that cannot be reached without breaking a rule below is reported as such.

**Rules.**

- No public API change and no change to the guarantees in `docs/architecture/`; every existing test passes unchanged. Anything that would need one is raised before it is built.
- Server rendering, streaming, and hydration keep working byte for byte: the server output, markers, and the hydration claim are covered by the existing SSR and streaming suites, and the client and server outputs keep coming from one compiler analysis.
- `optimization: 'none'` and `'safe'` keep identical behavior; development and production builds behave the same minus diagnostics.
- The kernel guard stays within 2× Preact. Any size-cap increase is proposed with its byte cost, its measured gain, and the alternative considered; you decide.
- Benchmark adapters and registry components stay idiomatic user code. Every result table includes every row with median and spread.

### 7a — Baseline and attribution

Re-measure on the current release (0.7.x), since async, router, SSR, and streaming have landed since the last record: all nine operations, the sortable table, and the retained per-row profile against Solid. Attribute creation and clear time by category (template cloning, slot location, binding setup, owners, effects, events, insertion, disposal, garbage collection). No optimization code.

### 7b — Design

Write the candidate changes into `docs/architecture/performance.md`, ranked by expected gain, each with its byte cost, semantic risk, effect on hydration and the server output, and test plan. Candidates to evaluate, not conclusions: bindings that settle after their first run allocate no effect node; owners created only for rows that register cleanups or context; event handlers stored on the element without per-row records; compiled slot paths without intermediate arrays; batched disposal and range removal on clear and replace.

### 7c — Implement in increments

One approved change at a time, each followed by the full measurement set, its byte cost, and its allocation change. Keep only changes with a measured, repeatable gain; revert the rest and record why.

### 7d — Verification and release preparation

Full verification on three browsers and three operating systems, `benchmarks/README.md` updated with the final comparison against Solid, Svelte, Vue, and React, CHANGELOG, and a pull request. Stop before merging.

## Phase 8 — Benos devtools — planned

A browser extension that shows what a running Benos app is doing: the reactive graph, live values, and why a DOM node updated. React DevTools cannot do this for Benos, because it inspects components that re-render, while Benos components run once and individual signals update individual nodes. The brief will be `docs/devtools-plan.md`, with checkpoints `docs/checkpoints/dt-<step>.md`.

**Rules.**

- Production bundles are byte-for-byte unchanged: the instrumentation exists only in development builds, and the size checks prove it.
- Instrumentation goes through a development-only hook in `@benosjs/core` and `@benosjs/dom` (raised before it is added, as a change to core). With no devtools attached, development builds pay at most a flag check per graph operation, measured with the kernel benchmark in development mode.
- The extension only reads and displays; editing a signal's value from the panel is a development aid behind an explicit action. It sends nothing off the machine.
- Chrome and Firefox, Manifest V3. Publishing to the Chrome Web Store and Firefox Add-ons needs your developer accounts and is your step.

### 8a — Design

Write `docs/architecture/devtools.md`: the hook's events (node created, read, written, ran, disposed; owner tree; DOM node to binding), the message protocol between the page and the extension, how source locations are recorded (the compiler already has them for source maps), the cost in development builds, and the panel designs. Decide the package layout (`@benosjs/devtools` for the in-page agent, plus the extension).

### 8b — Development hook and in-page agent

The hook in core and DOM, and the agent that keeps a model of the graph and the owner tree. Tests for every event against the kernel's own graph inspection, and the proof that production output did not change.

### 8c — Inspector panel

The extension with an element picker (click the page, see the owner, bindings, and the signals each binding reads), the owner tree, and live values. Playwright tests that load the extension in Chromium.

### 8d — "Why did this update?" and the recorder

Record a session; for any DOM update, show the chain back to the write and its source line. Highlight updates on the page. Report counts and time per computation, effects still alive after their owner left (leaks), and repeated writes in one flush.

### 8e — Module panels

Router (current route, params, loaders), query (cache entries, staleness, in-flight requests), forms (field state and validation), async (pending resources and Suspense boundaries), and server-rendered pages (which boundaries streamed and hydrated).

### 8f — Validation and release preparation

Use the devtools on the dashboard and record what they found in `docs/devtools-findings.md`, documentation, CHANGELOG, a pull request, and the extension packages ready for store submission. Stop before merging.

## Current release and next scope

Versions 0.2.0 through 0.7.0 are published. The optional UI system is complete and shipped: primitives, the source-owned component registry, `benos init/add/list/diff/update`, and theming are part of the released product. 0.4.0 shipped async resources and the router ([router-async-plan.md](./router-async-plan.md)); 0.5.0 shipped query, forms, and the flagship integration as executable code ([query-plan.md](./query-plan.md), [forms-plan.md](./forms-plan.md)); 0.5.1 made the `benos` CLI read its registry index from its own release tag ([registry-pin-plan.md](./registry-pin-plan.md)); 0.6.0 shipped server rendering and hydration ([ssr-plan.md](./ssr-plan.md)); 0.7.0 shipped streaming, progressive hydration, and the server fast path ([streaming-plan.md](./streaming-plan.md)).

0.7.1 pinned the starter's Vitest so `npm create benos` installs under npm 10.

Next is Phase 7, row creation at Solid's level, then Phase 8, the devtools. Blocks and eager server serialization remain upcoming after them.

## Scope boundary

Shipped scope includes the core, DOM renderer, compiler, Vite integration, diagnostics, benchmark and dashboard validation, documentation, and the optional UI system listed above. The router, async resources, Suspense, and transitions shipped in 0.4.0; query, forms, and the flagship integration shipped in 0.5.0; string server rendering and hydration shipped in 0.6.0; streaming shipped in 0.7.0. Phases 7 and 8 are planned: row creation performance and the devtools. Blocks, eager server serialization, and React interop remain upcoming unless a later approved plan changes this document.

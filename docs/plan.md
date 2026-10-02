# Benos build plan

This document is the source of truth for Benos scope and phase status. The master prompt establishes the initial architecture; this plan records the approved execution order and later corrections. Work stops at each checkpoint for review. No package is published and no Git history is changed without explicit approval.

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
- Do not publish packages.

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

- Implement the full `create-benos` requirements below, including end-to-end tests that scaffold into a temporary directory, install packed packages, and verify type-check, build, test, and lint. Do not publish.

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

## Scope boundary

In scope through Phase 6: the core, DOM renderer, compiler, Vite integration, diagnostics, benchmark validation, dashboard validation, documentation, and readiness tooling listed above. Router, forms, query, state, UI primitives, component registry, SSR, hydration, async resources, Suspense, devtools, React interop, and a general CLI remain out of scope unless a later approved plan changes this document.

# Changelog

All notable changes to Benos are documented here.

## [0.7.0] — 2026-10-31

### Added

- Add `renderToStream(app, options)` to `@benosjs/server`: it resolves once
  the router's loaders have settled, to `{ status, headers, stream, done }`,
  and streams the shell with every waiting `Suspense` boundary as its
  fallback, then one patch per boundary as its opted-in data settles (a
  `<template>` with the content, a payload script with only the new
  snapshots, and a call to a self-removing inline runtime), then an end
  notice. After the last patch the document is byte for byte what
  `renderToString` produces. `nonce` stamps every inline script; errors after
  the shell reach `onError` with `phase: 'stream'`.
- Hydrate progressively: `hydrate` waits for the shell when called before it
  exists (load the entry with `async`), merges every payload script, takes the
  patches that land after it started and claims their content in place, and
  holds a resource or query whose snapshot is still on its way instead of
  fetching it. The end notice, or the end of parsing without one, releases
  everything to the ordinary client path.
- Stream the dashboard example: its project detail reads a deliberately slow
  activity query inside `Suspense`; the shell arrives in about 100 ms where the
  whole page took about 700 ms (`pnpm bench:stream`). The
  [server rendering guide](docs/ssr.md) and [findings](docs/ssr-findings.md)
  cover streaming.

### Changed

- Server rendering is faster: a binding is evaluated once, with no computation,
  unless a tracked resource is pending in the request; template skeletons are
  compiled once per definition and built in place; cleanup closures that
  duplicated range removal are gone; a primitive slot value gets no owner.
  The 1,000-row benchmark went from 9.1 ms to 4.6–8.6 ms (17–23× Solid, from
  35–45×). Development keeps an effect per binding to refuse and report a
  write made after a binding read, so its HTML equals production's.
- Marker grammar v1 gains one extension: a streamed boundary's fallback is
  marked `<!--b:0:ID-->`. The protocol version stays 1; every 0.6.0 page is
  unchanged and still hydrates.
- The request record gains `track(promise, shell?)` (the router flags its
  initial navigation), `pendingCount`, `pendingOf`, `whenPatched`, and
  `whenSnapshot`; all optional, no core runtime change.

### Changed (registry)

- Raise UI registry dependency ranges to `^0.7.0` and minimum Benos versions
  to `0.7.0`, and build registry release `0.7.0`. No component changed.

### Sizes

- `@benosjs/server` 7,668 B (cap raised to 8,448 B for streaming and the fast
  path) and `@benosjs/dom/hydrate` 3,962 B (cap raised to 4,096 B for
  progressive hydration), each measured with core and DOM external; async
  2,084 B (+187), query 3,744 B (+5), router 6,899 B (+2); core 4,490 B,
  core + DOM 11,515 B, and forms 2,888 B unchanged, minified and gzipped.

## [0.6.0] — 2026-10-30

### Added

- Publish `@benosjs/server` with `renderToString(app, options)`: it renders
  the same components as the browser on any runtime with Web APIs (Node 20+,
  Bun, Deno, edge workers), waits for resources and queries that opt in with
  an `ssr` codec, serializes only their projections into a JSON payload, and
  returns the HTML with hydration markers, the status the router set (`404`
  for the not-found view, `302` with `Location` for a redirect), and headers.
- Add `@benosjs/dom/hydrate` with `hydrate(app, host, options)`: it claims the
  server's nodes positionally, attaches handlers once, keeps input typed before
  hydration, runs effects and `onMount` after the claim, keeps claiming until
  the router's loaders settle, and recovers a mismatch inside the nearest
  dynamic range, reporting it through `onMismatch`.
- Add the `ssr` option to `resource()` and `query()`, request-local query
  caches on the server, payload seeding on the client, and deterministic
  `createUniqueId()` and form field ids under server and hydrating roots.
- Render the dashboard example on the server (`entry-server.tsx`,
  `scripts/serve.mjs`), with the deployment shape in its README, and add the
  [server rendering guide](docs/ssr.md) and
  [findings](docs/ssr-findings.md).

### Changed

- Internal controls (`Suspense`, `RouterOutlet`) mount through a host
  argument, so one implementation serves the DOM and the server. A root
  created during a request inherits the request. `@benosjs/vite` compiles the
  SSR environment exactly like the client; the server renders both the plan
  and the direct template output.

### Changed (registry)

- Raise UI registry dependency ranges to `^0.6.0` and minimum Benos versions
  to `0.6.0`, and build registry release `0.6.0`. No component changed.

### Sizes

- Core 4,490 B and core + DOM 11,515 B (cap raised to 11,520 B for the
  hydration seams), query 3,739 B (cap raised to 3,840 B), router 6,897 B,
  async 1,897 B, forms 2,888 B; `@benosjs/dom/hydrate` 3,158 B (cap 3,328 B)
  and `@benosjs/server` 5,898 B (cap 6,144 B), each measured with core and DOM
  external, minified and gzipped.

## [0.5.1] — 2026-10-30

### Fixed

- `benos` reads its default UI registry index from its own release tag instead
  of `main`, so merging a release before publishing it no longer breaks
  published CLIs.
- Update the starter template's `happy-dom` to 21.0.4 so a fresh scaffold has
  no high-severity audit advisories (GHSA-834v-8h66-3h79).

## [0.5.0] — 2026-10-27

### Added

- Add `@benosjs/query`, a typed cache for server data. `query()`
  definitions infer argument and data types from `fetch`; each argument
  names one shared entry, and identity comes from the definition plus the
  argument, not string keys. Requests are deduplicated, fresh data is reused
  (`staleTime` 5 s by default), unused entries are collected after 5 minutes,
  and a request that started before a newer write can never overwrite it.
- Query observers are `resource()`s: they work with `<Suspense>` and
  `startTransition()`, expose `fetching()`, `error()`, and `failureCount()`,
  and never show one argument's data for another.
- Queries retry transient failures (network errors, timeouts, and HTTP 408,
  429, and 5xx) up to two times with jittered backoff, honoring
  `Retry-After`. Other errors fail at once. Mutations and `resource()` never
  retry.
- Add `mutation()` with declarative cache effects: `writes` stores the
  server's response, `affects` refreshes typed targets, and `optimistic`
  applies writes at once and rolls them back on failure. `run()` resolves to
  `{ ok, … }` and never rejects; a save that finishes after navigation still
  updates the cache.
- Add `query.load()` for route loaders. Route data becomes a live cache entry:
  revisits reuse cached data, records a mutation invalidated wait for fresh
  data, and mutations update the current page in place.
- Add the [query guide](docs/query.md).
- Add `@benosjs/forms`. `formModel()` binds a form to a route's loader data, a
  tracked source, or fixed initial values. The form follows the committed
  record: fields you have not edited show the latest server data, edited
  fields keep your value and report `remoteChanged()` when the server moves,
  and another record resets the form when the router commits it, in the same
  component.
- Forms validate with any Standard Schema v1 library (tested with Zod,
  Valibot, and ArkType), sync or async, on submit, blur, or change. Issues map
  to the exact field, then the nearest ancestor field, then the form, and a
  mutation error carrying Standard Schema `issues` maps to fields too.
- `form.submit` saves the schema's output through a query mutation, by default
  as `{ ...params, values }`, and never rejects. Saved fields become pristine;
  fields edited during the save stay dirty; a save that finishes after
  navigation still refreshes its record.
- Add `<form.Field>`, which renders a label, the control, a description, and
  the error with ids and `aria-describedby`, and the `text`, `checked`,
  `choice`, and `select` adapters for the registry `Input`, `Textarea`,
  `Checkbox`, `Switch`, `RadioGroup`, and `Select`. A failed submit focuses
  the first invalid field. `form.field()` is the headless handle.
- Route-bound forms ask before you leave with unsaved changes
  (`leave: 'confirm'` by default; `'discard'` or your own dialog).
- Add `blockNavigation({ when, confirm })` to `@benosjs/router`. It holds link,
  programmatic, and Back/Forward navigations, reports
  `navigation().status === 'blocked'`, resolves a refused navigation as
  `{ status: 'blocked' }`, undoes a refused Back or Forward, and warns before
  unload while blocking. Router histories record each entry's position for
  this.
- Add the registry `field` item, the layout, description, and error styles of
  `<form.Field>`.
- Add the [forms guide](docs/forms.md). The dashboard example's project pages
  use the query cache, with an optimistic star, and edit a project with a
  form. `examples/flagship` is the flagship project editor as executable code,
  next to the same editor in React with TanStack Router, Query, and Form.

### Fixed

- `<Show>` now keeps its branch while `when` stays present, as the
  components design always specified. A function child is called once and
  its accessor tracks the latest value; a plain child is created once. 0.4
  recreated the branch whenever `when` changed to another present value,
  which reset component state such as form drafts on every data update. Code
  that relied on setup running again must now react to the accessor.
- The compiler now compiles a JSX member tag with a lowercase object, such as
  `<form.Field>`, as a value. It produced the string `"form"` and threw
  "Invalid Benos JSX element type".
- The registry `Input` and `Textarea` keep `aria-invalid` and their invalid
  style in step with `invalid` after the first render, and `Checkbox` and
  `Switch` put `aria-describedby` on the input that has their role, so screen
  readers read a field's description and error.

### Changed

- Router loader data types keep function members callable, so
  `match.data().value()` type-checks for a query entry. Loaders run under a
  per-match owner whose cleanup fires on supersession, replacement, and
  router disposal; this is now a documented contract.
- `RouterOutlet` registers the outlet when it renders instead of at module
  load, and `@benosjs/async` and `@benosjs/router` are marked
  `"sideEffects": false`, so a bundle that uses only the router's
  `blockNavigation` (as forms without a route do) drops the rest.
- Raise UI registry dependency ranges to `^0.5.0` and minimum Benos versions
  to `0.5.0`, and build registry release `0.5.0`.
- Bump all twelve publishable packages and the starter's Benos dependency
  ranges to `0.5.0`. The starter does not include the router, query, or
  forms.
- Sizes: `@benosjs/query` is 3,498 B against a 3,584 B budget,
  `@benosjs/forms` 2,878 B against 3,072 B, and the router 6,739 B against
  7,168 B (+390 B for the navigation blocker). Core is 4,303 B and core + DOM
  11,006 B; async is unchanged.

## [0.4.0] — 2026-10-19

### Added

- Publish `@benosjs/async` with `resource()`, `<Suspense>`, and
  `startTransition()`. Resources take a tracked source and an abortable
  fetcher, expose a `disabled | pending | ready | failed` state signal, keep
  stale values while reloading, and ignore superseded responses. Suspense
  reveals content together and holds effects and `onMount` until reveal.
- Publish `@benosjs/router` with typed routes whose params are inferred from
  the path string, typed search codecs, nested layouts with `<Outlet>`, index
  and not-found routes, redirects, lazy route modules, and typed `<Link>` and
  `navigate()`. A wrong or missing param is a type error.
- Add route loaders that start before the route renders, update params,
  search, and data together without remounting, abort on supersession, and
  report failures to per-route error views with `retry()`.
- Add pending navigation state, route-heading focus, polite route
  announcements, hash and top scrolling, per-entry scroll restoration, and a
  memory history for tests.
- Add the [router guide](docs/router.md) and [async guide](docs/async.md).
- Turn `examples/dashboard` into a multi-page app with loader-backed project
  list and detail routes under a shared layout.

### Fixed

- Fix `<Show>`, `<Switch>`, and `<For>` updates when they are the root of a
  staged branch. After a router or Suspense commit, later branch changes
  inserted into the detached staging fragment, which dropped content or
  threw `insertBefore` in the browser.

### Changed

- Core and DOM gained internal staging and owner-gating seams used by async
  and the router. Public core and DOM APIs and their timing are unchanged.
  Core is 4,303 B and core + DOM is 11,010 B, within the 4,608 B and
  11,264 B budgets.
- `benos info` lists `@benosjs/async` and `@benosjs/router`.
- Raise UI registry dependency ranges to `^0.4.0` and minimum Benos versions
  to `0.4.0`, and build registry release `0.4.0`. Under semver's 0.x caret
  rule, `^0.3.0` excludes 0.4.0, so `benos add` would otherwise refuse fresh
  0.4.0 projects.
- Bump all ten publishable packages and the starter's Benos dependency
  ranges to `0.4.0`. The starter does not include the router.

### Verification

- Published at `0.4.0` across all ten packages. `@benosjs/core` and
  `@benosjs/dom` were published by the release workflow with provenance. The
  other eight were published manually because npm trusted publishing could not
  be configured on the new packages before their first version. Trusted
  publishing is now configured for all ten packages.

## [0.3.3] — 2026-10-16

### Fixed

- Align the starter's pinned Vitest version with the current Vitest peer family.
  Vitest `5.0.5` was published after the `5.0.4` starter pin and npm 10's
  Arborist crashes while resolving the resulting optional peer version skew.
  The targeted pin fixes fresh installs without changing unrelated packages.
- Add a daily cross-platform smoke check for the published latest starter using
  npm 10 and npm 11, including install, type-check, build, tests, and lint.

### Changed

- Bump all eight publishable packages and the starter's Benos dependency ranges
  to `0.3.3`.

## [0.3.2] — 2026-10-15

### Fixed

- Fix fresh create-benos projects failing during `npm install` with Node 22's
  default npm 10 by upgrading the starter template's Vitest dependency to
  `5.0.4`. Add an npm 10 and npm 11 starter install check to CI on Ubuntu,
  Windows, and macOS.

### Changed

- Bump all eight publishable packages to `0.3.2`.

## [0.3.1] — 2026-10-11

### Fixed

- Make `benos info` read installed package versions from package manifests
  through the project's module resolution paths. Packages that are declared
  but cannot be read are shown as unavailable with a warning instead of being
  silently omitted.

### Changed

- Bump all eight publishable packages and the starter's Benos dependency ranges
  to `0.3.1`.

## [0.3.0] — 2026-10-11

### Added

- Add `benos --version` / `-v`, root and command-specific `--help` / `-h`, and
  `benos info` for runtime, package-manager, operating-system, and installed
  Benos package details. Add `create-benos --version` / `-v` and `--help` / `-h`.

### Improved

- Make direct DOM output the compiler's standard `safe` output for supported
  JSX shapes, with the existing runtime-plan path retained as a fallback.
- Create effect-run owners only when an effect run needs a cleanup, child owner,
  or context, reducing generic-row owner creation calls from 8 to 4 and retained
  plain objects from 57 to 53 per row.
- Measure the registry sortable table at 2, 3, 5, and 8 columns against
  handwritten Benos and Solid, then remove the fixed three-column optimization
  because its gain did not generalize across widths. The interleaved medians
  and spreads are in `benchmarks/README.md`.
- The latest full production trace measured Benos at 1.39× Solid for 1,000-row
  creation, 1.40× for replacement, and 1.36× for 10,000-row creation. The full
  nine-operation comparison and spreads are in `benchmarks/README.md`.
- Raise UI registry minimum Benos versions to `0.3.0`, so fresh projects
  install the matching package release.

### Changed

- Bump all eight publishable packages and the starter's Benos dependency ranges
  to `0.3.0`.

## [0.2.3] — 2026-10-09

### Improved

- When a Benos command runs outside a project, suggest the nearby Benos app
  folder when there is one unambiguous match.

### Changed

- Bump all eight publishable packages and the starter's Benos dependency ranges
  to `0.2.3`.

## [0.2.2] — 2026-10-07

### Fixed

- Normalize generated npm package names to lowercase safe names while keeping
  the project directory exactly as entered. If a name has no usable letters or
  numbers, interactive runs ask for a valid package name.
- Start generated applications at version `0.0.0` instead of inheriting the
  create-benos package version.

### Changed

- Show create-vite-style progress for scaffolding, dependency installation,
  Benos UI setup, and server startup. The UI file list is hidden by default and
  available with `--verbose`.
- Bump all eight publishable packages and the starter's Benos dependency ranges
  to `0.2.2`.

### Verification

- Published at `0.2.2` across all eight packages after the `v0.2.2` tag was
  verified. The published npm versions and starter were smoke-tested.

## [0.2.1] — 2026-10-06

### Fixed

- Give the `benos` executable a dedicated bin entrypoint so npm's Unix
  symlinks and Windows `.cmd` shims run the CLI reliably.
- Automatically install a required `@benosjs/*` package when it is missing
  during `benos add`; continue to refuse an installed package that is too old
  and print its exact upgrade command.

### Changed

- Bump all eight publishable packages and the starter template to `0.2.1`.
- Update registry component dependency ranges and minimum Benos versions to
  `0.2.1`.
- Deprecate `benos@0.2.0` with an upgrade message pointing to `0.2.1` because
  its launcher failed through npm bin symlinks and Windows command shims.

### Verification

- Published at `0.2.1` across all eight packages. The packed CLI passed through
  npm, pnpm, Yarn, and Bun launch paths on Ubuntu, Windows, and macOS.

## [0.2.0] — 2026-10-06

### Added

- Publish the optional Benos UI system: `@benosjs/primitives` provides
  accessible Zag.js adapters, and `benos` installs, lists, diffs, and safely
  updates 19 editable UI components from the versioned registry.
- Add `createUniqueId()` to `@benosjs/core`, with owner-scoped IDs ready for
  deterministic server rendering in a future SSR implementation.
- Add interactive `create-benos` prompts for the project name, optional UI
  setup, and installing dependencies plus starting the dev server. Scriptable
  flags cover each prompt, and non-interactive runs never start the server by
  default.
- Support `benos init`, `add`, `list`, `diff`, and three-way `update`, with
  version gates, conflict artifacts, and recoverable per-component updates.

### Changed

- Align the eight publishable packages and the starter template on version
  `0.2.0`. Registry items now require the `0.2.0` minimums for the Benos
  packages they use.
- Keep `node-pty` and all other workspace test tools in development-only
  dependencies. Packed CLI checks reject native modules and runtime test-tool
  dependencies.

### Verification

- Local release verification passed: 221 unit tests, 405 browser tests across
  Chromium, Firefox, and WebKit, the packed create-benos consumer, and the pnpm
  UI CLI consumer matrix. Type-level, documentation, package, gallery, lint,
  bundle-size, and production benchmark checks also passed. The fresh template
  install reported no engine or deprecation warnings and zero vulnerabilities.
- Published at `0.2.0` across all eight packages. The CLI version was later
  deprecated after the launcher issue described in the `0.2.1` entry.

## [0.1.2] — 2026-10-02

### Changed

- Replace the create-benos starter with one small, centered responsive example
  that follows the system light/dark theme and uses the Benos logo for branding
  and the favicon.
- Demonstrate run-once components with a counter and a render-count indicator,
  and add a keyed `<For>` list with add, remove, and shuffle controls.
- Link the starter to the getting-started guide, API reference, React migration
  guide, and GitHub repository. Remove the obsolete `--template` CLI option.
- Bump the six publishable packages and starter dependencies to `0.1.2`.

### Verification

- Local Node 24.11 verification passes: 136 unit/integration tests, 30 browser
  tests, type-level checks, docs, lint, packed metadata, and the create-benos
  packed end-to-end test.
- A fresh packed starter install reports zero vulnerabilities and no engine or
  deprecation warnings. The production bundle remains 4,001 B for core and
  10,151 B for core plus DOM; the five kernel benchmark medians remain below
  the 2× Preact CI guard.
- GitHub Actions runs the packed create-benos end-to-end test on Ubuntu,
  Windows, and macOS.
- Published at `0.1.2`.

## [0.1.1] — 2026-10-02

### Fixed

- Preserve whitespace adjacent to JSX expressions using line-aware JSX text
  normalization; added inline and multiline text-expression fixtures for both
  compiler optimization modes.
- Pre-optimize `@benosjs/dom/internal` in the Vite plugin to avoid a first-load
  dependency optimization reload.
- Render the starter features as a semantic list and add compact default CSS.

### Changed

- Require Node.js `^22.18.0 || ^24.11.0 || >=26.0.0` across the packages and starter,
  matching the strictest dependency requirement. CI now runs at Node 22.18.0
  and checks installed dependency engine ranges.
- Upgrade ESLint to 10.11.0, Vite to 8.3.2, Vitest to 5.0.3, and happy-dom to
  20.14.5. The ESLint plugin now declares its supported ESLint 10 peer range;
  CI audits a freshly scaffolded project for high and critical advisories.
- Publish only `dist/js` and `dist/types` from the scoped packages. The packed
  metadata check rejects root stub files, `.tsbuildinfo`, and missing export
  targets.

### Verification

- The local suite passes 136 unit tests and 30 Chromium/Firefox/WebKit tests;
  type-level, documentation, lint, packed-package, engine, and size checks pass.
- `@benosjs/core` is 4,001 B minified plus gzip; core plus DOM is 10,151 B,
  both within the existing budgets.
- On Node 24.11.0, a fresh scaffold installed from packed 0.1.1 packages with
  no engine or deprecation warnings; `npm audit` reported zero vulnerabilities.
- Published at `0.1.1`.

## [0.1.0] — 2026-10-01

### Release metadata

- Renamed the unavailable pre-release `@benos/` scope to `@benosjs/` and moved
  repository links to the `benosjs/benos` GitHub organization.

### Added

- Fine-grained signals, computeds, effects, batching, ownership, cleanup,
  contexts, and error routing in `@benosjs/core`.
- DOM rendering, components, control flow, portals, refs, events, and error
  boundaries in `@benosjs/dom`.
- TypeScript/JSX compilation, source maps, diagnostics, and Vite integration
  through `@benosjs/compiler` and `@benosjs/vite`.
- Generated HTML, SVG, MathML, and ARIA JSX types plus the Benos ESLint rule
  package.
- `create-benos` scaffolding with package-manager detection and a packed
  consumer verification flow.
- Browser, consumer, type-level, benchmark, and dashboard validation suites.

### Verification

- 133 repository tests and 30 Chromium/Firefox/WebKit browser tests pass.
- `@benosjs/core` is 3,997 B minified plus gzip; core plus DOM is 10,148 B.
- All six packages were published at `0.1.0`; the `latest` tags for
  `@benosjs/dom` and `@benosjs/vite` point to `0.1.0`.
- `@benosjs/dom@0.0.0-stage` and `@benosjs/vite@0.0.0-stage` were also
  published during failed initial attempts and have been deprecated.
- The published scoped tarballs include non-exported root `dist/index.*` stub
  files and `dist/types.tsbuildinfo`. All package exports resolve to real files
  under `dist/js` and `dist/types`; excluding those extras and rejecting them
  in `check:packed` are tracked for `0.1.1`.
- A fresh npm consumer app passed type-check, build, test, and lint.

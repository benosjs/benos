# Changelog

All notable changes to Benos are documented here.

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
- The Ubuntu, Windows, and macOS GitHub Actions matrix is pending the push.
- This version is prepared for release and has not been published.

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
- This version is prepared for release and has not been published.

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

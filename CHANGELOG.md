# Changelog

All notable changes to Benos are documented here.

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
- No package was published as part of this release preparation.

# Benos roadmap

This roadmap covers work after v0.1. The phase scope and current status live in [plan.md](./plan.md); this file lists the post-v0.1 modules and investigations only.

## v0.1.1 package cleanup

- Narrow the `files` allowlist in the five scoped packages to publish only
  `dist/js` and `dist/types`, excluding the non-exported root `dist/index.*`
  stubs and `dist/types.tsbuildinfo` found in the v0.1.0 tarballs.
- Extend `check:packed` to reject `.tsbuildinfo` files and root stub entry
  points in every packed package.
- Update the starter's `happy-dom` dev dependency to a patched version and
  rerun its consumer checks; the v0.1.0 template install reports a critical
  dev-dependency advisory, while the production dependency audit is clean.

## First-party modules (optional, integrated)

- `@benosjs/router`: typed routes, params, and search params; nested layouts; lazy loading; route-level data loading; SSR support.
- `@benosjs/forms`: schema-driven, fine-grained field updates, strong inference, field state (value, errors, dirty, touched, submitting).
- `@benosjs/query`: caching, mutations, invalidation, retries, optimistic updates, cancellation, SSR. Evaluate adapting framework-agnostic cores (e.g., TanStack) before building from scratch.
- `@benosjs/state`: only if core signals plus a possible `store()` primitive prove insufficient.

## Flagship integration research

One typed declaration connecting route params, query, form schema, validation, mutation, and cache invalidation, with typed references throughout (no string keys such as `invalidate: ["users"]` or `field="name"`). Goal: eliminate the glue code between these concerns.

## UI system (optional)

- `@benosjs/primitives`: headless, accessible behavior (dialog, popover, menu, select, combobox, tabs, tooltip, accordion) built on Zag.js or a similar proven state-machine library, not from scratch. Must support RTL.
- Styled component registry: `benos add button` copies source into the project, shadcn-style. Registry metadata compatible with shadcn's format where practical. `benos diff` and `benos update` (three-way merge) from day one so fixes can reach copied components.
- Blocks: `benos add login`, `benos add dashboard`, with declared module dependencies.
- Theming via CSS variable tokens: light, dark, custom themes, accessible contrast, RTL.

## Tooling

The `benos` CLI (dev, build, add, diff, update), and DevTools that visualize the reactive graph and answer "why did this DOM node update?"

## Later investigations

SSR and streaming implementation, React interop via custom elements or islands, migration codemods, AI-friendly machine-readable documentation.

# Benos roadmap

This roadmap covers work after v0.1. The phase scope and current status live in [plan.md](./plan.md); this file lists the post-v0.1 modules and investigations only.

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

# Benos roadmap

Versions 0.2.0–0.2.2 are published. The phase plan and completed work live in
[plan.md](./plan.md); this roadmap tracks shipped optional modules and upcoming
framework work.

## Top framework performance item

- Reduce sortable table initial-render cost. The production comparison with
  Solid measured 2.72× at 5,000 rows and 2.46× at 10,000 rows (roughly 2× in
  the current workload). Sorting is near parity. See
  [benchmarks/README.md](../benchmarks/README.md) for the full protocol and
  results.

## Shipped in v0.2.x

- **UI primitives:** accessible Zag.js adapters, including keyboard, focus,
  ownership, and RTL behavior.
- **Component registry:** 19 source-owned components, including the sortable
  table, with minimum-version checks and immutable versioned payloads.
- **Benos UI CLI:** `init`, `add`, `list`, `diff`, and `update`, including
  conflict artifacts and recoverable component updates.
- **Theming:** CSS custom-property tokens, light/dark modes, and RTL support.
- **Starter and IDs:** interactive `create-benos` and the public
  `createUniqueId()` API.

`benos@0.2.0` is deprecated because its executable did not work through npm
bin symlinks and Windows command shims. Users should install a current release.

## Upcoming framework modules

- **Blocks:** reusable application patterns such as login and dashboard flows,
  built on the router and forms modules.
- **Router:** typed routes, params and search params, nested layouts, lazy
  loading, and route-level data loading.
- **Query:** caching, mutations, invalidation, retries, optimistic updates,
  cancellation, and SSR integration.
- **Forms:** schema-driven, fine-grained field updates with inferred value,
  error, dirty, touched, and submission state.
- **Flagship integration:** one typed declaration connecting routes, query,
  form schema, validation, mutation, and cache invalidation. The type-level
  sketch is complete; integrating the runtime modules remains future work.
- **SSR:** server rendering, hydration, streaming, and async resource
  serialization.
- **Devtools:** visualize the reactive graph and explain why a DOM node updated.

## Next CLI patch

- Improve the no-project error with the nearby-folder suggestion
  `Did you mean to run this in <folder>?`. This is planned work; it is not
  implemented yet.

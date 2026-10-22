# Benos roadmap

Versions 0.2.0 through 0.4.0 are published. The phase plan and completed work live in
[plan.md](./plan.md); this roadmap tracks shipped optional modules and upcoming
framework work.

## Top framework performance item

- Reduce per-row JavaScript allocations on initial render. The latest
  production trace measures generic row creation at about 1.4× Solid. The
  registry table now retains 44.2 plain objects, 19.0 arrays, and 19.0
  closures per row versus Solid's 10.1, 2.0, and 7.0. Continue reducing
  per-row allocations without regressing the nine-operation suite. See
  [benchmarks/README.md](../benchmarks/README.md) for the protocol, spreads,
  and allocation profile.

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

## Shipped in 0.4.0

- **Async:** `@benosjs/async` with owned resources, Suspense, and
  transitions. See the [async guide](./async.md).
- **Router:** `@benosjs/router` with typed routes, params and search params,
  nested layouts, lazy loading, route loaders, pending navigation, and focus
  and scroll management. See the [router guide](./router.md).

## Upcoming framework modules

- **Blocks:** reusable application patterns such as login and dashboard flows,
  built on the router and forms modules.
- **Query, forms, and the flagship integration (0.5.0):** `@benosjs/query`
  with caching, mutations, invalidation, retries, optimistic updates,
  cancellation, and route loader integration; `@benosjs/forms` with
  identity-aware form models, Standard Schema validation, accessible fields,
  and a leave policy; and the flagship editor connecting them as executable
  code ([flagship-integration.md](./architecture/flagship-integration.md)).
  Prepared for release on the `forms` branch; see the
  [query guide](./query.md) and [forms guide](./forms.md). SSR integration
  follows the SSR module.
- **SSR:** server rendering, hydration, streaming, and async resource
  serialization.
- **Devtools:** visualize the reactive graph and explain why a DOM node updated.

## Next CLI patch

- Improve the no-project error with the nearby-folder suggestion
  `Did you mean to run this in <folder>?`. This is planned work; it is not
  implemented yet.

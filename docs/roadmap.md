# Benos roadmap

Versions 0.2.0 through 0.6.0 are published. The phase plan and completed work live in
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

## Shipped in 0.5.0

- **Query:** `@benosjs/query` with caching, mutations, invalidation, retries,
  optimistic updates, cancellation, and route loader integration. See the
  [query guide](./query.md).
- **Forms:** `@benosjs/forms` with identity-aware form models, Standard Schema
  validation, accessible fields, and a leave policy. See the
  [forms guide](./forms.md).
- **Flagship integration:** the editor connecting typed routes, data, forms,
  and the cache as executable code
  ([flagship-integration.md](./architecture/flagship-integration.md)). SSR
  integration follows the SSR module.

## Shipped in 0.5.1

- **Registry pin:** the `benos` CLI reads the default UI registry index from
  its own release tag instead of `main`, so a release merged before it is
  published cannot break published CLIs
  ([registry-pin-plan.md](./registry-pin-plan.md)).

## Shipped in 0.6.0

- **Server rendering:** `@benosjs/server` and `@benosjs/dom/hydrate` with
  opt-in data serialization, router status codes, and in-place hydration of
  routed content; the dashboard rendered on the server. See the
  [server rendering guide](./ssr.md) and [findings](./ssr-findings.md).

## Prepared for 0.7.0

- **Streaming:** `renderToStream` with out-of-order Suspense patches over the
  0.6.0 markers and payload, CSP nonces, progressive hydration from an `async`
  entry, and the server fast path (1,000 rows from 9.1 ms to 4.6–8.6 ms); the
  dashboard streams its slow activity feed. See the
  [streaming section of the guide](./ssr.md#stream) and the
  [findings](./ssr-findings.md#streaming-070).

## Upcoming framework modules

- **Blocks:** reusable application patterns such as login and dashboard flows,
  built on the router and forms modules.
- **Devtools:** visualize the reactive graph and explain why a DOM node updated.
- **Eager server serialization:** write settled subtrees to the stream as
  strings instead of building nodes, the remaining server-speed item after the
  0.7.0 fast path.

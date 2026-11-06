# Benos roadmap

Versions 0.2.0 through 0.7.1 are published. The phase plan and completed work live in
[plan.md](./plan.md); this roadmap tracks shipped optional modules and upcoming
framework work.

## Next: Phase 7 and Phase 8

- **Phase 7, row creation at Solid's level:** implemented and in review.
  Against 0.7.1 in the same interleaved rounds, clear is 28% faster (2.06× →
  1.48× Solid), replace 9% (1.40× → 1.28×), creating 10,000 rows 6% (1.36× →
  1.28×), and the sortable table's mount about 6%; creating 1,000 rows moved
  least (1.37× → 1.35×). A row retains 67.5 objects instead of 95.5. The ≤ 1.05×
  creation target was not reached; the outcome and what remains are in
  [plan.md](./plan.md#phase-7--row-creation-at-solids-level--implemented-in-review)
  and [benchmarks/README.md](../benchmarks/README.md).
- **Phase 8, Benos devtools:** a browser extension for the reactive graph,
  live values, and why a DOM node updated, with panels for the router, query,
  forms, async, and server-rendered pages. Steps are in
  [plan.md](./plan.md#phase-8--benos-devtools--planned).

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

## Shipped in 0.7.0

- **Streaming:** `renderToStream` with out-of-order Suspense patches over the
  0.6.0 markers and payload, CSP nonces, progressive hydration from an `async`
  entry, and the server fast path (1,000 rows from 9.1 ms to 4.6–8.6 ms); the
  dashboard streams its slow activity feed. See the
  [streaming section of the guide](./ssr.md#stream) and the
  [findings](./ssr-findings.md#streaming-070).

## Upcoming framework modules

- **Blocks:** reusable application patterns such as login and dashboard flows,
  built on the router and forms modules.
- **Eager server serialization:** write settled subtrees to the stream as
  strings instead of building nodes, the remaining server-speed item after the
  0.7.0 fast path (server rendering is still 17–23× slower than Solid's).

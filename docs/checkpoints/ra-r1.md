# R1 — Router and async design review

**Status:** R1 approved with requested amendments on 2026-10-12. The amended design and circular-prone fixture are ready; R2 may begin with measured core/DOM prototypes.

## Deliverables

- [The track plan](../router-async-plan.md) is the source of truth for R0–R6.
- [Flagship integration target](../architecture/flagship-integration.md) was redesigned first, then amended with a React + shadcn/ui field version. All examples are Prettier-formatted without ignore directives. The page/editor blocks are 13 Benos, 73 React native, and 92 React shadcn/ui nonblank lines; full shown slices are 47, 87, and 106. All exclude imports and shared types, schema, and transports. This is a design comparison, not an implemented product claim.
- [Router architecture](../architecture/router.md) specifies typed path params/search, nested routes/layouts, matching, links, history, loaders, same-owner param changes, error and pending navigation states, lazy routes, focus/announcement/scroll, RTL, SSR seam, and test gates.
- [Async architecture](../architecture/async.md) now selects `@benosjs/async`, connects resource generations/Suspense/transitions to route staging, and preserves the opt-in SSR resource codec.

## Decisions proposed for approval

1. Keep `@benosjs/core` and `@benosjs/dom` **public** APIs and documented synchronous semantics unchanged. Add internal owner-job eligibility and staged DOM range hooks in R2. This is required because uncommitted Suspense content cannot run effects or mounts, and a transition-retained region cannot update against new signals before reveal.
2. Use instance-scoped route references: `route('/projects/:projectId', …)` infers `projectId`. Page/layout modules import references but not the router instance. The manifest dynamically imports every page/layout; context-bound `Link`/`navigate`/`navigation` use the registered instance. `route.match()` replaces `route.useMatch()`. Initial grammar is required named segments and terminal named splat; optional/regex segments are deferred.
3. Route loaders start before candidate render. Existing content stays during a pending navigation. On success, same-route params/search/data update atomically without remounting; on loader/import failure, the destination URL commits with its route error view.
4. Keep 0.4 cache-free. The 0.5 form/query/mutation design is an explicit compatibility constraint, including dirty-field preservation and declarative cache refresh keyed to the saved record.
5. Set production minified + gzip package caps of **4,096 B async** and **7,168 B router**, measured with framework dependencies externalized; also report fully bundled application cost when code exists.

## Size and repository boundary

At R1, the existing size script measured core **4,108 / 4,608 B** and core + DOM **10,580 / 11,264 B**. R1 is documentation only: **0 B added to core and 0 B added to DOM**. The design estimates internal core **+120–240 B**, DOM **+260–420 B**, combined **+380–660 B** after compression. These are estimates, not permission to exceed caps. The combined estimate is close to the 684 B remaining headroom; R2 must measure each prototype and stop if a cap fails.

The brief asks us to stop when core or DOM changes are needed. These exact internal changes are needed for Suspense/transition behavior, so no implementation proceeds without review of this checkpoint. No dependency, configuration, source code, or public API was modified in R1. No commit, push, PR, merge, tag, publish, or CI run was made.

## Validation and open risks

- Documentation formatting and whitespace checks passed; the current size script was run against unchanged production artifacts. No runtime test was run because R0/R1 specify design only.
- The 0.5 flagship snippets are proposed APIs. Type inference, Standard Schema issue mapping across Zod/Valibot/ArkType, real `Input` adapter behavior, and the React comparison require executable fixtures in their implementation phases. The shorter line count is not accepted as a correctness proof.
- Staged owners plus retained visible owners are the highest implementation risk. R2 must verify effect and mount gating, cancellation/disposal, A → B → A races, nested Suspense, and transition failure in all three browsers.
- The router's same-route atomic commit and popstate failure behavior are high-risk seams for R4; both require browser and memory-history regression tests.

R1 approval was provided in the current conversation. The requested amendments are documented above and in [router.md](../architecture/router.md), [async.md](../architecture/async.md), and the [circular-prone fixture](../../tests/fixtures/router-circular/README.md). The isolated production surface measurement was **8,253 B gzip Solid Router 1.0.0**, **28,219 B TanStack React Router 1.170.42**, and **32,759 B React Router 8.4.0**; method and caveats are in router.md. The fixture import-boundary test passes. R2 begins only with core/DOM prototype size measurements. The 4,608 B core and 11,264 B combined caps remain fixed; any prototype that exceeds either cap stops with exact bytes and alternatives.

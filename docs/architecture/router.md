# Router architecture for 0.4.0

**Status:** Implemented for 0.4.0. R5 validation is recorded in [ra-r5](../checkpoints/ra-r5.md). [The track brief](../router-async-plan.md) sets scope. [The flagship target](./flagship-integration.md) supplies the 0.5 compatibility test. This design preserves current core/DOM public APIs and their synchronous graph semantics.

## Package boundary and budget

`@benosjs/router` owns path matching, route definitions, typed URL construction, navigation state, loaders, browser/memory history, route presentation, and accessibility behavior. Its matcher, URL codec, and loader coordinator must run without `window`/`document`; only its browser history, `Link` interception, focus, announcement, and scroll adapters touch the DOM. The package depends on `@benosjs/async` and `@benosjs/dom`, and uses `@benosjs/core` through their internal seams. It contains no cache, mutation, form, auth, or UI-registry dependency. The 0.5 query adapter can call a loader and share its resource identity; the 0.5 mutation/form layer remains outside the router.

The router cap is **7,168 bytes** minified + gzip for a production entry with framework dependencies externalized. The async cap is **4,096 bytes** on the same basis ([async.md](./async.md)). Both are tighter than the initial R1 proposal. Also record the fully bundled `core + dom + async + router` bytes at R3/R4 so externalization cannot conceal total application cost. At the R2 baseline, core is **4,303 / 4,608 B** and core + DOM is **10,977 / 11,264 B**, leaving **305 B** and **287 B** respectively. R3 uses the existing internal staging and owner-gating seams; any further core or DOM work must remain within these fixed caps.

### Comparable production measurements

On 2026-10-12, an isolated temporary npm install measured `@solidjs/router@1.0.0`, `@tanstack/react-router@1.170.42`, and `react-router@8.4.0`. A tiny entry re-exported each package's browser router, memory router/history, route/link/navigation/params/search APIs, loader-capable router, and pending/redirect support where exported. The React bundles also included scroll restoration; Solid's entry included its preload hook. esbuild 0.28.2 used `bundle: true`, `minify: true`, `treeShaking: true`, `platform: 'browser'`, `format: 'esm'`, `target: 'es2022'`, production/browser conditions, no legal comments, and default Node gzip. `react`/`react-dom` or `solid-js` peers were external; each router's own dependencies were bundled.

The exact re-export sets were: Solid `Router, MemoryRouter, createMemoryHistory, Route, A, Navigate, useNavigate, useParams, useSearchParams, useIsRouting, useLocation, usePreloadRoute`; TanStack `createRouter, createRootRoute, createRoute, RouterProvider, Link, createMemoryHistory, createBrowserHistory, redirect, useNavigate, useParams, useSearch, ScrollRestoration`; React Router `createBrowserRouter, createMemoryRouter, RouterProvider, Link, Outlet, redirect, useNavigate, useParams, useSearchParams, useNavigation, ScrollRestoration`.

| Comparable public surface      | Minified bytes | Gzip bytes |
| ------------------------------ | -------------: | ---------: |
| Solid Router 1.0.0             |         19,966 |  **8,253** |
| TanStack React Router 1.170.42 |         78,207 | **28,219** |
| React Router 8.4.0             |         97,879 | **32,759** |

These are reproducible named-export surface measurements, not equivalent whole-app bundles or feature-for-feature benchmarks. Solid's Suspense/reactivity lives in its externalized peer, and React Router includes features beyond the Benos 0.4 scope. The **7,168 B router cap is 1,085 B below Solid Router's measured surface and 5,120 B below the rejected 12,288 B proposal**. The separate **4,096 B async cap** keeps its resource/Suspense/transition implementation visible in accounting; router + async may reach 11,264 B before shared compression, so R2–R4 must additionally report the combined bundle. If these caps prove impossible without removing required behavior, stop with measured alternatives rather than silently weakening features.

## Route declarations and inferred types

The recommended API separates **route references** from **route presentation**. A `route()` reference contains path and optional search codec types; R4 adds loader types. It imports no page or layout component and no router instance. R3's `mountRoute(ref, { lazy, children })` binds presentation in the application manifest. R4 adds per-route pending and error views. Every page and layout is a dynamic import, including shared layouts, so the manifest does not eagerly evaluate a module that imports route references. Inside a rendered owner, package-level `<Link>`, `navigate()`, and `navigation()` resolve the router from context. `getRouter()` returns the instance for a component to capture during setup and use in later event callbacks. Their destination types come from the route reference, and runtime checks reject a reference not registered with that router. Outside a rendered owner, a caller receives the router instance explicitly and uses `router.navigate()`. No app page imports the app's router instance at runtime; no global TypeScript module augmentation is needed.

```tsx
// routes/refs.ts: no component or router-instance imports
const projectRoute = route('/projects/:projectId', {
  search: {
    parse: (raw: URLSearchParams) => ({
      tab:
        raw.get('tab') === 'members'
          ? ('members' as const)
          : ('details' as const),
    }),
    stringify: (value: { tab: 'details' | 'members' }) =>
      new URLSearchParams({ tab: value.tab }),
  },
})
// routes/manifest.ts: dynamic component edges only
const router = createRouter({
  routes: [
    mountRoute(homeRoute, { lazy: () => import('./pages/home') }),
    mountRoute(projectRoute, {
      lazy: () => import('./pages/project-editor'),
    }),
  ] as const,
  notFound: () => <p>Not found</p>,
  history: browserHistory(),
})
// pages/project-editor.tsx: imports projectRoute from refs.ts, never manifest.ts
const match = projectRoute.match()
const router = getRouter() // capture during setup for later callbacks
;<Link
  to={projectRoute}
  params={{ projectId: 'p-1' }}
  search={{ tab: 'members' }}
>
  Members
</Link>
;<button
  onClick={() =>
    void router.navigate({
      to: projectRoute,
      params: { projectId: 'p-1' },
      search: { tab: 'details' },
    })
  }
>
  Details
</button>
// app bootstrap or an event outside an owner receives the instance
router.navigate({
  to: projectRoute,
  params: { projectId: 'p-1' },
  search: { tab: 'details' },
})
```

A `route()` call returns an immutable route reference, never global match state. `route.match()` reads the nearest committed match for that reference from the current owner context and throws a clear error outside a matching route scope, following the existing `getContext` rule. It returns a stable signal-bearing handle without the React-style `use` prefix. A route may be nested via `children: [...]` on `mountRoute` and may use a pathless layout whose lazy component renders `<Outlet />`. Parent and child layouts persist while their route identities remain matched. The router accepts an index route and a single `notFound` view for unmatched URLs. Absolute path literals are the public typed destination; a child may declare a relative segment but its reference carries an inferred full path after `createRouter` composition. Route registration rejects ambiguous duplicate full paths and conflicting parameter names. Sibling priority is static literal segment, then named segment, then catch-all; declaration order breaks otherwise equal specificity only with a development warning. Trailing slash policy is one canonical slash (root only) with redirects/replacements to the canonical URL. Path matching is case-sensitive by default and configurable per router only before creation.

Recommended multi-page layout:

```text
src/
  app.tsx                  # imports manifest, renders RouterOutlet
  routes/
    refs.ts                # route refs, search codecs, loaders; no views
    manifest.ts            # mountRoute tree and dynamic imports
    pages/
      home.tsx             # imports refs only
      project-list.tsx     # imports refs only
      project-editor.tsx   # imports refs, form model; no manifest import
    layouts/
      app-layout.tsx       # imports refs and Link/navigation; no manifest import
      projects-layout.tsx  # imports refs and Link/navigation; no manifest import
  data/
    projects.ts            # transport/query adapters; no view imports
```

The import graph is `app → manifest → refs/data`, with **dynamic** `manifest → page/layout` edges and static `page/layout → refs` edges. A page or layout never statically imports `manifest` or `app`. The [circular-prone fixture](../../tests/fixtures/router-circular/README.md) covers nested layouts that link to child/sibling routes and a page that reads its own match. At R3, compile and evaluate it with intentionally shuffled import order, assert lazy modules were not evaluated during manifest creation, and test that a wrong or unregistered route reference is rejected.

At the type level, `PathParams<P>` recursively splits a literal path on `/`, gathers `:name` segments into required string keys, and merges ancestor params for nested children. For example, `PathParams<'/projects/:projectId'>` is `{ projectId: string }`. The 0.4 grammar supports named required segments and a terminal named splat (`*rest`, represented as a string); optional parameters and regex segments are deferred because their undefined/precedence semantics need a separate review. Duplicate names, empty names, splat before the end, and nonliteral/dynamic paths are compile-time errors where TypeScript can see them, with runtime registration errors as a backstop. Percent-encoding is segment based: `navigate` encodes each param once; the matcher decodes once, rejects malformed escapes, and never lets an encoded slash alter segment boundaries. Empty required params are rejected before URL creation.

`Link`, owner-bound `navigate()`, and instance `router.navigate()` accept a route reference rather than an arbitrary string. Their `params` and `search` types are derived from that reference; an excess or misspelled param is a type error for object literals, and an absent required param is a type error. `to` is required except for a separate explicit `router.back()`. A deliberately unsafe external URL uses a native `<a>`. `Link` emits an actual `href` for copy/open-in-new-tab and has reactive exact or descendant active state via `aria-current="page"`. Modified clicks, non-primary buttons, `target`, `download`, default-prevented events, and external origins keep browser behavior. Programmatic navigation returns a result promise with `committed | superseded | redirected` rather than treating cancellation as an error. A redirect helper returns a typed destination; a redirect from a loader is a control result, capped at a finite hop count with cycle detection.

## Search params and URLs

`search.parse(raw)` is required when a route declares typed search; its return type is the parsed search type. `search.stringify(value)` must accept that type and produce `URLSearchParams`. Both are route-owned so links, navigation, direct URLs, history events, and SSR use one codec. A schema helper may be added later, but no assumption is made that Standard Schema itself parses string query values or serializes them. Search parsing errors reject the navigation before it commits; the raw URL is not trusted as typed input, and the last committed route remains visible. This matches R3's parse-failure behavior and is distinct from loader and lazy-import failures, which use the route error view. Parsed values are immutable snapshots. A change to parsed search reloads matching loaders. Link generation sorts keys for canonical output and preserves duplicate values only when the codec chooses to. Hash fragments are preserved separately from search.

## Matching and navigation state

`router.location()` is the committed URL; `router.navigation()` is a read-only signal with `idle | loading | blocked`, destination, and reason (`link | programmatic | pop`). A navigation starts by matching, parsing search, resolving redirects, and starting all matched route loaders and lazy imports **before** new route components render. The parent-to-child match order is deterministic; independent loader promises may run concurrently after parent params/search are known. Each navigation has a generation and `AbortController`. A later navigation aborts earlier work; an old completion, including A → B → A, cannot commit. All candidate owners, resources, and lazy imports are released on supersession; an imported module cannot be cancelled, but its result is ignored.

A first load renders the nearest route `pending` view or Suspense fallback while the candidate resolves. On later navigation, the old committed view stays visible with an explicit pending signal. Once candidate code and blocking loaders resolve, the router commits URL, params, search, loader values, and route tree atomically in one batch/reveal. A same-route change retains its component owner: `route.match()` returns a stable owner-bound object with `params: ReadonlySignal<PathParams<P>>`, `search: ReadonlySignal<Search>`, and `data: ReadonlySignal<LoaderOutput>`. The signals update together at commit; code that reads them inside JSX bindings or resource source functions tracks changes. Reading `params()` once in a component setup is still a snapshot and is explicitly documented as such. A change to another route definition disposes the old component scope; common parent layouts persist. Route loader data has a ready value whenever its component is committed, so `match.data()` does not require a non-null assertion. If a route has no loader, `data` is absent from that route's match type.

The router's blocking loader uses an owned `resource` generation under the hood. The resource's pending token participates in Suspense and transition staging, but the router holds the candidate route until ready so no component can mistake stale loader data for the new param's data. Loader functions receive `{ params, search, signal, context }` as immutable values, not live signals, and return a value or promise. `createRouter({ context })` supplies the router's frozen context value. Loader inputs are untracked and never inherit a current owner across `await`. On an explicit reload of a committed match, old data remains visible while pending; success swaps data atomically, failure presents the route error state with retry and does not erase last good data. A 0.5 query adapter may take over cache policy, but the 0.4 router itself does not retain data after a match is disposed or offer deduplication across unrelated navigations.

A loader failure or lazy import failure commits the destination URL with the nearest matched route `error` component; its `retry` starts a new generation. The prior view is retained only during loading, then replaced by the destination error view. If no route error view exists, the router delegates to the existing DOM `<ErrorBoundary>` at the outlet and ultimately reports an unhandled error. Synchronous render errors follow the existing owner boundary semantics. Event-handler errors remain with the existing DOM event reporter and do not activate route error views. The failed candidate never commits a half-built content tree. Redirects replace by default when returned from loaders; explicit navigation redirects may request push. Not-found is a committed route result, not a thrown loader error.

## History, focus, scrolling, and RTL

`browserHistory()` listens to `popstate`, stores a per-entry key in `history.state` without clobbering user state, and removes its listener on router disposal. A pop changes the browser address before loaders settle; the previous view remains during loading, while `router.location()` still names its committed URL and `router.navigation().destination` names the new address. Success commits target content; failure commits the popped URL with its route error/not-found view, so address and committed view converge. A later competing push navigation supersedes the pop generation and writes its own URL at commit. `memoryHistory({ initialEntries, initialIndex })` implements the same interface and exposes stack/index inspection for tests without DOM globals. Router construction is side-effect free; `router.mount()`/the outlet owner starts listeners and `dispose()` releases them.

On successful client navigation, focus moves to an opt-in route heading target (`data-route-focus`), falling back to the outlet landmark, without hijacking focus on hash-only changes, background reloads, or modified-click browser navigation. The router sets a temporary `tabindex="-1"` if needed and restores the prior attribute on disposal. One polite live region in the root announces the focused route heading (or document title); pending navigation and failed navigation have status announcements. Links keep native keyboard behavior. For push navigation, scroll moves to the hash target or top after commit; for pop it restores the saved per-entry position after the new DOM is committed. `replace` retains scroll by default. Hash scrolling is decoded safely and retried once after lazy reveal. The browser history adapter uses window scroll positions. Tests cover nested layouts, focus visibility, repeated same-route navigations, and status text. Direction is inherited from document/layout `dir`; matching and data semantics do not depend on LTR. No left/right keyboard assumption enters `Link` or navigation, and UI-registry components remain ordinary children.

## Lazy routes and SSR seam

`lazy: () => Promise<{ default: Component }>` is called after matching and before candidate render, once per route module per router lifetime; module failure is retryable by clearing the failed load. A loader may start concurrently with the import. The public route definition and its path/search/loader types remain eager so type inference and URL matching do not require downloading the component.

No browser global is read at module evaluation. A future server renderer can supply a request-local memory/static history, match a URL, run loaders under a request owner, and render the same outlet with SSR's escaping and marker rules in [ssr.md](./ssr.md). Router state and loaded data must be request local, never module-global. Only explicitly opted-in resource data may be serialized, with stable route ID plus param/search validation key; the router must not serialize arbitrary loader results by default. Hydration claims the committed URL/match and validates snapshot keys before running client setup; a mismatch refetches or renders fallback. Server effects and mounts remain suppressed, and the browser focus/scroll/announcement adapters do nothing on the server. This is an interface reservation, not an SSR implementation in 0.4.

## Internal core/DOM seam

R2 implemented the core and DOM staging seam. Public `signal`, `effect`, `batch`, `createRoot`, `render`, and `ErrorBoundary` signatures and documented timing remain unchanged.

| Package    | Implemented internal seam                                               | Measured gzip delta |
| ---------- | ----------------------------------------------------------------------- | ------------------: |
| core       | Owner eligibility, delayed jobs, and gated-render detection             |              +195 B |
| DOM        | Detached range staging, commit/disposal, and internal controls          |    +202 B marginal* |
| core + DOM | Combined measured increase, including cross-package compression effects |              +397 B |
| DOM (R5)   | Anchor-relative insertion and slot re-anchoring after a staged commit   |               +33 B |

\* The DOM figure is the marginal difference within the combined bundle, not a standalone DOM package measurement. The measured current totals and remaining headroom are in the [R2 checkpoint](../checkpoints/ra-r2.md). R3 must stop if required core/DOM integration would exceed either fixed cap; no cap has been raised.

## Trade-offs and test gates

[TanStack Router](https://tanstack.com/router/latest/docs/guide/type-safety) already has strong route-wide type inference, typed links/search, loaders, pending UI, and [scroll restoration](https://tanstack.com/router/latest/docs/guide/scroll-restoration). Benos should not claim novelty there. Instance-scoped typed references may avoid a global registration step, at the cost of a narrower path grammar and no 0.4 cache. [Solid Router](https://docs.solidjs.com/solid-router/reference/primitives/use-params) has reactive params and [preloading](https://docs.solidjs.com/solid-router/data-fetching/how-to/preload-data); Benos chooses an atomic committed match/data signal so form identity and data change together. [React Router](https://reactrouter.com/start/framework/pending-ui) has mature data/pending navigation integration; Benos 0.4 deliberately lacks its server/action/form workflow. These are design trade-offs, not performance claims.

R3 coverage is mapped to its executable tests below. Browser history and click behavior use Playwright's Chromium, Firefox, and WebKit projects ([configuration](../../playwright.config.ts)); the same browser test file runs in each project.

| R3 gate                                                                                                                                     | Verifying test(s)                                                                                                                                                                                                                                                                                                                                                                                                       | Result |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Literal path parameter/search inference and invalid links                                                                                   | [`packages/router/tests/types.test.ts`](../../packages/router/tests/types.test.ts): `checkRouterTypes` uses `expect-type` and `@ts-expect-error` for missing/misspelled params, missing/invalid search, nonliteral paths, invalid splats/params, duplicate names, and conflicting parent params. Included by `pnpm typecheck:types`.                                                                                    | Pass   |
| Nested layouts and same-route owner persistence                                                                                             | [`packages/router/tests/outlet.test.ts`](../../packages/router/tests/outlet.test.ts): `preserves nested layouts and a same-route owner while params update`.                                                                                                                                                                                                                                                            | Pass   |
| Index and pathless layouts                                                                                                                  | [`packages/router/tests/outlet.test.ts`](../../packages/router/tests/outlet.test.ts): `renders an index route inside a pathless layout and a not-found page`.                                                                                                                                                                                                                                                           | Pass   |
| Static/named/splat specificity, encoded params, malformed escapes, invalid route grammar, and trailing-slash canonicalization               | [`packages/router/tests/router.test.ts`](../../packages/router/tests/router.test.ts): `prefers static, then named, then catch-all routes`; `does not let an empty catch-all shadow an exact parent route`; `retains an encoded slash inside a parameter and rejects malformed escapes`; `canonicalizes a direct trailing slash and preserves a typed destination hash`.                                                 | Pass   |
| Search parse failures, serialization failures, canonical round trips                                                                        | [`packages/router/tests/router.test.ts`](../../packages/router/tests/router.test.ts): `sorts typed search, round-trips it, and leaves the committed URL on parse failure`; `surfaces search serialization failures before changing history`. Both parse and serialize failures leave committed location/history unchanged.                                                                                              | Pass   |
| Redirects, redirect cycles, and unregistered references                                                                                     | [`packages/router/tests/router.test.ts`](../../packages/router/tests/router.test.ts): `follows redirects, detects cycles, and rejects unregistered references`.                                                                                                                                                                                                                                                         | Pass   |
| Active links, normal link navigation, and native-click exemptions (modified clicks, non-primary click, target, download, default-prevented) | [`packages/router/tests/outlet.test.ts`](../../packages/router/tests/outlet.test.ts): `emits href and active state, intercepting only unmodified primary clicks`; [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `typed links, same-route params, and browser back/forward`; `modified and target links keep native browser handling`. These Playwright cases run in all three browser projects. | Pass   |
| Browser back/forward                                                                                                                        | [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `typed links, same-route params, and browser back/forward`, including same-route param navigation and owner reuse. Runs in Chromium, Firefox, and WebKit.                                                                                                                                                                                         | Pass   |
| Memory history stack and back/forward                                                                                                       | [`packages/router/tests/router.test.ts`](../../packages/router/tests/router.test.ts): `supports memory back and forward with a not-found result`.                                                                                                                                                                                                                                                                       | Pass   |
| Circular-import fixture and reversed module import order                                                                                    | [`packages/router/tests/circular.test.ts`](../../packages/router/tests/circular.test.ts): `does not evaluate page and layout modules while creating the manifest`; `accepts an intentionally reversed import order without a manifest cycle`. Static import-graph checks are in [`tests/fixtures/router-circular/import-graph.test.mjs`](../../tests/fixtures/router-circular/import-graph.test.mjs).                   | Pass   |

CI runs `pnpm test` and `pnpm test:browser` as ordered steps in the same `verify` job. GitHub Actions waits for each step to finish before starting the next, so the unit and browser suites do not compete for CPU or trigger the overlapping local timeout flake. Keep them in this single job and in this order.

R4 coverage is recorded below. Router browser tests run in Chromium, Firefox, and WebKit through the existing Playwright projects.

| R4 gate                                                                                                       | Verifying test(s)                                                                                                                                                                                                                                                                                                                                                                                                                            | Result                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Loader starts before component; initial pending view remains accessible                                       | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): `starts before the route component and shows the initial pending view`                                                                                                                                                                                                                                                                                 | Pass                          |
| Router context reaches loaders as an immutable value                                                          | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): `passes the immutable router context to loaders`                                                                                                                                                                                                                                                                                                       | Pass                          |
| Same-route owner persists; params and matching loader data commit atomically                                  | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): `keeps the route owner and commits params with matching loader data`; [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `same-route navigation commits matching params and loader data without remounting` (Chromium, Firefox, WebKit).                                                                                            | Pass in unit and all browsers |
| A → B → A generation guards reject stale completions; outlet disposal aborts pending work                     | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): `aborts superseded loaders and ignores a stale A → B → A completion`; `aborts an in-flight loader when the outlet owner is disposed`                                                                                                                                                                                                                   | Pass                          |
| Failed loader and aborted loader behavior, with retry                                                         | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): failure retry and supersession/disposal tests; [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `route failures retry in their route view while render failures reach the DOM boundary` (Chromium, Firefox, WebKit).                                                                                                              | Pass in unit and all browsers |
| Lazy-load failure displays the route error UI and can be retried                                              | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): `routes lazy import failures to the nearest route error view and retries`; [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `route failures retry in their route view while render failures reach the DOM boundary` (Chromium, Firefox, WebKit).                                                                                  | Pass in unit and all browsers |
| Route loader errors stay in route UI; component render errors reach the DOM ErrorBoundary                     | [`packages/router/tests/loader.test.ts`](../../packages/router/tests/loader.test.ts): `delegates loader failures without a route error view to the DOM ErrorBoundary`; `keeps render errors in the DOM ErrorBoundary instead of route loader UI`; [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `route failures retry in their route view while render failures reach the DOM boundary` (Chromium, Firefox, WebKit). | Pass in unit and all browsers |
| Pending navigation retains the previous page and announces pending and completed status                       | [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `pending navigation, focus announcements, and browser scroll restoration` (Chromium, Firefox, WebKit).                                                                                                                                                                                                                                                                 | Pass in all browsers          |
| Focus moves to the route heading and back/forward returns focus; polite live-region announcements are updated | [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `pending navigation, focus announcements, and browser scroll restoration` (Chromium, Firefox, WebKit).                                                                                                                                                                                                                                                                 | Pass in all browsers          |
| Push scrolls to top; back/forward restores each entry's scroll position and RTL layout direction              | [`tests/browser/router.spec.ts`](../../tests/browser/router.spec.ts): `pending navigation, focus announcements, and browser scroll restoration` sets `documentElement.dir = 'rtl'` and checks push/back/forward restoration (Chromium, Firefox, WebKit).                                                                                                                                                                                     | Pass in all browsers          |
| Loader and route public types infer params, search, and data, including nested routes                         | [`packages/router/tests/types.test.ts`](../../packages/router/tests/types.test.ts): `checkRouterTypes` uses `expect-type` for root and nested route loader contexts/data and no-loader data exclusion; included by `pnpm typecheck:types`                                                                                                                                                                                                    | Pass                          |

Every bug fix gets a regression test. R4 implementation and size results are recorded in [`docs/checkpoints/ra-r4.md`](../checkpoints/ra-r4.md).

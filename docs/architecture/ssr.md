# Server rendering and hydration

**Status:** 0.6.0 contract (S1 of the [SSR track](../ssr-plan.md)). This document replaces the Phase 2 design for the parts that ship in 0.6.0: `renderToString` in the new `@benosjs/server` package and `hydrate` in the new `@benosjs/dom/hydrate` entry. Streaming is deferred to its own track; the last section lists what this contract keeps open for it. Everything marked **frozen** is a protocol or user-visible decision that is hard to reverse and must be fixed with paired server/client fixtures before 0.6.0 is released.

## Goals and non-goals

The same component functions produce server HTML and then hydrate into the client owner tree, reusing the server's DOM nodes, without rerunning components on later signal writes. Signals, computed values, context lookup, error routing, and disposal follow [reactivity.md](./reactivity.md) and [ownership.md](./ownership.md). Server output escapes untrusted content, serializes only intentionally exposed data, and leaves no live graph behind when a request ends. Hydration claims matching nodes, attaches events exactly once, and recovers from a mismatch inside the smallest boundary that contains it.

Not in 0.6.0: streaming (`renderToStream`, out-of-order Suspense patches, strict and CSP-nonce delivery modes), replay of events dispatched before hydration, server components and server actions, `<head>` management (the application's HTML template owns the head), a raw-HTML escape hatch, a `create-benos --ssr` template, and isolation of module-level mutable state across requests (development warns; it is not silently claimed).

## Public surface

```ts
// @benosjs/server
export interface RenderOptions {
  rootId?: string // [A-Za-z0-9_-]{1,32}; default "0"
  signal?: AbortSignal
  onError?: (error: unknown, info: { phase: 'setup' | 'data' }) => void
  maxPayloadBytes?: number // default 1_048_576
}
export interface RenderResult {
  html: string // the root's markup, markers, and its payload script
  payload: string // the payload JSON alone, for custom placement
  status: number // 200, or what the router set
  headers: Headers // Location for a router redirect; otherwise empty
}
export function renderToString(
  app: () => JSX.Element,
  options?: RenderOptions,
): Promise<RenderResult>

// @benosjs/dom/hydrate
export interface HydrateOptions {
  rootId?: string // default "0"
  payload?: string // overrides the payload script lookup
  onMismatch?: (info: HydrationMismatch) => void
}
export interface HydrationMismatch {
  rootId: string
  path: string // element path from the root to the failing node, e.g. "main > ul > li:2"
  expected: string // "element <li>", "text", "slot", "root", ...
  actual: string
  recovered: 'boundary' | 'root'
}
export function hydrate(
  app: () => JSX.Element,
  host: Element | DocumentFragment | ShadowRoot,
  options?: HydrateOptions,
): () => void
```

`app` is a factory, not an element: it runs once per request inside the request root, so a router, query cache, or other per-request state created inside it is request local. `renderToString` resolves after every tracked promise (opted-in resources, opted-in queries, the router's initial navigation) settles or the signal aborts; abort rejects with the abort reason after disposing the root. `hydrate` returns the same idempotent disposer as `render`; after disposal the root's nodes are removed, as with `render`. These signatures are **frozen**.

The server runs on any runtime with `Promise`, `AbortSignal`, `Headers`, `TextEncoder`, and `URL`: Node 20+, Bun, Deno, and edge workers. `@benosjs/server` imports `@benosjs/core` and `@benosjs/dom` (whose import touches no browser global) and nothing from `node:`.

## Request root and server mode

1. `renderToString` creates one kernel root per request with `createRoot`, gives it a **request record** (the root-owner field described under _Core seams_), and sets the root's gate to 1 with the existing internal gate. Gate 1 is the existing mechanism that holds user effects and `onMount` jobs; render-tier effects still run. Nothing new is needed in the scheduler for suppression. The request record carries the root ID, the abort signal, the outgoing snapshots, the response status and headers, a `track(promise)` function, and the ID factory.
2. Component setup and computed reads run synchronously under their owners, exactly as on the client. Render-tier bindings subscribe and re-run during the request: this is required, because a boundary's content is staged while its resources are pending and must show the settled values before serialization. User `effect` callbacks and `onMount` are registered and never run; `onCleanup` runs when a branch or the request root disposes. The Phase 2 statement that bindings are evaluated once without subscribing is withdrawn.
3. The renderer settles in rounds: mount the app, `await` every promise tracked so far, flush, and repeat until no promise is tracked or the signal aborts. Between rounds no current owner is held across `await`; continuations reenter their owner with `runWithOwner` for synchronous work only.
4. The root is disposed in `finally`, on success, error, and abort. Gated user effects of a disposed owner are removed from the scheduler's gated set at disposal (a core fix, see _Core seams_), so a request leaves nothing in module-global state.
5. A public `createRoot` called during a request is not tracked by the request. Development warns once per request when it happens; production does nothing. Inheriting request mode is deferred until a use case needs it.
6. Module-level signals are outside the request root. In development, a write to a signal that was created outside any request while a request is active warns with the signal's creation stack; production has no check. Documentation requires per-request state creation inside `app`.
7. A thrown setup error with no boundary disposes the root and rejects `renderToString`; the caller answers with its own 500 page. An error inside an `<ErrorBoundary>` renders the boundary's fallback on the server. Error objects never reach the HTML; `onError` receives them.

## Server host

`@benosjs/server` is a second renderer over the same descriptors the DOM renderer consumes: text, numbers, arrays, element descriptors from `jsx`, component descriptors, and the compiler's host-neutral `TemplatePlan`. It does not reuse `@benosjs/dom`'s mount code, which is bound to DOM types, and it does not parse HTML. It builds a small request-local node tree (element, text, comment) because Suspense reveals and slot updates mutate the tree before it is serialized, then serializes the finished tree once. The streaming track can serialize eagerly on top of the same host.

- Control flow (`Show`, `For`, `Switch`/`Match`, `Dynamic`, `ErrorBoundary`) is reimplemented for the server tree with the same owner kinds (`component`, `branch`) and the same creation order as the DOM renderer, so owner paths match. `Portal` renders only its placeholder: its target is outside the root, and the client mounts its content after hydration.
- `Suspense` and `RouterOutlet` are registered internal controls whose mount functions only need markers, insertion, removal, and staging. The internal control signature gains a `host` argument providing `comment()`, `insert()`, `remove()`, and `stage()`; the DOM renderer passes its implementation and the server passes its own, so one mount function serves both hosts. Neither `@benosjs/async` nor `@benosjs/router` gains a second implementation.
- Direct templates (the `safe` optimization's HTML skeletons) are a DOM-only encoding. The server build compiles with `optimization: 'none'` (`@benosjs/vite` does this for the SSR environment), so the server always walks the plan. The client may use direct templates: they describe the same nodes, and hydration claims by path through the same skeleton structure. A paired fixture checks every direct template against its plan form.
- `ref` callbacks never run on the server. Event props are not serialized. `innerHTML` stays unsupported.
- Attribute serialization mirrors `setAttributeValue` in the DOM renderer: boolean attributes present-or-absent, `null`/`undefined` omitted, `aria-*`/`data-*` booleans as `"true"`/`"false"`, a `style` object as `name: value;` declarations, the same dangerous-scheme and `data:` URL guard with the same attribute list, and `xlink:href` by name. The property bindings `value`, `checked`, and `selected` become the matching attributes (`value` becomes the text content of a `<textarea>`); `selectedIndex` is ignored with a development warning.
- Escaping is by context: text escapes `&`, `<`, and `>`; attribute values escape `&`, `<`, and `"`. Inside `<title>` and `<textarea>` (RCDATA) the same text escaping applies and no markers are emitted. Inside `<script>`, `<style>`, and `<noscript>` dynamic text and dynamic children are rejected by the server with an error, because the parser does not decode entities or comments there; static text in those elements must not contain the element's end tag, which the server checks. Void elements get no end tag and reject children.
- Structures that the HTML parser repairs cannot round-trip. In development the server rejects `<tr>` outside `<thead>`/`<tbody>`/`<tfoot>`, `<td>`/`<th>` outside `<tr>`, `<col>` outside `<colgroup>`, nested `<a>`, `<form>`, or `<p>`, and a block element inside `<p>`, naming the element path. Production emits them as written and relies on mismatch recovery.

## Marker grammar v1 (**frozen**)

Hydration is positional: the client runs the same setup in the same order and claims nodes as it walks, so static nodes need no markers. Markers delimit the places where the parser would merge or hide structure: every dynamic position, and the root.

| Position                                                                    | Server output                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root                                                                        | `<!--benos:ROOTID:1-->` … `<!--/benos:ROOTID-->` then the payload `<script>`                                                                                                                                                                                             |
| Dynamic text (a plan text slot)                                             | `<!--b-->` text `<!--/b-->`; adjacent static text stays a separate text node                                                                                                                                                                                             |
| Dynamic child (a plan anchor slot, `Show`, `Switch`, `Dynamic`, boundaries) | `<!--b-->` nodes `<!--/b-->`                                                                                                                                                                                                                                             |
| Each `For` item                                                             | `<!--i-->` item nodes `<!--/i-->`, inside the `For` slot's own pair; the client treats these wrappers as transparent and removes them                                                                                                                                    |
| Empty value (`null`, `false`, empty array)                                  | `<!--b--><!----><!--/b-->`: the empty comment is the value's node, as on the client                                                                                                                                                                                      |
| Portal                                                                      | `<!--b--><!--/b-->`; the content is client rendered                                                                                                                                                                                                                      |
| Suspense, RouterOutlet                                                      | The committed stage wrapped as `<!--b:N-->` … `<!--/b-->` (N is the stage's ordinal under the control: 0 for a Suspense fallback, 1 for its content), then the control's own empty comment `<!---->`; the client claims the pair only with the stage of the same ordinal |
| Dynamic text inside RCDATA (`<title>`, `<textarea>`)                        | The text alone; the single text node is claimed                                                                                                                                                                                                                          |

The `1` in the root marker is the protocol version. `ROOTID` matches `[A-Za-z0-9_-]{1,32}`; two roots on one page use different IDs. Markers carry no application data. Nesting is by structure, not by IDs: the client knows which pair it is entering because it is mounting that slot. After a claim, the client removes the opening `<!--b-->` and turns the closing `<!--/b-->` into the slot's ordinary trailing marker, then applies the DOM renderer's single-element rule (a range that is exactly one element drops its marker). Hydrated DOM therefore equals client-rendered DOM for the same state, which keeps every later update path identical.

Markers are comments, which the parser accepts inside `<table>`, `<select>`, and foreign content without foster parenting. Whitespace is never emitted between nodes. A plan's dynamic text is a text instruction with a slot; its pair keeps it separate from adjacent static text after parsing.

## Payload format v1 (**frozen**)

```html
<script type="application/json" data-benos="ROOTID">
  {"v":1,"r":[["id","key",value]],"q":[["id","hash",value]]}
</script>
```

- `v` is the payload version. `r` holds resource snapshots as `[ssr.id, ssr.key(source), ssr.serialize(value)]`. `q` holds query entries as `[ssr.id, keyHash, ssr.serialize(data)]`. Only resources and queries that declare `ssr` appear; nothing else is serialized, and a failed request is not serialized at all (see _Data_).
- The JSON escapes `<` as `<`, and ` `/` `, so it is inert inside `<script>`. It is limited to `maxPayloadBytes` (UTF-8); exceeding it rejects the render with a `RangeError`, in development and production.
- The client reads the script by `data-benos` under `document` unless `options.payload` is given, validates `v`, the array shapes, and that `id` and `key` are strings, and ignores any entry that fails. A missing or invalid payload is not an error: every boundary then renders its fallback and fetches on the client, which is the same recovery as a non-serializable resource.
- Snapshot values are passed to `deserialize` untouched; the codec owns validation of its own shape. `serialize` must return JSON-compatible data: functions, symbols, `undefined`, non-finite numbers, and cycles reject the render with a `TypeError` naming the resource ID.

## Data: resources, queries, router, forms

The request record is reached through the core internal registry, so these packages need no server import.

**Resources** (`@benosjs/async`). Under a server root, a `resource` without `ssr` never launches its fetcher: it enters `pending` with a token that never settles, so its Suspense boundary serializes as fallback and the client fetches after hydration. Reading it outside a Suspense boundary during server rendering throws. A resource with `ssr` launches, registers its promise with `track`, and on success records `[id, key(source), serialize(value)]`. On failure under a server root the resource stays `pending` with a permanent token: the boundary serializes as fallback, nothing is recorded, `onError` is called with `{ phase: 'data' }`, and the client fetches again. Server-side fetch failures therefore never render error UI from the server; this is deliberate.

Under a hydrating root, `resource` with `ssr` looks up `[id, key(source)]` in the incoming snapshots before its first launch. A hit seeds `value` with `deserialize(value)` and `state` with `ready`, marks the source observed, and does not fetch; the snapshot is consumed so a later identical resource does not reuse it. A miss behaves as today. `refresh()` and source changes work normally after seeding.

**Queries** (`@benosjs/query`). The page-global default cache is not used under a server root: `resolveCache()` creates one request-local cache per request root (stored in the request record) when no `QueryCacheProvider` is in scope. Entries whose definition declares `ssr` are recorded after a successful fetch as `[id, keyHash, serialize(data)]`; mutations do not run on the server. Under a hydrating root, a cache seeds an entry from the incoming snapshot on first lookup with `updatedAt` set to the hydration time, so the entry is fresh for `staleTime`. `query.load` in a route loader goes through the same entries.

**Router** (`@benosjs/router`). The application creates `memoryHistory({ initialEntries: [url] })` and `createRouter` inside `app`, so router state is request local. The router registers its initial navigation with `track`, runs loaders under the request root, and writes the outcome to the request record's response: `404` when the not-found view renders, `302` with `Location` for a route `redirect`, otherwise `200`. The browser focus, scroll, and announcement adapters already do nothing without `document`. Hydration claims the committed URL's match; a loader whose data came from an opted-in query reuses the seeded entry, and anything else loads on the client with the outlet's pending state.

**Forms** (`@benosjs/forms`). Field IDs are built on `createUniqueId()` instead of the module counter, so they are deterministic under server and hydrating roots and unchanged in meaning elsewhere.

## Deterministic IDs

`createUniqueId()` keeps its signature. Outside a request root it uses the current per-instance counter. Under a server or hydrating root it returns `b` + the root ID + the owner path + the call ordinal, for example `b0-2-0-k7-1`. The owner path is the chain of **creation ordinals** from the root: every owner and computation receives the next ordinal of its parent when it is created (`parent.childOrdinal++`), and an effect's run owner inherits the effect's ordinal, so a slot that re-evaluates after a resource settles produces the same path as a client that rendered the settled value first. A keyed `For` item's branch owner uses its key as the segment instead (`k` + the sanitized key; a key that is not `[A-Za-z0-9_-]` after stringification is replaced by a short hash). The ordinal is the number of `createUniqueId` calls so far under that owner. An owner caches its path the first time it is needed. The derivation runs in `@benosjs/server` and `@benosjs/dom/hydrate`, not in core: core exposes the ordinals and calls the root's ID factory when one is set.

The path is deterministic because component setup is synchronous and identical on both sides, and because the client's seeded snapshots make it take the same branches the server took after settling. A branch that differs anyway is a mismatch and recovers as below.

## Hydration

1. `hydrate` finds the root markers under `host` and checks the protocol version and root ID; a mismatch there client-renders the whole root (removing the server nodes) and reports `recovered: 'root'`. It parses the payload, creates a hydrating root with a request record carrying the snapshots and the ID factory, sets gate 1, and mounts `app` with a **claim cursor** active.
2. While the cursor is active, the DOM renderer's creation sites consult it: a template claims its top-level nodes and slot nodes from the cursor instead of cloning; an element or text claims the node at the cursor; a dynamic slot claims the `<!--b-->` … `<!--/b-->` pair and mounts its value inside it; a `For` claims one pair per item in order. A claim checks node kind and, for elements, tag and namespace; attributes and text are not compared (the server wrote them from the same state). Property and attribute bindings run to subscribe but skip their first write while claiming, which keeps `value` and `checked` typed by the user before hydration; their next change applies normally. A mount into a parent that is not the cursor's parent (a `Portal` target, a boundary fallback created on the client) creates nodes as usual.
3. Event descriptors attach exactly as in `render`: delegated listeners on the root's document or shadow root and native listeners on their elements, once, with automatic `batch`. Refs receive their claimed element once. Events dispatched before hydration are not replayed; browser default behavior applies. User docs must say so.
4. When the walk completes, the root's gate opens and `notifyMount` runs: user effects and `onMount` jobs start after hydration, in the usual order. Later writes follow client timing exactly; hydration adds no microtask delay.
5. A mismatch (missing node, wrong kind, wrong tag, unbalanced pair) throws a hydration error caught at the nearest dynamic slot. Recovery disposes that slot's tentative branch, removes the server nodes between the slot's markers, and client-renders the value; if the failure is outside any slot, the root recovers as in step 1. Development reports the path, expected and actual node, and the recovery scope to the console and to `onMismatch`; production calls only `onMismatch`. Recovery never leaves a half-claimed range: a slot is either fully claimed or fully client-rendered.
6. A failed hydration leaks nothing: tentative owners are disposed, listeners installed before the failure belong to disposed owners and are removed, and snapshots consumed by the disposed branch are not restored (the client-rendered replacement fetches).

Details fixed while building S3: the first-write skip applies only to elements the server rendered (a node created fresh during hydration, such as portal content or a recovered range, gets its attributes at once); a Suspense content stage claimed in place is taken back out of the document by `hold()` when its first reveal finds pending tokens, so a missing or mismatched payload shows the fallback alone until the client fetch settles, and the pending content's own reads report a boundary mismatch; keyed-item wrappers `<!--i-->` are transparent to every claim and removed as they are passed; a stage pair carries its ordinal (`<!--b:N-->`) so a fallback stage never claims content; and a key whose remainder was client rendered answers later claims silently, so one mismatch is reported once.

Hydration and `render` share one DOM renderer. The claim cursor is the only addition to `@benosjs/dom`'s main entry; the walker, payload parsing, recovery, and the ID factory live in `@benosjs/dom/hydrate`.

## Core and DOM seams

Every change to an existing package, with its reason and estimate (minified and gzipped):

| Package | Change                                                                                                                                             | Reason                                                     | Estimate  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| core    | Creation ordinals: `ordinal` and `childOrdinal` on owners, ordinals on computations, run owners inherit their effect's ordinal                     | Deterministic ID paths                                     | 60–90 B   |
| core    | Root-owner `request` field, `getInternalRequest()` (walks to the root), `setInternalRequest(owner, record)`                                        | Server mode, snapshots, response, `track` without new APIs | 50–70 B   |
| core    | `createUniqueId` calls the request's ID factory when one is set                                                                                    | Deterministic IDs behind the existing signature            | 40–60 B   |
| core    | `setInternalOwnerKey(owner, key)`; disposal removes an effect from `gatedEffects` and a job from `gatedMounts`                                     | `For` key segments; no per-request leak in the gated sets  | 40–60 B   |
| core    | Development warnings: ownerless-signal write during a request, `createRoot` during a request                                                       | Rule 6 and rule 5 above                                    | 0 B       |
| dom     | Claim cursor: template, element, text, comment, slot pair, direct template, and first-write skip sites; `__benosDomHydrate` registry for the entry | Hydration without a second renderer                        | 190–260 B |
| dom     | Internal control `host` argument; `For` sets the item owner key                                                                                    | Shared Suspense/Outlet mounts; keyed ID segments           | 20–40 B   |
| async   | Server-root behavior in `resource` (permanent token, `track`, record), snapshot seeding under a hydrating root, Suspense uses `host`               | Opt-in serialization                                       | 220–300 B |
| query   | Request-local default cache, entry recording, snapshot seeding                                                                                     | Rule 5 of query.md made real                               | 180–240 B |
| router  | `track` the initial navigation, response status and `Location`, outlet uses `host`                                                                 | Status codes without a server import                       | 120–180 B |
| forms   | Prefix from `createUniqueId()`                                                                                                                     | Hydration-stable field IDs                                 | −10 B     |
| vite    | `optimization: 'none'` for the SSR environment                                                                                                     | Plan-only server output                                    | n/a       |

Against the budgets: core 4,303 of 4,608 (305 B headroom; estimate 190–280 B), core + DOM 11,006 of 11,264 (258 B headroom; estimate 210–300 B including the core share that lands in the pair), async 1,644 of 4,096, query 3,498 of 3,584 (86 B headroom; estimate 180–240 B), router 6,739 of 7,168, forms 2,878 of 3,072. Two budgets need a decision:

- **Query:** the client-side seeding alone exceeds 86 B. Proposal: raise the query cap to 3,840 B (+256).
- **Core + DOM:** the estimate straddles the headroom. Proposal: no change now; S3 measures the seams, and if they exceed the headroom after looking for savings in `@benosjs/dom`, S3 asks for a cap of at most 11,392 B (+128) with the measured number.

New budgets: `@benosjs/server` 6,144 B (core and DOM external) and `@benosjs/dom/hydrate` 2,048 B (core and DOM external), both measured by `pnpm size`.

## Trade-offs and prior art

- [Solid](https://docs.solidjs.com/reference/rendering/hydrate) marks elements with `data-hk` IDs and text with `<!--#-->`/`<!--/-->`, and compiles a separate string-concatenating server output. Benos keeps one compiler output and claims positionally, so markers are only at dynamic positions; the cost is a tree build before serialization, which the streaming track can remove.
- [React](https://react.dev/reference/react-dom/client/hydrateRoot) separates adjacent text with `<!-- -->`, and on a mismatch re-renders from the nearest Suspense boundary in production (the whole root in development). Benos recovers at the nearest dynamic slot in both modes and reports in development.
- [Svelte 5](https://svelte.dev/docs/svelte/svelte-server) delimits with `<!--[-->`/`<!--]-->` and serializes head and body separately. Benos delimits the same way with `<!--b-->`/`<!--/b-->` and leaves the head to the template.
- [Qwik](https://qwik.dev/docs/concepts/resumable/) serializes the whole application state and listeners to avoid hydration. Benos hydrates: components run once on the client, which keeps its runtime small and its data policy explicit (only codec-declared data leaves the server).

Opt-in serialization and fallback-on-failure are the strictest choices here. They cost a client fetch for data the application did not declare, and they never leak a fetched object or a server error by accident.

## Test plan before S2 is complete

1. Server and client produce the same component output and owner/context behavior for the same app and state; no user effect, DOM effect, or `onMount` runs on the server; cleanups run on completion, error, and abort; nothing stays in the gated sets after disposal.
2. Escaping of text, attributes, URLs, style objects, RCDATA, and the payload; rejected dynamic content in `<script>`/`<style>`/`<noscript>`; no field outside a codec in HTML; payload limit and `TypeError` on non-JSON values.
3. Deterministic markers and IDs across requests, across concurrent requests, under keyed `For`, after a slot re-evaluates, and across two roots on one page; parser round trips for `<table>`, `<select>`, SVG, MathML, and RCDATA; the development structure checks.
4. Hydration in Chromium, Firefox, and WebKit: node identity preserved; delegated and native events once with batched writes; refs once; effects and mounts after claim; typed input preserved; direct-template claims equal plan claims; missing, invalid, and key-mismatched payloads; text, attribute-free, tag, and structural mismatches recovering within one slot; root recovery; no leaked owners or listeners after recovery.
5. Resources and queries seeded from snapshots do not refetch; a failed server fetch leaves fallback and fetches on the client; the router sets 404 and 302 with `Location`; an aborted request cancels loaders and fetches; two concurrent requests never share cache entries, IDs, or snapshots.
6. The same suite on Node and Bun for the server; the packed `@benosjs/server` imports no `node:` module.

## Hard-to-reverse decisions

Marker grammar v1, payload format v1, the public signatures above, opt-in serialization with fallback on failure, positional claiming with slot-scoped recovery, the first-write skip for typed input, server-side gate-1 suppression, creation-ordinal ID paths, `Portal` content as client-only, and the server build's plan-only compilation. Each has a paired server/client fixture.

## Kept open for streaming

Markers nest by structure, every boundary is a slot pair, and the payload is per root, so a later `renderToStream` can emit the shell, then a patch per boundary that replaces one pair's contents and appends snapshots to the root's payload, in strict or nonce delivery mode as the Phase 2 design described. The server host serializes a finished tree in 0.6.0; a streaming host serializes eagerly and holds back only pending boundaries. No 0.6.0 output needs to change for that.

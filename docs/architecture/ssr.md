# Server rendering and hydration

**Status:** 0.6.0 contract (S1 of the [SSR track](../ssr-plan.md)), extended with the 0.7.0 streaming contract (S1 of the [streaming track](../streaming-plan.md)) in the sections from _Streaming_ onwards. This document replaces the Phase 2 design: `renderToString` in `@benosjs/server` and `hydrate` in `@benosjs/dom/hydrate` shipped in 0.6.0; `renderToStream`, out-of-order Suspense patches, progressive hydration, and the server fast path are the 0.7.0 additions. Everything marked **frozen** is a protocol or user-visible decision that is hard to reverse and is fixed with paired server/client fixtures before the release that introduces it.

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
5. A `createRoot` called during a request inherits the request record, so a route loader's root shares the request's caches and ids; its creator still owns its disposal, which the router does for its candidate roots. Nothing else about such a root is tracked.
6. Module-level signals are outside the request root. In development, a write to a signal that was created outside any request while a request is active warns with the signal's creation stack; production has no check. Documentation requires per-request state creation inside `app`.
7. A thrown setup error with no boundary disposes the root and rejects `renderToString`; the caller answers with its own 500 page. An error inside an `<ErrorBoundary>` renders the boundary's fallback on the server. Error objects never reach the HTML; `onError` receives them.

## Server host

`@benosjs/server` is a second renderer over the same descriptors the DOM renderer consumes: text, numbers, arrays, element descriptors from `jsx`, component descriptors, and the compiler's host-neutral `TemplatePlan`. It does not reuse `@benosjs/dom`'s mount code, which is bound to DOM types, and it does not parse HTML. It builds a small request-local node tree (element, text, comment) because Suspense reveals and slot updates mutate the tree before it is serialized, then serializes the finished tree once. The streaming track can serialize eagerly on top of the same host.

- Control flow (`Show`, `For`, `Switch`/`Match`, `Dynamic`, `ErrorBoundary`) is reimplemented for the server tree with the same owner kinds (`component`, `branch`) and the same creation order as the DOM renderer, so owner paths match. `Portal` renders only its placeholder: its target is outside the root, and the client mounts its content after hydration.
- `Suspense` and `RouterOutlet` are registered internal controls whose mount functions only need markers, insertion, removal, and staging. The internal control signature gains a `host` argument providing `comment()`, `insert()`, `remove()`, and `stage()`; the DOM renderer passes its implementation and the server passes its own, so one mount function serves both hosts. Neither `@benosjs/async` nor `@benosjs/router` gains a second implementation.
- The server renders both compiler outputs: the host-neutral plan and the `safe` optimization's direct templates, whose skeleton it builds from the compiler's four-token grammar (`<tag>`, `</tag>`, escaped text, `<!---->` anchors; attributes arrive typed, by path). **The server and client builds must use the same optimization**: the two outputs put dynamic positions in different places (the plan nests a component-bearing element as its own template behind a slot; the direct skeleton inlines it), so a plan-only server and a `safe` client disagree on markers, owners, and therefore ids. `@benosjs/vite` compiles the SSR environment exactly like the client, and the S5 dashboard found this the hard way.
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

**Queries** (`@benosjs/query`). The page-global default cache is not used under a server root: `resolveCache()` creates one request-local cache per request (kept in a `WeakMap` by request record and disposed through the record's `cleanup` hook) when no `QueryCacheProvider` is in scope. Every fetch that cache starts is tracked by the request, and an entry whose definition declares `ssr` is recorded after a successful fetch as `[id, keyHash, serialize(data)]`. An observer of a query without `ssr` never fetches on the server (its boundary serializes as fallback), while `query.load` in a route loader always fetches, because the navigation needs the data; without `ssr` that data is not serialized and the client loads it again. Mutations do not run on the server. Under a hydrating root the page default cache is used, and an entry is seeded from the incoming snapshot when it is first looked up, fresh for `staleTime` from that moment. The observer's inner resource uses a codec that serializes to `undefined`, which records nothing: the entry serializes itself.

**Router** (`@benosjs/router`). The application creates `memoryHistory({ initialEntries: [url] })` and `createRouter` inside `app`, so router state is request local. The router registers its initial navigation with `track` and writes the outcome to the request record's response: `404` when the committed branch is empty and a not-found view exists, `302` with `Location` for a route `redirect`, otherwise `200`. Under a server or hydrating request a loader is awaited directly in its own root (aborted with the root) instead of through a resource watched by a user effect, because user effects are gated for the request's whole life. The browser focus, scroll, and announcement adapters already do nothing without `document`. On the client, `hydrate` keeps claiming until the tracked navigation settles, so routed content that commits after its loaders claims the server's stage pair; a loader whose data came from an opted-in query reuses the seeded entry, and anything else loads again.

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

Marker grammar v1, payload format v1, the public signatures above, opt-in serialization with fallback on failure, positional claiming with slot-scoped recovery, the first-write skip for typed input, server-side gate-1 suppression, creation-ordinal ID paths, `Portal` content as client-only, and one compiler optimization for both builds. Each has a paired server/client fixture.

## Streaming (0.7.0 contract)

Streaming sends the page in pieces: the **shell** (everything the router needs settled, with every data-bound Suspense boundary as its fallback), then one **patch** per boundary as its opted-in data settles, in settle order, then an **end notice**. The browser shows the shell at once, swaps each boundary's content in as it arrives, and hydrates progressively: `hydrate` may run before the first patch and claims streamed content when it lands. Nothing in marker grammar v1 or payload format v1 changes; the sections below add to them.

### The invariant

**After the last patch has applied, the document between the root markers is byte for byte what `renderToString` produces for the same settled state, and the union of the payload scripts holds the same entries.** Every other rule here serves this one: it is what lets a page that finishes streaming before hydration hydrate through the unchanged 0.6.0 code, and it is the fixture that S3 pins (apply the patches in a DOM, serialize, compare).

### Public surface

```ts
// @benosjs/server
export interface StreamOptions extends RenderOptions {
  /** Stamped on every inline script the stream emits, for CSP. */
  nonce?: string
  onError?: (
    error: unknown,
    info: { phase: 'setup' | 'data' | 'stream' },
  ) => void
}
export interface StreamResult {
  status: number // 200, or what the router set; final once this resolves
  headers: Headers // Location for a router redirect; otherwise empty
  stream: ReadableStream<Uint8Array> // shell, patches, end notice; UTF-8
  done: Promise<void> // settles when the stream closes
}
export function renderToStream(
  app: () => JSX.Element,
  options?: StreamOptions,
): Promise<StreamResult>
```

`renderToStream` resolves once the shell is ready: the app has mounted and every promise tracked **for the shell** (the router's initial navigation and its loaders, see _Data_) has settled or the signal has aborted. It rejects, like `renderToString`, on a setup error with no boundary or on abort before the shell; after it resolves, errors no longer reject anything, because the status line has gone out: they close the stream with the end notice and reach `onError` with `phase: 'stream'`. `stream` begins with the shell, already serialized when the promise resolves, so the caller can send headers and the first bytes together. `done` never rejects. The caller owns the HTML template and pipes `stream` between its two halves; `examples/dashboard` shows the pattern on `node:http` and Bun. `renderToString` is unchanged and remains the right call when the page has no streamed boundary or the caller needs the whole document before answering. These signatures are **frozen** with 0.7.0.

```ts
// @benosjs/dom/hydrate (unchanged signature)
export function hydrate(
  app: () => JSX.Element,
  host: Element | DocumentFragment | ShadowRoot,
  options?: HydrateOptions,
): () => void
```

`hydrate` gains two behaviors and no option: called before the shell has been parsed (the root's closing marker is not yet in `host`), it waits for it and then claims, so a client entry loaded with `async` hydrates as soon as the shell exists; and it takes patches that arrive after it started. Both are described under _Progressive hydration_.

### Shell

The renderer settles in two stages instead of one. The request record's `track(promise, shell?)` gains a second argument: the router passes `true` for its initial navigation (which awaits its loaders), and `renderToStream` awaits only those before serializing the shell; `renderToString` awaits everything, as before. At shell time every Suspense boundary whose content is still staged (its fallback, stage ordinal 0, committed; its content, ordinal 1, held) is a **streamed boundary**. The host gives it an **ID** (a decimal counter per root, in the order boundaries are found) and rewrites the committed fallback stage's opening marker from `<!--b:0-->` to `<!--b:0:ID-->`. Nothing else in the shell differs from `renderToString`'s output for the same state, and the shell's payload script holds the snapshots recorded so far. As built in S3, the host finds streamed boundaries from the stage records it keeps per request (`stagesOf`), so it cannot tell a boundary waiting on opted-in data from one whose resource has no codec and will never settle on the server: both carry an ID, and the second is resolved by the end notice, which hands it to the client exactly as 0.6.0's plain fallback was. The hydrate reader accepts the suffix on both, so a never-patched boundary hydrates through the unchanged claim code.

The marker extension: `b:N:ID` where `ID` matches `[0-9]+`. The 0.6.0 reader (`isOpen`, `closeOf`, `leftover`, and the ordinal in `claimComment`) accepts `b`, `b:N`; it learns to accept `b:N:ID` and to read the ordinal as the digits between the colons. This is a reader change, not a page change: no 0.6.0 page contains the suffix, and a page that never streams never emits it, so the protocol version stays **1**. The suffix appears only on fallback stages (`N` = 0) of streamed boundaries, and only in the shell and in patched content; it never survives into the applied document, because the patch removes the fallback range.

### Patches

After the shell, the renderer keeps settling in rounds. After each round the host walks its streamed boundaries; one whose content stage has committed (the boundary's `reveal` ran) is serialized as a patch and removed from the pending set. A patch is three or four nodes, written after the shell in the same `stream`:

```html
<template id="b:ROOTID:ID"><!--b:1-->…content…<!--/b--></template>
<script type="application/json" data-benos="ROOTID">
  {"v":1,"r":[…],"q":[…]}
</script>
<script nonce="…">
  __benos_s.p('ROOTID', 'ID')
</script>
```

- The template holds exactly the content stage's range as `renderToString` would have serialized it in place: the `<!--b:1-->` … `<!--/b-->` pair and what it contains. Content that itself contains a streamed boundary (nested data) is serialized with that inner boundary as its fallback, marked `<!--b:0:ID2-->`, and the inner boundary joins the pending set; its own patch follows later. Order is settle order, never depth order.
- The payload script holds only the snapshots recorded since the previous flush (the shell or the last patch). It has the same `data-benos` attribute and format as the root's payload; the client merges every script with that attribute. It is omitted when nothing was recorded.
- The call script applies the patch through the runtime (below) and removes itself. The first patch is preceded by the runtime's definition, one inline script of about 520 bytes; a page whose shell has no streamed boundary never sends it, and its stream is then the shell alone, byte for byte `renderToString`'s `html`. Every inline script carries `options.nonce` when given. The payload script needs no nonce: `type="application/json"` is not executed.
- The cumulative payload (shell plus patches) is checked against `maxPayloadBytes` at every flush. Exceeding it after the shell cannot reject the response, so the stream ends with the end notice and `onError` receives the `RangeError` with `phase: 'stream'`; the client fetches the rest. Before the shell it rejects as `renderToString` does.
- A boundary whose data fails on the server never settles (the resource stays pending with a permanent token, as in 0.6.0), so it gets no patch; the end notice hands it to the client. An `ErrorBoundary` inside streamed content behaves as on the client: its fallback is what the patch carries.

The **end notice** is one call, `__benos_s.e("ROOTID")`, sent whenever the stream had at least one streamed boundary: when every boundary has been patched, when the renderer's tracked set drains with boundaries still pending (failed or never-settling data), when the signal aborts or the consumer cancels the stream after the shell, or when the payload limit is exceeded after the shell. The runtime's definition precedes it if no patch has sent it yet. Then the stream closes and the root is disposed, as today. The runtime marks the root finished so the client stops waiting.

### The runtime

`__benos_s` is one global object per page (the name is **frozen** with 0.7.0; two roots share it). It is defined by the server's inline script, in plain ES2020 that every supported browser runs, and never evaluates application data: it reads node references and the two string arguments only.

- `p(rootId, id)`: locates `<template id="b:ROOTID:ID">` by id, so placement is free. If a hydration has registered a handler under `__benos_s.h[rootId]`, the runtime hands it the id and the template and returns; otherwise it finds the comment `<!--b:0:ID-->` with a comment walker from `document`, removes it and every node through its matching `<!--/b-->` (counting nested pairs: a comment matching `^b(:|$)` opens, `/b` closes), moves the template's children before the node that followed the pair (the control's own `<!---->`), and removes the template. The call script removes itself; the payload script stays for `hydrate` to read. After this the fallback is gone and the DOM equals the non-streamed page at that boundary, which is the invariant at work.
- `e(rootId)`: sets `__benos_s.d[rootId]` and calls the registered handler's `e()`, which turns every boundary still waiting into a client render.
- The object's shape, `{ h: { [rootId]: { p(id, template), e() } }, d: { [rootId]: 1 }, p, e }`, is shared by the server string and `@benosjs/dom/hydrate`, which ship together. A patch that arrives before a handler is registered is applied by the runtime; one that arrives after is applied by hydration (S4).

Patches that arrive after the stream has been fully parsed are impossible; patches that arrive for an already recovered or already disposed boundary are ignored. The runtime adds nothing to the client bundle: it is a string in `@benosjs/server`.

### Progressive hydration

1. **Waiting for the shell.** `hydrate` looks for the root markers under `host`. When the opening marker is present but the closing one is not, the shell is still arriving: it observes `host` for child additions until the closing marker appears, then proceeds exactly as today. When neither marker is present the root is client rendered, as in 0.6.0. The disposer returned meanwhile cancels the wait. A client entry that wants this calls `hydrate` from a script loaded with `async`; a deferred module runs after parsing, which is after the stream, and still works, by the invariant.
2. **Reading payloads.** `readPayload` reads every `script[type="application/json"][data-benos="ROOTID"]` under the host or document, merges their entries, and drops the scripts. Later patch payloads are merged the same way when a patch is handed to the hydration.
3. **Streamed boundaries defer, and held data waits.** While claiming, `Suspense` creates its marker through `host.comment`; the hydration's claim of that marker notes the stage pair before it. When that pair is a fallback with an ID (`<!--b:0:ID-->`) and the root is not yet finished, the hydration records `ID` for the marker, and `Suspense` learns it through the request record (`request.pendingOf(marker)`). A streamed boundary then commits its claimed fallback **and does not stage its content**: no owner or binding is created for it yet, and when its continuation runs (`request.whenPatched(ID, continue)`, under the boundary's owner) the content is staged onto the patched nodes. Deferral alone is not enough, because a resource is usually created in the page's setup, outside the boundary that reads it, and launches at creation: so under a hydrating root whose stream is unfinished, a resource with a codec and no snapshot **holds** instead of fetching (`request.whenSnapshot(key, next)`), pending with a token; when a payload carrying its key is merged it seeds and settles, and at the end of the stream it fetches. A query observer's inner resource holds the same way, because its codec key is the entry's hash (built in S4; S1 planned to wait only through deferral). A stream is in progress only while the document is parsing (`readyState === 'loading'`) and the root has not sent its end notice; a page that is already parsed, or one rendered by `renderToString`, never holds anything.
4. **Applying a patch during hydration.** When the handler receives the template for `ID`: it merges the patch's payload entries into the request's snapshot maps, inserts the template's children (the `<!--b:1-->` pair) before the boundary's marker, after the fallback's range; records the inserted pair as a claimable stage of ordinal 1 for that position; **re-activates the claim cursor** at the pair; and calls the continuation. `Suspense` stages its content as it would have at first: the DOM host's `stage` claims the pair, components run, resources find their snapshots and are born ready, and `reveal` commits the claimed content in place and disposes the fallback. The claim is deactivated when the continuation returns (synchronously; staged content under a request mounts synchronously). The stage owner's gate opens at commit, so the content's user effects and `onMount` run then, as a client-rendered boundary's would. The root's own gate is not involved: it opened when the shell's claim finished, and streamed boundaries are not tracked by the root, so hydration of the shell never waits for them.
5. **End of stream.** The handler's `e()`, or `DOMContentLoaded` arriving without one (the connection dropped), marks the root finished, releases every holding resource (which fetches), and runs every registered continuation with no patch: each boundary stages its content as a plain client render (today's missing-payload path). A boundary or resource registered after the root is finished continues immediately the same way.
6. **Mismatch and recovery.** A claim failure inside a patched range recovers at the nearest slot or, failing that, at the boundary's pair, exactly as today, and a later patch for a recovered boundary is ignored. A patch for an unknown `ID` (a boundary whose claim failed earlier and whose range was client rendered) is dropped. Nothing is leaked: a boundary that never stages before `hydrate`'s disposer runs has created nothing; one that staged is disposed with its owner.

### Server fast path

The 0.6.0 host wrapped every dynamic binding (an element attribute getter, a direct template's attribute binding, a child slot, a component's dynamic children, the control-flow sources of `Show`, `For`, `Switch`, and `Dynamic`) in a render effect so that content staged under a pending boundary shows settled values before serialization. Those effects, and the owners, cleanups, and tree moves around them, were the reactive overhead the 35–45× measurement pointed at.

The rule, as built in S2: **a binding is evaluated once, with no computation or subscription, unless a tracked resource is still pending in this request.** Only a settle can change what a binding shows later, so only bindings created while something is pending need an effect. `@benosjs/async` keeps `request.pendingCount`: incremented when a resource with an `ssr` codec launches under a server root (the only launches a server root ever makes), decremented when it settles or fails. The host evaluates the getter under `untrack`, applies the value, and creates today's render effect only when the count is above zero. A request without opted-in data never pays for reactivity; a request with data pays for it during the window in which the data is pending, and branches mounted after the last settle (a `Show` revealing a list once its resource is ready) are evaluated once. S1 proposed a per-binding "did this read pending data" signal; implementation showed it cannot be made sound without core help, because a plain `value()` read of a pending resource, or a computed caching one, carries no token, so the request-wide count replaced it.

The semantic gap: a binding that read a signal which a component mounted later writes during its setup shows the final value under an effect and the first value under the fast path. Development evaluates the binding once exactly as production does, then also creates the effect; because core runs a new render effect at the next flush rather than at creation, that first run is the first chance to see such a write. When a binding created while nothing was pending sees a different value there or later, the host **does not apply it**, reports the binding's element path with the message that production evaluates once and the write must move before the read or into an effect. Development and production emit the same HTML, and development says why. This costs nothing in core: the count is a field on the request record.

Three structural costs went with it, found by profiling the production path, all internal to `@benosjs/server`: the direct-template skeleton is parsed once per template definition and replayed, and built in place instead of into a holder fragment that is then moved; the per-element and per-range cleanup closures that duplicated the disposing slot's range removal are gone, and node removal is skipped while the request root is torn down after serialization, since the tree has already been written; and a primitive slot value (text) gets a text node but no branch owner, which it never needed because no component runs and no id is claimed under it.

Eager serialization (writing settled subtrees to the stream without keeping their nodes) is **not** part of S2. S2 measured the steps above against Solid in `bench:ssr`; the checkpoint reports the number and where the remaining time goes.

### Data under streaming

- **Resources** (`@benosjs/async`). On the server, a resource with a codec counts itself in `request.pendingCount` from launch to settle. A resource inside a streamed boundary is created on the client only when the boundary's continuation runs, which is after its snapshot has arrived, so it seeds as in 0.6.0; a resource inside a boundary that the end notice handed to the client fetches as in 0.6.0.
- **Suspense** (`@benosjs/async`). Under a hydrating root, asks `request.pendingOf?.(marker)`; when it returns an ID, defers content as described and registers with `request.whenPatched`. On the server, unchanged: the host reads the stage state.
- **Queries** (`@benosjs/query`). Unchanged: an observer's inner resource is what counts as pending. Loader-driven queries settle before the shell with the navigation; observer-driven queries inside a boundary stream like resources.
- **Router** (`@benosjs/router`). Tracks its initial navigation with the shell flag. Status and `Location` are final when `renderToStream` resolves, because the navigation, loaders included, has settled. A redirect streams whatever the app rendered after the redirect committed (usually nothing); callers that want an empty body may ignore `stream` and must still await `done` or cancel the stream so the root is disposed.
- **Forms**: unchanged.

### Request record additions

```ts
interface InternalRequest {
  // 0.6.0 fields unchanged, plus:
  track?: (promise: Promise<unknown>, shell?: boolean) => void
  pendingCount?: number // server: tracked resources still pending (async maintains it)
  pendingOf?: (marker: object) => string | undefined // hydrate: streamed boundary ID
  whenPatched?: (id: string, next: () => void) => void // hydrate: continuation
  whenSnapshot?: (key: string, next: () => void) => void // hydrate: a held resource or query entry
}
```

Every field is optional and set only by the host that needs it, so core's runtime does not change: the registry already passes the record through. Type-only changes cost no bytes.

### Seams and budgets

| Package     | Change                                                                                                                                                                                                                                      | Reason                                  | Estimate                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| core        | `InternalRequest` type fields above                                                                                                                                                                                                         | Hooks for the hosts                     | 0 B                                                      |
| dom (main)  | None                                                                                                                                                                                                                                        | Stage IDs are read in the hydrate entry | 0 B                                                      |
| dom/hydrate | Wait for the closing root marker; merge every payload script; `b:N:ID` in the reader; `pendingOf`, `whenPatched`, `whenSnapshot`; the runtime handler; template insertion, stage record, claim re-activation; end notice and end of parsing | Progressive hydration                   | 400–600 B; built: +804 (S3 +39, S4 +765), 3,962          |
| async       | `pendingCount` kept from launch to settle under a server root; streamed-boundary deferral in `Suspense`; a resource holds for its snapshot while the page streams                                                                           | Fast path; deferral; hold               | 140–200 B; built: +187, 2,084                            |
| query       | The inner resource's codec key is the entry's hash, so it holds like a resource; the fetcher seeds from a snapshot that arrived                                                                                                             | Hold                                    | 0 B; built: +5, 3,744                                    |
| router      | `track(promise, true)` for the initial navigation                                                                                                                                                                                           | Shell timing                            | 5–10 B                                                   |
| server      | Binding frames and the development revert; stage records, streamed-boundary detection, IDs, patch and payload-delta serialization; `renderToStream`, stream plumbing, abort, end notice; the runtime string                                 | Fast path; streaming                    | 1,750–2,400 B; built: +1,747 (S2 +518, S3 +1,229), 7,645 |

Against the budgets: core 4,490 of 4,608 and core + DOM 11,515 of 11,520 do not move. async 1,897 → about 2,100 of 4,096. query 3,739 → about 3,760 of 3,840. router 6,897 → about 6,905 of 7,168. Two caps must rise:

- **`@benosjs/dom/hydrate`:** 3,158 + 400–600 → up to about 3,760 of 3,328. Proposal: **4,096** (+768).
- **`@benosjs/server`:** 5,898 + 1,750–2,400 → up to about 8,300 of 6,144. Proposal: **8,448** (+2,304). The runtime string is about a fifth of the growth and is sent to the browser only on pages that stream.

S2 and S3 report the measured numbers; if either lands over its new cap after a savings pass, the step stops and asks.

### Trade-offs and prior art (streaming)

- [SolidStart](https://docs.solidjs.com/solid-start/reference/server/render-to-stream) streams boundaries as `<template>` plus a script that calls `$R`, and hydrates per boundary with `data-hk` IDs. Benos uses the same template-and-script delivery; its boundaries are addressed by a marker suffix because its hydration is positional and needs no per-element IDs.
- [React](https://react.dev/reference/react-dom/server/renderToReadableStream) marks pending boundaries with `<!--$?-->`, streams hidden `<div>`s and a `$RC` function that moves them, and offers `onShellReady` and `onAllReady`. Benos's promise resolves at shell ready and `done` at all ready; it never renders content into a hidden element, so the applied DOM needs no cleanup.
- [Qwik](https://qwik.dev/docs/concepts/resumable/) avoids hydration altogether by serializing state and listeners. Benos hydrates and streams, which keeps its runtime small and its data policy opt-in; the cost is that a boundary's interactivity waits for its patch.
- [Astro](https://docs.astro.build/en/guides/server-islands/) streams server islands as independent requests. Benos streams boundaries inside one response and one request root, so they share the request's caches and IDs.

What Benos does not do in 0.7.0: event replay before hydration, `<head>` streaming, out-of-order delivery of anything but Suspense boundaries, and script-less delivery. The marker suffix, `__benos_s`, the patch shape, and the end notice are frozen with 0.7.0; a shorter dynamic-text marker would be protocol version 2 and is not planned here.

### Test plan before S3 and S4 are complete

1. **Invariant:** for every server fixture that has a streamed boundary, applying the patches in a DOM (happy-dom, with the runtime function executed) and serializing yields the `renderToString` output for the same settled state; the payload union matches. Nested streamed boundaries, two roots, a boundary that fails and is handed to the client, abort mid-stream.
2. **Shell:** `renderToStream` resolves after the navigation and loaders and before any boundary's data; status 200, 404, and 302 with `Location`; a shell with no streamed boundary emits no runtime and no scripts beyond the payload.
3. **Patches:** one per boundary in settle order; payload deltas carry only new entries; the cumulative payload cap; nonce on every inline script; `done` settles on close, including after abort; the root is disposed and leaves nothing gated.
4. **Hydrate-at-end (S3):** a streamed page loaded in Chromium, Firefox, and WebKit with a deferred entry hydrates with zero mismatches through the 0.6.0 claim code.
5. **Progressive (S4):** `hydrate` before any patch, between patches, and after all patches gives the same DOM, zero mismatches, and no client fetch for a streamed boundary; the end notice triggers exactly one fetch per unresolved boundary; typed input in the shell survives; a patch for a recovered boundary is ignored; no leaked owners or listeners; the `async` entry waits for the shell.
6. **Fast path (S2):** every existing server fixture produces identical HTML; a binding inside pending content re-renders on settle, including one over a cached computed of a plain `value()` read; a late write warns in development and the HTML equals production's; no computation is created for a page without pending data, and few after its data settles (counted by wrapping the registry's render-effect factory); `bench:ssr` reports the ratio against Solid.
7. Node and Bun for the server suites; the packed `@benosjs/server` imports no `node:` module and the runtime string parses as ES2020.

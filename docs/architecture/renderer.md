# DOM renderer and internal host contract

**Status:** Phase 4a approved design, **required for v0.1**. `@benosjs/dom` implementation is Phase 4b. The host contract below is internal; it is not a public generic renderer API until a second host validates it.

## Goal and public entry point

The DOM renderer materializes compiler-produced descriptors into native nodes, installs fine-grained render bindings, and owns every node, event listener, ref, and branch through the kernel owner tree. Components do not rerun after setup. A successful signal write updates DOM synchronously before the writer returns, except within an explicit or automatic batch. User effects run after prior render work, as [scheduling.md](./scheduling.md) specifies.

```ts
export function render(
  app: () => JSX.Element,
  host: Element | DocumentFragment | ShadowRoot,
): () => void
```

`render` appends an owned range to `host` and leaves any pre-existing host children intact. Its returned disposer is idempotent and removes only that range after disposing its owners and listeners. Multiple roots may share a host without owning each other's nodes. If application setup throws without a boundary, the incomplete range and owner are disposed before the error reaches `render`'s caller. This append-and-own behavior is hard to reverse.

## Internal host and compiler ABI

`@benosjs/core` keeps zero DOM imports. `@benosjs/dom/internal` is an **unsupported internal subpath** used by compiler output and a future server host. It re-exports only the kernel hooks needed for component/branch owners, render-tier effects, mount eligibility, error routing, and event error reporting. The root `@benosjs/core` public exports remain unchanged. A single core instance must be shared across package subpaths; packed-package tests must catch duplicate graph/scheduler copies.

The compiler emits one host-neutral `TemplatePlan`: an immutable tree of element, text, and range-anchor instructions with stable slot IDs, literal attributes, and namespace information. It does **not** emit an HTML string for `innerHTML` parsing. The DOM host lazily creates a static prototype per `Document` and clones it for each instance; a future HTML host may interpret the same plan into escaped output. Context-sensitive HTML such as tables/selects and SVG therefore uses explicit element creation, with no parser repair changing node paths. The module can be imported without touching `window` or `document`; the first `render` supplies the document.

Conceptual internal interfaces:

```ts
interface TemplatePlan {
  readonly id: string
  readonly nodes: readonly StaticInstruction[]
  readonly slots: readonly SlotPath[]
}

interface RangeHandle<N> {
  readonly first: N
  readonly last: N
  readonly owner: InternalOwner
}

interface Host<N, E extends N> {
  clone(plan: TemplatePlan, documentContext: unknown): RangeHandle<N>
  slot(range: RangeHandle<N>, id: number): N
  insert(range: RangeHandle<N>, parent: N, before: N | null): void
  move(range: RangeHandle<N>, parent: N, before: N | null): void
  remove(range: RangeHandle<N>): void
  text(node: N, value: string): void
  attribute(element: E, name: string, value: unknown): void
  property(element: E, name: string, value: unknown): void
  event(element: E, descriptor: EventDescriptor): () => void
  isConnected(range: RangeHandle<N>): boolean
}
```

The published internal types will replace `unknown` with host-specific generic constraints; this sketch identifies operations, not a promise to support custom hosts in v0.1. Element creation/clone, attribute assignment, event attachment, and child ranges are separate operations so SSR can escape output and hydration can claim nodes later without changing component semantics. The compiler's exact descriptor ABI and examples are in [compiler.md](./compiler.md). It is versioned internally with the compiler and DOM runtime and tested as one release unit; applications must not hand-author it.

## Mount and update sequence

1. `render` opens one detached kernel root/setup transaction and prepares the minimum owned range: a singleton element is its own range, while multi-node and empty values receive the anchors needed for later replacement. The app descriptor is materialized under a child component owner. Nested components and control-flow branches get child owners; a portal keeps the declaration owner's parentage even when its range is elsewhere.
2. Each static template is cloned once per materialization. Dynamic text, attributes, properties, child ranges, and handler expressions each register a render-tier binding under the owner that created the node. No binding calls its enclosing component function again. Dynamic child values use owned ranges, not a virtual-DOM diff of the whole component.
3. Nodes are inserted into the host during setup. After insertion, the renderer marks connected component anchors eligible and asks the kernel to enqueue mount jobs. Closing setup flushes render bindings, then user effects and eligible `onMount` callbacks before `render` returns. A component introduced by a later `<Show>`, `<For>`, `<Dynamic>`, portal, or boundary reset follows the same commit order.
4. A detached host or portal target retains mount jobs. Only while already committed jobs await external attachment does one shared `MutationObserver` per document watch attachment; it disconnects when no such jobs remain. The observer callback queues eligible jobs, so these `onMount` calls are asynchronous relative to render/attachment. A prepared but uncommitted async branch does not install the observer.
5. Disposing a branch cancels queued bindings and mount jobs, removes listeners, runs owned cleanup in [ownership.md](./ownership.md)'s depth-first order, then removes only its DOM range. A keyed move uses `move` without disposal or ref/mount replay.

Anchor nodes are internal and carry no user-visible text. A range whose materialized value is exactly one element uses that element as both its first and last node, with no anchors. This applies to a root/component range, a `<For>` item, and an active control-flow branch; a multi-node or empty value uses the minimum anchors needed for later replacement. A text binding reuses one Text node when its value changes. A dynamic child binding normalizes arrays recursively; empty values leave its insertion marker. Node and range identity is preserved when the bound descriptor is the same; replacing a descriptor disposes the old scope before mounting the new one. The renderer must never recreate all children of an element merely because one text binding changed.

## Events and errors

Every handler is wrapped in a synchronous `batch`. The wrapper catches a synchronous exception **after** the batch flush and passes it once to the kernel's nonthrowing internal `reportError`; it does not enter a component `<ErrorBoundary>`. A returned promise ends the batch immediately. Writes after `await` form later transactions; a rejection of the returned promise is reported once when it settles, without holding the batch open. Handler reads are untracked unless the handler explicitly creates an effect.

For common bubbling events (`click`, `input`, `change`, `keydown`, `keyup`, `pointerdown`, `pointerup`, `submit`, `focusin`, `focusout`, and `dblclick`), a reference-counted delegation hub is installed on the event's `Document` or `ShadowRoot`. Native target and ancestor listeners run in the browser's normal dispatch order before the delegated hub sees the event at the root; a native `stopPropagation()` therefore prevents the delegated hub from running. Within the hub, handlers run from the target outward in bubbling order, and a delegated `stopPropagation()` stops later logical ancestors. Capture handlers, non-bubbling events (`focus`, `blur`, `scroll`, `load`, etc.), and `on:<name>` custom events use native element listeners. The hub removes its root listener when its last descriptor is disposed. A handler expression is read at dispatch under `untrack`, so a changed handler can be used without reinstalling the DOM listener. Tests cover native/delegated order, native stop-propagation blocking, and each delegated event family.

The handler's `event.currentTarget` must denote the matched element, including under delegation. The DOM host may temporarily shadow that property for a delegated callback and restore it in `finally`; if the browser cannot support that safely for a particular event, it installs a native listener instead. Browser tests must verify `target`, `currentTarget`, `stopPropagation`, nested roots, portals, and Shadow DOM. This consistency requirement is part of the event contract, not a type-only promise.

## Refs and lifecycle

`ref` accepts a callback receiving the concrete non-null element. The renderer calls it once after element creation under that element's owner, before `onMount`; it never calls it with `null` during teardown or a keyed move. A callback may call `onCleanup` to release user resources. A ref callback error routes through its creation owner; a handled boundary disposes the failed scope. A newly mounted element gets a new ref call; moving an existing keyed range or portal does not. There is no object-ref or variable-assignment compiler rewrite.

`onMount` is deliberately distinct from `ref`: a ref may run while a host is detached, whereas mount waits until its representative anchor is connected to a live document and prior render work is complete. A component with no visible element still has an anchor. A disposed-before-attachment component never mounts.

## HTML, SVG, and attribute rules

The compiler chooses an HTML, SVG, or MathML namespace for each intrinsic element and records transitions such as SVG `foreignObject`. The DOM host uses namespace-aware creation and namespaced attributes such as `xlink:href`; it does not infer SVG by tag spelling alone. [DOM `createElementNS`](https://developer.mozilla.org/en-US/docs/Web/API/Document/createElementNS) is the relevant platform operation.

| Input                                                             | DOM behavior                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `class`, `for`                                                    | Standard HTML names, set as attributes. `className` and `htmlFor` are rejected by JSX types and diagnosed in development.                                                                                                                                                                                                                      |
| Boolean HTML attributes (`disabled`, `required`, `checked`, etc.) | `true` means present with an empty value; `false`, `null`, and `undefined` mean absent. The attribute list is explicit, because attributes such as `aria-hidden` and modern `hidden` have different rules. The [HTML boolean-attribute rule](https://html.spec.whatwg.org/dev/common-microsyntaxes.html#boolean-attributes) is presence-based. |
| `aria-*`, `data-*`, and other string/enumerated attributes        | `null`/`undefined` remove; booleans become literal `"true"`/`"false"`; numbers stringify. This preserves `aria-hidden="false"`.                                                                                                                                                                                                                |
| `value`, `checked`, `selected` on form controls                   | Update the live DOM property; initial static markup may also reflect an attribute. A binding never replaces the input node. Explicitly controlled bindings can overwrite user input; later hydration must preserve pre-hydration input until such a binding commits.                                                                           |
| `style`                                                           | Accepts a CSS string or a record of CSS property names to string/nullish values. String uses `cssText`; a record uses `style.setProperty`/`removeProperty`. No automatic `px` or deep mutation tracking.                                                                                                                                       |
| `ref`, event props, `children`                                    | Runtime directives, never serialized as DOM attributes.                                                                                                                                                                                                                                                                                        |
| `innerHTML`, `dangerouslySetInnerHTML`                            | Unsupported in v0.1. Text bindings use text nodes, and SSR has no raw-HTML escape hatch until a separate trusted API is designed.                                                                                                                                                                                                              |

URL-bearing attributes (`href`, `src`, `action`, `formaction`, `poster`, `xlink:href`, and equivalent SVG references) reject ASCII-trimmed, case-insensitive `javascript:` and `vbscript:` schemes. `data:` is rejected for navigation, forms, frames, and objects; an image `src` may use `data:image/*`. Relative and ordinary network URLs pass through. This is a narrow dangerous-scheme guard, not a general validator of untrusted destinations; applications still validate user-supplied URLs. The same policy must be used by a later HTML host. Tests cover case, leading ASCII whitespace/control characters, and encoded variants after URL parsing. No dynamic value is interpolated into an HTML string.

## Testing and future seams

Phase 4b happy-dom tests cover DOM identity on fine-grained writes, component non-rerun, singleton ranges without anchors, per-document template cloning, text/attribute/property updates, keyed moves including swaps and reversals, root/portal disposal, nested owners, event batching and cleanup, native/delegated listener order and stop-propagation behavior, submit/focusin/focusout/dblclick delegation, handler throws and async rejections, `currentTarget`, refs never receiving null, SVG/MathML namespace handling, URL injection resistance, form controls, provider warnings, and the control-flow/helper APIs. Phase 4d browser tests are limited to live-document attachment timing, focus behavior, parser behavior, accessibility, and keyboard/RTL fixtures. The Phase 4 rows in [test-traceability.md](./test-traceability.md) are acceptance criteria.

For future SSR/hydration, the same plan can be serialized by an HTML host and claimed by a client host, with versioned markers and resource snapshots from [ssr.md](./ssr.md). This document reserves host operations but does not implement, export, or freeze an SSR protocol in v0.1. Future staged transitions gate owners' render/user jobs until commit, as [async.md](./async.md) requires.

**Hard-to-reverse decisions:** append-and-own `render`, DOM identity, internal plan/host ABI, attribute names and coercions, URL policy, delegation and `currentTarget`, automatic event batching/error routing, ref timing, connected mount timing, and the unsupported raw-HTML rule.

# JSX compiler and TypeScript contract

**Status:** Phase 4a approved design, **required for v0.1**. `@benosjs/compiler` and `@benosjs/vite` implementation is Phase 4c. The compiler output ABI is internal to the matching `@benosjs/dom` version.

## Goal and non-goals

Benos needs valid TSX input, precise source locations, and one required JSX transform that creates inert template/component descriptors and fine-grained bindings. A component function runs once; bindings, control flow, and getter-backed props provide later updates. The compiler must not rewrite a plain `if`, `.map()`, or props destructuring into reactive behavior. Optimizations may reduce DOM work but must not change observable behavior when disabled.

The compiler does not implement SSR, hydration, Suspense, a virtual DOM, or a general macro language in v0.1. It does reserve a host-neutral plan and deterministic slot IDs for the later work in [ssr.md](./ssr.md). It does not evaluate JSX at compile time.

## Public transform and build integration

The standalone API is conceptually:

```ts
interface TransformOptions {
  filename: string
  development?: boolean
  optimization?: 'none' | 'safe'
}
interface TransformResult {
  code: string
  map: RawSourceMap
}
export function transformJsx(
  source: string,
  options: TransformOptions,
): TransformResult
```

`filename` is required for source maps and deterministic template IDs. The transform parses `.tsx`/`.jsx`, emits ESM JavaScript with TypeScript syntax removed, imports only used helpers from `@benosjs/dom/internal`, and returns a source map. Development output keeps useful names and locations; production drops diagnostics and minifies only in the later bundling stage. `optimization: 'none'` and `'safe'` must pass the same behavior fixtures. The first safe optimizations are static-plan hoisting and static-subtree cloning; no optimization may alter expression evaluation count/order, owner scope, event timing, or keyed identity.

`@benosjs/vite` exposes `benos(options)` as a Vite plugin. It runs in the pre-transform stage for app `.tsx`/`.jsx` modules, before another JSX transform can turn them into ordinary `jsx()` calls. It excludes dependencies by default, returns the compiler's code and map, and uses Vite's development/build mode to select diagnostics. It composes input maps when an earlier source transform exists. If a module has already had its JSX lowered by another transform, it fails with an actionable configuration error rather than running a React-style runtime with snapshot props. Initial HMR uses a full reload and disposes the old root; state-preserving component hot replacement is deferred until owner/descriptor replacement is specified. [Vite's plugin API](https://vite.dev/guide/api-plugin.html) provides the transform hook and source-map path used here.

For type checking, applications use `"jsx": "react-jsx"`, `"jsxImportSource": "@benosjs/dom"`, and `tsc --noEmit` (or declaration-only emit), while the Vite plugin sees and transforms the original TSX source. [TypeScript resolves the automatic-runtime `JSX` namespace](https://www.typescriptlang.org/docs/handbook/jsx.html) from `@benosjs/dom/jsx-runtime` and `@benosjs/dom/jsx-dev-runtime`. Those entry points publish types and the required `jsx`, `jsxs`, `jsxDEV`, and `Fragment` runtime names. If untransformed TypeScript-emitted JSX calls execute, those functions throw a clear “Benos JSX transform required” error rather than silently running with eager, nonreactive props. An application must use the Benos compiler to run TSX. This type-check/build split is a tooling contract and needs an external fixture test.

## Internal output format

The output imports `template` and `instantiate` from `@benosjs/dom/internal`. `template` receives an immutable, host-neutral plan: element/text/anchor instructions, literal attributes, namespace, source location in development, and numbered slots. It does not call `document` at module import time. Development output keeps this readable object form. Production output uses a compact positional tuple encoding of the same plan fields; the decoder is internal to the matching DOM runtime. Both encodings describe identical slots, ownership, evaluation order, and namespace transitions and must pass the same behavior fixtures. The DOM host lazily builds and clones a prototype per document; a later server host can interpret the same instructions into escaped HTML. `instantiate` owns the clone and runs a setup callback with slot operations that register render-tier bindings. Component descriptors are inert until materialized under a component owner.

JSX text uses line-aware whitespace normalization. A text node without a line
break is preserved exactly, including spaces next to an expression. When it
contains line breaks, indentation is removed from continuation lines, trailing
spaces are removed from non-final lines, and retained lines are joined with one
space. This preserves a final-line space such as the one in
`<button>\n  Clicks: {count()}\n</button>`.

Example input:

```tsx
function Counter(props: { count: () => number; increment: () => void }) {
  return (
    <button type="button" onClick={props.increment}>
      Count: {props.count()}
    </button>
  )
}
```

Representative readable output (helper spellings and plan encoding are the **internal ABI** fixed for 4b/4c; this is not code to hand-author):

```js
import {
  template as _template,
  instantiate as _instantiate,
} from '@benosjs/dom/internal'

const _t0 = _template({
  id: 'module:0',
  nodes: [
    {
      op: 'element',
      tag: 'button',
      ns: 'html',
      slot: 0,
      attrs: [['type', 'button']],
      children: [
        { op: 'text', value: 'Count: ' },
        { op: 'anchor', slot: 1 },
      ],
    },
  ],
})

function Counter(props) {
  return _instantiate(_t0, (scope) => {
    scope.text(1, () => props.count())
    scope.event(0, 'click', () => props.increment)
  })
}
```

`scope.text` is one render-tier effect for the anchor's Text node; it evaluates once during the initial render flush and on tracked changes. `scope.attr` is the matching render-tier binding for a dynamic attribute or property. `scope.child` owns a dynamic child anchor, and `scope.event` registers a handler descriptor whose getter is read untracked at dispatch. A static literal goes in the plan and creates no effect. In both optimization modes, `props.count()` is evaluated once per binding run, not once while creating the descriptor and again while mounting. The plan's slot numbers follow stable JSX source order. The plan uses element construction, not HTML string parsing, so table/select/SVG structure is identical under the DOM and future HTML hosts.

Component props and children are descriptors rather than eagerly evaluated values. Example:

```tsx
<Greeting name={firstName()}>{flag() ? <A /> : <B />}</Greeting>
```

Representative output (the descriptors are created inside the component that owns the reactive expressions):

```js
import {
  component as _component,
  dynamicChild as _dynamicChild,
} from '@benosjs/dom/internal'

function Parent() {
  const _child0 = _dynamicChild(() =>
    flag() ? _component(A, {}) : _component(B, {}),
  )
  return _component(Greeting, {
    get name() {
      return firstName()
    },
    get children() {
      return _child0
    },
  })
}
```

`_dynamicChild` creates an inert selection descriptor; it does not invoke `A` or `B` inside a public `computed`. The renderer owns and swaps the selected branch outside computed evaluation. `Greeting` is called once when the returned descriptor is materialized. Repeated reads of its children through `children(() => props.children)` resolve the same handle, as [components.md](./components.md) defines. For a component spread, the compiler emits a `props` descriptor that evaluates each spread expression in source order once to snapshot its enumerable keys, then forwards each selected key through a getter that can reread the current expression. Later explicit props override earlier spreads. The compiler never snapshots a dynamic prop expression merely to build its getter.

## Evaluation and diagnostics

| JSX source                                           | Required evaluation                                                                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Literal text and attributes                          | Encoded once in the static plan.                                                                                                                                       |
| Dynamic intrinsic text/attribute/property expression | Wrapped as a render binding; evaluated in source order during initial render flush and again only when tracked sources change. A plain variable creates no dependency. |
| Component prop expression                            | Getter evaluated when the component reads that prop, under the current tracking context. The component itself is not rerun.                                            |
| Spread expression                                    | Evaluated once for the initial key set in source order, then reread by winning-key getters; development warns if a reactive spread changes keys.                       |
| Event handler expression                             | Getter evaluated untracked on dispatch. The handler is invoked inside one synchronous batch.                                                                           |
| Ref expression                                       | Resolved at element creation; callback runs under that element's owner with a non-null node.                                                                           |
| Child component JSX                                  | Kept inert until the owning range is materialized.                                                                                                                     |

Binding expressions should be side-effect-free; they may run again after a signal write. A function supplied as a plain child is **not** automatically invoked as an accessor, because that would confuse render props with reactive reads. Only compiler-created binding/child descriptors have that role. `await`/`yield` inside a binding expression are rejected in v0.1 with a source-located diagnostic; async behavior must use explicit state now and the designed resource API later. The compiler does not insert `untrack` around ordinary prop reads or rewrite destructuring. Development diagnostics identify statically visible destructuring of component props, unsupported `className`/`htmlFor`/raw HTML attributes, and duplicate known keys, but runtime ownership remains the source of truth.

The compiler must preserve JavaScript left-to-right evaluation of static expressions, spread key capture, and ref setup. Dynamic binding evaluation is deliberately scheduled in the render tier, not at descriptor construction. Optimization on/off must keep the same schedule and exception route. Source maps map each generated getter, binding, and diagnostic back to the original TSX expression; the [Babel generator](https://babeljs.io/docs/babel-generator/) supports returned maps. Template IDs derive from normalized module path and JSX position, not randomness, but are not yet the public SSR marker grammar.

## JSX types

`@benosjs/dom/jsx-runtime` and `/jsx-dev-runtime` export a scoped `JSX` namespace. `JSX.Element` is an opaque renderable descriptor, **not** an `HTMLElement` or React element. `ElementChildrenAttribute` names `children`. Intrinsic elements cover supported HTML, SVG, and MathML names through typed tag maps, including overlap cases such as `a`; there is no permissive `[name: string]: any` escape hatch. `data-*` and `aria-*` use template-literal attribute keys. Event props infer their native event and element type; `ref` infers the concrete non-null element type. `class` and `for` are accepted; `className`, `htmlFor`, object refs, and raw HTML props are not. Custom elements are accepted through a separately typed hyphenated-tag rule with conservative attributes/events, not by widening all intrinsics. Component props remain the component function's own generic type, including `children`, and `<For>` infers item/key/accessor types without casts. `key` has no global React-like meaning; keyed identity is explicit on `<For>`.

Type tests must verify valid HTML/SVG props, invalid prop names, ref element types, event `currentTarget`, generic components, `Provider` children, `splitProps`/`mergeProps` inference, and the control-flow callback accessors. The runtime type entry points must be packed and checked from a fresh consumer project; monorepo path aliases can hide broken `exports` mappings.

## Parser choice, tests, and hard decisions

Babel is the v0.1 parser/transform/generator because its TypeScript/JSX parser and source-map generator support a correctness-first custom AST transform with readable output ([parser](https://babeljs.io/docs/babel-parser), [generator](https://babeljs.io/docs/babel-generator/)). This is an engineering choice, not a claim that Babel is fastest. SWC/Oxc can be compared after the same fixture corpus produces identical descriptor behavior and maps. Vite's own bundler need not use Babel internally.

Phase 4c/4d tests must snapshot development and production output for static DOM, dynamic text/attributes/properties, component props, lazy children, fragments, spreads, nested control flow, events, refs, SVG/MathML, and errors. Each fixture runs with `optimization: 'none'` and `'safe'` and compares DOM, owner lifetime, effect counts, evaluation order, and exception routing. Source maps are checked at representative binding/diagnostic positions. A fresh Vite/TypeScript fixture verifies that the plugin sees raw TSX before another JSX transform, the automatic-runtime types resolve, packed exports work, and untransformed runtime calls fail clearly. Real-browser cases then cover parser-sensitive tables/selects/SVG and the Phase 4 entries in [test-traceability.md](./test-traceability.md).

**Hard-to-reverse decisions:** the required transform, scoped JSX types, inert descriptors, getter timing, source-order evaluation, host-neutral template format, internal import subpath, component/child ownership, diagnostics, and the TypeScript/Vite pipeline. The exact SSR marker bytes remain designed later, as [ssr.md](./ssr.md) requires.

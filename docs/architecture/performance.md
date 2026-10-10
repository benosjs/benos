# Initial-render allocation design

**Status:** P3 attribution checkpoint. The compiled benchmark path and allocation call sites are verified; runtime optimization trials are next. No public API or documented runtime semantics have changed.

## Goal and measured baseline

Initial rendering is allocation-heavy. The corrected compiled-TSX forced-GC snapshot retains about 60 function objects, 123 plain JavaScript objects, and 54 arrays per Benos row; exact owner creation counters record 20 owner creations per row on this adapter. Solid retains about 8 functions, 11 plain objects, and 6 arrays, with one root per row. DOM wrappers and native layout objects are much closer between frameworks than the JavaScript allocation totals.

The per-row figures are independent categories: an owner is also a plain object. They are retained-object deltas after collection, not total allocation calls. The P1 allocation sampler also includes transient objects that do not survive the snapshot. Those distinctions matter when evaluating changes to garbage-collection time.

| Metric per compiled keyed row | Benos P3 | Solid P3 | Target |
| ----------------------------- | -------: | -------: | -----: |
| Owner creation calls          |       20 |        1 |    ≤ 2 |
| Retained closures/functions   |       60 |        8 |   ≤ 12 |
| Retained plain objects        |      123 |       11 |   ≤ 20 |
| Retained arrays               |       54 |        6 |   ≤ 10 |

These are measured targets, not a promise that the candidates below explain or remove every allocation. Counts from the P1 runtime-JSX adapter were not comparable to a create-benos app because that adapter bypassed the compiler. The corrected P3 TSX adapter compiles through the same built Vite plugin and production optimization path used by a starter app. The 90%-coverage call-site profiles in [the P3 attribution checkpoint](../checkpoints/perf-p3-attribution.md) show that template instantiation, child creation, ownership/effects, cleanup, and slot updates dominate retained allocations. The property-key iteration trial found no repeatable benefit and was reverted.

The corrected compiled-path profile found:

- Generic 10,000-row create spent 322 ms in renderer-main-thread GC, 167 ms in template instantiation, 114 ms in binding setup, 30 ms creating owners, 14 ms in event setup, and 65 ms inserting DOM. GC is measured separately and can overlap marked spans.
- A compiled 10,000-row table spent 96 ms in template instantiation, 63 ms in binding setup, and 20 ms creating owners.
- Clearing 10,000 rows spent 230 ms in disposal; replacing 10,000 rows spent 254 ms disposing the old rows. The separate GC trace found a large GC cost during 10k replace, with a broad spread.
- Source-mapped retained-allocation sites put `mountTemplate` at about 49 objects / 1.5 KB per row, `child` at 34 / 937 B, `createOwner` at 14 / 1.0 KB, and `createEffect` plus `onCleanup` at about 27 / 1.3 KB. Event installation accounts for a smaller portion.

See [the P1 historical checkpoint](../checkpoints/perf-p1.md), [the corrected P3 checkpoint](../checkpoints/perf-p3-attribution.md), [the performance track plan](../perf-plan.md), and the raw profiles under ../../benchmarks/js-framework-benchmark/results/perf-p3-compiled-*.

## Ranking

The evidence-based ranking below reflects the corrected compiled-path call sites and expected gain per added gzip byte. Estimates remain directional; each candidate must earn its place in an A/B run. Ordinary-prop key iteration was measured first and reverted for lack of repeatable benefit. The event-slot trial removed retained records and reduced sampled allocation counts repeatably while staying within the byte cap. Directly storing stable raw handlers exceeded the cap and was reverted. The measured call sites still put compiler template work and owner/effect/cleanup setup ahead of the remaining candidates.

| Rank | Candidate                                                            | Expected allocation change per row                                                                                                                                 | Expected time change                                                                                                                  | Estimated size delta: core / DOM / app                                               | Confidence                                                            |
| ---: | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
|    1 | Emit direct client DOM operations from compiler analysis             | Target the 49 objects / 1.5 KB in `mountTemplate`, 34 objects / 937 B in `child`, and 19 objects / 538 B in `updateSlot`; avoid the per-instance setup indirection | Highest measured target on the compiled path: 96 ms template instantiation at 10k table rows; expected improvement remains unmeasured | 0 B / −40 to +80 B / +16 to +64 B per distinct generated template                    | High allocation opportunity; low timing confidence                    |
|    2 | Materialize physical owners and run scopes lazily                    | Target 14 owner calls / 1.0 KB and 14 cleanup calls / 644 B per row, plus source-free effect setup where safe                                                      | Owner creation marks are 30 ms / 10k generic rows; potential GC and cleanup savings are unmeasured                                    | +60 to +140 B core runtime / −20 to +30 B DOM / 0 B                                  | Medium allocation opportunity; high semantic risk                     |
|    3 | Store delegated event slots on elements                              | Measured reduction: about 16 retained objects / 545 B per row across repeat profiles; owner/effect calls unchanged                                                 | All nine trace medians stayed within baseline spreads; no repeatable click-to-paint change measured                                   | 0 B / +2 B / 0 B for getter slots; raw stable-handler variant was +20 B over the cap | Repeatable allocation benefit; timing effect below trace noise        |
|    4 | Fuse keyed For entry and range records                               | Remove the per-item `ForEntry`/range record duplication if the lifetime and state align; `createEntry` is about 4 objects / 120 B per row                          | Small row setup/disposal gain; not expected to close the main create gap alone                                                        | 0 B / −10 to +30 B / 0 B                                                             | Medium for one object; low for elapsed time                           |
|    5 | Reduce per-row disposal and contiguous DOM removal work              | No retained allocation reduction promised                                                                                                                          | Clear and replace show 230 ms and 254 ms disposal spans at 10k; GC adds a variable 1,059 ms main-thread median during replace         | 0 B / −20 to +100 B / 0 B                                                            | High cost is measured; attribution within disposal remains incomplete |
|    6 | Iterate ordinary props without a key snapshot (reverted)             | No measured retained-allocation change; a short-lived `Object.keys` array remains transient                                                                        | Two runs showed no repeatable trace or GC reduction                                                                                   | 0 B / +10 B / 0 B (reverted)                                                         | Tested; no repeatable benefit                                         |
|    7 | Promote render bindings only when observation or ownership is needed | Potentially remove the effect/run-owner allocations for source-free render bindings; current generic row exact effect call count is 10 / row                       | 23 ms of effect-node creation / 10k and larger surrounding setup; no safe savings known until source-free bindings are isolated       | 0 to +20 B public core; +80 to +160 B core runtime / 0 to +20 B DOM / 0 B            | Low; semantic risk is high                                            |

The package estimates can overlap: a core-internal helper pulled into a DOM application affects the application's combined runtime even when the public core entry point stays unchanged. Generated application size is reported separately. Do not sum the ranges as if they were measured independent deltas.

## Candidate designs

### 1. Iterate ordinary props without allocating a key snapshot

The current DOM path calls Object.keys for an ordinary props object and Reflect.ownKeys for other prototypes, then loops over the returned array. The ordinary path could preserve Object.keys semantics while enumerating own enumerable string keys directly, avoiding the temporary array. Custom-prototype props would keep their existing Reflect.ownKeys behavior unless a separately tested iterator preserves that exact contract.

The expected saving is one short-lived array for every mounted element whose props use the ordinary-object path. This is not a claim that one retained array per row disappears: key arrays are transient and therefore absent from the forced-GC snapshot. The compiled-path allocation profile did not rank these arrays among leading sampled sites; the expected effect is reduced transient setup allocation. P3 will compare create/append traces and GC without promising a fixed saving.

Semantic risk is low to medium. Enumeration order, own-property filtering, symbols, non-enumerable properties, property getters, and the order in which props are applied must remain as before. In particular, this optimization must not read a getter twice. The SSR host will need the same property visibility and evaluation-order rules, but it does not need the DOM-specific loop.

**Trial result:** the guarded `for...in` prototype added 10 B to core + DOM and did not change retained allocations. Across two interleaved runs, create 1k moved from 52.9 ms to 51.0 ms then 57.3 ms; all ranges overlapped. Other rows were similarly noisy without a repeated gain. The implementation was reverted. The property-order semantic test remains. See [the P3 property-key checkpoint](../checkpoints/perf-p3-property-keys.md).

**Tests:** compare DOM output and evaluation order for string keys, numeric-like keys, inherited keys, symbols, non-enumerable keys, getter-backed props, and custom prototypes. An allocation counter for a no-key-snapshot implementation is only relevant if this candidate is revisited. Run the complete compiler behavior fixture set and all nine interleaved benchmark rows; capture GC traces for create and append.

### 2. Store delegated handlers directly on elements

The retained P3 implementation stores the compiler's existing handler getter directly in an event slot indexed by element and event type. It removes the intermediate `EventRecord`, the compiled-path props wrapper, and the extra getter closure while preserving untracked getter reads at dispatch. Multiple handlers on one element retain registration order, and owner cleanup removes each slot. Runtime JSX data properties still use a getter wrapper in this version.

Two allocation-sampling runs measured about 222.5 retained objects and 7.84 KB per row, down from 238.5 and 8.38 KB. The source-mapped `installEvent` site disappeared; the `installDelegated` site fell from 8.0 objects / 301 B to about 4.0 / 165 B per row. The aggregate reduction is repeatable, though the nine click-to-paint rows did not show a repeatable timing improvement. User callback closures remain.

A follow-up prototype stored ordinary function-valued runtime props directly and used a private marker for getter-backed slots. Its production core + DOM bundle measured 10,260 B, 20 B above the 10,240 B cap (60 B above the retained getter-slot version). It was reverted. The current implementation therefore preserves getter timing for data properties rather than storing stable runtime callbacks as raw values; defer that detail until it can fit under the existing cap without cutting features.

The existing semantics in [renderer.md](./renderer.md) and [scheduling.md](./scheduling.md) remain binding: dynamic handler replacement, bubbling order, native/delegated ordering, native stopPropagation blocking delegated handlers, currentTarget, automatic event batching, handler error reporting, and cleanup on owner disposal. Shadow roots and multiple event roots must continue to work. Server rendering emits no browser event installation and retains only the event descriptor needed by its host.

**Tests:** getter-backed handler replacement without setup reads; multiple handlers of one type; bubbling and stopPropagation; native/delegated ordering; shadow root dispatch; currentTarget; batch-once behavior including throw; disposal clearing slots and releasing external references; SSR event descriptors. The current renderer suite passes unchanged apart from the two focused slot tests. A deterministic per-row allocation assertion remains useful if the slot representation changes again.

### 3. Promote render bindings only when observation or ownership is needed

Today an internal render effect allocates an EffectNode and a run owner before its first callback. The compiled adapter's exact counters record 10 effect creations per row; the separate retained call-site profile attributes about 13 `createEffect` allocations and 14 owner allocations per row across nested setup. A render-binding-specific first-run probe can execute at the existing render tier and promote itself to a normal tracked effect on the first reactive read. If it completes without a tracked read and without registering an owned resource, the probe leaves no retained effect node or run owner. The public effect API is not changed.

The probe must promote its logical run scope as soon as the callback calls onCleanup, creates a child effect/root, installs an owned resource, or uses any other operation whose lifetime belongs to that run. It must also promote before recording the first source edge. Thus a source-free callback with a cleanup still receives exactly one cleanup at the same disposal point. Once promoted, dependency reconciliation, edge reuse, run-scope disposal, queue deduplication, and render-first ordering are the ordinary implementation.

This design is narrower than treating arbitrary bindings as static. It only folds a render binding after observing that its initial run has no reactive sources and no ownership obligations. It does not cache arbitrary values across independent mounts.

The critical risks are lost first-run self-writes, missed dependencies read through computeds, changed cleanup registration timing, changed effect creation order, and altered error routing. These semantics are fixed by [reactivity.md](./reactivity.md), [scheduling.md](./scheduling.md), and [ownership.md](./ownership.md), especially scheduler guarantees 2, 4, 7, 8, and 10 and ownership rules for effects and cleanup.

In server mode, the server host evaluates each binding once to produce HTML and does not subscribe a DOM effect. The probe must follow that existing policy: it must not promote to a live client render effect during SSR, and server cleanup remains attached to the request owner as specified in [ssr.md](./ssr.md).

**Tests:** source-free render binding detaches; one-source and computed-source bindings promote and rerun; conditional dependencies switch; duplicate reads subscribe once; self-write in the initial run is not lost; cleanup-only and child-effect-only bindings preserve ownership; throw and boundary routing match a full effect; disposed or queued promoted effects are removed from source sets and queues. In none and safe compiler modes, assert identical DOM, evaluation order, effect counts, owner cleanup order, and error routing.

### 4. Materialize physical owners lazily

Keep the current logical owner tree and all of its observable lifetime boundaries, but do not allocate a physical Owner object for a component scope that has no local cleanup, child owner, context provider, mount job, effect, listener, or other owned resource. Context reads can walk the already materialized parent chain. A child, provider, cleanup, boundary, mount job, or owned computation materializes the needed scope before registering the resource. If a previously elided scope becomes necessary, materialize it before the operation becomes observable.

The corrected compiled adapter records 20 owner creation calls per row versus one Solid root. The target is at most two physical owner objects per row, not removal of logical cleanup scopes. The likely first savings are empty component and effect-run owners. The keyed item owner may remain because it is the lifetime boundary for the row's range and resources. The owner mark is 30 ms per 10,000 generic rows, while its retained call site is about 1.0 KB per row; the stronger expected benefit is lower retained heap and less traversal than standalone construction time.

This is the highest semantic-risk candidate. It must preserve depth-first disposal, reverse cleanup order, O(1) child unlink, context shadowing and Provider capture, error-boundary selection, effect re-run cleanup, onMount insertion eligibility, Portal logical ancestry, and createRoot detachment. It must not make a child cleanup belong to an ancestor whose lifetime outlives the logical child. No owner or context public API changes are proposed.

SSR retains the same logical owner path and request-end disposal rules from [ssr.md](./ssr.md). Server mode must still suppress user effects, DOM render effects, and onMount while running cleanup at request disposal. Any physical-owner elision must be host-neutral.

**Tests:** for every owner kind, compare behavior with and without a materialized local resource; context shadowing and errors through elided scopes; cleanup order and child removal; component, branch, effect-run, Portal, and detached-root disposal; mount jobs on initial and later branches; server-mode suppression and request-end cleanup. Add exact owner creation counters to generic row and table benchmarks.

### 5. Emit direct client DOM operations from shared compiler analysis

Use the compiler's existing template analysis as the shared source of truth, then emit a client-specific function that clones the cached template and binds local node handles directly. It must not allocate a TemplateScope, per-instance slot Map, slot path arrays, setup callback, or one callback for each scope operation. Dynamic bindings can still create normal render effects; this proposal removes the indirection around them, not their reactivity.

The corrected generic js-framework-benchmark and table fixtures both compile through Benos Vite, so the generic operations exercise this path too. At 10,000 table rows, the corrected profile attributes 96.2 ms [82.4–106.1] to template instantiation; retained call-site data identifies `mountTemplate` as the largest single site. The estimated recovery range is a test target only; compare equivalent output and measure again.

Keep the shared host-neutral analysis and template description available to a future server renderer. The DOM emitter is one backend, not the definition of the template. A server compilation target must derive HTML operations from the same analysis without evaluating browser globals; it need not ship DOM node handles or client event installation. This follows the seam in [compiler.md](./compiler.md) and [ssr.md](./ssr.md). Do not freeze a second incompatible template language or change compiler behavior between optimization modes.

**Tests:** run every compiler behavior fixture under optimization none and safe and compare DOM, owner lifetime, effect count, evaluation order, and error routing. Cover static DOM, dynamic text/attributes/properties, component props, lazy children, fragments, spreads, nested control flow, events, refs, SVG/MathML, parser-sensitive markup, and source maps. Add server-host plan-consumption tests when SSR is implemented; until then, assert that the shared analysis remains host-neutral and the compiler's existing readable and tuple forms represent the same plan. Test application gzip size for the gallery and dashboard as well as the core+DOM budget.

### 6. Fuse keyed For entry and range records

The current keyed list creates a ForEntry object and a separate DomRange object for each item. Where the lifetimes are identical, one internal record can hold both key/item/index state and the range fields. This removes one plain object per row without changing the public item and index accessor API. It does not remove the per-item accessor functions or the item signal needed when an identity-keyed item value changes.

Semantic risk is medium: keyed reconciliation, duplicate-key diagnostics, LIS moves, single-element ranges without anchors, branch disposal, and item updates under a stable key must remain identical. There is no SSR-specific behavior because the records belong to the host renderer; the server renderer will need its own per-item representation with the same logical keys.

**Tests:** all keyed For create/update/remove/swap/reverse tests; stable item identity with a changed object value; lazy item and index reads; range movement, singleton ranges, disposal and cleanup; generic per-row allocation and all nine benchmark rows.

### 7. Reduce per-row disposal and contiguous DOM removal work

The corrected compiled-path profile measures 229.7 ms [219.6–308.8] to dispose 10,000 rows on clear and 254.4 ms [244.5–285.5] to dispose the old rows in replace. A separate trace records a 1,004 ms median renderer-main-thread GC cost during replace, with an 891–1,111 ms spread. Before changing disposal, split the span into owner traversal/cleanup and DOM removal. A candidate may batch removal of an already contiguous range after disposing each owner in the documented order, or reduce repeated range bookkeeping. It cannot skip any owner cleanup or reorder user-visible disposal.

The scheduler continues to use intrusive O(1) queue links and identity deduplication. The DOM operation may be grouped only when all removed nodes are contiguous and the group does not cross a live node that must remain. SSR has no DOM removal; request abort and completion still dispose logical owners in the specified order.

**Tests:** cleanups observe the same depth-first/reverse order; errors do not stop later cleanup; keyed middle removal does not touch neighbors; clear and replace release listeners, subscriptions, and refs; disposal before mount cancels pending mount jobs; DOM ranges with anchors and singleton elements are removed correctly. Profile removal calls and owner traversal separately before and after.

### Dependency arrays for small computations: already satisfied

Do not add a second small-source dependency representation in P3. Core already stores dependencies as intrusive doubly linked edges shared by producer and consumer. It allocates no dependency array for one or two sources; the source lookup Map is lazy and appears only at five sources. Thus avoiding arrays for one- or two-source computations has zero incremental allocation or time gain in the measured implementation.

The P1 row still retains many arrays, but their measured allocation sites have not been shown to be dependency storage. First attribute those arrays. Replacing linked dependency edges with inline fields would add graph complexity and risk duplicate-read O(1) lookup, source reconciliation, subscription order, and edge reuse without evidence of a benefit.

There is no proposed graph or SSR change: server rendering continues to evaluate computeds synchronously and suppress effects under the request owner.

**Tests if this code is touched:** one and two source effects/computeds, duplicate reads, conditional switching, source reconciliation, subscribe-new-before-unsubscribe-old behavior, diamond scheduling, and disposal removing producer and queue links. Keep the lazy sourceMap threshold behavior under a structural allocation assertion.

## Semantics and sequencing gates

No candidate may change:

- Synchronous reads and writes, global write-version behavior, dependency deduplication, reconciliation order, or computed purity in [reactivity.md](./reactivity.md).
- Render-before-user scheduling, FIFO ordering, the render-effect first-run position, automatic event batching, O(1) queue operations, or nonthrowing flush error reporting in [scheduling.md](./scheduling.md).
- Logical owner parentage, depth-first disposal, cleanup order, context behavior, error routing, mount eligibility, or detached roots in [ownership.md](./ownership.md).
- The host-neutral compiler analysis and future server-render behavior in [ssr.md](./ssr.md).

Implement and measure one candidate at a time. Ordinary property-key iteration has been measured and reverted. The getter-slot event implementation is retained; the raw stable-handler refinement was reverted at the fixed size cap. The next unstarted candidates are direct compiled DOM emission, owner/effect/cleanup allocation, keyed record fusion, and disposal. Each candidate needs its own trace and allocation profile. The dependency-array candidate is closed as already satisfied.

At each step, rebuild production output, record exact gzip bytes, collect per-row allocations, and run the full interleaved nine-row benchmark with two warmups and seven rounds. Also run table mounts at 5,000 and 10,000 rows, the dashboard filter slice, heap allocation sampling, and GC traces when the candidate should affect them. A change stays only if its improvement repeats and no row regresses beyond measured noise.

## Budget decision

P1 measured core at 4,049 / 4,096 gzip bytes and core + DOM at 10,198 / 10,240, leaving 47 and 42 bytes. No budget increase is requested: the approved increase is **0 bytes**. The core and core+DOM caps remain 4,096 and 10,240 bytes.

Some gross candidate estimates exceed the 42-byte combined headroom. Those changes must replace existing code or be offset by measured size reductions while preserving semantics. If an approved prototype cannot fit, stop at that P3 checkpoint with its exact measured byte delta and benchmark result; do not raise a cap, cut a feature, or continue on an assumed allowance. The generated application size is a separate measurement and must be reported for both the gallery and dashboard.

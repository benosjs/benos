# Initial-render allocation design

**Status:** P3. The compiled production benchmark path has been refreshed against the runtime-JSX history. The approved limits are 4,608 bytes for core and 11,264 bytes for core + DOM. Direct numeric slot indexing is retained after repeatable allocation and create/append gains. No public API or documented runtime semantics have changed.

## Goal and measured baseline

Initial rendering is allocation-heavy. The compiled-TSX forced-GC snapshot before event slots retained about 60 function objects, 123 plain JavaScript objects, and 54 arrays per Benos row. The current getter-slot build with direct numeric template-slot arrays retains about 58 functions, 106 plain objects, and 56 arrays; exact owner creation counters still record 20 owner creations per row. Solid retains about 8 functions, 11 plain objects, and 6 arrays per row, with one root per row. DOM wrappers and native layout objects are much closer between frameworks than the JavaScript allocation totals.

The per-row figures are independent categories: an owner is also a plain object. They are retained-object deltas after collection, not total allocation calls. The P1 allocation sampler also includes transient objects that do not survive the snapshot. Those distinctions matter when evaluating changes to garbage-collection time.

| Metric per keyed row        | P1 runtime JSX | Compiled safe before slots | Current compiled | Solid | Target |
| --------------------------- | -------------: | -------------------------: | ---------------: | ----: | -----: |
| Owner creation calls        |              5 |                         20 |               20 |     1 |    ≤ 2 |
| Retained closures/functions |             34 |                         60 |               58 |     8 |   ≤ 12 |
| Retained plain objects      |             86 |                        123 |              106 |    11 |   ≤ 20 |
| Retained arrays             |             33 |                         54 |               56 |     6 |   ≤ 10 |

These are measured targets, not a promise that the candidates below explain or remove every allocation. Counts from the P1 runtime-JSX adapter were not comparable to a create-benos app because that adapter bypassed the compiler. The corrected P3 TSX adapter compiles through the same built Vite plugin and production optimization path used by a starter app. The 90%-coverage call-site profiles in [the P3 attribution checkpoint](../checkpoints/perf-p3-attribution.md) show that template instantiation, child creation, ownership/effects, cleanup, and slot updates dominate retained allocations. The property-key iteration trial found no repeatable benefit and was reverted.

The corrected compiled-path profile found:

- Generic 10,000-row create spent 322 ms in renderer-main-thread GC, 167 ms in template instantiation, 114 ms in binding setup, 30 ms creating owners, 14 ms in event setup, and 65 ms inserting DOM. GC is measured separately and can overlap marked spans.
- A compiled 10,000-row table spent 96 ms in template instantiation, 63 ms in binding setup, and 20 ms creating owners.
- Clearing 10,000 rows spent 230 ms in disposal; replacing 10,000 rows spent 254 ms disposing the old rows. The separate GC trace found a large GC cost during 10k replace, with a broad spread.
- Before direct numeric indexing, source-mapped retained-allocation sites put `mountTemplate` at about 47.7 objects / 1.49 KB per row. The indexed-slot profiles now measure `mountTemplate` at 46.5 / 1.37 KB, `child` at 33.2 / 930 B, `createOwner` at 12.9 / 927 B, and `createEffect` plus `onCleanup` at about 26.8 / 1.27 KB. Event installation accounts for a smaller portion.

See [the P1 historical checkpoint](../checkpoints/perf-p1.md), [the corrected P3 checkpoint](../checkpoints/perf-p3-attribution.md), [the performance track plan](../perf-plan.md), and the raw profiles under ../../benchmarks/js-framework-benchmark/results/perf-p3-compiled-*.

## Runtime-JSX versus compiled `safe` output

The runtime-JSX comparison is historical and hand-writes calls to the public
`jsx` runtime. The compiled comparison uses the create-benos path: TSX goes
through the production Vite plugin with `optimization: 'safe'`. On a 10,000-row
create, the compiler path changes the marked CPU spans as follows. These
function spans are sampled independently, so their medians are diagnostic and
must not be summed as a wall-clock decomposition.

| Marked category      | Runtime JSX, ms | Compiled safe, ms | Change, ms | Calls, runtime → compiled |
| -------------------- | --------------: | ----------------: | ---------: | ------------------------: |
| Template instantiate |             0.0 |             167.1 |     +167.1 |               0 → 140,000 |
| Binding setup        |           200.0 |             114.1 |      −85.9 |         290,000 → 190,000 |
| Owner creation       |             7.0 |              30.2 |      +23.2 |          50,000 → 200,000 |
| Signal node creation |             7.4 |               5.3 |       −2.1 |           10,000 → 10,000 |
| Effect node creation |             4.1 |              21.8 |      +17.7 |          20,000 → 100,000 |
| Event setup          |            20.8 |              14.4 |       −6.4 |           40,000 → 40,000 |
| DOM insertion        |            44.7 |              64.6 |      +19.9 |         120,000 → 100,016 |
| Disposal             |             1.3 |              25.1 |      +23.8 |          10,004 → 140,004 |

On clear-10k, disposal is 149.8 ms in the runtime-JSX profile and 229.7 ms
in the compiled profile. This difference is not compiler-only: the compiled
adapter has different generated scopes and owner cleanup registrations. The
attribution isolates the added work; it does not claim the compiled syntax
alone causes every difference.

The forced-GC retained profile measures 153.5 JavaScript objects and 4.71 KB
per runtime-JSX row (33.9 functions, 86.4 plain objects, 33.2 arrays), versus
237.0 objects and 8.22 KB before the getter-slot event change on compiled
`safe` TSX. The compiled path therefore retains about 83.5 more objects and
3.51 KB per row in the paired adapters. The current getter-slot plus numeric
slot-array build retains 219.994 objects and 7.547 KB, leaving a compiled-
versus-runtime difference of 66.5 objects and 2.83 KB per row. The safe compiler adds 14 template
instantiations, 15 owner creations, and 8 effects per row while reducing
binding calls by 10; those extra scopes and plan bindings account for the main
measured allocation difference.

The top runtime-JSX allocation stacks are `mountElement` (932.5 KB sampled
per 1k rows), `applyProps` (623.9 KB), `jsx` (606.3 KB), and `mountValue`
(355.7 KB). On compiled TSX, the current source-mapped retained sites identify
`mountTemplate` (46.5 objects / 1,367 B per row), `child` (33.2 / 930 B),
`createOwner` (12.9 / 927 B), `onCleanup` (13.8 / 633 B), `createEffect`
(13.0 / 638 B), and `updateSlot` (17.1 / 484 B). Numeric slot indexing reduced
the `mountTemplate` site by about 1.2 objects / 127 B per row compared with
the getter-slot map profile. The earlier CPU mark attributed 167.1 ms per 10k
generic rows or 96.2 ms per 10k table rows to template instantiation before
this slice. The interleaved end-to-end gain from the slice was about 8–10 ms
per 10k generic rows; the remaining mark is an opportunity ceiling, not
claimed recoverable savings.

## Ranking

The ranking reflects the refreshed compiled-path call sites and the approved size headroom. The stable raw-handler refinement was tested under the new cap and reverted: neither two timing runs nor retained-allocation sampling showed a repeatable gain. Ordinary-prop iteration remains reverted. Getter-slot event storage is retained for its repeatable allocation reduction. Direct numeric slot indexing is a retained first slice of the top-ranked direct-output candidate. The remaining direct-output estimate is based on measured `mountTemplate` and template-mark costs; it is an opportunity bound, not a claim that the full span will disappear.

| Rank | Candidate                                                    | Measured opportunity per row                                                                                      | Measured time opportunity                                                                                                         | Estimated size delta: core / DOM / generated app                    | Risk and confidence                                                   |
| ---: | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
|    1 | Direct compiler DOM operations from shared compiler analysis | Current sites: `mountTemplate` 46.5 / 1,367 B; `child` 33.2 / 930 B; do not count overlaps                        | Earlier pre-indexing template mark was 167.1 ms / 10k; current 8–10 ms total create gain is measured, remaining mark not isolated | 0 B core / −1 B combined / −150 B raw and −80 B gzip in generic app | Largest remaining hotspot; indexed slots are the first retained slice |
|    2 | Materialize physical owners and run scopes lazily            | `createOwner`: 14 calls / 1,008 B; `onCleanup`: 14 calls / 644 B                                                  | Owner mark ceiling: 30.2 ms / 10k generic rows                                                                                    | estimated +60 to +140 B / −20 to +30 B / 0 B                        | Large object target; high ownership-semantic risk                     |
|    3 | Reduce disposal and contiguous DOM removal work              | No retained allocation saving is assumed                                                                          | Clear 229.7 ms and replace 254.4 ms disposal spans / 10k                                                                          | 0 B / estimated −20 to +100 B / 0 B                                 | High cost measured; traversal/removal split still needed              |
|    4 | Fuse keyed For entry and range records                       | About 4 objects / 120 B per keyed row                                                                             | Small row setup/disposal effect; expected below main create candidates                                                            | 0 B / estimated −10 to +30 B / 0 B                                  | Medium allocation confidence; timing uncertain                        |
|    5 | Promote source-free render bindings                          | Could remove an effect and run owner only for bindings with no reads/resources; not included in the table targets | No isolated repeated timing gain measured                                                                                         | estimated +80 to +160 B core + DOM                                  | Highest semantic risk; defer until larger wins are measured           |
|    6 | Ordinary prop key iteration (reverted)                       | No retained allocation change; temporary key array only                                                           | Two trials had overlapping spreads and no repeatable gain                                                                         | +10 B in the failed prototype                                       | Closed; no benefit                                                    |

The size estimates are hypotheses, not added bytes. Each candidate must report exact rebuilt core, core + DOM, and generated app sizes against the approved caps. Package estimates can overlap when shared helpers are bundled together, so do not sum the ranges as if they were independent deltas.

**Measured direct-slot slice:** replacing the per-instance slot `Map` with a
sparse `Node[]` indexed by compiler slot ID changed the retained profile from
58 functions / 113 plain objects / 49.993 arrays (7,678.6 JS bytes) to 58 / 106
/ 55.993 (7,546.6 bytes). It removes seven plain objects, adds six arrays,
and saves one JS object and 132 B per keyed row. Two source-mapped profiles
measured 221.51 / 7,705.8 B and 221.53 / 7,705.9 B retained objects / bytes
per row, accounting for over 90% of retained JS allocations. Core stayed at
4,049 B; core + DOM moved from 10,200 B to 10,199 B. The generated generic app
moved from 33.81 kB / 10.96 kB gzip to 33.66 kB / 10.88 kB. Two full
interleaved runs measured 10k create at 484.2 and 486.3 ms versus the 494.4 ms
before measurement, and append at 56.2 ms both times versus 57.4 ms. Other
rows showed no repeatable regression.
Exact nine-row medians and spreads, table timings, dashboard profile, and the
reverted raw-handler experiment are in
[the P3 follow-up checkpoint](../checkpoints/perf-p3-direct-slots.md).

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

Implement and measure one candidate at a time. Property-key iteration and stable raw-handler specialization have been measured and reverted. Getter-slot event storage and direct numeric slot indexing are retained. The remaining compiled-path candidates are direct compiler DOM emission, lazy owner/effect/cleanup allocation, keyed record fusion, and disposal. Each needs its own trace and allocation profile. The dependency-array candidate is closed as already satisfied.

At each step, rebuild production output, record exact gzip bytes, collect per-row allocations, and run the full interleaved nine-row benchmark with two warmups and seven rounds. Also run table mounts at 5,000 and 10,000 rows, the dashboard filter slice, heap allocation sampling, and GC traces when the candidate should affect them. A change stays only if its improvement repeats and no row regresses beyond measured noise.

## Budget decision

The user-approved caps are **4,608 bytes for core** and **11,264 bytes for core + DOM** (minified + gzip). The pre-trial production build measured core at **4,049 B** and core + DOM at **10,200 B**, leaving 559 B and 1,064 B. The current build measures **4,049 B** and **10,199 B**, leaving 559 B and 1,065 B. The cap increase is 512 B for core and 1,024 B for core + DOM. Spend it only on changes with repeatable measured gains, and record exact byte deltas beside the gain.

If a prototype exceeds either cap, stop and report the exact byte delta and measured result. Do not cut features or change semantics to fit. Generated application size is a separate measurement from package budgets and must be reported for both the gallery and dashboard when compiler output changes.

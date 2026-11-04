# Initial-render allocation design

**Status (2026-11-04):** Phase 7 ([row-perf-plan.md](../row-perf-plan.md)) is at its design step. The next section is its design; the sections after it are the 0.3.0 track's record and stay as history.

## Phase 7 design — row creation at Solid's level

### What the 0.7.1 baseline says

[RP-7a](../checkpoints/rp-7a.md) measured 0.7.1: creating, replacing, and appending rows is 1.22–1.40× Solid, clear is 2.06×, and the sortable table mounts at 1.55–1.92×. A compiled benchmark row retains 95.5 JavaScript objects (3.4 KB) against Solid's 26.5 (0.9 KB). At 10,000 rows the extra garbage collection is the dominant part of the gap; at 1,000 rows the gap is CPU in binding setup. Both come from what one row allocates, so every candidate below removes per-row records, and each is judged by retained objects, GC, and the trace times together.

This is what one benchmark row allocates today, read from the code and matched against the retained-allocation sites:

| Part of the row                            | Retained JS objects | What                                                                                                                                                                                      |
| ------------------------------------------ | ------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<For>` entry                              |                   5 | entry record, `getItem` and `getIndex` closures, key segment string, item owner                                                                                                           |
| Keyed item signal                          |                   6 | state node, `read`, `readonly`, `set`, `update`, the `readonly` getter (plus a `WeakMap` entry)                                                                                           |
| `<Row row={row} />` descriptor             |                   3 | descriptor, props with a getter, the `jsx` props copy                                                                                                                                     |
| `Row` component                            |                   5 | component owner, `mountReady` closure, component range, its cleanup closure, the owner's cleanup array                                                                                    |
| Direct template instance                   |               8 + 2 | descriptor, `values` array and its closure, node array, `at` closure, range, removal cleanup; the owner's `computations` set and its backing store                                        |
| Attribute binding (`class`, `data-remove`) |         3 or 4 each | effect closure, effect node, one or two dependency edges                                                                                                                                  |
| Dynamic text (`id`, `label`)               |             13 each | slot record, slot range and node array, slot cleanup, effect closure and node, edge, branch owner and its `mountReady`, mounted record, branch range and node array, a second range array |
| Delegated event (two `onClick`)            |              3 each | getter closure, map entry, removal closure                                                                                                                                                |

Dynamic text is the largest single cost: 26 of a row's objects for two strings, plus two comment markers in the DOM. Solid creates one text node and one computation for each.

### Candidates, ranked

| Rank | Candidate                                                             | Retained objects per row (of 95.5) | Other effect                                            | Estimated size: core / DOM | Risk                             |
| ---: | --------------------------------------------------------------------- | ---------------------------------: | ------------------------------------------------------- | -------------------------- | -------------------------------- |
|    1 | Text bindings in direct templates without a slot                      |                          about −20 | −2 DOM nodes, −2 owners, ~−10 disposal calls per row    | 0 / +60 to +120 B          | Low to medium                    |
|    2 | Bulk DOM removal on clear and full replace                            |                                  0 | clear and replace stop removing rows one node at a time | 0 / +20 to +50 B           | Low                              |
|    3 | A `<For>` item's owner doubles as its component's owner               |                           about −4 | −1 owner, −2 disposal calls per row                     | +15 to +30 / +40 to +80 B  | Medium (ids must not change)     |
|    4 | Keyed item and index state without signal closures                    |                           about −5 | also removes the `WeakMap` entry                        | +20 to +50 / −10 to +10 B  | Low                              |
|    5 | One teardown per template instance                                    |                           about −3 | fewer cleanup calls on clear and replace                | 0 / −20 to +40 B           | Medium (event cleanup semantics) |
|    6 | Owned computations without a `Set`                                    |                           about −2 | about −120 B per owner with effects                     | +30 to +60 / 0 B           | Medium (disposal order)          |
|    7 | Small items: no disposer for internal render effects; lazy `readonly` |          −1 retained, −4 transient | less GC on create                                       | +5 to +15 / +5 B           | Low                              |

Together, about −35 retained objects per row, from 95.5 to roughly 60, a little over a third. The byte estimates are hypotheses; each implementation step reports exact sizes. Estimates overlap where helpers are shared, so they do not add up exactly; the total is likely +150 to +400 B on core + DOM.

**Honest expectation.** A third fewer retained objects should cut the 10,000-row GC substantially and the 1,000-row binding time by a similar share; a reasonable projection is creation at about 1.15–1.25× Solid and clear near 1.2–1.4×, not the ≤ 1.05× target. What would remain after these: the item entry and its accessors, the component descriptor and props copy, and the per-binding effect records Solid also has. Whether to go further is decided after the first four are measured, with numbers instead of projections.

### 1. Text bindings in direct templates without a slot

A compiled template marks each dynamic child with a `<!---->` placeholder. Today every such binding builds a full slot before knowing its value: slot record, range, cleanup, then on the first run a branch owner, mounted record, and branch range, and it keeps the placeholder as a marker after the text. All of that exists so the value can later become elements or a list; a binding whose value stays a string or number never uses it.

**Design.** A direct template's child binding starts in _text mode_. Its render effect evaluates the value; if it is a string or number, it creates a Text node, replaces the placeholder with it, and keeps the Text in the effect's closure. Later string or number values write `data` on that node only when it changed. The first time the value is anything else (an element, an array, `null`, a boolean), the binding _upgrades_: it inserts a marker comment where the text is, removes the text, builds the ordinary slot under the template's owner, and from then on behaves exactly as today. A binding whose first value is not text builds the slot immediately, as today.

What does not change: the text binding keeps one render effect, so tracking, scheduling order, and error routing are the same; a Text node is reused across text values, as [renderer.md](./renderer.md) requires; empty values still leave an insertion marker (that path is the slot); and no owner or id ordinal is consumed, because a text value never had children (the server host already skips the branch owner for primitive slots, since 0.7.0).

**Hydration and server output.** Unchanged. While the hydration claim is active, child bindings take today's slot path, so a hydrated page keeps the server's markers and claims them as now; text mode applies to templates created on the client. The server host is a separate renderer and is not touched.

**Disposal.** A text-mode binding registers no cleanup: its Text node sits inside the template's root element and leaves with it, and it owns no branch. An upgraded binding registers the slot cleanup at upgrade, on the template's owner (not the effect's run owner); like today's, it runs during that owner's disposal, after its child owners and before the template's range removal.

**Tests.** Text to text, text to element, text to array, text to `null` and back, element to text; numbers and empty strings; a binding that throws on its first or a later run; disposal before and after an upgrade; keyed moves of rows with text bindings; hydration of a page and then client-created rows in the same list; DOM output identical to today except the removed markers; all compiler fixtures in `none` and `safe`; allocation counts per row.

### 2. Bulk DOM removal on clear and full replace

`<For>`'s clear path already ends with `parent.textContent = ''` when the list fills its parent, but it disposes the rows first, and each row's cleanups remove its nodes one at a time (the row, then each slot's text and marker inside it), so the bulk clear finds almost nothing left. Replace disposes and removes the old rows one by one.

What a row's cleanup observes today matters here. A component registers its range removal after the component function ran, so in the reverse cleanup order it runs _before_ the user's `onCleanup`: a row's own cleanup already sees its nodes detached. (A direct template's removal is likewise registered after the user's cleanups.)

**Design.** Remove first, then dispose. Clear writes `parent.textContent = ''` and then disposes the rows; full replace (no key reused, the old rows contiguous) creates the new rows as today, removes the old rows' span with one `Range.deleteContents()`, and then disposes them. The renderer's own removal cleanups find their nodes already detached and do no DOM work. Each row's cleanup still sees its own nodes detached, as today, and cleanups still run depth-first in reverse order. The one difference: a row's cleanup no longer sees _later_ rows of the same list still attached, since the whole list leaves at once. No documented behavior covers that, and this design records it.

**Tests.** Cleanups run depth-first in reverse order and see their row detached; an error in one cleanup does not stop the others; clear and replace release listeners, subscriptions, and refs; a list that does not fill its parent (siblings before or after) still removes only its own nodes; a list inside a `<Show>` that is disposed during the clear; portals inside rows (their nodes live elsewhere and are still removed by their own cleanup); disposal before mount cancels mount jobs.

### 3. A `<For>` item's owner doubles as its component's owner

A row like `{(row) => <Row row={row} />}` creates two owners: the item owner (keyed `k<id>`) and the `Row` component owner below it (ordinal 0). The item owner holds nothing else.

**Design.** When the item function returns a plain component descriptor and the item owner is still empty (no child owner, computation, cleanup, or claimed ordinal), the component mounts into the item owner instead of a new one: the owner becomes kind `component` with the component's mount readiness, and its id segment gains the component's `-0` (`k<id>-0` for a string or number key, `<ordinal>-0` otherwise). `createUniqueId` builds ids from these segments, so every id inside the row is the same string as before (`…-k5-0-…`), and the server host, which still creates two owners, produces the same ids. Items that are not a single plain component, or whose function created anything, keep two owners.

**Risk.** The id equality is the contract to protect: a test renders keyed and unkeyed rows that call `createUniqueId` at several depths on the server and on the client and compares them, before and after. Core gains one internal setter for an owner's kind, mount readiness, and key.

**Tests.** The id comparison above; `onMount` and `onCleanup` inside the row component; context lookup from inside a row; error boundaries inside rows; keyed moves; an item function that creates a computed before returning the component (two owners kept); control-flow children (`<Show>` as the item) keep two owners.

### 4. Keyed item and index state without signal closures

A keyed `<For>` creates a `signal` for the item (`by` rows can receive a new object for the same key) and, when read, another for the index. A public `signal()` builds five closures for its API. The renderer only needs to read and write the value.

**Design.** Core exposes internal state helpers (create, read with tracking, write with notification) that `signal()` itself is built on, so the write path is shared rather than duplicated. `<For>` stores the state node on the entry and reads it from `getItem` and `getIndex`. The public `signal()` API, its equality, version limit, and development warnings are unchanged.

**Tests.** Item updates under a stable key re-run only that row's bindings; index updates on moves; equality skips; the kernel guard.

### 5. One teardown per template instance

A template instance registers a cleanup to remove its range; its component registers another for the same range; each delegated event registers a removal closure and keeps a map entry.

**Design.** A direct template instance registers one cleanup that removes its delegated events (found again through the binding paths it already has) and its range, and `mountComponent` skips its own removal when the range belongs to a template that already removes it. Native-listener events and runtime JSX keep today's per-event cleanup. Dispatch, ordering, `currentTarget`, batching, and the root listener's reference counting do not change.

**Tests.** Handler replacement, multiple handlers on one element, bubbling and `stopPropagation`, native and delegated order, shadow roots, disposal removing handlers so a retained element no longer dispatches, the hub removing its root listener after the last handler.

### 6. Owned computations without a `Set`

An owner that owns an effect allocates a `Set` for its computations. Effect and computed nodes can instead link into a list on their owner (two fields on the node), with the same insertion order, O(1) removal when an effect detaches, and disposal in the same order as the `Set`'s iteration.

**Tests.** Disposal order of computations relative to children and cleanups; detaching a dependency-free effect; a computation disposed during its owner's disposal; the kernel guard and kernel benchmark.

### 7. Small items

Internal render effects stop building the disposer closure that `createEffect` returns, since the renderer never calls it (the public `effect` keeps it). `signal()` creates its `readonly` view the first time `.readonly()` is called. Both are invisible to callers.

### Considered and not proposed

- **Pass the index accessor only when the item function declares two parameters** (Solid's approach): a function written with rest parameters or `arguments` would silently receive no index. Not worth the risk for one closure per row.
- **Share `signal` methods through `this`**: `const { set } = count` and `onClick={count.set}` would break. A public behavior change.
- **Promote source-free bindings** (0.3.0 candidate 5): the measured bindings all read signals, so nothing would be removed.
- **Split the owner record** into a lean record and rarely used fields: with candidates 1 and 3, a row has one owner, so the saving is small.

### Measurement and size plan

Each candidate is implemented and measured alone, in rank order, with the RP-7a set: the nine operations interleaved against all four frameworks, the table matrix, retained allocations per row, the CPU categories, and GC for Benos against Solid. A candidate stays only with a repeatable gain and no regression beyond noise; otherwise it is reverted and recorded.

Core + DOM is at 11,515 of 11,520 bytes, so even candidate 1 does not fit. **Decision needed:** raise the core + DOM cap for this track, by 512 B to 12,032 B, with every step reporting its exact bytes beside its measured gain, as the 0.3.0 track did. Core (4,490 of 4,608) likely absorbs candidates 3, 4, 6, and 7 without a change. Hydrate and server bundles are not expected to move; they are reported at each step.

## Record of the 0.3.0 track

**Status (2026-10-11):** P3 direct compiler output is integrated into the standard `safe` optimization, and effect-run owners now materialize lazily. The approved limits are 4,608 bytes for core and 11,264 bytes for core + DOM. Direct numeric slot indexing and direct native templates are retained after behavior tests and production measurements. No public API or documented runtime semantics have changed.

## Goal and measured baseline

Initial rendering is allocation-heavy. The compiled-TSX forced-GC snapshot before event slots retained about 60 function objects, 123 plain JavaScript objects, and 54 arrays per Benos row. The pre-direct safe build with getter slots and numeric template-slot arrays retained about 58 functions, 106 plain objects, and 56 arrays; it recorded 20 owner creations per row. Solid retains about 8 functions, 11 plain objects, and 6 arrays per row, with one root per row. The current direct-output, lazy-run-owner profile is lower and recorded in the latest checkpoint below. DOM wrappers and native layout objects are much closer between frameworks than the JavaScript allocation totals.

The per-row figures are independent categories: an owner is also a plain object. They are retained-object deltas after collection, not total allocation calls. The P1 allocation sampler also includes transient objects that do not survive the snapshot. Those distinctions matter when evaluating changes to garbage-collection time.

| Metric per keyed row        | P1 runtime JSX | Compiled safe before slots | Pre-direct safe output | Direct experiment | Solid | Target |
| --------------------------- | -------------: | -------------------------: | ---------------------: | ----------------: | ----: | -----: |
| Owner creation calls        |              5 |                         20 |                     20 |                 6 |     1 |    ≤ 2 |
| Retained closures/functions |             34 |                         60 |                     58 |                25 |     8 |   ≤ 12 |
| Retained plain objects      |             86 |                        123 |                    106 |                35 |    11 |   ≤ 20 |
| Retained arrays             |             33 |                         54 |                     56 |                 8 |     6 |   ≤ 10 |

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

The ranking reflects the refreshed compiled-path call sites and the approved size headroom. The stable raw-handler refinement was tested under the new cap and reverted: neither two timing runs nor retained-allocation sampling showed a repeatable gain. Ordinary-prop iteration remains reverted. Getter-slot event storage and direct numeric slot indexing are retained. Direct output is now the standard safe compiler path; native/delegated event ordering and error semantics passed the complete browser suite. The sortable-table row also lowers directly with a dynamic mapped-child slot.

| Rank | Candidate                                                    | Measured opportunity per row                                                                                                               | Measured time opportunity                                                                                                                     | Estimated size delta: core / DOM / generated app   | Risk and confidence                                                                           |
| ---: | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
|    1 | Direct compiler DOM operations from shared compiler analysis | Implemented: 58→24 closures, 106→57 objects, 56→16 arrays, 20→8 owner calls, 10→4 effect calls per row versus the pre-direct compiled path | Pre-lazy direct safe output: 1.38× create, 1.43× replace, 1.33× create-10k, 2.08× clear; all nine post-lazy rows are in the latest checkpoint | Current sizes: 4,108 B core / 10,580 B core + DOM  | Kept; shared runtime paths and semantic fixtures pass, with documented conservative fallbacks |
|    2 | Lazy effect-run owners; broader owner elision remains open   | Implemented slice: 8→4 owner calls and 57→53 retained objects per generic row; closure and array counts unchanged                          | 10k-create moved 359.40→328.71 ms, but the ranges overlap; no repeatable timing win claimed                                                   | +59 B core / +72 B core + DOM; current limits pass | Kept for deterministic allocation reduction; row lifetime tests pass                          |
|    3 | Reduce disposal and contiguous DOM removal work              | No retained allocation saving is assumed                                                                                                   | Clear 229.7 ms and replace 254.4 ms disposal spans / 10k                                                                                      | 0 B / estimated −20 to +100 B / 0 B                | High cost measured; traversal/removal split still needed                                      |
|    4 | Fuse keyed For entry and range records                       | About 4 objects / 120 B per keyed row                                                                                                      | Small row setup/disposal effect; expected below main create candidates                                                                        | 0 B / estimated −10 to +30 B / 0 B                 | Medium allocation confidence; timing uncertain                                                |
|    5 | Promote source-free render bindings                          | Could remove an effect and run owner only for bindings with no reads/resources; not included in the table targets                          | No isolated repeated timing gain measured                                                                                                     | estimated +80 to +160 B core + DOM                 | Highest semantic risk; defer until larger wins are measured                                   |
|    6 | Ordinary prop key iteration (reverted)                       | No retained allocation change; temporary key array only                                                                                    | Two trials had overlapping spreads and no repeatable gain                                                                                     | +10 B in the failed prototype                      | Closed; no benefit                                                                            |

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

**Implemented slice:** effect callbacks begin under their stable owner without an empty per-run Owner. The runtime materializes a child `effect-run` owner on the first operation whose lifetime belongs to the run: registering `onCleanup`, creating a child computation or owner, or creating a Provider. Reads and writes alone do not allocate it. A materialized owner is disposed before a genuine rerun, so children and cleanup order remain scoped to that run. Error routing falls back to the stable effect owner when no run owner was needed. A resource-free effect that loses all dependencies still detaches as before.

In the production compiled row profile, effect-run owner creation calls fell from 8 to 4 per row (−4, or 50%). The forced-GC snapshot fell from 57 to 53 retained plain objects per row (−4, 288 B); retained closures stayed at 24 and arrays at 15.993. The allocation call sites attribute 91.8% of retained bytes and 91.5% of retained objects. On the generic 1k create / replace / update / select / swap / remove / 10k create / append / clear trace, medians were respectively 35.50 / 36.74 / 13.54 / 1.27 / 3.99 / 5.04 / 328.71 / 47.81 / 5.35 ms. Against the preceding direct-output run, the 10k-create median moved from 359.40 to 328.71 ms; the ranges overlap at 353–364 ms, so this is encouraging but not yet a repeatable timing claim. Other row changes are within the measured spreads. Full medians and spreads are recorded in [benchmarks/README.md](../../benchmarks/README.md#lazy-effect-run-owners-2026-10-11).

The registry table profile now records 5 owner creations, 10 effects, and 1 signal per row. Its retained delta is 30 closures, 67.19 plain objects, and 40.01 arrays per row; the comparable Solid table records 1 owner/root, 3 effects, and 7 closures, 10.10 objects, and 2.01 arrays. The table still exceeds the ≤2 owner target. This first slice removes empty effect-run scopes from generic rows, but does not elide keyed row owners or merge the table's many render bindings. Its retained call sites account for 92.3% of objects and 91.8% of bytes. See the allocation profile artifact linked in the benchmark record.

This partial implementation keeps the logical owner tree and preserves depth-first disposal, reverse cleanup order, O(1) child unlink, context shadowing and Provider capture, error-boundary selection, effect rerun cleanup, mount eligibility, Portal logical ancestry, and detached `createRoot` behavior. Tests cover resource-free reruns, cleanup-only runs, nested effects and computeds, Provider-created context scopes, subscriber and queue release, cleanup behavior, and effect errors routed to the nearest boundary. No owner or context public API changes were made.

SSR continues to use the same logical owner path and request-end disposal rules from [ssr.md](./ssr.md). The implementation is host-neutral: server mode still suppresses user effects, DOM render effects, and `onMount` while request cleanup remains attached to its owner. Further owner elision is still a separate candidate and must preserve these contracts before implementation.

### 5. Emit direct client DOM operations from shared compiler analysis

Use the compiler's existing template analysis as the shared source of truth, then emit a client-specific function that clones the cached template and binds local node handles directly. It must not allocate a TemplateScope, per-instance slot Map, slot path arrays, setup callback, or one callback for each scope operation. Dynamic bindings can still create normal render effects; this proposal removes the indirection around them, not their reactivity.

The corrected generic js-framework-benchmark and table fixtures both compile through Benos Vite, so the generic operations exercise this path too. At 10,000 table rows, the corrected profile attributes 96.2 ms [82.4–106.1] to template instantiation; retained call-site data identifies `mountTemplate` as the largest single site. The estimated recovery range is a test target only; compare equivalent output and measure again.

Keep the shared host-neutral analysis and template description available to a future server renderer. The DOM emitter is one backend, not the definition of the template. A server compilation target must derive HTML operations from the same analysis without evaluating browser globals; it need not ship DOM node handles or client event installation. This follows the seam in [compiler.md](./compiler.md) and [ssr.md](./ssr.md). Do not freeze a second incompatible template language or change compiler behavior between optimization modes.

**Tests:** run every compiler behavior fixture under optimization none and safe and compare DOM, owner lifetime, effect count, evaluation order, and error routing. Cover static DOM, dynamic text/attributes/properties, component props, lazy children, fragments, spreads, nested control flow, events, refs, SVG/MathML, parser-sensitive markup, and source maps. Add server-host plan-consumption tests when SSR is implemented; until then, assert that the shared analysis remains host-neutral and the compiler's existing readable and tuple forms represent the same plan. Test application gzip size for the gallery and dashboard as well as the core+DOM budget.

**Internal prototype result:** the private environment flag emits direct output
only for supported `<tr>` and `<td>` subtrees. It caches one parsed HTML template
per Document, clones it per mount, emits child/sibling node walks, and reuses a
module-hoisted binder instead of allocating a plan and setup closure per row.
On the generic fixture, its medians were 1.27×, 1.21×, 1.20×, 1.12×, and 1.63×
Solid for create, replace, 10k create, append, and clear. The full sortable table
could not use direct output for its outer row because `columns.map` returns JSX;
direct cell output improved initial mounts by 15–17%, while sort remained within
the measured spread. The generic app bundle changed by −564 B raw / +172 B gzip;
the table app changed by +161 B / +201 B. The DOM package grew 138 B and core
did not change. Direct event bindings use native listeners and the prototype's
text/attribute subset does not cover all renderer prop semantics. Keep this
mode private and disabled by default until direct events preserve delegated
ordering, full compiler fixtures and source maps pass, and the actual sortable
row can use the path without bypassing dynamic children. SSR remains possible
as a separate backend consuming host-neutral JSX analysis; it must never parse
the client template or touch `document`.

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

Implement and measure one candidate at a time. Property-key iteration and stable raw-handler specialization have been measured and reverted. Getter-slot event storage, direct numeric slot indexing, direct compiler DOM output in the standard `safe` mode, and lazy effect-run owners are retained. Remaining candidates are further owner/effect/cleanup allocation beyond the lazy run-owner slice, keyed record fusion, and disposal. Each needs its own trace and allocation profile. The dependency-array candidate is closed as already satisfied.

At each step, rebuild production output, record exact gzip bytes, collect per-row allocations, and run the full interleaved nine-row benchmark with two warmups and seven rounds. Also run table mounts at 5,000 and 10,000 rows, the dashboard filter slice, heap allocation sampling, and GC traces when the candidate should affect them. A change stays only if its improvement repeats and no row regresses beyond measured noise. The current direct-output record and all nine rows are in [benchmarks/README.md](../../benchmarks/README.md#p3-direct-output-in-the-standard-safe-path-2026-10-11).

## Budget decision

The user-approved caps are **4,608 bytes for core** and **11,264 bytes for core + DOM** (minified + gzip). Historical pre-direct measurements were core **4,049 B** and core + DOM **10,199 B**. Direct output measured core **4,049 B** and core + DOM **10,508 B**. The current lazy-run-owner build measures core **4,108 B** and core + DOM **10,580 B**, an increase of **59 B** and **72 B**, respectively, from the direct-output checkpoint. It remains 500 B below the core cap and 684 B below the combined cap. The cap increase is 512 B for core and 1,024 B for core + DOM. Spend it only on changes with repeatable measured gains, and record exact byte deltas beside the gain.

If a prototype exceeds either cap, stop and report the exact byte delta and measured result. Do not cut features or change semantics to fit. Generated application size is a separate measurement from package budgets and must be reported for both the gallery and dashboard when compiler output changes.

## Direct output implementation checkpoint before lazy run owners (2026-10-11)

Safe output now uses cached native template prototypes and direct child paths
for eligible elements. On a production 1,000-row allocation profile it retains
24 closures, 57 plain objects, and 16 arrays per row, compared with 58, 106,
and 56 on the previous compiled-safe path. It records 8 owner calls and 4
effect calls per row; those constructor counts are higher than the runtime-JSX
adapter's 5 and 2, even though direct output reduces retained JS objects
relative to runtime JSX from 145.5 to 98.5 and retained bytes from 4.46 KB to
3.58 KB. The direct path is 1.34× Solid on create, 1.40× on replace, 1.33× on
10k create, and 2.05× on clear. The exact medians, spreads, table baseline,
dashboard slice, bundle sizes, and source artifacts are in
[`benchmarks/README.md`](../../benchmarks/README.md#p3-direct-output-in-the-standard-safe-path-2026-10-11).

The registry table's `columns.map(...)` does not force its outer `<tr>` to a
template plan. Safe mode emits a direct `<tr>` skeleton with a child slot for
the mapped descriptors; each mapped native `<td>` can then use a direct
template too. A compiler regression fixture will lock in this supported shape.

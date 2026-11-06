# RP-7a — Baseline and attribution

**Status:** Phase 7 started on 2026-11-04. The user's words: "Merge, start Phase 7". PR #31 (the Phase 7 and Phase 8 plan) is merged as `dfb132d`; this track runs on `perf/row-creation` in the `benos-row-perf` checkout, branched from it. No framework code changed in this step.

## Delivered

- **[The brief](../row-perf-plan.md)**: goal table, rules, constraints, size caps, steps RP-0 to RP-7d, and the hypotheses below.
- **A fresh baseline on 0.7.1** for all nine operations against Solid, Svelte, Vue, and React, the sortable table matrix, retained allocations per row, CPU attribution by category, and garbage collection for Benos _and_ Solid. Raw data is in `benchmarks/js-framework-benchmark/results/rp-7a-*-2026-11-04.json`.
- **`gc-p1.mjs` works again.** It still served `app-benos`, a build the allocation script stopped producing, so it timed out. It now serves `app-benos-safe` (falling back to `app-benos` for old builds), and `P1_GC_APP` and `P1_GC_TABLE_APP` select other builds; that is how Solid's GC was measured with the same script.

Environment for every table: Node 26.10.0, Chromium 153.0.8010.12, macOS arm64, production builds, two warmups and seven measured rounds, frameworks interleaved. Values are median [min–max] in milliseconds.

## 1. The nine operations

| Operation          | Benos               | Solid               | Svelte              | Vue                 | React               | Benos / Solid | 0.3.0 |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------: | ----: |
| Create 1,000 rows  | 35.7 [34.4–36.1]    | 25.6 [25.2–26.2]    | 28.0 [27.1–28.4]    | 30.0 [29.3–32.2]    | 30.2 [29.7–30.5]    |         1.40× | 1.39× |
| Replace 1,000 rows | 36.4 [35.0–41.4]    | 27.1 [25.6–29.1]    | 27.7 [26.5–32.3]    | 28.5 [26.9–33.8]    | 32.7 [30.9–37.4]    |         1.35× | 1.40× |
| Update every 10th  | 13.3 [13.2–46.3]    | 13.9 [13.9–15.3]    | 13.9 [13.3–14.7]    | 24.6 [19.3–25.0]    | 17.3 [16.4–18.0]    |         0.96× | 0.94× |
| Select one row     | 1.3 [1.3–1.4]       | 0.9 [0.8–0.9]       | 2.0 [1.2–22.4]      | 17.4 [3.9–24.9]     | 5.4 [4.8–18.7]      |         1.48× | 1.44× |
| Swap rows          | 4.0 [3.9–17.1]      | 2.9 [2.8–3.1]       | 4.4 [4.3–4.6]       | 18.7 [14.2–25.1]    | 27.1 [26.3–28.6]    |         1.39× | 1.35× |
| Remove one row     | 5.0 [4.7–21.2]      | 4.4 [4.3–6.7]       | 6.1 [5.8–23.1]      | 25.0 [7.6–27.0]     | 9.5 [9.0–10.4]      |         1.14× | 1.11× |
| Create 10,000 rows | 331.9 [325.2–343.3] | 239.7 [237.9–268.2] | 253.7 [249.0–279.4] | 269.6 [267.0–293.1] | 531.6 [498.6–536.2] |         1.38× | 1.36× |
| Append 1,000 rows  | 44.0 [43.3–45.7]    | 36.0 [35.1–36.3]    | 38.2 [37.2–50.3]    | 41.9 [39.5–48.0]    | 43.5 [43.0–44.7]    |         1.22× | 1.22× |
| Clear rows         | 5.3 [5.2–5.6]       | 2.6 [2.5–2.6]       | 3.4 [3.4–7.3]       | 4.8 [3.6–5.7]       | 4.6 [4.5–8.3]       |         2.06× | 2.07× |

The ratios are the 0.3.0 ratios within noise: async, the router, query, forms, server rendering, and streaming landed without slowing the client, and without closing the gap. Benos is the slowest of the five at creating 1,000 rows and second slowest (ahead of React) at 10,000.

## 2. Sortable table (mount / sort)

| Columns | Rows | Registry                                  | Handwritten Benos                          | Solid                                     | Registry / Solid mount | Handwritten / Solid mount | Registry / Solid sort |
| ------: | ---: | ----------------------------------------- | ------------------------------------------ | ----------------------------------------- | ---------------------: | ------------------------: | --------------------: |
|       2 |   5k | 115.0 [105.1–137.6] / 71.0 [64.8–131.7]   | 122.6 [105.0–228.4] / 66.6 [60.6–91.9]     | 62.8 [56.6–80.1] / 64.5 [56.4–77.5]       |                  1.83× |                     1.95× |                 1.10× |
|       2 |  10k | 245.7 [217.9–297.1] / 146.1 [125.8–178.6] | 239.8 [215.1–295.1] / 152.3 [131.2–303.4]  | 132.2 [120.0–155.0] / 136.0 [126.0–149.7] |                  1.86× |                     1.81× |                 1.07× |
|       3 |   5k | 169.0 [138.1–409.7] / 114.5 [84.7–318.8]  | 160.1 [134.8–204.2] / 96.8 [85.2–108.2]    | 88.2 [73.1–108.9] / 92.8 [76.2–115.8]     |                  1.92× |                     1.82× |                 1.23× |
|       3 |  10k | 309.5 [266.3–320.2] / 197.1 [166.4–231.6] | 346.1 [263.1–389.9] / 192.0 [177.8–477.2]  | 165.4 [144.2–223.9] / 170.4 [157.4–483.9] |                  1.87× |                     2.09× |                 1.16× |
|       5 |   5k | 246.2 [213.1–271.6] / 154.4 [138.8–178.3] | 232.6 [209.0–288.9] / 149.1 [131.1–555.3]  | 133.8 [127.9–154.5] / 132.3 [126.3–159.0] |                  1.84× |                     1.74× |                 1.17× |
|       5 |  10k | 478.8 [423.3–531.0] / 316.0 [276.0–439.9] | 452.3 [405.7–599.3] / 356.1 [265.7–444.1]  | 275.8 [250.5–308.5] / 274.1 [272.2–316.1] |                  1.74× |                     1.64× |                 1.15× |
|       8 |   5k | 388.3 [367.5–694.7] / 292.4 [206.8–370.3] | 364.3 [342.7–463.3] / 238.0 [220.2–425.7]  | 232.1 [196.1–245.7] / 220.1 [206.5–281.1] |                  1.67× |                     1.57× |                 1.33× |
|       8 |  10k | 768.8 [726.1–940.3] / 545.8 [474.5–831.1] | 854.0 [730.5–1217.5] / 614.6 [487.1–859.1] | 496.9 [464.1–588.9] / 524.6 [471.2–770.1] |                  1.55× |                     1.72× |                 1.04× |

Mount is 1.55–1.92× Solid, and handwritten Benos is as slow as the registry component: the gap is in the framework, not in `SortableTable`. Sort is 1.04–1.33×.

## 3. Retained allocations per row

Allocation sampling plus forced-GC heap snapshots, 1,000 rows, production defines, unminified with source maps. JS bytes add plain objects, arrays, closures, strings, numbers, shapes, and code.

| Build                                | Owners | Effects | Signals | Plain objects | Arrays | Closures | DOM wrappers | JS bytes |
| ------------------------------------ | -----: | ------: | ------: | ------------: | -----: | -------: | -----------: | -------: |
| Benos, compiled rows (the benchmark) |      4 |       4 |       1 |          53.0 |   16.0 |     25.0 |         12.0 |    3,452 |
| Solid rows                           |      1 |       3 |       0 |          11.0 |    6.0 |      8.0 |         10.0 |      898 |
| Benos registry table row             |      5 |      10 |       1 |          67.2 |   40.0 |     34.0 |         13.0 |    5,075 |
| Solid table row                      |      1 |       7 |       0 |          24.1 |    6.0 |     12.0 |          9.0 |    1,851 |

A Benos row keeps **3.8× Solid's JavaScript memory** (95.5 objects against 26.5). The registry table row is 2.7×. The 0.3.0 record (44.2 objects, 19 arrays, 19 closures for the table row) used an earlier version of this profile; this run's per-type counts are higher for the table row, so the 7b design re-measures both with this script rather than comparing across versions.

Where a compiled Benos row's 95.5 retained objects come from (allocation sites resolved through source maps):

| Site                                                                     | Objects |  Bytes | What it is                                                                                     |
| ------------------------------------------------------------------------ | ------: | -----: | ---------------------------------------------------------------------------------------------- |
| `mountDirectTemplate`, the bindings callback (`dom/src/index.ts:1635`)   |    25.8 |    656 | per binding: slot records, ranges and their node arrays, cleanup closures, effect functions    |
| `createEffect` (`core/src/runtime.ts:1085`)                              |     6.2 |    443 | effect nodes, their disposer closures, the owner's `computations` set                          |
| allocation trace unavailable                                             |     9.0 |    307 | —                                                                                              |
| `createOwner` (`core/src/runtime.ts:208`)                                |     3.3 |    276 | owner records, about 84 bytes each (20 fields)                                                 |
| `signal` (`core/src/runtime.ts:816`)                                     |     5.6 |    187 | the keyed item's signal: node plus five closures (`read`, `readonly`, `set`, `update`, getter) |
| `installDelegated` (`dom/src/index.ts:608`)                              |     3.8 |    158 | per handler: map entry, getter closure, removal closure                                        |
| `track` (`core/src/runtime.ts:656`)                                      |     3.3 |    158 | dependency edges                                                                               |
| `updateSlot`, `mountDirectTemplate`, `createEntry`, `mountValue`, others |     ~38 | ~1,200 | branch ranges, node arrays, entry closures (`getItem`, `getIndex`), props copies               |

Solid's 26.5 come from computations (5.0), the row function's closures (7.0), `insert` (4.0), and `readSignal` (4.0).

## 4. DOM per row

Measured in Chromium after creating 1,000 rows:

| Build | Nodes per row | Comment markers per row | Row markup                                                                                                             |
| ----- | ------------: | ----------------------: | ---------------------------------------------------------------------------------------------------------------------- |
| Benos |            12 |                       2 | `<tr class=""><td>1<!----></td><td><a>easy white desk<!----></a></td><td><button …>remove</button></td><td></td></tr>` |
| Solid |            10 |                       0 | `<tr class=""><td>1</td><td><a>easy white desk</a></td><td><button …>remove</button></td><td></td></tr>`               |

Each dynamic text keeps a comment marker after its text node.

## 5. Where creation and clear time goes

**CPU by category.** Temporary `performance.mark` pairs around each category in an unminified production build; exclusive medians in milliseconds with median call counts. The marks add their own cost, so these attribute time, they do not add up to the trace times above.

| Category        |   Create 1k |   Replace 1k |    Clear 1k |   Create 10k |    Replace 10k |     Clear 10k | Table 5k mount | Table 10k mount |
| --------------- | ----------: | -----------: | ----------: | -----------: | -------------: | ------------: | -------------: | --------------: |
| Binding setup   | 10.5 (7000) |   8.7 (7000) |     0.0 (2) | 83.1 (70000) |   82.1 (70000) |       0.1 (2) |   67.6 (60048) |  134.3 (120048) |
| Owner creation  |  0.7 (4000) |   0.5 (4000) |     0.0 (1) |  5.8 (40000) |    4.4 (40000) |       0.0 (1) |    4.5 (25021) |     7.8 (50021) |
| Signal creation |  0.3 (1000) |   0.4 (1000) |           — |  4.5 (10000) |    5.2 (10000) |             — |     3.2 (5004) |     3.8 (10004) |
| Effect creation |  1.0 (4000) |   0.7 (4000) |           — |  8.3 (40000) |    6.0 (40000) |             — |   10.6 (50019) |   23.8 (100019) |
| Event setup     |  0.7 (2000) |   0.6 (2000) |           — |  9.0 (20000) |    5.8 (20000) |             — |        0.1 (3) |         0.0 (3) |
| DOM insertion   |  2.5 (4000) |   2.2 (4000) |     0.0 (1) | 23.6 (40000) |   25.2 (40000) |       0.0 (1) |   13.6 (40023) |    27.8 (80023) |
| Disposal        |  0.4 (2004) | 10.5 (17001) | 8.6 (15002) |  2.8 (20004) | 103.6 (170001) | 86.9 (150002) |    2.5 (20014) |     4.1 (40014) |

**Garbage collection, Benos against Solid.** The same Chromium GC trace for both (`gc-p1.mjs`), main-thread median in milliseconds:

| Workload        | Benos GC | Solid GC | Difference | Whole gap in the trace times |
| --------------- | -------: | -------: | ---------: | ---------------------------: |
| Create 1k       |      2.0 |      1.1 |        0.9 |                         10.1 |
| Replace 1k      |      1.9 |      0.5 |        1.4 |                          9.3 |
| Clear 1k        |      0.7 |      0.0 |        0.7 |                          2.7 |
| Create 10k      |    135.6 |     39.1 |       96.5 |                         92.2 |
| Replace 10k     |    375.7 |      2.7 |      373.0 |                            — |
| Table mount 10k |    315.6 |     46.6 |      269.0 |          144 (three columns) |

The GC trace runs the unminified profiling build under tracing, which collects more than the minified benchmark build, so its differences are an upper bound rather than a share of the trace times. Even so, at 10,000 rows **extra garbage collection is the dominant part of the gap**: create 10k pays up to 96.5 ms more GC against a 92 ms gap, and the three-column 10,000-row table mount up to 269 ms more against a 144 ms gap. Solid's GC stays small in every workload. At 1,000 rows GC is about a millisecond of a 10 ms gap; there the gap is CPU in binding setup. Both point at the same cause: what each row allocates.

## 6. Hypotheses

| Hypothesis                                     | Verdict                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settled bindings keep reactive state           | Ruled out as stated        | The benchmark's four bindings all read the row signal or `selected`, so none settle, and `detachDependencyFreeEffect` already drops settled ones. The cost is what _every_ binding allocates, below.                                                                                                                                                                                           |
| Owner per row                                  | Supported                  | Four owners per row against Solid's one: the `<For>` entry, the `Row` component, and one branch owner per dynamic text. Each owner is a 20-field record, and an owner with effects also allocates a `Set` for them.                                                                                                                                                                            |
| Slot location                                  | Supported, reformulated    | Locating nodes by path is cheap. The cost is the slot itself: a dynamic text allocates a comment marker, a `Slot` record, a range with its node array, a cleanup closure, an effect, and a branch owner with its own range, where Solid creates a text node and one computation. This is the largest allocation site (25.8 objects per row) and the binding-setup time (10.5 ms of create 1k). |
| Event records                                  | Supported, smaller         | Each delegated handler is a getter closure, a map entry keyed by element, a removal closure, and a cleanup entry (3.8 objects per row from `installDelegated`, plus cleanups). Solid stores the handler on the element and registers no cleanup.                                                                                                                                               |
| Disposal                                       | Supported                  | Clear makes 15 disposal calls per row. The fast clear path disposes every row's owner _before_ `parent.textContent = ''`, so each row's cleanup first removes its own nodes one at a time, and the bulk clear finds little left to do. Replace pays the same on the old rows (17 calls per row).                                                                                               |
| Garbage collection                             | Supported, dominant at 10k | Section 5: the extra GC matches or exceeds the gap at 10,000 rows and the 10,000-row table mount (an upper bound, from the profiling build).                                                                                                                                                                                                                                                   |
| _New:_ signal creation allocates five closures | Supported, small           | Every keyed row creates one signal for its item (`by` rows can receive a new object for the same key). `signal()` allocates `read`, `readonly`, `set`, `update`, and the `readonly` getter eagerly, plus a node and a `WeakMap` entry: 5.6 objects per row.                                                                                                                                    |

## 7. What this points to for 7b

Not a design yet; the order the evidence suggests, for the design checkpoint to cost and rank:

1. **Text bindings without a branch.** A dynamic text whose value is a string or number creates one text node and one effect: no comment marker, no branch owner, no range. It becomes a branch only when the value turns into nodes. The server output and hydration markers are untouched (the server already skips the branch owner for primitive slots since 0.7.0); the design must show how a hydrated slot and a client-created slot behave the same afterward.
2. **Fewer owners per row.** The `<For>` entry and a component mounted directly as its only child could share one owner, and an owner could allocate its `computations` set only when an effect outlives its first run.
3. **Disposal that does not touch the DOM per row** when the parent is cleared in bulk: dispose without each cleanup removing its own nodes, then clear once.
4. **Leaner bindings and events.** Per-binding records without separate range objects and node arrays; delegated handlers stored on the element instead of in a map with removal closures.
5. **Cheaper `signal()`**: create `readonly` lazily, and share the rest without a closure per method where the public API allows it.

Expected effect: items 1 and 2 remove about half of a row's retained objects, which is where the 10,000-row GC and the 1,000-row binding time come from; item 3 targets clear's 2.06×. Each costs bytes against a core + DOM cap with 5 bytes left, so 7b will price each one.

## 8. Sizes

Unchanged; no framework code changed: core 4,490 / 4,608; core + DOM 11,515 / 11,520; hydrate 3,962 / 4,096; server 7,668 / 8,448.

## Checks run

`pnpm build`, the benchmark runs above, and Prettier and ESLint on the changed files. The test suites were not run: only a benchmark script and documents changed.

## Next

On approval: RP-7b, the design. Write the candidates into `docs/architecture/performance.md` with each one's byte cost, semantic risk, effect on hydration and the server output, and test plan, and stop for review before implementing anything.

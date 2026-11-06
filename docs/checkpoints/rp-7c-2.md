# RP-7c-2 — Bulk removal on clear and full replace

**Status:** RP-7c-1 was approved on 2026-11-04. The user's words: "Approve, start 7c-2". This is candidate 2 of the [design](../architecture/performance.md#2-bulk-dom-removal-on-clear-and-full-replace). Committed locally on `perf/row-creation`; nothing is pushed.

## Delivered

- **Bulk removal** in `mountFor` (`packages/dom/src/index.ts`). When a reconcile keeps none of the old rows (a clear, or a replace that reuses no key), the old rows leave the DOM in one `Range.deleteContents()` and are disposed after it. The Range is used only when the old rows' first node shares a parent with the node after them and their last node sits right before it (the first new row, or the list's marker). Otherwise, as for a row whose node list went stale, the rows are removed one by one as before. The per-row removal still runs after disposal in every case; when the Range already took the rows, it finds nothing to do.
- **A finding that changed the design: the fast clear path never ran in the compiled benchmark.** It required the list to fill its parent. A compiled `<tbody>{list}</tbody>` ends with the list's own marker _and_ the template's placeholder for that child, so the check always failed and clear went row by row. (RP-7a described that path as the one clear took; that was true of runtime JSX only.) Instead of reordering the path, I removed it. Every clear now takes the bulk path above. That costs 62 B less than keeping it, and in runtime JSX it was not saving anything either: it disposed first, so each row had already removed itself before `textContent = ''` ran.
- **An O(n²) step removed from replace.** The old-row loop tested `!used.has(entry) && !next.includes(entry)`. An old entry is in `next` only if it is in `used`, so `includes` was always false, and it scanned the new list once per removed row: about a million comparisons on a 1,000-row replace. It is now `!used.has(entry)`.
- **Tests (five new).**
  - A runtime list between sibling elements, fully replaced and then cleared. It checks the cleanup order (child components first, each owner's cleanups in reverse), that each row's cleanup sees its row detached, and that the siblings stay. It also checks that the old rows' listeners and subscriptions are released (re-attached old rows ignore clicks, and a signal they read no longer re-runs them) and that `Range.deleteContents` ran once per operation.
  - Rows with a `<Portal>` inside: portal content leaves with the row, and rows replaced before their detached host is attached never run `onMount`.
  - A list inside a `<Show>` that closes in the same batch as the clear: each row is cleaned up once.
  - A row cleanup that throws inside an `ErrorBoundary`: every other row's cleanup still runs.
  - Compiled rows (`<table><tbody><For>…`) replaced and cleared in `none` and `safe`: identical DOM at every step, cleanups in order, listeners released, and the bulk path taken twice in `safe`.

  Every assertion except the two bulk-path counts also passes against the 7c-1 code, so what rows observe is unchanged. The one difference the design recorded remains: a row's cleanup no longer sees _later_ rows of the same list still attached.

## Size

| Bundle                 | 7c-1   | 7c-2   | Cap    |
| ---------------------- | ------ | ------ | ------ |
| `@benosjs/core`        | 4,490  | 4,490  | 4,608  |
| `@benosjs/core` + DOM  | 11,587 | 11,610 | 12,032 |
| `@benosjs/dom/hydrate` | 3,962  | 3,962  | 4,096  |
| `@benosjs/server`      | 7,688  | 7,688  | 8,448  |

+23 B on core + DOM (the design estimated 20–50). Keeping the old fast path, reordered, measured +85 B.

## Measurements

Same machine, protocol, and scripts as [RP-7a](./rp-7a.md): Node 26.10.0, Chromium 153, macOS arm64, production builds; median [min–max] ms. Raw data in `benchmarks/js-framework-benchmark/results/rp-7c-2-*-2026-11-04.json`.

### Why the gain is modest: what removal itself costs

Before writing the change, I measured removal alone in Chromium: benchmark-shaped rows in a `<tbody>` with two trailing comments, nine rounds each, timed through a forced layout.

| Rows   | One `removeChild` per row | One `Range.deleteContents()` | `textContent = ''` |
| ------ | ------------------------- | ---------------------------- | ------------------ |
| 1,000  | 1.9 [1.7–2.3]             | 1.6 [1.5–2.8]                | 1.5 [1.4–1.8]      |
| 10,000 | 16.7 [15.8–18.5]          | 17.8 [16.4–26.5]             | 16.4 [15.4–21.4]   |

The browser's removal work is about the same whichever way it is asked for. What bulk removal saves is the JavaScript around it: the per-row removal calls inside each row's cleanups. Most of clear's remaining gap to Solid is disposal JavaScript, which candidates 3, 5, and 6 target.

### Interleaved A/B: 7c-1 against 7c-2

The full run below was noisy: append moved for every framework, and the table mount moved, on code this step does not touch. So I also ran the 7c-1 and 7c-2 builds side by side in the same rounds, with Solid: two warmups, eleven interleaved rounds, on the three operations that matter. Create is the control; its code path did not change.

| Operation          | Benos 7c-1       | Benos 7c-2       | Solid            | 7c-1 / Solid | 7c-2 / Solid |
| ------------------ | ---------------- | ---------------- | ---------------- | -----------: | -----------: |
| Create 1,000 rows  | 35.2 [33.6–36.3] | 35.1 [33.4–37.9] | 25.6 [25.2–30.3] |        1.38× |        1.37× |
| Replace 1,000 rows | 35.2 [34.6–38.2] | 34.2 [33.9–36.0] | 25.7 [24.7–27.0] |        1.37× |        1.33× |
| Clear rows         | 4.6 [2.3–5.3]    | 4.0 [1.9–5.0]    | 2.6 [2.5–3.0]    |        1.76× |        1.52× |

The control is flat (35.2 vs 35.1). Replace is about 1 ms faster: 8 of 11 7c-2 samples fall at 33.9–34.3 ms, most 7c-1 samples at 34.6–35.3. Clear is about 0.6 ms faster: 9 of 11 7c-2 samples are 3.9–4.0 ms, against 4.5–4.9 for 7c-1. (Each build has one or two clear samples near 2 ms in both runs, where the trace caught less of the paint.)

### The nine operations (full run)

| Operation          | Benos 7c-1          | Benos 7c-2          | Solid               | Svelte              | Vue                 | React               | 7c-1 / Solid | 7c-2 / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | -----------: | -----------: |
| Create 1,000 rows  | 33.9 [32.8–34.2]    | 33.0 [32.5–35.3]    | 24.9 [24.6–27.3]    | 27.4 [27.2–31.1]    | 29.4 [29.1–33.7]    | 29.6 [29.4–32.8]    |        1.37× |        1.33× |
| Replace 1,000 rows | 34.5 [33.8–35.2]    | 33.8 [33.2–34.4]    | 25.4 [25.2–26.3]    | 27.1 [26.6–27.3]    | 27.0 [26.3–30.3]    | 31.2 [30.4–36.1]    |        1.36× |        1.33× |
| Update every 10th  | 12.8 [12.6–13.1]    | 12.7 [12.4–12.9]    | 13.7 [13.4–14.5]    | 13.3 [13.0–19.8]    | 23.4 [21.2–27.8]    | 17.8 [16.5–19.5]    |        0.93× |        0.92× |
| Select one row     | 1.1 [1.0–1.1]       | 1.2 [1.1–1.2]       | 0.9 [0.8–1.0]       | 1.3 [1.2–25.3]      | 24.2 [17.6–25.5]    | 6.0 [4.6–6.9]       |        1.32× |        1.37× |
| Swap rows          | 3.7 [3.6–4.2]       | 3.8 [3.6–4.0]       | 2.9 [2.8–3.0]       | 22.6 [4.3–23.3]     | 19.4 [18.1–25.5]    | 27.9 [26.2–28.8]    |        1.35× |        1.32× |
| Remove one row     | 4.6 [4.6–5.3]       | 4.7 [4.5–5.0]       | 4.2 [4.2–4.8]       | 8.7 [5.8–23.2]      | 24.4 [7.8–25.2]     | 9.3 [9.0–17.3]      |        1.07× |        1.11× |
| Create 10,000 rows | 314.5 [310.3–319.1] | 320.1 [308.8–333.3] | 237.5 [235.0–280.4] | 248.9 [244.0–266.7] | 269.0 [265.9–277.3] | 531.8 [504.8–572.5] |        1.33× |        1.35× |
| Append 1,000 rows  | 42.1 [41.9–45.1]    | 47.3 [46.6–53.3]    | 38.1 [35.4–50.5]    | 50.1 [39.1–59.5]    | 51.7 [49.1–60.6]    | 46.0 [44.6–63.4]    |        1.19× |        1.24× |
| Clear rows         | 4.4 [4.3–4.8]       | 4.0 [3.8–4.5]       | 2.6 [2.6–9.3]       | 3.4 [3.3–7.3]       | 3.7 [2.3–5.9]       | 4.8 [4.6–10.7]      |        1.77× |        1.55× |

Clear and replace match the A/B. Append is slower for every framework in this run (Solid 35.4 → 38.1, Svelte 37.0 → 50.1, Vue 41.1 → 51.7), and its Benos code path is unchanged (it keeps every old row), so I read that row as noise from this run, not a regression. Create, update, select, swap, remove, and create 10k moved within their spreads; none of them run the changed code.

### Sortable table mount

This step runs no new code on a mount from empty: one call that returns at once. Yet the full run and a standalone rerun both put the registry table 10–20% above the 7c-1 run in the 2- and 3-column cells (2 columns, 5k rows: 109.1 in 7c-1, 120.5 and 119.7 now), while Solid's cells held (63.1, 65.4, 63.1). So I ran the 7c-1 and 7c-2 builds of both Benos tables side by side in the same rounds (the harness's own protocol: two warmups, seven rounds, order reversed every round):

| Columns | Rows | Registry 7c-1        | Registry 7c-2       | Handwritten 7c-1    | Handwritten 7c-2     | Solid               | Registry 7c-1 / Solid | Registry 7c-2 / Solid |
| ------: | ---: | -------------------- | ------------------- | ------------------- | -------------------- | ------------------- | --------------------: | --------------------: |
|       2 |   5k | 124.5 [113.4–159.0]  | 113.3 [109.1–206.6] | 114.9 [99.9–161.3]  | 118.5 [107.8–176.1]  | 63.7 [60.5–81.1]    |                 1.95× |                 1.78× |
|       2 |  10k | 259.5 [217.6–353.1]  | 251.0 [210.3–331.7] | 237.0 [211.4–256.0] | 267.0 [218.1–327.6]  | 136.4 [121.0–205.3] |                 1.90× |                 1.84× |
|       3 |   5k | 140.5 [127.0–242.2]  | 155.7 [132.6–164.9] | 152.6 [134.2–195.8] | 154.0 [133.1–181.2]  | 87.8 [74.2–93.2]    |                 1.60× |                 1.77× |
|       3 |  10k | 329.3 [305.9–379.5]  | 311.2 [292.7–385.0] | 316.3 [270.9–457.9] | 288.8 [264.8–363.9]  | 179.0 [162.3–197.5] |                 1.84× |                 1.74× |
|       5 |   5k | 242.3 [205.9–281.5]  | 243.7 [206.5–311.3] | 244.8 [218.2–427.9] | 232.8 [224.5–297.9]  | 157.2 [135.7–179.7] |                 1.54× |                 1.55× |
|       5 |  10k | 522.1 [458.9–970.3]  | 537.5 [425.8–610.2] | 481.1 [435.4–627.8] | 512.9 [445.4–745.6]  | 303.5 [292.8–324.7] |                 1.72× |                 1.77× |
|       8 |   5k | 393.3 [354.9–470.5]  | 398.2 [381.7–585.2] | 377.5 [339.2–574.3] | 374.1 [356.3–521.8]  | 267.6 [248.4–759.8] |                 1.47× |                 1.49× |
|       8 |  10k | 869.4 [729.2–1002.9] | 872.1 [736.8–941.0] | 859.0 [761.1–983.7] | 898.5 [749.8–1033.6] | 562.9 [488.5–662.3] |                 1.54× |                 1.55× |

Side by side there is no difference: across the eight cells the geometric mean of 7c-2 / 7c-1 is 0.996 for the registry table and 1.015 for the handwritten one, and 7c-2 is faster in 6 of 16 pairs. The 7c-1 build itself measured 124.5 ms at 2 columns and 5k rows here, against 109.1 in the morning's 7c-1 run. So the earlier gap was between runs, not between builds. That the shift hit Benos and not Solid fits Benos's much larger collection on this mount (211 against 47 ms at 10k rows), though I have not measured that link directly. The separate runs are kept as `rp-7c-2-table-2026-11-04.json` and `rp-7c-2-table-rerun-2026-11-04.json`, and the side-by-side run as `rp-7c-2-table-ab-2026-11-04.json`. The lesson for the next steps is to compare builds side by side whenever a run disagrees with an earlier one.

### Retained allocations per row

Unchanged, as expected: this step removes work at teardown, not records. Benchmark row 73.5 retained objects (2,711 B; 7c-1 2,712 B), 2 owners; registry table row 112.8 (7c-1 112.9), 2 owners.

### Garbage collection (main thread, profiling build)

| Workload        | Benos 7c-1          | Benos 7c-2          | Solid |
| --------------- | ------------------- | ------------------- | ----: |
| Create 1k       | 1.9 [1.9–2.0]       | 2.0 [1.9–2.1]       |   1.1 |
| Replace 1k      | 1.7 [1.7–1.8]       | 2.0 [1.9–2.4]       |   0.5 |
| Clear 1k        | 0.0                 | 0.0                 |   0.0 |
| Create 10k      | 103.9 [97.3–105.7]  | 107.2 [103.3–122.2] |  39.1 |
| Replace 10k     | 18.3 [7.6–30.3]     | 41.7 [18.4–254.4]   |   2.7 |
| Table mount 5k  | 90.3 [88.1–105.6]   | 92.6 [88.5–106.0]   |   3.7 |
| Table mount 10k | 211.1 [208.6–225.1] | 290.1 [223.6–488.4] |  46.6 |

Allocation per row did not change, and only replace and clear run the new code. Replace 1k collected 0.3 ms more. I don't have an explanation for that beyond collection timing, and the end-to-end replace is still 1 ms faster in the A/B. Replace 10k and table mount 10k have spreads up to 254 and 488 ms, so their medians are not a reliable comparison; the table mount runs no changed code.

### CPU by category (instrumented build)

| Workload    | Disposal 7c-1 (calls) | Disposal 7c-2 (calls) |
| ----------- | --------------------- | --------------------- |
| Clear 1k    | 5.5 (5,002)           | 2.6 (4,002)           |
| Clear 10k   | 47.2 (50,002)         | 20.8 (40,002)         |
| Replace 1k  | 5.2 (5,001)           | 1.8 (4,001)           |
| Replace 10k | 48.6 (50,001)         | 19.3 (40,001)         |

One fewer disposal-category call per row: the row's `removeChild`. These numbers overstate the gain. The instrumented build wraps `removeChild` in this category, but `Range.deleteContents()` is not wrapped, so the removal that moved into the Range left the category without being counted elsewhere, and the wrapper's own overhead left with it. The end-to-end trace times above are the measure; this table shows where the per-row work went.

## Found, not changed

**`onMount` never runs for a component that returns an array containing a `<Portal>` into a detached host.** For example, `return [<p/>, <Portal mount={target}>…</Portal>]`, rendered into a host that is attached later, in or out of a `<For>`. Element-only, array-only, and portal-only outputs all mount correctly. The likely cause: an array's range copies its children's node lists when it mounts, and the Portal then moves its placeholder into the target, so the copy keeps a node that is never attached and the mount check never passes. This predates this step and is outside Phase 7; it would need its own fix and test.

## Checks run

| Check                                                                       | Result                             |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `pnpm test`                                                                 | 56 files, 580 tests passed (5 new) |
| `pnpm test:browser` (Chromium, Firefox, WebKit)                             | 534 passed                         |
| `pnpm lint`, `typecheck:types`, `check:doc-examples` (54 files, both modes) | Passed                             |
| `pnpm size`                                                                 | All within caps (table above)      |

The existing tests passed unchanged; the only test edits are the five additions.

## Assessment

Candidate 2 is kept: +23 B for a repeatable gain on the two operations it targets, with clear 1.76 → 1.52× and replace 1.37 → 1.33× Solid in the interleaved run. As the micro-benchmark predicted, the gain is modest: the browser's removal work is the same either way, and what remains of clear's gap is disposal JavaScript. After candidates 1 and 2, creation is still about 1.33–1.37× Solid. Candidates 3 and 4 remove the next per-row records (an owner, and the item signal's closures), and 3, 5, and 6 also shorten disposal.

## Next

On approval: RP-7c-3, a `<For>` item's owner doubling as its component's owner (candidate 3). It adds the internal core setter approved at RP-7b, and its id-equality test is written and run first. The marker question from RP-7c-1 is still open.

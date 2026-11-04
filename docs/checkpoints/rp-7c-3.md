# RP-7c-3 — A list item's owner doubles as its component's owner

**Status:** RP-7c-2 was approved on 2026-11-04. The user's words: "Approve, start 7c-3". This is candidate 3 of the [design](../architecture/performance.md#3-a-for-items-owner-doubles-as-its-components-owner). Committed locally on `perf/row-creation`; nothing is pushed.

## Delivered

- **One owner per row** for a row like `{(row) => <Row row={row} />}`. When the item function returns a plain component descriptor and has created nothing in the item's owner (no child owner, computation, cleanup, context, mount job, or claimed ordinal), the component mounts into that owner instead of a new one. The owner becomes kind `component` with the component's mount readiness, and its id segment gains the `-0` the component's owner would have had (`k5` → `k5-0`, or `<ordinal>-0` without a string or number key). Item functions that created anything keep two owners, and so do controls returned as the item (`<Show>`, `<Switch>`, `<ErrorBoundary>`, …) and internal controls. The server host is not changed; it still creates two owners and produces the same ids.
- **One change from the design: no new setter.** The design added an internal core setter for the owner's kind, mount readiness, and key. Instead, the existing internal `createInternalOwner` takes one more argument, `reuse`. With it, the call returns the current owner, converted, when that owner is still empty, and otherwise creates a child as before. A setter needed its own entry in core's internal registry, whose property names survive minification. Measured: the setter version was +54 B core and +92 B core + DOM; this version is +50 and +77.
- **The id test ran before the change**, as the design required. A hydration test server-renders five lists in which every row calls `createUniqueId` at three depths: in the row component, in a child component, and inside a `<Show>` in the row. The lists are keyed by number, keyed by string, an item function that registers a cleanup (two owners kept), and `<Show>` as the item (two owners kept). The test requires hydration to produce exactly the server's 18 ids. It passed on the 7c-2 code and passes now. A temporary counter confirmed that hydration really took the shared path for the keyed and unkeyed rows (`k1-0`, `k2-0`, `kx-0`, `ky-0`) and not for the other two. Separately, I saved all 24 server and hydration ids of a variant that adds rows keyed by object identity before the change, and compared them after it: identical, in the same order.
- **Tests (four new).**
  - The id test above.
  - `onMount` and `onCleanup` in a row component, and context lookup from a row, through keyed moves, removal, insertion, and disposal.
  - A computed that an item function creates before returning its component: it keeps updating the row and is disposed with it.
  - Errors from a row, caught by an `ErrorBoundary` inside the row and by one around the list.

  All four pass against the 7c-2 code too, so they pin behavior that was already true.

## Size

| Bundle                 | 7c-2   | 7c-3   | Cap    |
| ---------------------- | ------ | ------ | ------ |
| `@benosjs/core`        | 4,490  | 4,540  | 4,608  |
| `@benosjs/core` + DOM  | 11,610 | 11,687 | 12,032 |
| `@benosjs/dom/hydrate` | 3,962  | 3,962  | 4,096  |
| `@benosjs/server`      | 7,688  | 7,688  | 8,448  |

+77 B on core + DOM (the design estimated 55–110), +50 of it in core (estimated 15–30). Core has 68 B left under its own cap. Candidates 4, 6, and 7 were estimated at +55 to +125 B of core together, so the core cap will likely be a decision at candidate 6.

## Measurements

Same machine, protocol, and scripts as [RP-7a](./rp-7a.md): Node 26.10.0, Chromium 153, macOS arm64, production builds; median [min–max] ms. Raw data in `benchmarks/js-framework-benchmark/results/rp-7c-3-*-2026-11-04.json`.

### Interleaved A/B: 7c-2 against 7c-3

Saved 7c-2 builds ran in the same rounds as 7c-3 and Solid: two warmups and eleven interleaved rounds, on all nine operations.

| Operation          | Benos 7c-2          | Benos 7c-3          | Solid               | 7c-2 / Solid | 7c-3 / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | -----------: | -----------: |
| Create 1,000 rows  | 33.5 [32.4–34.0]    | 32.5 [32.3–34.1]    | 24.6 [24.3–25.7]    |        1.36× |        1.32× |
| Replace 1,000 rows | 33.0 [32.8–33.3]    | 33.0 [32.8–33.3]    | 25.2 [24.9–25.9]    |        1.31× |        1.31× |
| Update every 10th  | 12.5 [12.3–21.8]    | 12.5 [12.4–13.9]    | 13.4 [13.3–14.1]    |        0.93× |        0.93× |
| Select one row     | 1.1 [1.0–23.2]      | 1.1 [1.0–15.0]      | 0.8 [0.8–0.9]       |        1.31× |        1.29× |
| Swap rows          | 3.6 [3.5–3.7]       | 3.6 [3.5–4.2]       | 2.8 [2.7–2.9]       |        1.32× |        1.33× |
| Remove one row     | 4.5 [4.5–4.7]       | 4.5 [4.5–4.7]       | 4.2 [4.2–4.3]       |        1.07× |        1.08× |
| Create 10,000 rows | 306.3 [303.4–313.0] | 305.4 [303.2–322.0] | 234.4 [233.5–237.6] |        1.31× |        1.30× |
| Append 1,000 rows  | 41.9 [41.7–42.2]    | 41.9 [41.6–42.8]    | 35.0 [34.6–37.0]    |        1.20× |        1.20× |
| Clear rows         | 3.9 [3.8–3.9]       | 3.7 [3.7–3.9]       | 2.5 [2.5–2.6]       |        1.52× |        1.48× |

- **Clear** is about 0.2 ms faster, and consistently so: 7c-2's eleven samples are all 3.8–3.9 ms, while 8 of 7c-3's are 3.7–3.8.
- **Create 1,000 rows** has a median 1 ms lower, but I don't count it as established. Both builds' samples fall in two clusters, about 32.4 and about 33.6 ms. 7c-3 landed in the lower one 8 times of 11 and 7c-2 4 times, and with eleven samples that split is not conclusive.
- Everything else is unchanged within the spreads, including create 10,000 rows.

### The nine operations (full run)

| Operation          | Benos 7c-2          | Benos 7c-3          | Solid               | Svelte              | Vue                 | React               | 7c-2 / Solid | 7c-3 / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | -----------: | -----------: |
| Create 1,000 rows  | 33.0 [32.5–35.3]    | 32.8 [32.5–33.9]    | 24.6 [24.5–24.7]    | 27.1 [26.1–28.1]    | 29.3 [28.2–30.0]    | 29.9 [29.4–30.4]    |        1.33× |        1.34× |
| Replace 1,000 rows | 33.8 [33.2–34.4]    | 33.1 [32.8–33.5]    | 25.4 [25.1–27.2]    | 27.0 [26.9–27.6]    | 27.4 [26.4–29.1]    | 30.8 [30.3–31.5]    |        1.33× |        1.30× |
| Update every 10th  | 12.7 [12.4–12.9]    | 12.6 [12.4–12.8]    | 13.5 [13.3–13.7]    | 13.0 [12.9–13.2]    | 22.2 [20.8–24.2]    | 17.2 [16.8–17.6]    |        0.92× |        0.93× |
| Select one row     | 1.2 [1.1–1.2]       | 1.1 [1.0–1.2]       | 0.8 [0.8–0.8]       | 1.3 [1.3–21.8]      | 19.9 [18.1–23.4]    | 8.4 [5.8–8.8]       |        1.37× |        1.30× |
| Swap rows          | 3.8 [3.6–4.0]       | 3.6 [3.6–3.7]       | 2.8 [2.7–2.8]       | 4.2 [4.1–4.3]       | 20.4 [20.2–24.7]    | 26.0 [25.8–27.0]    |        1.32× |        1.30× |
| Remove one row     | 4.7 [4.5–5.0]       | 4.5 [4.5–4.6]       | 4.2 [4.1–4.3]       | 5.7 [5.7–22.3]      | 24.0 [19.1–25.4]    | 10.0 [9.5–11.0]     |        1.11× |        1.07× |
| Create 10,000 rows | 320.1 [308.8–333.3] | 305.2 [301.9–308.7] | 234.8 [234.5–238.6] | 245.6 [244.7–252.4] | 261.8 [261.1–263.3] | 503.7 [494.4–549.5] |        1.35× |        1.30× |
| Append 1,000 rows  | 47.3 [46.6–53.3]    | 41.8 [41.6–42.2]    | 35.1 [34.8–35.3]    | 36.6 [36.3–37.6]    | 40.9 [40.7–42.1]    | 42.4 [40.1–42.8]    |        1.24× |        1.19× |
| Clear rows         | 4.0 [3.8–4.5]       | 3.8 [3.7–3.8]       | 2.5 [2.5–2.6]       | 3.3 [3.2–3.4]       | 3.5 [3.4–5.9]       | 4.5 [4.4–7.1]       |        1.55× |        1.50× |

This run was quiet: Solid, Svelte, and Vue all ran at or below their 7c-2 times. The 7c-2 column comes from that step's noisy run (see RP-7c-2), so the A/B above is the comparison to use; create 10,000 and append differ here only because 7c-2's run was slow.

### Sortable table mount (interleaved A/B)

Both table versions write their row inline, `(row) => <tr>…</tr>`, not as a component, so candidate 3 does not apply to them. The A/B confirms no change: the geometric mean of 7c-3 / 7c-2 over the eight cells is 0.988 for the registry table and 0.986 for the handwritten one, with individual cells moving both ways within their spreads.

| Columns | Rows | Registry 7c-2        | Registry 7c-3       | Handwritten 7c-2     | Handwritten 7c-3    | Solid               |
| ------: | ---: | -------------------- | ------------------- | -------------------- | ------------------- | ------------------- |
|       2 |   5k | 105.6 [90.9–125.2]   | 112.0 [97.2–146.6]  | 107.8 [96.2–126.8]   | 102.0 [97.9–117.4]  | 62.9 [60.3–70.8]    |
|       2 |  10k | 221.0 [187.2–263.1]  | 230.2 [198.2–310.4] | 215.0 [191.5–334.2]  | 217.2 [191.4–397.8] | 133.1 [107.4–143.7] |
|       3 |   5k | 153.2 [117.0–231.8]  | 131.7 [119.9–167.5] | 122.0 [116.7–160.9]  | 125.3 [119.2–215.5] | 77.5 [73.0–110.0]   |
|       3 |  10k | 256.7 [244.1–351.8]  | 272.4 [244.1–352.1] | 273.2 [245.1–350.0]  | 257.9 [244.6–489.6] | 149.5 [144.5–201.6] |
|       5 |   5k | 213.5 [205.6–326.3]  | 214.0 [204.3–444.6] | 223.1 [197.9–279.2]  | 218.0 [201.3–364.9] | 130.7 [120.7–183.1] |
|       5 |  10k | 468.6 [440.1–1015.8] | 446.5 [436.9–553.7] | 453.2 [392.7–550.5]  | 430.4 [398.8–547.9] | 288.0 [246.2–338.6] |
|       8 |   5k | 361.8 [348.6–391.9]  | 356.8 [334.6–394.0] | 336.7 [325.8–550.4]  | 365.3 [321.8–548.4] | 237.1 [208.9–278.7] |
|       8 |  10k | 778.5 [699.0–1141.2] | 742.7 [689.5–850.0] | 772.4 [639.4–1121.8] | 740.5 [661.1–917.6] | 552.6 [468.3–641.2] |

The table rows' second owner comes from somewhere else: `{columns.map(...)}` is an array child, which builds a slot and a branch owner in every row. That is a possible later candidate; it is not in the design.

### Retained allocations per row

| Build                    | Owners | Retained JS objects | Retained JS bytes |
| ------------------------ | -----: | ------------------: | ----------------: |
| Benos row, 7c-2          |      2 |                73.5 |             2,711 |
| Benos row, 7c-3          |      1 |                72.5 |             2,636 |
| Solid row                |      1 |                26.5 |               913 |
| Registry table row, 7c-3 |      2 |               112.7 |             3,713 |

One owner and 75 B less per benchmark row. The design estimated about −4 objects; the owner is one object, and the other records it counted (the component's mount readiness closure, its range) are still created, now for the shared owner.

### Garbage collection (main thread, profiling build)

| Workload        | Benos 7c-2          | Benos 7c-3          | Solid |
| --------------- | ------------------- | ------------------- | ----: |
| Create 1k       | 2.0 [1.9–2.1]       | 2.0 [1.9–2.0]       |   1.1 |
| Replace 1k      | 2.0 [1.9–2.4]       | 1.8 [1.7–1.9]       |   0.5 |
| Create 10k      | 107.2 [103.3–122.2] | 100.9 [100.2–103.1] |  39.1 |
| Replace 10k     | 41.7 [18.4–254.4]   | 17.3 [17.0–17.5]    |   2.7 |
| Table mount 5k  | 92.6 [88.5–106.0]   | 88.0 [87.2–100.5]   |   3.7 |
| Table mount 10k | 290.1 [223.6–488.4] | 205.4 [204.8–207.0] |  46.6 |

Create 10k collected about 6% less, in line with 75 B less retained per row (7c-1 measured 103.9, so part of this is run-to-run variation). The table rows are unchanged by this step, so their drop from 7c-2's wide-spread run is variation, not an effect.

### CPU by category (instrumented build)

Owner creation halves: 2,000 → 1,000 calls on create 1k (0.3 → 0.2 ms) and 20,000 → 10,000 on create 10k (2.9 → 1.6 ms). Clear 10k disposal 20.8 → 15.5 ms. The other categories moved within this build's run-to-run variation.

## Found, not changed

**Rows keyed by object identity get different ids in hydration than on the server.** A row without a string or number key (unkeyed objects, `by` returning an object, or a duplicate key) uses its owner's ordinal as its id segment. The server's `<For>` creates its rows before its list effect; the client's creates the effect first, and the effect takes the ordinal the first row had on the server. Every such row's `createUniqueId` is therefore one ordinal off during hydration (`b0-0-2-1-…` on the server, `b0-0-2-2-…` in hydration), so client-side references built from those ids do not match the server's attributes. This predates Phase 7 and this step leaves it exactly as it was (verified above). It needs its own fix in the server or DOM `<For>` and its own test. RP-7c-2's `onMount` finding with an array containing a `<Portal>` is also still open.

## Checks run

| Check                                                                       | Result                                |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `pnpm test`                                                                 | 56 files, 584 tests passed (4 new)    |
| `pnpm test:browser` (Chromium, Firefox, WebKit)                             | 534 passed on a full rerun; see below |
| `pnpm lint`, `typecheck:types`, `check:doc-examples` (54 files, both modes) | Passed                                |
| `pnpm size`                                                                 | All within caps (table above)         |

On the first browser run, one Chromium test failed once: the dropdown menu's `End` key did not move the active item. That component does not use `<For>`. The test passed 10 of 10 on its own, its whole file passed 423 of 423 (three browsers, three repeats, four workers), and the full suite then passed 534 of 534. `pnpm test:coverage`, which CI does not run, stops at `packages/dom/tests/types.test.ts` ("No test suite found"), a file this step does not touch.

The existing tests passed unchanged; the only test edits are the four additions.

## Assessment

Candidate 3 does what it was designed to do structurally: one owner per benchmark row instead of two, 75 B less retained per row, and half the owner-creation work. The time it saves is small: clear about 0.2 ms faster, consistently; create 1,000 rows possibly 1 ms faster but not established; create 10,000 unchanged. It costs 77 B, 50 of them in core. I recommend keeping it. The owner reduction is repeatable and does not depend on noise, nothing regressed, and the remaining candidates (5 and 6) shorten per-owner and per-template teardown, which a row with one owner pays once. The alternative is to revert it and keep core's 50 bytes for candidates 4, 6, and 7. That is a reasonable call too, and it's yours.

After three candidates, creating rows is about 1.30–1.32× Solid, clear 1.48×, append 1.20×. The RP-7b projection for all seven candidates was 1.15–1.25×.

## Next

On approval: RP-7c-4, keyed item and index state without signal closures (candidate 4), measured the same way. Two questions stay open: the text marker (RP-7c-1), and, later, core's cap.

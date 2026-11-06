# RP-7c-1 — Text bindings without a slot

**Status:** RP-7b was approved on 2026-11-04 with the core + DOM cap raised to 12,032 B. The user's words: "Approve, raise cap". This is the first implementation step: candidate 1 of the [design](../architecture/performance.md#1-text-bindings-in-direct-templates-without-a-slot). Committed locally on `perf/row-creation`; nothing is pushed.

## Delivered

- **The cap.** `scripts/check-size.mjs` now allows 12,032 B for core + DOM.
- **Text mode** in `mountDirectTemplate` (`packages/dom/src/index.ts`). A compiled template's dynamic child whose value is a string or number is a bare Text node in front of its placeholder, updated in place, with no slot record, range, cleanup, branch owner, or mounted record. The first value of any other kind removes the text and builds the ordinary slot on the placeholder, its cleanup registered on the template's owner; from then on it is today's slot. The slot's ordinal is still claimed at setup, so owner ordinals and `createUniqueId` are unchanged. While hydrating, a binding takes today's slot path from the start.
- **One change from the design: the marker stays.** The design removed the placeholder after the text. That broke three existing contracts: the compiler suite's `none`/`safe` DOM parity (`none` builds ordinary slots, which keep the marker), a hydration test that fixes the hydrated DOM with the marker, and the progressive-hydration rule that a hydrated page equals a fresh client render. Removing the marker everywhere would mean changing those tests' expectations, which this track does not do without your decision. The allocation saving does not depend on it, so the DOM is byte-identical to 0.7.1 and a row still has 12 DOM nodes to Solid's 10.
- **Tests.** A compiler test drives one binding through text, number, empty string, an element, text again, an array, `null`, `false`, text, and `0`, plus a later throw inside an `ErrorBoundary`, in both `none` and `safe`, and requires identical DOM at every step and an empty body after disposal. A hydration test hydrates text rows of a direct template, then updates, adds, reorders, and removes rows on the client, and requires node identity for the hydrated rows and a shape equal to a fresh client render.

## Size

| Bundle                 | Before | After  | Cap    |
| ---------------------- | ------ | ------ | ------ |
| `@benosjs/core`        | 4,490  | 4,490  | 4,608  |
| `@benosjs/core` + DOM  | 11,515 | 11,587 | 12,032 |
| `@benosjs/dom/hydrate` | 3,962  | 3,962  | 4,096  |
| `@benosjs/server`      | 7,688  | 7,688  | 8,448  |

+72 B on core + DOM (the design estimated 60–120). The compiler did not change, so generated application code is identical; applications grow by the runtime's 72 B.

## Measurements

Same machine, protocol, and scripts as [RP-7a](./rp-7a.md): Node 26.10.0, Chromium 153, macOS arm64, production builds, two warmups, seven interleaved rounds; median [min–max] ms. Raw data in `benchmarks/js-framework-benchmark/results/rp-7c-1-*-2026-11-04.json`.

### The nine operations

| Operation          | Benos 7a            | Benos 7c-1          | Solid               | Svelte              | Vue                 | React               | 7a / Solid | 7c-1 / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ---------: | -----------: |
| Create 1,000 rows  | 35.7 [34.4–36.1]    | 33.9 [32.8–34.2]    | 24.8 [24.5–25.0]    | 27.3 [26.2–28.4]    | 29.6 [29.2–32.1]    | 29.9 [29.8–30.4]    |      1.40× |        1.37× |
| Replace 1,000 rows | 36.4 [35.0–41.4]    | 34.5 [33.8–35.2]    | 25.3 [24.6–25.8]    | 27.3 [26.6–27.7]    | 29.1 [27.1–29.6]    | 31.4 [30.8–32.2]    |      1.35× |        1.36× |
| Update every 10th  | 13.3 [13.2–46.3]    | 12.8 [12.6–13.1]    | 13.7 [13.6–13.8]    | 13.5 [13.2–22.7]    | 24.1 [20.4–24.6]    | 17.4 [17.1–19.1]    |      0.96× |        0.93× |
| Select one row     | 1.3 [1.3–1.4]       | 1.1 [1.0–1.1]       | 0.8 [0.8–24.2]      | 1.3 [1.2–2.2]       | 19.1 [18.5–28.9]    | 7.1 [5.3–8.3]       |      1.48× |        1.32× |
| Swap rows          | 4.0 [3.9–17.1]      | 3.7 [3.6–4.2]       | 2.7 [2.7–2.9]       | 4.3 [4.2–5.0]       | 19.2 [17.1–24.8]    | 27.1 [26.3–32.3]    |      1.39× |        1.35× |
| Remove one row     | 5.0 [4.7–21.2]      | 4.6 [4.6–5.3]       | 4.3 [4.2–4.4]       | 5.8 [5.8–6.0]       | 21.9 [8.6–25.0]     | 9.9 [8.8–11.1]      |      1.14× |        1.07× |
| Create 10,000 rows | 331.9 [325.2–343.3] | 314.5 [310.3–319.1] | 236.9 [236.1–252.0] | 249.3 [245.1–277.0] | 265.0 [264.1–285.2] | 505.2 [493.9–515.6] |      1.38× |        1.33× |
| Append 1,000 rows  | 44.0 [43.3–45.7]    | 42.1 [41.9–45.1]    | 35.4 [35.3–37.6]    | 37.0 [36.4–45.9]    | 41.1 [40.7–47.8]    | 42.7 [40.4–45.8]    |      1.22× |        1.19× |
| Clear rows         | 5.3 [5.2–5.6]       | 4.4 [4.3–4.8]       | 2.5 [2.4–2.6]       | 3.3 [3.2–3.8]       | 4.8 [3.4–6.4]       | 4.6 [4.5–4.7]       |      2.06× |        1.77× |

Every Benos median improved. Create 1k (−5%), create 10k (−5%), and clear (−17%) moved with spreads that no longer overlap the 7a run. Solid also ran about 3% faster in this run than in 7a (same machine, a few hours apart), so the ratio is the fairer comparison and moved less: create 1.40 → 1.37×, create 10k 1.38 → 1.33×, clear 2.06 → 1.77×. Replace stayed at 1.36×. Nothing regressed.

### Sortable table mount

| Columns | Rows | Registry 7a         | Registry 7c-1       | Solid 7c-1          | 7a / Solid | 7c-1 / Solid | Handwritten 7c-1 / Solid | Registry sort / Solid |
| ------: | ---: | ------------------- | ------------------- | ------------------- | ---------: | -----------: | -----------------------: | --------------------: |
|       2 |   5k | 115.0 [105.1–137.6] | 109.1 [101.8–135.1] | 63.1 [55.8–78.7]    |      1.83× |        1.73× |                    1.75× |                 1.05× |
|       2 |  10k | 245.7 [217.9–297.1] | 220.2 [201.7–250.3] | 129.5 [124.1–142.4] |      1.86× |        1.70× |                    1.67× |                 1.16× |
|       3 |   5k | 169.0 [138.1–409.7] | 139.2 [128.1–160.8] | 86.9 [72.2–105.8]   |      1.92× |        1.60× |                    1.58× |                 1.22× |
|       3 |  10k | 309.5 [266.3–320.2] | 276.9 [259.5–327.9] | 161.2 [149.3–179.0] |      1.87× |        1.72× |                    1.71× |                 1.12× |
|       5 |   5k | 246.2 [213.1–271.6] | 215.5 [205.3–245.8] | 143.1 [131.6–216.5] |      1.84× |        1.51× |                    1.51× |                 0.98× |
|       5 |  10k | 478.8 [423.3–531.0] | 439.4 [409.4–513.8] | 279.9 [254.8–314.0] |      1.74× |        1.57× |                    1.58× |                 1.05× |
|       8 |   5k | 388.3 [367.5–694.7] | 371.3 [321.3–398.9] | 243.8 [211.1–391.0] |      1.67× |        1.52× |                    1.44× |                 1.02× |
|       8 |  10k | 768.8 [726.1–940.3] | 769.2 [656.0–881.1] | 555.2 [506.6–712.1] |      1.55× |        1.39× |                    1.36× |                 0.94× |

The mount ratio improved in all eight cells (1.55–1.92× → 1.39–1.73×). The table's spreads are wide and overlap, so the per-cell numbers are indicative; the direction is consistent across every cell.

### Retained allocations per row

| Build                    | Owners | Effects | Plain objects | Arrays | Closures | Retained JS objects | Retained JS bytes |
| ------------------------ | -----: | ------: | ------------: | -----: | -------: | ------------------: | ----------------: |
| Benos row, 7a            |      4 |       4 |          53.0 |   16.0 |     25.0 |                95.5 |             3,408 |
| Benos row, 7c-1          |      2 |       4 |          41.0 |    8.0 |     23.0 |                73.5 |             2,712 |
| Solid row                |      1 |       3 |          11.0 |    6.0 |      8.0 |                26.5 |               913 |
| Registry table row, 7a   |      5 |      10 |          67.2 |   40.0 |     34.0 |               143.8 |             4,673 |
| Registry table row, 7c-1 |      2 |      10 |          50.2 |   28.0 |     32.0 |               112.9 |             3,717 |
| Solid table row          |      1 |       7 |          24.1 |    6.0 |     12.0 |                43.4 |             1,516 |

−22 objects per benchmark row (the design estimated about −20) and −31 per table row; owners per row 4 → 2 and 5 → 2. A Benos row now keeps 2.8× Solid's objects, from 3.6×.

### Garbage collection (main thread, profiling build)

| Workload        | Benos 7a | Benos 7c-1 | Solid |
| --------------- | -------: | ---------: | ----: |
| Create 1k       |      2.0 |        1.9 |   1.1 |
| Replace 1k      |      1.9 |        1.7 |   0.5 |
| Clear 1k        |      0.7 |        0.0 |   0.0 |
| Create 10k      |    135.6 |      103.9 |  39.1 |
| Table mount 5k  |    111.2 |       90.3 |   3.7 |
| Table mount 10k |    315.6 |      211.1 |  46.6 |

GC at 10,000 rows fell 23% on create and 33% on the table mount. (Replace 10k went from 375.7 to 18.3 ms, but its 7a spread ran from 15 to 411 ms, so it is not a reliable comparison.)

### CPU by category (instrumented build)

| Workload        | Binding setup (calls)      | Owner creation | DOM insertion (calls)     | Disposal (calls)            |
| --------------- | -------------------------- | -------------- | ------------------------- | --------------------------- |
| Create 1k       | 10.5 (7,000) → 6.7 (3,000) | 0.7 → 0.4      | 2.5 (4,000) → 2.2 (2,000) | —                           |
| Replace 1k      | 8.7 (7,000) → 5.3 (3,000)  | 0.5 → 0.3      | 2.2 → 1.8                 | 10.5 (17,001) → 5.2 (5,001) |
| Clear 1k        | —                          | —              | —                         | 8.6 (15,002) → 5.5 (5,002)  |
| Create 10k      | 83.1 → 53.3                | 5.8 → 3.1      | 23.6 → 24.3               | —                           |
| Clear 10k       | —                          | —              | —                         | 86.9 → 47.2                 |
| Table mount 10k | 134.3 → 86.1               | 7.8 → 3.9      | 27.8 → 18.4               | 4.1 → 1.0                   |

Binding setup fell about 36%, and clear makes 5 disposal calls per row instead of 15.

## Checks run

| Check                                                                       | Result                             |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `pnpm test`                                                                 | 56 files, 575 tests passed (2 new) |
| `pnpm test:browser` (Chromium, Firefox, WebKit)                             | 534 passed                         |
| `pnpm lint`, `typecheck:types`, `check:doc-examples` (54 files, both modes) | Passed                             |
| `pnpm size`                                                                 | All within caps (table above)      |

The existing tests passed unchanged; the only test edits are the two additions.

## Assessment

Candidate 1 does what the design said for memory (−22 objects per row, half the owners, a third less GC at 10,000 rows) and for setup time (−36% binding setup), and it is kept. The trace-time ratios moved less than the allocation numbers: creation is still 1.33–1.37× Solid. That is consistent with the RP-7b expectation that the candidates work together; candidate 2 targets clear and replace next, and candidates 3 and 4 the remaining row records.

## Next

On approval: RP-7c-2, bulk DOM removal on clear and full replace (candidate 2), measured the same way. Separately, whether to drop the text marker everywhere (two fewer DOM nodes per row, closer to Solid's DOM) is your call: it changes three tests' expected DOM, not behavior, and I would measure it as its own step if you want it.

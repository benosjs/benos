# RP-7c-4 — Keyed item and index state without signal closures

**Status:** RP-7c-3 was approved and kept on 2026-11-04. The user's words: "Keep, start 7c-4". This is candidate 4 of the [design](../architecture/performance.md#4-keyed-item-and-index-state-without-signal-closures). Committed locally on `perf/row-creation`; nothing is pushed.

## Delivered

- **Internal state in core.** `internalState(initial)` (internal registry only) returns one function: called as `state()` it reads the value with tracking, and called as `state(value, true)` it writes first. `signal()` and `internalState()` now share two internal functions, `createState` and `writeState`. Equality, the version limit, the computed-evaluation guard, and the development warnings live in one place, as the design asked, and `signal()`'s public behavior is unchanged.
- **`<For>` uses it** for a keyed item (`by` rows) and for the index, both still created lazily on first read. A keyed row no longer creates a public signal: one state node and one function, where `signal()` built a node, five closures, and a debugging `WeakMap` entry.
- **A change during the step: no `arguments.length`.** The first version wrote when called with any argument and read when called with none, checking `arguments.length`. In V8's lower tiers that can allocate an `arguments` object per call, reads included. In that version's measurements, "update every 10th", which writes every row's state, came out 1.09× Solid against 0.94× for 7c-3. Writes now pass an explicit flag, which is also 12 B smaller, and the regression is gone (0.93×). The first version's measurements are kept as `rp-7c-4-arguments-*`.
- **Tests (two new).**
  - Core: the state reads with tracking, writes, skips equal values (including `NaN`), writes `undefined` when asked to, and rejects a write inside a `computed`.
  - `<For>`: only rows whose keyed item or index changed re-run. Covered: a new object under the same key re-runs only its row; the same list again re-runs nothing; a swap re-runs only the two moved rows and keeps their nodes; removing the first row re-runs the rows whose index changed.

  The `<For>` test also passes against the 7c-3 code.

## Size

| Bundle                 | 7c-3   | 7c-4   | Cap    |
| ---------------------- | ------ | ------ | ------ |
| `@benosjs/core`        | 4,540  | 4,587  | 4,608  |
| `@benosjs/core` + DOM  | 11,687 | 11,733 | 12,032 |
| `@benosjs/dom/hydrate` | 3,962  | 3,962  | 4,096  |
| `@benosjs/server`      | 7,688  | 7,688  | 8,448  |

+46 B on core + DOM. The design estimated +20 to +50 core and −10 to +10 DOM; core took +47 (the shared create and write functions and one registry entry) and DOM −1. **Core has 21 B left under its cap.** Candidate 5 is DOM-only and fits. Candidates 6 and 7 are estimated at +30 to +60 and +5 to +15 B of core, so they do not fit without a decision on core's cap.

## Measurements

**The machine was loaded for this step's runs.** The load average was 9–15, with Docker Desktop's renderer at about 55% CPU and a virtual machine running. Every framework ran slower and with wider spreads than in yesterday's runs; Solid's create 1,000 rows was 28.1 ms in the full run against 24.6 yesterday, and a table cell's spread reached 2×. I did not stop those processes; they are yours. Allocation counts do not depend on load, so they carry this step. The interleaved A/B removes drift but not the extra variance, so small time differences cannot be resolved here. RP-7d re-measures everything at the end, ideally on a quiet machine. Raw data in `benchmarks/js-framework-benchmark/results/rp-7c-4-*-2026-11-05.json`.

### Retained allocations per row (load-independent)

| Build                    | Owners | Signals | Closures | Retained JS objects | Retained JS bytes |
| ------------------------ | -----: | ------: | -------: | ------------------: | ----------------: |
| Benos row, 7c-3          |      1 |       1 |     23.0 |                72.5 |             2,636 |
| Benos row, 7c-4          |      1 |       0 |     19.0 |                68.5 |             2,499 |
| Solid row                |      1 |       0 |      8.0 |                26.5 |               913 |
| Registry table row, 7c-3 |      2 |       1 |     32.0 |               112.7 |             3,713 |
| Registry table row, 7c-4 |      2 |       0 |     28.0 |               109.1 |             3,587 |

−4 retained objects and −137 B per benchmark row, and about the same per table row; the design estimated about −5. The state's one function replaces `signal()`'s five closures; the `WeakMap` entry, which `signal()` adds for debugging inspection in every build, is gone too.

### Interleaved A/B: 7c-3 against 7c-4

Saved 7c-3 builds in the same rounds as 7c-4 and Solid: two warmups, eleven interleaved rounds. The last column is the first version (with `arguments.length`) from its own A/B run.

| Operation          | Benos 7c-3          | Benos 7c-4          | Solid               | 7c-3 / Solid | 7c-4 / Solid | First version / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | -----------: | -----------: | --------------------: |
| Create 1,000 rows  | 32.5 [32.4–34.5]    | 33.6 [32.4–35.2]    | 24.7 [24.4–26.1]    |        1.32× |        1.36× |                 1.35× |
| Replace 1,000 rows | 32.9 [32.6–34.2]    | 32.4 [31.3–35.3]    | 25.2 [24.1–26.4]    |        1.30× |        1.29× |                 1.30× |
| Update every 10th  | 12.6 [12.5–13.7]    | 12.5 [12.5–12.7]    | 13.5 [13.4–16.4]    |        0.94× |        0.93× |                 1.09× |
| Select one row     | 1.0 [1.0–1.5]       | 1.1 [1.0–5.4]       | 0.8 [0.8–22.2]      |        1.27× |        1.28× |                 1.30× |
| Swap rows          | 3.7 [3.6–4.6]       | 3.6 [3.5–4.3]       | 2.8 [2.7–3.0]       |        1.30× |        1.29× |                 1.29× |
| Remove one row     | 4.6 [4.5–4.6]       | 4.5 [4.5–4.7]       | 4.2 [4.1–4.6]       |        1.07× |        1.07× |                 1.10× |
| Create 10,000 rows | 322.6 [306.8–341.1] | 315.5 [303.3–335.1] | 244.2 [235.5–262.5] |        1.32× |        1.29× |                 1.32× |
| Append 1,000 rows  | 43.9 [42.2–67.3]    | 47.4 [42.2–59.7]    | 36.4 [35.2–44.3]    |        1.21× |        1.30× |                 1.20× |
| Clear rows         | 4.3 [3.8–5.0]       | 4.2 [3.8–4.7]       | 2.6 [2.5–3.0]       |        1.67× |        1.63× |                 1.59× |

No operation moved beyond what this load explains. Create 1,000 and append came out slower and create 10,000 and replace faster, with overlapping spreads. Append's 7c-3 samples run to 67 ms and Solid's to 44, so the 1.21 → 1.30 there is not a measurement I would act on. The first version had append at 1.20×, and the final version only removed work from append's path (the `arguments` check on each row's state write). The one difference that tracks a mechanism is "update every 10th", fixed as described above.

### Sortable table mount (interleaved A/B)

The table A/B ran at a load average of about 13. 7c-4 was faster in 8 of 16 cells; the geometric mean of 7c-4 / 7c-3 is 1.014 for the registry table and 0.976 for the handwritten one. Solid's own cells spread up to 2×, for example 8 columns × 5k at 226–742 ms. No effect is detectable at this noise. The table is in `rp-7c-4-table-ab-2026-11-05.json`.

### Garbage collection (main thread, profiling build)

| Workload        | Benos 7c-3          | Benos 7c-4          | Solid |
| --------------- | ------------------- | ------------------- | ----: |
| Create 1k       | 2.0 [1.9–2.0]       | 2.0 [1.9–2.1]       |   1.1 |
| Replace 1k      | 1.8 [1.7–1.9]       | 1.7 [1.7–1.7]       |   0.5 |
| Create 10k      | 100.9 [100.2–103.1] | 100.3 [93.6–122.9]  |  39.1 |
| Replace 10k     | 17.3 [17.0–17.5]    | 20.3 [18.8–22.6]    |   2.7 |
| Table mount 5k  | 88.0 [87.2–100.5]   | 86.2 [83.9–106.4]   |   3.7 |
| Table mount 10k | 205.4 [204.8–207.0] | 191.8 [190.1–210.7] |  46.6 |

The table mount at 10k collected 7% less. Create 10k is unchanged. Replace 10k collected 3 ms more, inside what this run's spreads allow.

### CPU by category (instrumented build)

Signal creation leaves the profile: create 1k 0.5 ms (1,000 calls) → 0, create 10k 3.2 ms (10,000) → 0, table mount 10k 3.2 ms → 0. The internal state's creation is not instrumented and now falls inside binding setup, where it is first read. Binding setup plus signal creation together: create 1k 6.6 → 6.3 ms, create 10k 52.6 → 48.0 ms, table mount 10k 89.5 → 81.9 ms.

## Found, not changed

**A keyed row whose first read of its item is inside a `computed` throws.** For example, a row component that starts with `const label = computed(() => props.row().label)` fails with "signal cannot run during computed evaluation" and renders nothing. The row's item state is created lazily on first read, and creation is refused inside a computed. This is in 0.7.1 too, and this step keeps it exactly as it was. The fix is to move that refusal out of the shared `createState` and into `signal()`. That lets the renderer's lazily created state be made during a computed, where it is a cache made once per row, while public `signal()` keeps the rule. It is one line, with no size change, plus a test. It changes behavior, though (a throw becomes a working row), so it is your call.

RP-7c-2's `onMount` finding (an array containing a `<Portal>`) and RP-7c-3's id finding (rows keyed by object identity) are still open.

## Checks run

| Check                                                                       | Result                             |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `pnpm test`                                                                 | 56 files, 586 tests passed (2 new) |
| `pnpm test:browser` (Chromium, Firefox, WebKit)                             | 534 passed (final code)            |
| `pnpm lint`, `typecheck:types`, `check:doc-examples` (54 files, both modes) | Passed                             |
| `pnpm size`                                                                 | All within caps (table above)      |

The existing tests passed unchanged; the only test edits are the two additions.

## Assessment

Candidate 4 removes what it set out to remove: the public signal in every keyed row, with 4 objects and about 137 B less retained per row, signal creation out of the profile, and 7% less collection on a 10,000-row table mount. It costs 46 B, all in core. This step's time measurements were taken on a loaded machine and show no change beyond the noise in either direction. I recommend keeping it on the allocation evidence, and confirming the times in RP-7d. After four candidates, creating rows is about 1.29–1.36× Solid in today's noisy runs, or about 1.30–1.32× on yesterday's quieter ones.

## Decisions for you

1. Approve 7c-4 (keep it), or revert it.
2. **Core's cap**, which candidates 6 and 7 need. Options: raise it for this track, as was done for core + DOM at RP-7b; do candidate 5 (DOM-only) and then stop and re-plan; or drop candidates 6 and 7.
3. Whether to fix the `computed` finding above as a small step of its own.

## Next

On approval: RP-7c-5, one teardown per template instance (candidate 5, DOM-only), measured the same way.

# Benchmarks

Run `pnpm build && pnpm bench:kernel` to measure Benos signal reads, computed invalidation, effect fanout, and dynamic dependency switching. The runner reports the median of seven measured rounds after one warmup round.

Run `pnpm build && pnpm bench:compare` to compare equivalent signal reads, a 20-node computed chain, 200-effect fanout, dynamic dependency switching, and repeated equal writes. The harness imports `packages/core/dist/js/index.production.js` and rejects a bundle that still contains development mode runtime paths. The build fixes `NODE_ENV` to `production` for that artifact. The harness validates matching computed outputs and effect run counts before reporting the median of five timed rounds after one warmup. Setup and disposal are outside the timed section; implementation-specific setup is required because the libraries expose different APIs. The Solid adapter imports its client reactive core (`solid-js/dist/solid.js`), since its default Node entry is the server build. Results are local microbenchmarks, not overall application performance. They include no DOM work and do not normalize each library's ownership and error-reporting features.

Run `pnpm bench:profile` for Benos-only V8 sampled allocation estimates and peak signal subscriber counts. Sampling is approximate and run-to-run values vary. The peak count is read directly from the kernel's private graph inspection hook. The profile exercises a 10,000-effect fanout and a 200-node computed chain; it does not claim to measure retained memory after disposal.

CI runs `pnpm bench:guard` after `pnpm build`. The guard runs the production comparison seven times and fails if the median Benos/Preact ratio exceeds 2.00 for any workload. Each comparison checks matching outputs and effect counts; a missing or invalid timing also fails. Seven independent runs reduce sensitivity to one noisy sample, but shared-runner contention can still affect a performance gate.

## Recorded before and after

Node v24.8.0, macOS arm64, 2026-09-30. Preact Signals Core 1.14.4, Alien Signals 3.2.1, Solid 1.9.15. Times are milliseconds; lower is faster.

The **before** table is the recorded Phase 3 result. Its script imported the production-named, minified artifact, but the runtime's development guard could still evaluate as enabled under Node. It is a valid record of the previous measured behavior, but the change to the **after** table includes both kernel optimization and correcting that build-mode error. The two tables therefore cannot isolate the speedup due to data structures alone.

### Before

| Workload                                          | Benos | Preact | Alien | Solid |
| ------------------------------------------------- | ----: | -----: | ----: | ----: |
| 1,000,000 signal reads                            |  7.15 |   4.88 |  8.03 |  5.96 |
| 10,000 writes and reads through 20 computed nodes | 39.53 |   4.49 |  4.60 | 21.88 |
| 200 writes to 200 subscribed effects              | 12.44 |   1.91 |  1.37 |  3.24 |
| 20,000 dynamic dependency switches                | 14.97 |   2.54 |  2.61 |  8.21 |
| 100,000 equal writes                              |  0.69 |   0.47 |  1.16 |  0.90 |

### After

Each entry is the median of five independent harness runs, each of which reports the median of five timed rounds. The production bundle has development paths removed by build-time substitution. The CI guard now takes a median across seven such harness runs.

| Workload                                          | Benos | Preact | Alien | Solid | Benos / Preact |
| ------------------------------------------------- | ----: | -----: | ----: | ----: | -------------: |
| 1,000,000 signal reads                            |  6.16 |   4.90 |  8.12 |  5.95 |          1.26× |
| 10,000 writes and reads through 20 computed nodes |  6.76 |   5.00 |  4.69 | 21.68 |          1.35× |
| 200 writes to 200 subscribed effects              |  2.20 |   1.34 |  1.34 |  3.43 |          1.64× |
| 20,000 dynamic dependency switches                |  4.38 |   2.41 |  2.69 |  8.03 |          1.82× |
| 100,000 equal writes                              |  0.72 |   0.50 |  1.19 |  0.93 |          1.44× |

Benos is within 2× Preact and Alien on every case in this run, and is faster than Alien for signal reads and equal writes. It remains slower than Preact on all five. Switching has the largest remaining Preact gap; Benos still updates ownership-aware dependency links, handles two effect tiers, and checks cycle/error state during each synchronous flush. These are plausible contributors, but this benchmark does not isolate their individual costs.

## Phase 4d checkpoint (2026-10-01)

Measured from the production build with `pnpm size`:

| Artifact                         |        Size |       Budget |
| -------------------------------- | ----------: | -----------: |
| `@benosjs/core`                  | 3,963 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 9,806 bytes | 10,240 bytes |

The CI guard's median of seven production comparisons (each comparison is the median of five timed samples) was:

| Workload                            | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.24 |        4.93 | 1.25× |
| 20-deep computed chain write + read |       6.64 |        5.12 | 1.28× |
| 200-effect fanout write             |       2.07 |        1.17 | 1.76× |
| Dynamic dependency switch           |       3.83 |        2.59 | 1.55× |
| Repeated equal write                |       0.72 |        0.51 | 1.42× |

All guard ratios were below the 2× threshold.

## Phase 5a checkpoint (2026-10-01)

The development diagnostics and ESLint rule did not change the production bundle sizes:

| Artifact                         |        Size |       Budget |
| -------------------------------- | ----------: | -----------: |
| `@benosjs/core`                  | 3,963 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 9,806 bytes | 10,240 bytes |

The production benchmark guard median of seven comparisons was:

| Workload                            | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       5.94 |        4.69 | 1.27× |
| 20-deep computed chain write + read |       6.23 |        4.88 | 1.27× |
| 200-effect fanout write             |       1.98 |        1.13 | 1.75× |
| Dynamic dependency switch           |       3.58 |        2.30 | 1.57× |
| Repeated equal write                |       0.68 |        0.48 | 1.42× |

All Phase 5a benchmark guard ratios remained below 2×.

V8 heap sampling on the separate Benos-only profile recorded about 8.4 MB before versus 5.5 MB after for 10,000-effect fanout (peak 10,000 subscribers), and 258 KB before versus 92–129 KB across two after runs for the 200-node chain (peak one subscriber on its source). These are sampled allocation estimates, not precise allocation totals or retained memory.

## Phase 5b checkpoint (2026-10-01)

The [js-framework-benchmark integration](./js-framework-benchmark/README.md) builds each adapter with Vite in production mode and measures the official CPU operation IDs 01–09 in Chromium. The final run used Node v24.8.0, Chromium 153.0.8010.12, macOS arm64, two warmup rounds, and seven measured rounds. Framework versions were Solid 1.9.15, Svelte 5.57.1, Vue 3.5.43, and React 19.3.0. Labels and keys are deterministic across adapters. Raw output is in [`results/latest.json`](./js-framework-benchmark/results/latest.json).

### Bundle sizes

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,963 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,157 bytes | 10,240 bytes |

### Before: legacy synchronous click-to-DOM measurement

This is the previously recorded Phase 5b table. The old runner timed synthetic event dispatch through microtasks and a forced `offsetHeight` read. It did not observe a browser paint, and it allowed each framework's scheduling strategy to interact differently with that boundary. The 18–24 ms cluster for Solid, Svelte, Vue, and React on select, swap, and remove is therefore a frame/polling artifact, not evidence that those operations took the same amount of work. Keep this table only as a historical baseline; it is not comparable as a paint measurement.

| Workload           | Benos | Solid | Svelte |   Vue | React |
| ------------------ | ----: | ----: | -----: | ----: | ----: |
| Create 1,000 rows  |  40.9 |  24.4 |   28.2 |  26.1 |  29.4 |
| Replace 1,000 rows |  46.3 |  25.8 |   26.3 |  25.3 |  31.6 |
| Update every 10th  |  11.2 |  21.6 |   12.3 |  22.5 |  14.9 |
| Select one row     |   1.2 |  18.8 |    1.5 |  22.1 |   4.8 |
| Swap rows          |   3.7 |  19.6 |   21.1 |  22.7 |  24.4 |
| Remove one row     |   4.0 |   2.5 |   21.7 |  21.9 |   7.2 |
| Create 10,000 rows | 415.0 | 235.0 |  267.2 | 236.0 | 530.5 |
| Append 1,000 rows  |  50.7 |  29.1 |   45.2 |  34.8 |  35.9 |
| Clear rows         |  10.5 |   2.7 |    1.7 |   1.6 |   4.5 |

### After: Chrome trace click-to-paint measurement

Every framework now uses the same native `.click()` operation, waits for the expected DOM state, forces layout, and records a Chromium trace. The reported duration is click-to-`Paint`/`PrePaint`, with `Commit` or `Layout` as an explicit trace fallback. This measures the same browser boundary for synchronous and scheduled frameworks. It is still a local engineering run, not an upstream leaderboard result.

Times are milliseconds; lower is faster. The final run used seven measured rounds per operation.

| Workload           | Benos | Solid | Svelte |   Vue | React | Benos / Solid |
| ------------------ | ----: | ----: | -----: | ----: | ----: | ------------: |
| Create 1,000 rows  |  63.9 |  39.7 |   43.9 |  50.6 |  58.8 |         1.61× |
| Replace 1,000 rows |  76.7 |  42.5 |   44.8 |  52.7 |  57.1 |         1.80× |
| Update every 10th  |  22.7 |  25.6 |   24.2 |  27.8 |  31.1 |         0.89× |
| Select one row     |   2.6 |   1.6 |   11.5 |   8.1 |  10.6 |         1.66× |
| Swap rows          |  12.0 |   8.0 |    9.4 |  12.6 |  49.0 |         1.49× |
| Remove one row     |  16.0 |   7.7 |   11.6 |  15.1 |  20.0 |         2.09× |
| Create 10,000 rows | 588.9 | 408.7 |  424.8 | 479.6 | 864.3 |         1.44× |
| Append 1,000 rows  |  79.7 |  57.2 |   67.5 |  73.3 |  75.5 |         1.39× |
| Clear rows         |  10.8 |   4.0 |    5.9 |   6.8 |   9.3 |         2.68× |

The old numbers favored frameworks whose scheduled work happened to line up with the forced layout and microtask polling. The trace run removes that timing bias and shows that Benos is slower than Solid on create, replace, select, swap, remove, 10,000-row creation, append, and clear; it is faster on update. This run misses the requested 1.3× create, replace, append, and clear targets (1.61×, 1.80×, 1.39×, and 2.68×). Paint scheduling remains noisy, but the same-boundary medians do not support claiming those targets are met.

The previous checkpoint added static-child mounting, empty/append keyed fast paths, a direct full-parent replacement and clear path, lazy item/index signals, and a sampled production profile of row creation. The focused A/B run below removed the keyed and full-parent paths because their trace effects were not measurable. The profile's largest costs were minified application work, DOM insertion, and garbage collection; it did not identify a single additional safe shortcut. Row creation still pays for ownership-aware keyed branches, reactive item access, event records, and DOM insertion. Solid and Svelte compile more of that path into specialized imperative operations. The benchmark adapter remains idiomatic user code and was not changed to hide those costs.

The production kernel guard was rerun at this checkpoint (median of seven harness runs, each with five timed samples): signal read 9.96 ms vs Preact 7.73 ms (1.29×), computed chain 10.44 vs 8.11 (1.28×), effect fanout 3.51 vs 2.07 (1.71×), dependency switch 6.81 vs 4.25 (1.55×), and equal write 1.14 vs 0.82 (1.39×). Every guard ratio stayed below 2×.

## Phase 5b focused optimization round (2026-10-01)

This focused round used the same production-build Chrome trace protocol. The previous seven-round result is the controlled **before** table; the new seven-round result is the **after** table. Three-round A/B runs were used only to attribute individual changes, so their values are directional and more sensitive to paint scheduling.

### Bundle sizes

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,997 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,058 bytes | 10,240 bytes |

### Before

| Workload           | Benos | Solid | Svelte |   Vue | React |
| ------------------ | ----: | ----: | -----: | ----: | ----: |
| Create 1,000 rows  |  63.9 |  39.7 |   43.9 |  50.6 |  58.8 |
| Replace 1,000 rows |  76.7 |  42.5 |   44.8 |  52.7 |  57.1 |
| Update every 10th  |  22.7 |  25.6 |   24.2 |  27.8 |  31.1 |
| Select one row     |   2.6 |   1.6 |   11.5 |   8.1 |  10.6 |
| Swap rows          |  12.0 |   8.0 |    9.4 |  12.6 |  49.0 |
| Remove one row     |  16.0 |   7.7 |   11.6 |  15.1 |  20.0 |
| Create 10,000 rows | 588.9 | 408.7 |  424.8 | 479.6 | 864.3 |
| Append 1,000 rows  |  79.7 |  57.2 |   67.5 |  73.3 |  75.5 |
| Clear rows         |  10.8 |   4.0 |    5.9 |   6.8 |   9.3 |

### After

| Workload           | Benos | Solid | Svelte |   Vue | React | Benos / Solid |
| ------------------ | ----: | ----: | -----: | ----: | ----: | ------------: |
| Create 1,000 rows  |  39.4 |  25.2 |   27.8 |  29.9 |  30.1 |         1.57× |
| Replace 1,000 rows |  42.6 |  25.3 |   27.6 |  29.5 |  31.1 |         1.68× |
| Update every 10th  |  14.7 |  13.8 |   13.4 |  20.6 |  17.4 |         1.06× |
| Select one row     |   7.5 |   0.8 |    1.3 |  18.1 |   5.8 |         8.92× |
| Swap rows          |   9.0 |   2.9 |    4.6 |  19.4 |  26.7 |         3.10× |
| Remove one row     |   4.7 |   4.2 |    6.0 |  24.4 |   9.9 |         1.12× |
| Create 10,000 rows | 360.6 | 238.2 |  248.8 | 270.6 | 509.2 |         1.51× |
| Append 1,000 rows  |  47.3 |  35.6 |   37.7 |  42.4 |  43.5 |         1.33× |
| Clear rows         |   6.4 |   2.6 |    3.5 |   3.6 |   4.6 |         2.46× |

### Attribution and decisions

| Change                        | Controlled trace effect                                                                                                                       |       Production size cost | Decision |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------: | -------- |
| Static-child mounting         | Enabled → disabled: create 1k 41.6 → 44.1 ms, replace 43.1 → 47.9 ms, create 10k 350.2 → 404.8 ms, append 47.1 → 50.6 ms                      |                  +23 bytes | Keep     |
| Keyed empty/append fast paths | Enabled → disabled: create 1k 41.6 → 40.9 ms, replace 43.1 → 42.6 ms, append 47.1 → 47.6 ms; no reliable gain                                 |                  +72 bytes | Removed  |
| Full-parent replace/clear     | Enabled → disabled: replace 43.1 → 42.6 ms, clear 6.2 → 6.4 ms; inconsistent and within trace noise                                           |                  +60 bytes | Removed  |
| Lazy item/index signals       | Lazy → eager: create 10k 366.1 → 370.1 ms and append 47.6 → 49.5 ms; avoids two per-row signals and was retained for the allocation reduction | +4 bytes versus eager code | Keep     |

The leading-row removal path was measured separately: disabling it increased remove from 4.81 ms to 9.59 ms (1.12× to 2.19× Solid), so it remains. Cached template prototypes already compute each slot path once per document; instances only walk those cached paths after cloning.

### Heap snapshot allocation comparison

Chromium 153 heap snapshots were taken after GC before and after creating 1,000 rows with the same production workload. Benos grew by 5.93 MB of V8 heap used and 3.87 MB of JavaScript snapshot self-size, about 5.93 KB and 3.87 KB per row. Solid grew by 1.87 MB and 0.67 MB, about 1.87 KB and 0.67 KB per row. Benos's largest row-specific snapshot entries were approximately 2,000 `onClick` closures, 2,000 `getHandler` closures, and thousands of owner/context objects. The snapshot excludes browser-native DOM memory, so these figures identify JavaScript overhead rather than total process memory.

The final trace still misses the 1.3× create, replace, and append targets and the 2× clear target. The remaining gap is primarily per-row owner/event/descriptor allocation and DOM insertion; the adapter remains idiomatic user code. The kernel guard after this round remained below 2× Preact: 5.93/4.76, 6.21/5.02, 1.99/1.14, 3.63/2.31, and 0.68/0.48 ms for its five workloads.

## Phase 5b interleaved follow-up (2026-10-01)

The earlier focused table ran each framework in a separate block. This rerun builds all five production adapters first, serves them on separate local ports, and rotates framework order on every round of each operation. Every result below is the median of seven measured rounds after two warmups; brackets show the observed minimum–maximum spread across those seven rounds. The report is in [`js-framework-benchmark/results/latest.json`](./js-framework-benchmark/results/latest.json). The production bundle and browser protocol are unchanged.

### Bundle sizes and kernel guard

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,997 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,058 bytes | 10,240 bytes |

The production kernel guard also passed with its median-of-seven protocol:

| Workload                            | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.30 |        4.93 | 1.28× |
| 20-deep computed chain write + read |       6.67 |        5.39 | 1.24× |
| 200-effect fanout write             |       2.16 |        1.27 | 1.70× |
| Dynamic dependency switch           |       3.91 |        2.51 | 1.56× |
| Repeated equal write                |       0.71 |        0.49 | 1.47× |

### All nine operations

| Workload           |          Benos (ms) |          Solid (ms) |         Svelte (ms) |            Vue (ms) |          React (ms) | Benos / Solid |
| ------------------ | ------------------: | ------------------: | ------------------: | ------------------: | ------------------: | ------------: |
| Create 1,000 rows  |    42.3 [39.5–42.9] |    26.3 [25.1–32.5] |    28.6 [27.5–32.9] |    31.1 [29.6–39.4] |    32.8 [32.2–36.6] |         1.61× |
| Replace 1,000 rows |    44.7 [42.9–47.7] |    25.4 [24.6–31.0] |    27.5 [26.6–28.0] |    28.4 [27.4–31.2] |    32.1 [30.8–37.2] |         1.76× |
| Update every 10th  |    15.3 [12.8–17.1] |    14.8 [13.6–20.7] |    14.9 [13.4–24.6] |    23.7 [16.7–27.0] |    18.3 [16.9–19.9] |         1.03× |
| Select one row     |     10.2 [1.2–14.8] |      0.9 [0.9–23.3] |     18.5 [1.4–24.9] |    23.9 [12.7–27.1] |      7.3 [5.2–18.0] |        11.35× |
| Swap rows          |       8.5 [3.8–9.2] |       3.0 [2.8–3.2] |      4.6 [4.2–23.7] |    18.0 [15.8–24.6] |    28.7 [27.3–30.4] |         2.86× |
| Remove one row     |      5.3 [4.7–11.9] |      4.5 [4.2–23.5] |      6.5 [5.9–27.5] |     24.4 [8.3–25.1] |      9.6 [8.8–19.8] |         1.18× |
| Create 10,000 rows | 370.9 [364.1–394.5] | 250.9 [234.4–301.4] | 252.0 [237.9–273.0] | 276.8 [264.8–326.9] | 527.1 [498.8–555.5] |         1.48× |
| Append 1,000 rows  |    55.9 [53.4–62.9] |    38.4 [35.6–50.1] |    49.4 [44.0–53.3] |    53.0 [44.9–54.5] |    49.4 [47.7–59.7] |         1.46× |
| Clear rows         |     13.3 [7.2–21.9] |       2.7 [1.3–4.2] |      3.8 [3.0–15.9] |      3.8 [1.7–15.3] |     14.4 [5.5–16.3] |         4.95× |

### Select and swap investigation

The increase from the prior focused table is not attributable to a production code regression found in this round. Select only writes the selected signal and runs existing class bindings; swap reconciles an unchanged-length keyed list. The removed keyed empty/append paths and full-parent replace/clear path are not entered by either operation, and static-child mounting, lazy item/index signals, and cached template slot paths do not mount or create rows during either operation. A controlled five-round interleaved A/B with zero-dependency effect detachment disabled was slower, not faster: select was 7.1 ms [3.1–13.5] with detachment versus 10.5 ms [2.0–16.6] without, and swap was 11.3 ms [7.0–14.6] versus 13.3 ms [6.0–15.4]. No source change was justified.

The apparent select regression is therefore measurement noise and scheduling variance at the paint boundary, not a demonstrated kernel or DOM regression. The interleaved run exposes that spread directly: Solid select ranged from 0.9 to 23.3 ms and Benos select from 1.2 to 14.8 ms. Swap is 2.86× in the interleaved rerun, lower than the prior 3.10× record. The old 1.66× and 1.49× ratios should not be compared to the new ratios as if they came from the same ordering protocol.

## Phase 5c dashboard checkpoint (2026-10-01)

The repository and dashboard production builds remain within the established
budgets. The kernel and framework medians below are carried forward from the
interleaved Phase 5b run; the dashboard slice is a separate equivalent
Benos/Solid table-and-form measurement.

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,997 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,058 bytes | 10,240 bytes |

| Kernel workload                     | Benos median | Preact median | Ratio |
| ----------------------------------- | -----------: | ------------: | ----: |
| Signal read                         |      6.30 ms |       4.93 ms | 1.28× |
| 20-deep computed chain write + read |      6.67 ms |       5.39 ms | 1.24× |
| 200-effect fanout write             |      2.16 ms |       1.27 ms | 1.70× |
| Dynamic dependency switch           |      3.91 ms |       2.51 ms | 1.56× |
| Repeated equal write                |      0.71 ms |       0.49 ms | 1.47× |

| Dashboard slice |      JS gzip | Filter update median |       Spread |
| --------------- | -----------: | -------------------: | -----------: |
| Benos           | 11,320 bytes |              43.0 ms | 33.9–50.8 ms |
| Solid           |  6,560 bytes |              13.1 ms | 11.0–18.1 ms |

The dashboard slice is 3.28× slower at the measured filter update and 1.73×
larger in gzip than its Solid counterpart. This is recorded as an honest
validation result; the remaining gap is listed in `docs/dashboard-findings.md`
and no unapproved optimization was applied during the dashboard build.
A clean production rebuild after the profile run measured 33.7 ms versus
11.8 ms (2.86×) with no source change; the difference is paint-boundary noise,
so the original checkpoint result remains the recorded baseline.

## Phase 6b performance checkpoint (2026-10-01)

The interleaved production protocol was rerun with two warmups and seven
measured rounds. Every framework used the same Chromium trace click-to-paint
boundary. The table includes every operation; brackets are the observed
minimum and maximum across the seven samples.

| Operation          |                Benos (ms) |                Solid (ms) | Benos / Solid |
| ------------------ | ------------------------: | ------------------------: | ------------: |
| Create 1,000 rows  |    38.979 [38.933–40.550] |    24.498 [24.402–24.792] |         1.59× |
| Replace 1,000 rows |    41.685 [41.160–42.029] |    25.374 [25.276–26.340] |         1.64× |
| Update every 10th  |    12.863 [12.689–15.912] |    13.341 [13.308–13.520] |         0.96× |
| Select one row     |       1.275 [1.192–9.671] |       0.853 [0.774–0.984] |         1.49× |
| Swap rows          |       3.853 [3.725–9.469] |       2.786 [2.733–3.156] |         1.38× |
| Remove one row     |       4.635 [4.539–5.563] |       4.182 [4.143–4.205] |         1.11× |
| Create 10,000 rows | 360.152 [357.816–368.758] | 233.591 [231.637–235.998] |         1.54× |
| Append 1,000 rows  |    46.179 [45.961–48.041] |    34.737 [34.538–34.838] |         1.33× |
| Clear rows         |       6.113 [5.951–6.160] |       2.517 [2.477–2.563] |         2.43× |

The dashboard filter slice, measured with seven rounds, was 36.6 ms
[32.2–43.9] for Benos and 11.2 ms [9.8–16.5] for Solid (3.27×). The Benos
slice gzip bundle was 11,634 bytes versus Solid's 6,590 bytes (1.77×).

### Candidate attribution

| Candidate                                                 | Measurement                                                                                                                                                                                                  |                                           Production byte cost | Decision    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------: | ----------- |
| Stable event handlers without per-instance getter/wrapper | The benchmark adapter uses inline per-row closures; the stable-identifier compiler path therefore did not change any measured row. The temporary combined bundle was 10,319 B and the trace did not improve. | 0 B retained (temporary +239 B combined with other trial code) | Removed     |
| Two-ended `<For>` swap check                              | A/B swap median was 8.006 ms before and 9.193 ms with the check in a five-round run; this was a regression.                                                                                                  |                                                   0 B retained | Removed     |
| Full-parent clear                                         | Clear median changed from 6.877 ms to 6.113 ms in the controlled seven-round rerun; the fast path only activates when the `<For>` range fills its parent.                                                    |                                                 +68 B combined | Kept        |
| Contiguous DOM removal with `Range.deleteContents()`      | Dashboard profiling still showed per-row disposal and `removeChild` as the dominant path, and the focused trace did not show a repeatable gain.                                                              |                                                   0 B retained | Removed     |
| Cheaper per-row disposal                                  | No safe implementation change was identified without changing owner lifetime semantics; the existing lazy run-owner reuse and dependency-free effect detachment remain in place.                             |                                                            0 B | Not changed |

The retained full-parent clear path did not alter public APIs or documented
semantics. The two-ended swap and batched-removal trials were reverted because
their measured results did not justify their code or budget cost. The remaining
gap is concentrated in row ownership/disposal, descriptor allocation, event
records, and DOM insertion; the benchmark adapter stayed unchanged.

### Heap snapshot comparison

After a forced GC, Chromium heap snapshots were taken before and after creating
1,000 rows in the same production workload. These are whole-page V8 snapshot
deltas, so they include framework and browser JavaScript and exclude native DOM
memory; they are useful for relative allocation accounting, not a retained-row
memory claim.

| Framework | Snapshot delta | Delta nodes | Approx. delta per row |
| --------- | -------------: | ----------: | --------------------: |
| Benos     |   15,715,687 B |     301,151 |              15.72 KB |
| Solid     |   11,427,066 B |     167,082 |              11.43 KB |

The Benos snapshot contained 2,000 `onClick` and 2,000 `getHandler` closure
objects for this workload. This confirms the event-record closure finding as a
remaining Phase 6 candidate; it was not implemented in 6b because the stable
handler benchmark path did not exercise it and the temporary bundle exceeded
the combined budget.

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,997 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,148 bytes | 10,240 bytes |

## Phase 6d checkpoint (2026-10-01)

The packed `create-benos` verification did not change the runtime bundles. The
production kernel guard was rerun with its median-of-seven protocol after the
packed consumer test:

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,997 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,148 bytes | 10,240 bytes |

| Workload                            | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       5.95 |        4.72 | 1.27× |
| 20-deep computed chain write + read |       6.26 |        4.92 | 1.27× |
| 200-effect fanout write             |       1.98 |        1.14 | 1.73× |
| Dynamic dependency switch           |       3.63 |        2.27 | 1.60× |
| Repeated equal write                |       0.68 |        0.48 | 1.43× |

## Phase 6e final verification (2026-10-01)

The release record uses the Phase 6b interleaved production trace in
`results/phase6b-final-7.json`: two warmup rounds, seven measured rounds, and
the same Chrome trace click-to-paint boundary for every framework. Brackets
contain the minimum and maximum measured samples. The earlier Phase 5b tables
remain above as historical measurements only.

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  3,997 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,148 bytes | 10,240 bytes |

| Workload           |                Benos (ms) |                Solid (ms) |               Svelte (ms) |                  Vue (ms) |                React (ms) | Benos / Solid |
| ------------------ | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------: |
| Create 1,000 rows  |    38.979 [38.933–40.550] |    24.498 [24.402–24.792] |    26.106 [25.845–27.919] |    29.303 [27.916–30.344] |    29.690 [29.280–30.544] |         1.59× |
| Replace 1,000 rows |    41.685 [41.160–42.029] |    25.374 [25.276–26.340] |    26.977 [26.632–27.626] |    28.812 [28.527–29.833] |    30.395 [30.253–31.737] |         1.64× |
| Update every 10th  |    12.863 [12.689–15.912] |    13.341 [13.308–13.520] |    13.035 [12.914–13.097] |    22.497 [14.645–24.238] |    17.214 [17.083–18.972] |         0.96× |
| Select one row     |       1.275 [1.192–9.671] |       0.853 [0.774–0.984] |       1.264 [1.180–2.065] |    19.949 [17.957–23.659] |       7.966 [6.689–8.893] |         1.49× |
| Swap rows          |       3.853 [3.725–9.469] |       2.786 [2.733–3.156] |       4.162 [4.078–4.711] |    20.765 [17.760–25.745] |    26.375 [25.601–27.552] |         1.38× |
| Remove one row     |       4.635 [4.539–5.563] |       4.182 [4.143–4.205] |      5.792 [5.663–14.799] |    22.076 [21.504–24.123] |      9.847 [9.634–10.437] |         1.11× |
| Create 10,000 rows | 360.152 [357.816–368.758] | 233.591 [231.637–235.998] | 244.382 [242.100–247.894] | 260.965 [259.886–264.602] | 507.081 [492.566–580.036] |         1.54× |
| Append 1,000 rows  |    46.179 [45.961–48.041] |    34.737 [34.538–34.838] |    36.378 [36.203–36.876] |    40.609 [40.389–46.281] |    40.332 [39.722–43.536] |         1.33× |
| Clear rows         |       6.113 [5.951–6.160] |       2.517 [2.477–2.563] |       3.349 [3.278–7.630] |       3.452 [3.391–3.651] |       4.436 [4.384–6.663] |         2.43× |

The nine-row table is the release measurement. Benos remains slower than Solid
on every row except update; the largest remaining gap is clear. The gap is
retained as a post-v0.1 performance item rather than being hidden by changing
the adapter or raising the bundle budgets.

## v0.1.1 release candidate verification (2026-10-02)

Built and measured locally with Node 22.18.0, Vite 8.3.2, and Vitest 5.0.3.
The nine-row framework trace above remains the latest interleaved DOM
measurement; this release-candidate change set does not modify the core or DOM
runtime, so that trace was not rerun. The production kernel guard was rerun
with its median-of-seven protocol (each run has five timed samples):

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  4,001 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,151 bytes | 10,240 bytes |

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.25 |        4.89 | 1.26× |
| 20-deep computed chain write + read |       6.37 |        5.29 | 1.20× |
| 200-effect fanout write             |       2.15 |        1.19 | 1.74× |
| Dynamic dependency switch           |       3.46 |        2.51 | 1.43× |
| Repeated equal write                |       0.83 |        0.50 | 1.65× |

All kernel guard ratios remain below 2× Preact. The bundle sizes remain within
their existing budgets.

## UI U1 amendment / U2 Zag contract checkpoint (2026-10-02)

Rebuilt production output with Node 22.18.0 before measuring. The U1 alias and
workspace-name changes do not add runtime bytes. Sizes below are from the fresh
build, not the earlier stale `dist` output. U2 stopped before adding primitive
runtime code because Zag requires a stable machine `id` and Benos has no public
ID-generation API; details are in `docs/checkpoints/ui-U2.md`.

| Artifact                         |         Size |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,001 bytes |  4,096 bytes |  95 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,151 bytes | 10,240 bytes |  89 bytes |

The production kernel guard used the median of seven runs, each with five timed
samples:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       7.99 |        6.33 | 1.29× |
| 20-deep computed chain write + read |      10.67 |        6.63 | 1.20× |
| 200-effect fanout write             |       2.47 |        1.83 | 1.71× |
| Dynamic dependency switch           |       4.77 |        3.35 | 1.47× |
| Repeated equal write                |       1.00 |        0.61 | 1.60× |

Every kernel ratio remained below the 2× Preact guard. These timings are a
kernel checkpoint only; the U2 prototype did not change the runtime. Ratios
are the median of the seven per-run ratios, while the two displayed time
columns are separately medianed; their rounded values therefore need not divide
to the displayed ratio.

## UI U2 completion (2026-10-03)

Built production output with Node 22.18.0 before measuring. `createUniqueId()`
adds 50 gzip bytes to core and 47 bytes to core+DOM versus the fresh U1 build;
both budgets remain unchanged. ID creation runs only during primitive setup,
not during signal, computed, or effect updates.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,198 bytes | 10,240 bytes |  42 bytes |

The production kernel guard was rerun with the median of seven runs, each run
using five timed samples:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.07 |        4.82 | 1.27× |
| 20-deep computed chain write + read |       6.26 |        5.24 | 1.20× |
| 200-effect fanout write             |       2.03 |        1.16 | 1.73× |
| Dynamic dependency switch           |       3.46 |        2.46 | 1.41× |
| Repeated equal write                |       0.82 |        0.50 | 1.62× |

All five ratios pass the 2× guard. The U2 adapter has no effect on the existing
kernel hot paths.

## UI U4 batch 1 (2026-10-03)

The seven styled registry components do not modify `@benosjs/core` or
`@benosjs/dom`; these measurements are from a fresh production rebuild.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |  40 bytes |

The production kernel guard was rerun with the median of seven runs, each run
using five timed samples:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.20 |        4.94 | 1.24× |
| 20-deep computed chain write + read |       6.41 |        5.27 | 1.22× |
| 200-effect fanout write             |       2.06 |        1.19 | 1.76× |
| Dynamic dependency switch           |       3.57 |        2.49 | 1.41× |
| Repeated equal write                |       0.84 |        0.53 | 1.60× |

All five ratios pass the 2× guard. There were no core or DOM source changes.
Component coverage and the gallery instructions are recorded in
[`docs/checkpoints/ui-U4-batch-1.md`](../docs/checkpoints/ui-U4-batch-1.md).

## UI U4 batch 2 (2026-10-03)

Production artifacts were rebuilt before measurement. Batch 2 adds only
registry source and styles; the Select collection import is a declared Zag
dependency and no component code enters core or DOM.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |  40 bytes |

The production kernel guard used the median of seven runs, each with five
timed samples:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.15 |        4.93 | 1.28× |
| 20-deep computed chain write + read |       6.38 |        5.30 | 1.19× |
| 200-effect fanout write             |       2.14 |        1.18 | 1.79× |
| Dynamic dependency switch           |       3.55 |        2.47 | 1.44× |
| Repeated equal write                |       0.84 |        0.51 | 1.65× |

All five ratios pass the 2× production guard. See the [U4 batch 2 checkpoint](../docs/checkpoints/ui-U4-batch-2.md) for the six-component browser and consumer matrix.

## UI U4 batch 2 review fixes (2026-10-04)

Rebuilt production artifacts locally with Node v24.8.0 before measuring. No
core or DOM runtime source changed in this review; the Tab direction fix is in
the UI registry component and the checkbox change is in registry CSS. The
prior Node 22.18.0 checkpoint build measured 4,051 / 10,200 bytes; this local
rebuild measures two fewer bytes for both artifacts. Both measurements remain
under their unchanged budgets.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,049 bytes |  4,096 bytes |  47 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,198 bytes | 10,240 bytes |  42 bytes |

The production benchmark guard used the median of seven runs, each with five
timed samples. These medians were measured after other local verification jobs
finished:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       5.97 |        4.72 | 1.27× |
| 20-deep computed chain write + read |       6.21 |        4.99 | 1.26× |
| 200-effect fanout write             |       2.01 |        1.16 | 1.74× |
| Dynamic dependency switch           |       3.63 |        2.35 | 1.54× |
| Repeated equal write                |       0.69 |        0.48 | 1.44× |

All ratios pass the 2× production guard. No kernel benchmark workload or
production runtime path changed in the review.

## UI U4 batch 3 (2026-10-05)

Rebuilt production artifacts with Node 22.18.0 before measuring. Batch 3 adds
registry components and styles plus one explicit keyboard tab stop on the
Tooltip trigger; no core or DOM runtime source changed.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |  40 bytes |

The production kernel guard used the median of seven runs, each with five
timed samples. It was run after the full browser and consumer test jobs had
finished:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.39 |        5.03 | 1.29× |
| 20-deep computed chain write + read |       6.83 |        5.59 | 1.24× |
| 200-effect fanout write             |       2.31 |        1.29 | 1.70× |
| Dynamic dependency switch           |       3.65 |        2.60 | 1.40× |
| Repeated equal write                |       0.84 |        0.55 | 1.60× |

All five ratios pass the 2× production guard. No benchmark workload or
production runtime path changed in batch 3.

## UI U4 batch 4 table comparison (2026-10-05)

Fresh production build sizes remain inside the unchanged limits. Batch 4 adds
only registry source, CSS, tests, and benchmark code; core and DOM runtime
sources did not change.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |  40 bytes |

The production kernel guard used the median of seven runs with five timed
samples each:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.04 |        4.77 | 1.27× |
| 20-deep computed chain write + read |       6.38 |        5.28 | 1.21× |
| 200-effect fanout write             |       2.11 |        1.18 | 1.74× |
| Dynamic dependency switch           |       3.52 |        2.44 | 1.44× |
| Repeated equal write                |       0.81 |        0.68 | 1.19× |

Both adapters were built with Vite's production build and run in Chromium. Each
round alternated which framework ran first. The fixture starts in reverse
numeric name order so sorting requires keyed row movement. It renders the same
three columns, caption, data, and table CSS. Initial render timing begins just
before mount (after deterministic row data is prepared); sort timing begins at
header activation. Both end after two `requestAnimationFrame` callbacks, which
is a render/paint opportunity boundary and a practical browser proxy, not a
Chrome-tracing paint timestamp. Results are the median of seven measured
rounds after one warmup; brackets give min–max spread.

| Workload                    |          Benos (ms) |          Solid (ms) | Benos / Solid |
| --------------------------- | ------------------: | ------------------: | ------------: |
| Initial render, 5,000 rows  | 255.0 [174.6–326.7] |    93.9 [87.7–99.3] |         2.72× |
| Sort, 5,000 rows            |  126.8 [87.5–136.3] |  115.0 [92.3–124.3] |         1.10× |
| Initial render, 10,000 rows | 491.4 [387.0–554.3] | 199.6 [173.9–265.1] |         2.46× |
| Sort, 10,000 rows           | 266.2 [234.0–447.5] | 240.2 [197.4–361.4] |         1.11× |

Benos is about 2.5–2.7× slower on initial mounting and about 10–11% slower
for a full keyed sort in these runs. The initial-mount difference is consistent
with the additional descriptor, accessor, and owner work per cell in the
source-owned component; this benchmark does not isolate those costs, so that is
a likely explanation rather than a profile finding. Sort spreads overlap
substantially, so the small sort gap should be treated as directional. Raw
samples and protocol metadata are in
[`js-framework-benchmark/results/u4-batch4-table.json`](js-framework-benchmark/results/u4-batch4-table.json).

## UI U4 gallery review follow-up (2026-10-05)

The sortable-table mount profile now includes four production-built fixtures:
direct DOM, a handwritten Benos keyed table, the registry `SortableTable`, and
an equivalent Solid table. The runner alternates the four fixtures in
Chromium. It prepares row data before the mount timer and ends after two
animation frames. Values below pool three independent runs of seven measured
rounds each after one warmup (21 samples); brackets are the observed min–max
spread. The two-frame boundary is a render/paint opportunity proxy rather than
a traced Paint event.

| Variant                    |    Initial, 5,000 rows |   Initial, 10,000 rows |     Sort, 5,000 rows |      Sort, 10,000 rows |
| -------------------------- | ---------------------: | ---------------------: | -------------------: | ---------------------: |
| Direct DOM baseline        |   78.7 [69.2–183.7] ms | 146.7 [135.0–169.2] ms |                    — |                      — |
| Handwritten Benos baseline | 151.8 [135.6–174.8] ms | 292.9 [276.0–365.6] ms |                    — |                      — |
| Registry SortableTable     | 150.7 [134.9–236.1] ms | 308.3 [272.9–485.5] ms | 88.5 [78.7–140.5] ms | 178.2 [164.7–306.4] ms |
| Solid table                |   76.4 [63.6–108.6] ms | 144.6 [130.1–278.8] ms | 84.2 [73.3–152.1] ms | 212.2 [166.3–465.1] ms |

The registry component adds no measurable initial-render cost at 5,000 rows
against the handwritten Benos baseline (150.7 vs 151.8 ms). At 10,000 rows it
measures 5.3% higher (308.3 vs 292.9 ms), but the spreads overlap broadly and
the three independent runs varied; that difference is not enough evidence to
justify further component changes. The general Benos rendering baseline is
about 1.9–2.0× the direct-DOM baseline. The registry mount is about 2.0× Solid
at both sizes. Sort medians are similar to Solid and their spreads overlap.

The first profiling pass before optimization measured registry mount at 202.4
ms vs 156.4 ms handwritten Benos at 5,000 rows, and 371.7 ms vs 300.5 ms at
10,000 rows. It used a keyed inner `<For>` to reconcile the same static columns
for every row. Replacing that redundant per-row column reconciler with one
array map removed the observed 29.4% / 23.7% increment: the current pooled
medians are effectively even at 5,000 rows and within the noisy spread at
10,000. Sorting remains keyed by the caller's stable row key. Columns are
provided as a static descriptor list; the previous inner `<For>` did not
actually pass the attempted dynamic-column replacement test either.

Core and core + DOM were rebuilt with Node 22.18.0 before the gallery-review
checkpoint:

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |  40 bytes |

The production kernel guard was rerun after the rebuild; each row is the
median of seven runs with five timed samples per run.

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.07 |        4.80 | 1.27× |
| 20-deep computed chain write + read |       6.32 |        5.24 | 1.20× |
| 200-effect fanout write             |       2.12 |        1.17 | 1.79× |
| Dynamic dependency switch           |       3.48 |        2.45 | 1.43× |
| Repeated equal write                |       0.82 |        0.50 | 1.55× |

The current sizes and kernel medians are also recorded in the accompanying
checkpoint at
[`docs/checkpoints/ui-U4-gallery-followup.md`](../docs/checkpoints/ui-U4-gallery-followup.md).
Raw profiles are in
[`u4-batch4-profile.json`](js-framework-benchmark/results/u4-batch4-profile.json)
and the three archived run files beside it.

## UI U6 interactive create-benos follow-up (2026-10-05)

This follow-up changes only the create-benos CLI, its test harness, and
documentation. It does not change core or DOM runtime code. The local
verification shell used Node 24.8.0, which is below the workspace's declared
minimum; CI uses Node 22.18.0. Record these local values for this checkpoint
and use the CI size row as the supported-runtime confirmation.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,049 bytes |  4,096 bytes |  47 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,198 bytes | 10,240 bytes |  42 bytes |

The production kernel guard was run on its own and reports the median of seven
runs with five timed samples per run:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       5.97 |        4.76 | 1.26× |
| 20-deep computed chain write + read |       6.25 |        4.92 | 1.28× |
| 200-effect fanout write             |       1.99 |        1.14 | 1.74× |
| Dynamic dependency switch           |       3.67 |        2.29 | 1.59× |
| Repeated equal write                |       0.68 |        0.47 | 1.43× |

All rows remain below the 2× guard. No framework hot path changed in this
follow-up.

## U7 v0.2.0 release preparation (2026-10-06)

Rebuilt and measured with Node 24.19.0. The new release changes package
metadata, registry version gates, documentation, and the CLI consumer test
setup; it does not change the core or DOM runtime sources.

| Artifact                         |     Measured |       Budget | Remaining |
| -------------------------------- | -----------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |  40 bytes |

The production kernel guard reports the median of seven runs with five timed
samples per run:

| Kernel workload                     | Benos (ms) | Preact (ms) | Ratio |
| ----------------------------------- | ---------: | ----------: | ----: |
| Signal read                         |       6.24 |        4.96 | 1.26× |
| 20-deep computed chain write + read |       6.32 |        4.94 | 1.28× |
| 200-effect fanout write             |       2.04 |        1.16 | 1.76× |
| Dynamic dependency switch           |       3.87 |        2.47 | 1.54× |
| Repeated equal write                |       0.72 |        0.49 | 1.44× |

Every row remains under the 2× CI guard. Local verification also passed the
221 unit tests, all 405 Chromium/Firefox/WebKit browser tests, the packed
create-benos consumer, and the pnpm UI CLI consumer matrix.

## Initial-render P1 runtime-JSX history (2026-10-10)

This table is historical. The generic P1 adapter used hand-written runtime
`jsx` descriptors, which bypassed the compiler and does not match a
create-benos TSX application. The current published comparison is the compiled
`safe` TSX record below. Earlier tables remain as history to show how the
harness correction changed the measured gap.

Core and DOM were rebuilt before this measurement; sizes remain within budget.
The package build and the benchmark adapter use production output. The baseline
is commit `e029073` (the 0.1.2 package release commit; no `v0.1.2` tag exists
in local or remote refs). Both Benos versions used the same current benchmark
adapter. Chromium trace timing was interleaved with two warmups and seven
measured rounds. Values are median milliseconds [minimum–maximum].

| Operation         |                    v0.1.2 |              Current HEAD |                     Solid | HEAD / v0.1.2 | HEAD / Solid |
| ----------------- | ------------------------: | ------------------------: | ------------------------: | ------------: | -----------: |
| Create 1,000      |    39.914 [38.963–48.959] |    39.171 [38.347–39.890] |    25.252 [24.740–28.102] |         0.98× |        1.55× |
| Replace 1,000     |    43.665 [42.274–47.035] |    42.360 [41.996–47.304] |    25.524 [25.335–27.695] |         0.97× |        1.66× |
| Update every 10th |    14.541 [13.106–15.060] |    15.389 [14.054–19.971] |    13.863 [13.640–14.081] |         1.06× |        1.11× |
| Select row        |      6.138 [1.285–17.101] |      7.317 [1.216–15.231] |       0.901 [0.879–1.014] |         1.19× |        8.12× |
| Swap rows         |      5.339 [3.966–17.697] |      5.840 [5.093–11.707] |      3.583 [2.871–24.145] |         1.09× |        1.63× |
| Remove one row    |      8.792 [4.818–19.778] |     13.946 [5.213–18.305] |     10.143 [4.434–24.899] |         1.59× |        1.37× |
| Create 10,000     | 430.204 [385.832–514.739] | 454.222 [402.521–599.993] | 276.428 [243.823–360.283] |         1.06× |        1.64× |
| Append 1,000      |    65.829 [53.981–72.957] |    59.708 [56.751–94.454] |    43.742 [37.317–76.198] |         0.91× |        1.37× |
| Clear 1,000       |      8.878 [7.017–13.931] |     11.717 [7.756–16.937] |       3.205 [1.731–6.367] |         1.32× |        3.66× |

A second interleaved seven-round run focused on replace and clear. Replace
medians were 48.395 ms [45.320–54.920] for v0.1.2 and 49.765 ms
[45.380–61.751] for HEAD; clear medians were 9.502 ms [7.351–17.348] and
8.144 ms [6.830–18.028]. The runs disagree on which version is faster, and
the spreads overlap. This does not confirm a runtime regression. The prior
1.96× replace report is close to the focused run's 1.89× HEAD/Solid ratio;
the primary same-protocol run measured 1.66×. The earlier 9.59× clear ratio
used a 1.30 ms Solid denominator; the paired reruns measured Solid clear at
3.205 ms and 3.834 ms, producing HEAD/Solid ratios of 3.66× and 2.12×.
Phase 6b recorded 2.43× clear and 1.64× replace. These differences are
consistent with the broad trace spreads and unstable Solid clear denominator,
not evidence of a source regression. No source fix or optimization was made.

The P1 production size gate passed:

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  4,049 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,198 bytes | 10,240 bytes |

The temporary source-mapped production profile, Chromium GC traces, and
allocation sampling results are recorded in
[`docs/checkpoints/perf-p1.md`](../docs/checkpoints/perf-p1.md), with raw
results in `benchmarks/js-framework-benchmark/results/perf-p1-*.json`.

## Initial-render P3: first compiled-path baseline (2026-10-10, historical)

The original generic Benos adapter used JavaScript runtime `jsx` descriptors,
so its TSX compiler path was skipped. That P1 comparison did not match a
create-benos app. The generic adapter is now TSX and both the generic and table
fixtures build through the built `@benosjs/vite` production entry with
`optimization: 'safe'`, matching the starter's production transform. The
P1 values above are retained as runtime-JSX history. This first compiled
comparison is also kept as history; use the refreshed compiled comparison
below for current release reporting. Baseline commit `e029073` contains
core and DOM version 0.1.2. The protocol is Chromium trace click-to-paint, two
warmups, seven interleaved measured rounds. Times are milliseconds, median
[minimum–maximum].

| Operation         |                    v0.1.2 |                   Current |                     Solid | Current / Solid |
| ----------------- | ------------------------: | ------------------------: | ------------------------: | --------------: |
| Create 1,000      |    52.180 [51.013–62.091] |    52.907 [50.913–56.275] |    25.264 [24.713–27.305] |           2.09× |
| Replace 1,000     |    57.604 [55.837–60.543] |    58.035 [56.098–89.638] |    25.723 [24.919–26.556] |           2.26× |
| Update every 10th |    13.766 [13.127–15.863] |    14.413 [12.946–18.574] |    13.738 [13.572–14.220] |           1.05× |
| Select one row    |      1.808 [1.162–11.014] |       1.248 [1.164–1.531] |       0.856 [0.806–0.893] |           1.46× |
| Swap rows         |       3.782 [3.457–5.517] |       3.779 [3.611–9.192] |       2.958 [2.810–3.683] |           1.28× |
| Remove one row    |       4.725 [4.495–5.605] |      4.566 [4.402–12.156] |       4.313 [4.215–5.086] |           1.06× |
| Create 10,000     | 490.079 [482.844–498.807] | 492.144 [483.591–512.038] | 237.605 [234.933–249.741] |           2.07× |
| Append 1,000      |    58.933 [58.448–59.235] |    59.130 [58.384–60.011] |    35.173 [35.058–35.483] |           1.68× |
| Clear 1,000       |       9.315 [8.954–9.937] |       9.312 [9.126–9.853] |       2.549 [2.528–2.581] |           3.65× |

The corrected path changes the measured Benos/Solid gap materially on create,
replace, append, and clear. The current and v0.1.2 medians are close with
overlapping spreads on all nine rows, so this is a harness correction, not a
confirmed source regression.

The compiled registry table measured 146.6 ms [138.2–149.5] to mount 5,000
rows and 279.7 ms [262.0–291.6] to mount 10,000 rows; Solid measured 71.4
[65.4–75.6] and 137.6 [131.1–149.5] ms. Sort medians were 92.7
[81.8–173.8] vs 79.9 [73.4–81.9] ms at 5k, and 178.0 [156.4–226.7] vs
156.7 [152.3–208.5] ms at 10k. Raw results and source-mapped attribution are
in [`results/p3-compiled-release-comparison.json`](./js-framework-benchmark/results/p3-compiled-release-comparison.json),
[`results/p3-compiled-table.json`](./js-framework-benchmark/results/p3-compiled-table.json),
and the [P3 checkpoint](../docs/checkpoints/perf-p3-attribution.md).

### P3 property-key iteration trial

The guarded `for...in` prop-key trial ran twice on the same compiled production path, with every one of the nine operations reported in [its checkpoint](../docs/checkpoints/perf-p3-property-keys.md). Create 1k improved in the first run and regressed in the confirmation run; retained allocations were unchanged and all timing spreads overlapped. The candidate added 10 B to core + DOM, so its implementation was reverted. The semantic test for enumerable own-key order remains. The next trial is delegated event slots.

### P3 delegated event slots

The getter-slot implementation removes the compiled-path event record, props
wrapper, and extra getter closure while preserving untracked handler reads at
dispatch. Its allocation profiles show about 16 fewer retained JS objects and
545 fewer bytes per row; owner and effect call counts are unchanged. The nine
click-to-paint rows and table rows remain within overlapping spreads, so no
timing improvement is claimed. Core is 4,049 B and core + DOM is 10,200 B.
The full before/after tables and direct-handler size experiment are in [the
event-slot checkpoint](../docs/checkpoints/perf-p3-event-slots.md); raw results
are `p3-event-slots*.json` under `js-framework-benchmark/results/`.

## Current compiled-path comparison: `safe` TSX (2026-10-11)

The create-benos starter runs TSX through the production `@benosjs/vite`
plugin with `optimization: 'safe'`. This comparison uses that same built plugin,
production core and DOM entries, and TSX source. Chromium trace click-to-paint
was interleaved across v0.1.2, current HEAD, and Solid with two warmups and
seven measured rounds. Times are median milliseconds [minimum–maximum].

| Operation         |                    v0.1.2 |          Current compiled |                     Solid | Current / Solid |
| ----------------- | ------------------------: | ------------------------: | ------------------------: | --------------: |
| Create 1,000      |    52.406 [52.019–52.828] |    51.121 [49.867–52.737] |    25.495 [25.367–26.681] |           2.01× |
| Replace 1,000     |    57.502 [56.132–58.342] |    52.987 [52.575–59.255] |    25.423 [25.227–26.439] |           2.08× |
| Update every 10th |    13.947 [13.587–17.075] |    15.458 [13.581–17.730] |    14.278 [14.141–15.781] |           1.08× |
| Select one row    |       1.343 [1.193–1.568] |       1.307 [1.223–1.412] |       0.870 [0.829–0.952] |           1.50× |
| Swap rows         |      4.027 [3.468–13.735] |      3.908 [3.519–12.752] |       3.129 [3.036–3.590] |           1.25× |
| Remove one row    |       4.694 [4.489–4.803] |       4.636 [4.598–5.105] |       4.494 [4.379–4.921] |           1.03× |
| Create 10,000     | 510.544 [507.571–512.365] | 486.265 [480.083–568.523] | 243.630 [241.184–248.700] |           2.00× |
| Append 1,000      |    61.179 [57.565–65.227] |    56.207 [55.988–57.295] |    35.964 [35.372–37.671] |           1.56× |
| Clear 1,000       |       9.667 [9.481–9.983] |       9.287 [9.015–9.527] |       2.622 [2.391–2.898] |           3.54× |

The P1 runtime-JSX table showed create, replace, and create-10k at 1.55×,
1.66×, and 1.64× Solid; the corresponding compiled-path medians are now
2.02×, 2.17×, and 2.06×. Clear remains near 3.6× in this rerun; earlier
release records with a faster Solid clear denominator were not stable. The
compiler path's additional template and binding costs are detailed in the
[P3 compiled comparison checkpoint](../docs/checkpoints/perf-p3-compiled-comparison.md).
The raw seven-round samples for this latest compiled build are in
[`results/p3-direct-slots-2.json`](./js-framework-benchmark/results/p3-direct-slots-2.json).

### P3 stable raw-handler trial (reverted)

The user-approved larger caps were applied before reevaluating direct storage
for stable inline handler functions. Two interleaved runs did not show a
repeatable timing gain on any operation, and the forced-GC profile retained the
same 58 functions, 113 plain objects, and 49.993 arrays per row as the
getter-slot baseline. The trial added 59 B to core + DOM (core stayed at
4,049 B), and the generated generic app grew by about 120 B raw / 70 B gzip.
It was reverted. The all-nine before/after medians and spreads are recorded in
the [P3 follow-up checkpoint](../docs/checkpoints/perf-p3-direct-slots.md).

### P3 direct numeric template slots (kept)

Replacing each template mount's slot `Map` with a sparse numeric array removes
seven retained plain objects and 132 retained bytes per row, at the cost of six
additional arrays and no net increase in total retained JavaScript object
count. The two compiled-path confirmation runs consistently improved create
10k by 1.6–2.1% and append by about 2%, with no repeatable regression in the
other seven rows. Core is 4,049 B; core + DOM is 10,199 B (−1 B from the
10,200 B baseline). The generic compiled app is 33.66 kB raw / 10.88 kB gzip;
the dashboard Benos slice is 11,450 B gzip and measured 34.0 ms [31.4–38.1]
versus Solid at 12.2 ms [11.1–17.9]. Detailed traces, allocation profiles,
and the 5k/10k table run are in the
[P3 follow-up checkpoint](../docs/checkpoints/perf-p3-direct-slots.md).

## P3 direct compiler-output ceiling experiment (prototype history, 2026-10-11)

Before the direct-output experiment, the compiled `safe` path retained 219.994
JavaScript objects and 7.547 KB per generic benchmark row after forced GC,
versus 153.5 objects and 4.71 KB for the earlier runtime-JSX adapter. The
compiled path adds 66.5 objects and 2.83 KB per row. Its marked 10k-row CPU
spans move work as follows; marks are independently sampled and overlap, so
their durations must not be summed as a wall-clock total.

| Marked category        | Runtime JSX, ms / 10k | Compiled safe, ms / 10k | Change, ms / 10k | Calls, runtime → compiled |
| ---------------------- | --------------------: | ----------------------: | ---------------: | ------------------------: |
| Template instantiation |                   0.0 |                   167.1 |           +167.1 |               0 → 140,000 |
| Binding setup          |                 200.0 |                   114.1 |            −85.9 |         290,000 → 190,000 |
| Owner creation         |                   7.0 |                    30.2 |            +23.2 |          50,000 → 200,000 |
| Signal node creation   |                   7.4 |                     5.3 |             −2.1 |           10,000 → 10,000 |
| Effect node creation   |                   4.1 |                    21.8 |            +17.7 |          20,000 → 100,000 |
| Event setup            |                  20.8 |                    14.4 |             −6.4 |           40,000 → 40,000 |
| DOM insertion          |                  44.7 |                    64.6 |            +19.9 |         120,000 → 100,016 |
| Disposal               |                   1.3 |                    25.1 |            +23.8 |          10,004 → 140,004 |

That is +6.65 retained objects and +0.283 KB per row. The largest added
retained categories were closures (33.9 → 58, +24.1), plain objects (86.4 →
106, +19.6), and arrays (33.2 → 55.993, +22.793). Template plan creation,
owner creation, and effects add work; compiled binding setup and event setup
take less time in these marks.

The experiment added a private build-time environment flag,
`BENOS_EXPERIMENTAL_DIRECT_OUTPUT=1`. It only lowers dynamic `<tr>` and `<td>`
subtrees whose bindings fit the direct prototype: one cached HTML template per
Document, cloned per mount, generated child/sibling walks, and direct text,
attribute, and event binding statements. The template definition and binder
function are module-hoisted; there is no per-row template plan or setup closure.
The renderer calls that shared binder once per clone and the descriptor still
stores one environment array. The registry table's outer `<tr>` contains a
dynamic JSX-producing `columns.map`, so it falls back to the normal template
path; its `<td>` cells use direct output.

The generic fixture was built through the production Benos Vite compiler path.
The runner interleaved two warmups and seven measured Chromium trace rounds.
Values are click-to-paint milliseconds, median [minimum–maximum]. The selected
operations are create 1,000, replace 1,000, create 10,000, append 1,000, and
clear 1,000.

| Operation     |  Current compiled safe | Experimental direct output |                  Solid | Current / Solid | Direct gap closed |
| ------------- | ---------------------: | -------------------------: | ---------------------: | --------------: | ----------------: |
| Create 1,000  |    52.33 [51.00–52.94] |        32.79 [31.36–34.24] |    25.76 [25.11–26.76] |           2.03× |             73.6% |
| Replace 1,000 |    53.02 [52.30–57.14] |        31.61 [30.20–32.58] |    26.09 [25.37–26.40] |           2.03× |             79.5% |
| Create 10,000 | 483.58 [480.76–542.79] |     292.81 [289.20–294.88] | 243.88 [242.53–250.63] |           1.98× |             79.6% |
| Append 1,000  |    56.89 [56.13–57.96] |        40.80 [39.55–49.71] |    36.48 [36.12–38.47] |           1.56× |             78.9% |
| Clear 1,000   |      9.93 [9.10–10.65] |           4.43 [4.35–4.49] |       2.72 [2.62–2.74] |           3.65× |             76.3% |

The direct prototype closes about 74–80% of the current compiled-path gap on
these five medians. It remains 1.12–1.63× Solid. Allocation sampling on 1,000
rows measured these per-row forced-GC retained deltas:

| Allocation category             | Current compiled safe | Direct output |  Solid |
| ------------------------------- | --------------------: | ------------: | -----: |
| Closures / functions            |                    58 |            25 |  8.001 |
| Plain JavaScript objects        |               106.001 |        35.002 | 11.003 |
| Arrays                          |                55.993 |         7.993 |  6.007 |
| DOM wrappers                    |                17.999 |            10 |     10 |
| Owner creation calls            |                    20 |             6 |      1 |
| Effect / computation node calls |                    10 |             4 |      3 |

Compared with compiled `safe`, direct output cuts retained closures by 57%,
plain objects by 67%, arrays by 86%, owner calls by 70%, and effect calls by
60%. It still retains more of each JavaScript category than Solid.

The whole minified generic application bundle measured 34,197 B / 10,929 B
gzip for safe output and 33,633 B / 11,101 B gzip for direct output: −564 B
raw but +172 B gzip. The sortable-table application measured 36,273 B /
11,562 B gzip safe and 36,434 B / 11,763 B gzip direct: +161 B raw / +201 B
gzip. The bundled runtime helpers outweigh template-plan savings in that entry.

The same table page measured these medians after two warmups and seven rounds;
brackets are observed spread. The registry table uses direct compiled cells
only, because its mapped JSX children prevent whole-row template lowering.

| Table workload       |  Current compiled safe |     Direct cell output |                  Solid |
| -------------------- | ---------------------: | ---------------------: | ---------------------: |
| Initial, 5,000 rows  | 152.8 [139.6–160.2] ms | 130.1 [111.7–137.2] ms |    74.7 [68.0–86.7] ms |
| Sort, 5,000 rows     |   91.8 [86.4–179.3] ms |   95.3 [79.5–105.8] ms |   84.2 [78.2–180.5] ms |
| Initial, 10,000 rows | 293.2 [279.0–336.2] ms | 245.1 [238.8–263.9] ms | 141.9 [140.5–150.6] ms |
| Sort, 10,000 rows    | 183.6 [162.9–288.0] ms | 175.7 [168.0–313.7] ms | 168.4 [153.9–256.2] ms |

The direct cell path closes about 29–32% of the initial-mount gap to Solid.
Sorting is unchanged within the broad overlapping spreads. Current package
sizes are core 4,049 B / 4,608 B and core + DOM 10,337 B / 11,264 B; this
prototype adds 138 B to core + DOM and 0 B to core. All budgets still pass.

At the time of this experiment the prototype was not enabled by default and
had a narrow table-only shape. The next checkpoint integrated direct output
into the standard `safe` optimization with delegated events and normal DOM
property handling; see the implementation measurements below. This table is
kept as the prototype's original ceiling result.

Raw trace, allocation, smoke, and table samples are in
[`direct-prototype-trace.json`](js-framework-benchmark/results/direct-prototype-trace.json),
[`direct-prototype-allocation.json`](js-framework-benchmark/results/direct-prototype-allocation.json),
[`direct-prototype-table.json`](js-framework-benchmark/results/direct-prototype-table.json),
and [`direct-prototype-smoke.json`](js-framework-benchmark/results/direct-prototype-smoke.json).

## P3 direct output in the standard `safe` path (2026-10-11)

The compiler now uses direct output as its normal `optimization: 'safe'`
implementation for eligible native JSX subtrees. It preserves the renderer's
delegated event slots, native-before-delegated ordering, automatic event
batching, handler error reporting, standard property/URL rules, owned child
ranges, and mount timing. The no-optimization path remains the behavior oracle.
Both `none` and `safe` pass the same development/production fixture matrix and
source-map assertions; the full Chromium, Firefox, and WebKit browser suite
passes 405/405 tests.

This interleaved production trace used Chromium 153 on macOS arm64, two
warmups, and seven rounds. “Runtime JSX” calls the public JSX runtime directly
and is the prior runtime path; “Safe direct” is TSX compiled by the production
Benos Vite plugin; Solid uses the equivalent JSX adapter. Values are
click-to-paint milliseconds, median [minimum–maximum].

| Operation      |            Runtime JSX |            Safe direct |                  Solid | Safe direct / Solid |
| -------------- | ---------------------: | ---------------------: | ---------------------: | ------------------: |
| Create 1,000   |    39.87 [39.20–40.11] |    34.84 [34.28–36.60] |    25.92 [25.36–27.13] |               1.34× |
| Replace 1,000  |    41.66 [41.17–43.24] |    36.85 [36.48–37.19] |    26.36 [24.88–26.94] |               1.40× |
| Partial update |    14.75 [14.04–15.41] |    13.92 [13.47–22.02] |    14.30 [14.04–16.88] |               0.97× |
| Select row     |      7.82 [1.27–12.56] |       1.40 [1.26–1.65] |       0.93 [0.86–1.00] |               1.50× |
| Swap rows      |      8.53 [7.52–10.10] |      4.15 [3.90–22.25] |       3.24 [2.86–3.57] |               1.28× |
| Remove row     |       4.78 [4.68–8.34] |       4.96 [4.80–5.16] |       4.49 [4.25–4.59] |               1.10× |
| Create 10,000  | 367.58 [361.74–369.19] | 325.86 [324.54–333.79] | 244.45 [243.08–246.10] |               1.33× |
| Append 1,000   |    47.69 [47.29–48.53] |    45.02 [44.13–52.91] |    36.57 [36.22–37.36] |               1.23× |
| Clear 1,000    |       6.21 [6.00–8.14] |       5.39 [5.31–6.27] |       2.63 [2.48–2.70] |               2.05× |

Selection and swap have wide spreads from paint scheduling and GC outliers;
their medians are shown with the full observed spread. The standard safe path
is 1.34× Solid on create, 1.40× on replace, and 1.33× on 10k create. Clear is
still just over the previous 2× target at 2.05×.

Allocation sampling and forced-GC snapshots over 1,000 created rows produce
the following retained per-row counts. Owner/signal/effect figures are calls
counted at their core constructors; other categories are retained heap
deltas. DOM wrappers are browser-side wrappers, not runtime JS objects.

| Per-row category              | Runtime JSX | Safe direct | Solid |
| ----------------------------- | ----------: | ----------: | ----: |
| Retained closures / functions |       33.00 |       24.00 |  8.00 |
| Retained plain objects        |       80.00 |       57.00 | 11.00 |
| Retained arrays               |       31.00 |       15.99 |  6.01 |
| Retained DOM wrappers         |       11.00 |       12.00 | 10.00 |
| Owner constructor calls       |           5 |           8 |     1 |
| Signal constructor calls      |           1 |           1 |     0 |
| Effect constructor calls      |           2 |           4 |     3 |
| Retained JS object count      |      145.47 |       98.49 | 26.48 |
| Retained JS bytes             |       4,459 |       3,584 |   913 |

Against the previous compiled-safe profile, direct output reduced retained
closures from 58 to 24, objects from 106 to 57, arrays from 56 to 16, owners
from 20 to 8, and effect nodes from 10 to 4 per row. In the direct comparison
with runtime JSX, it retains about 47 fewer JS objects and 875 fewer JS bytes
per row, while making more owner/effect constructor calls. Source-mapped
allocation sites account for 91% of both object count and bytes on the safe
path; the full profiles are linked below.

The generic production app's JS asset is 33.73 kB raw / 11.29 kB gzip for safe
direct output, compared with 30.23 kB / 10.56 kB for runtime JSX and
15.58 kB / 6.45 kB for Solid. The direct compiler output adds about 3.50 kB
raw / 0.73 kB gzip to this app versus runtime JSX. The table app measures
36.33 kB / 11.90 kB gzip; the matched handwritten Benos table is 32.04 kB /
10.71 kB and Solid is 15.27 kB / 6.25 kB.

The sortable-table outer row already compiles directly: the compiler binds
`columns.map(...)` to a child slot in a cloned `<tr>` skeleton, then lowers
each mapped `<td>` as its own direct native template. The `map` expression
does not force the row through a template plan. The compiler matrix includes
a regression fixture that asserts direct `<tr>` and `<td>` templates for this
mapped-child shape and compares its runtime DOM in both optimization modes.

The table benchmark below uses the same production compiler path, with two
warmups and seven rounds. It measures initial render through two animation
frames; the registry and Solid cases also sort through two frames. This is the
table baseline for the direct safe implementation:

| Table operation      |             Native DOM |      Handwritten Benos | Registry `SortableTable` |                  Solid |
| -------------------- | ---------------------: | ---------------------: | -----------------------: | ---------------------: |
| Initial, 5,000 rows  |    72.0 [68.5–81.7] ms | 110.6 [100.1–129.0] ms |   148.7 [135.1–173.3] ms |    74.2 [71.8–76.7] ms |
| Sort, 5,000 rows     |                      — |                      — |    135.4 [87.3–172.1] ms |    91.6 [73.1–97.6] ms |
| Initial, 10,000 rows | 141.3 [136.9–151.4] ms | 232.8 [220.7–238.2] ms |   304.3 [280.3–350.0] ms | 142.4 [137.1–167.0] ms |
| Sort, 10,000 rows    |                      — |                      — |   231.9 [173.6–247.7] ms | 165.4 [158.6–358.7] ms |

Registry mount remains about 2.00× Solid at 5k and 2.14× at 10k; registry
sorting is 1.48× and 1.40×. The mapped child no longer falls back to a
template plan, but `columns.map` still creates its per-row mapped descriptor
array. The component adds more sorting, columns, empty-state, direction, and
accessibility behavior than the handwritten table baseline. The Solid 10k
sort spread has a 358.7 ms outlier; the median and full spread are retained.

The measured JavaScript assets are 2.14 kB / 1.04 kB gzip for native DOM,
32.04 kB / 10.71 kB for handwritten Benos, 36.33 kB / 11.90 kB for the
registry table, and 15.27 kB / 6.25 kB for Solid. Shared table CSS is 26.18
kB / 4.08 kB gzip in each build. The exact samples are in
[`safe-direct-baseline-table-2026-10-11.json`](js-framework-benchmark/results/safe-direct-baseline-table-2026-10-11.json).

The dashboard table-plus-form filter slice measured 24.6 ms
[22.7–34.4] for Benos and 13.0 ms [12.0–17.1] for Solid (1.89×), with app JS
assets of 11,586 B and 6,590 B gzip. These dashboard samples were interleaved
by round with two warmups and seven measured rounds.

Current rebuilt package sizes are core 4,049 / 4,608 B gzip and core + DOM
10,508 / 11,264 B gzip. Both budgets pass. The generic app's changed-output
source maps are verified in development and production. The current fallback
cases are documented in
[`compiler.md`](../docs/architecture/compiler.md): spreads, refs, custom
elements/customized built-ins, template contents, special void/raw-text/RCDATA
child cases, and expressions with unsupported lexical constructs. Other
native subtrees in a component/control-flow render may still use direct output.

Raw results: [nine-operation trace](js-framework-benchmark/results/safe-direct-nine-2026-10-11.json),
[table trace](js-framework-benchmark/results/safe-direct-baseline-table-2026-10-11.json),
[allocation profile](js-framework-benchmark/results/safe-direct-allocation-2026-10-11.json),
and the dashboard [comparison samples](../examples/dashboard/comparison-results.json).

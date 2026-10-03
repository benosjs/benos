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

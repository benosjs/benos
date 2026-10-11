# P1 — Production profiles and attribution

> **Superseded benchmark path:** the original generic adapter in this P1 run
> used hand-written runtime `jsx` calls, so it bypassed `@benosjs/vite` and did
> not represent a create-benos TSX application. The CPU, retained-allocation,
> and GC measurements below are historical runtime-JSX results. The corrected
> compiled-TSX comparison and profiles are in the
> [P3 attribution checkpoint](./perf-p3-attribution.md); use that report for
> framework performance decisions.

## Checkpoint

- P0 brief: [perf-plan.md](../perf-plan.md).
- Working branch: `perf/initial-render`, from `origin/main` at `69106be`.
- Rebuilt production bundles and passed the size gate: core 4,049 / 4,096 bytes; core + DOM 10,198 / 10,240 bytes (minified + gzip).
- No production implementation or documented semantics changed. The profiling transforms and allocation counters were used only in temporary builds under `/tmp`.
- P1 is complete. P2 has not started.

## Environment and release baseline

- macOS arm64, Node v26.10.0, Chromium 153.0.8010.12.
- The repository has no `v0.1.2` Git tag in local or remote refs. I used commit `e029073` as the baseline: it contains the released `@benosjs/core` and `@benosjs/dom` version 0.1.2. The same current js-framework-benchmark adapter and Solid build were used for both Benos versions.
- The release comparison used production bundles, two warmups, seven interleaved rounds, and Chromium trace click-to-paint timing (commit/layout fallback). Each row reports median [minimum–maximum] ms.

## v0.1.2 versus current HEAD

| Workload          |                    v0.1.2 |              Current HEAD |                     Solid | HEAD / v0.1.2 | HEAD / Solid |
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

The two concerning rows were rerun in a second interleaved seven-round set:

| Workload      |          v0.1.2, run 2 |    Current HEAD, run 2 |           Solid, run 2 |
| ------------- | ---------------------: | ---------------------: | ---------------------: |
| Replace 1,000 | 48.395 [45.320–54.920] | 49.765 [45.380–61.751] | 26.318 [25.151–34.534] |
| Clear 1,000   |   9.502 [7.351–17.348] |   8.144 [6.830–18.028] |   3.834 [2.709–17.357] |

The earlier 9.59× clear ratio came from a 12.51 ms Benos median divided by a 1.30 ms Solid median. That ratio did not reproduce: the new trace runs put Solid clear at 3.205 ms and 3.834 ms, with broad spreads. In the paired v0.1.2/HEAD runs, current clear was 32% slower in the first run and 14% faster in the second; ranges overlap. Replace was 3% faster in the first run and 3% slower in the second, also within overlapping ranges. The earlier 1.96× replace ratio is close to the focused rerun's 1.89× HEAD/Solid ratio; the full comparison measured 1.66×. The Phase 6b release record was 2.43× for clear and 1.64× for replace; the repeated current comparison is consistent with ordinary trace variation around those values, not a confirmed source regression.

The source diff from `e029073` to HEAD is limited to the new `createUniqueId` implementation and `untrack` around component invocation. The `For` clearing path, `disposeOwner`, and `removeRange` are unchanged. `createUniqueId` is not called by this benchmark, and clearing does not invoke component functions. Since the slower medians did not reproduce and the disposal implementation is unchanged, there was no regression to bisect or fix.

## CPU attribution

For this profile, core and DOM were built with production defines, minification disabled, and source maps enabled. The temporary build transform set the DOM development-diagnostic flags to false; the development warning string was absent from the built output. Source maps resolve to the original TypeScript. Temporary performance.mark pairs measured template instantiation, binding setup, owner creation, signal/computed/effect node creation, event setup, native DOM insertion, and disposal. A separate Chromium CDP trace captured garbage collection over the same two warmups and seven measured rounds. Marked values are exclusive median [min–max] ms over seven samples after two warmups; nested marked spans are subtracted. GC columns report the union of complete GC event durations on the renderer main thread and the summed GC CPU time across renderer threads, with overlapping intervals counted once per thread. This includes incremental as well as stop-the-world GC work. The CPU categories are diagnostic attribution, so they are not comparable to the uninstrumented trace wall times above.

| Workload           |           Template |             Binding |            Owner |         Signal |      Computed |           Effect |      Event setup |       DOM insert |            Disposal |             GC main |   GC all threads CPU |
| ------------------ | -----------------: | ------------------: | ---------------: | -------------: | ------------: | ---------------: | ---------------: | ---------------: | ------------------: | ------------------: | -------------------: |
| Create 1,000       |      0.0 [0.0–0.0] |    22.6 [20.1–25.6] |    0.8 [0.5–0.9] |  0.5 [0.3–1.2] | 0.0 [0.0–0.0] |    0.4 [0.1–0.8] |    1.9 [1.6–2.4] |    4.9 [4.0–6.6] |       0.2 [0.2–0.4] |       4.0 [3.7–6.4] |     13.3 [12.6–17.9] |
| Replace 1,000      |      0.0 [0.0–0.0] |    21.9 [18.0–24.5] |    0.8 [0.5–1.0] |  0.7 [0.3–1.0] | 0.0 [0.0–0.0] |    0.6 [0.2–2.7] |    1.7 [0.9–3.0] |    4.7 [2.3–7.0] |    19.6 [19.1–20.7] |     51.2 [3.5–53.1] |    87.9 [19.5–101.8] |
| Clear 1,000        |      0.0 [0.0–0.0] |       0.0 [0.0–0.1] |    0.0 [0.0–0.0] |  0.0 [0.0–0.0] | 0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.1] |    15.1 [13.5–18.7] |       0.0 [0.0–0.0] |        0.0 [0.0–0.0] |
| Create 10,000      |      0.0 [0.0–0.0] | 200.0 [188.4–210.8] |   7.0 [6.4–15.4] |  7.4 [6.7–8.8] | 0.0 [0.0–0.0] |   4.1 [3.4–13.2] | 20.8 [17.6–25.8] | 44.7 [39.9–53.0] |       1.3 [1.1–7.8] | 374.6 [365.9–389.2] |  709.6 [693.1–776.8] |
| Replace 10,000     |      0.0 [0.0–0.0] | 206.6 [187.2–217.0] |   7.8 [6.8–30.4] |  7.6 [6.4–9.2] | 0.0 [0.0–0.0] |    4.0 [3.0–6.0] | 17.0 [13.2–23.4] | 51.1 [45.2–60.0] | 190.9 [185.0–216.0] |   67.4 [26.0–770.1] | 319.8 [157.7–1182.4] |
| Clear 10,000       |      0.0 [0.0–0.0] |       0.1 [0.0–0.1] |    0.0 [0.0–0.0] |  0.0 [0.0–0.0] | 0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.1] | 149.8 [138.5–156.2] |       0.0 [0.0–0.0] |        0.0 [0.0–0.0] |
| Table mount 5,000  |   49.4 [43.8–57.8] |    47.1 [36.4–67.6] |  11.5 [9.8–18.9] | 2.9 [2.3–12.5] | 0.0 [0.0–0.1] |  11.3 [7.9–20.5] |    0.1 [0.1–0.4] | 16.4 [15.2–21.5] |       2.6 [1.2–3.0] |       0.0 [0.0–0.0] |        0.0 [0.0–0.0] |
| Table mount 10,000 | 103.1 [91.2–114.6] |    72.2 [63.4–76.5] | 29.3 [21.2–35.1] |  4.9 [4.4–5.8] | 0.0 [0.0–0.1] | 25.5 [18.6–35.0] |    0.2 [0.1–1.0] | 32.1 [29.7–43.5] |       4.7 [4.2–5.5] |       0.0 [0.0–0.0] |        0.0 [0.0–0.0] |

The generic js-framework-benchmark rows use runtime JSX descriptors, so template instantiation is zero there. GC accounts for a substantial and repeatable part of the 10,000-row create operation (about 375 ms median on the renderer main thread); replace has wide GC variance, while clear and the profiled table mounts triggered no GC during the measured windows. All-renderer-thread GC CPU includes parallel scavenger work and can exceed elapsed wall time. The complete seven-round trace summary is in [the GC profile JSON](../../benchmarks/js-framework-benchmark/results/perf-p1-garbage-collection.json). The compiled sortable table spends 103.1 ms in template cloning/slot setup at 10,000 rows. Clear spends 149.8 ms in disposal at 10,000 rows; replace spends 190.9 ms disposing the old list. The marked spans exclude garbage collection, which is measured separately, and uninstrumented reconciliation/key-building loops. Together they attribute named Benos and browser GC work without claiming a full partition of wall time.

## Allocation sampling and retained objects

Chromium allocation sampling ran on production-defined, unminified builds with source maps and development diagnostics statically disabled in the temporary build. A forced-GC heap snapshot before and after rendering 1,000 rows measured retained-object deltas per row. Runtime call counters identify owner, signal, computed, and effect node creation exactly; the sampler's byte and sample-point totals are estimates. `DOM wrappers` are separated from Chromium's native layout objects.

| Per-row category               |                Benos |           Solid | Evidence                                                      |
| ------------------------------ | -------------------: | --------------: | ------------------------------------------------------------- |
| Owner nodes                    |              5 calls |          1 call | Instrumented `createOwner` / Solid `createRoot` call count    |
| Signal nodes                   |               1 call |               0 | Instrumented node creation calls                              |
| Computed nodes                 |                    0 |               0 | Instrumented node creation calls                              |
| Effect/computation nodes       |              2 calls |         3 calls | Instrumented `createEffect` / Solid `createComputation` calls |
| Retained closures/functions    | 33.9 objects / 951 B |     8.9 / 252 B | Heap snapshot delta                                           |
| Retained plain objects         |       86.4 / 2,649 B |    11.4 / 369 B | Heap snapshot delta                                           |
| Retained arrays                |       33.2 / 1,114 B |     6.2 / 291 B | Heap snapshot delta                                           |
| DOM wrappers                   |       11.0 / 1,240 B |  10.0 / 1,063 B | Heap snapshot delta                                           |
| Chromium native/layout objects |      123.3 / 8,911 B | 120.1 / 8,768 B | Host allocations, not framework objects                       |

The Benos snapshot includes about two `onClick` and two `getHandler` function objects per row. Its largest allocation-sampling sites were `mountElement` (943 sampled B/row), `applyProps` (644 B/row), `jsx` (639 B/row), `signal` (265 B/row), `createOwner` (251 B/row), and `installEvent` (203 B/row). Solid's largest framework sites were its row mapper (338 sampled B/row), `createComputation` (269 B/row), `insert` (123 B/row), and `createRoot` (84 B/row). These are sampled byte estimates; sample-point counts are not exact object counts. The snapshot retained about 4.71 KB of closures, arrays, and plain objects per Benos row versus 0.91 KB per Solid row (5.2×). DOM wrapper deltas are close.

## Hypothesis verdicts

| Section 3 hypothesis               | Verdict                                                                | Evidence                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime template interpretation    | Supported for compiled tables; ruled out for the generic row benchmark | Generic rows use runtime JSX and record no template spans. Table mount records 103.1 ms of template/slot work at 10,000 rows.                                                                                                   |
| Per-binding allocation             | Supported                                                              | Benos creates 2 effect nodes and 1 item signal per generic row; retained arrays and plain objects exceed Solid's by about 5.4× and 7.6×. The table creates about 10 effects per row.                                            |
| Event records and handler closures | Supported                                                              | Two user `onClick` plus two `getHandler` closures are retained per Benos row; 10,000-row event setup is 20.8 ms for create and 17.0 ms for replace in the final marked profile.                                                 |
| Owner per row                      | Supported as an allocation contributor; not the largest CPU category   | Benos creates five owners per generic row versus one Solid root per row. Owner creation time is 0.8 ms at 1,000 rows; binding, events, DOM insertion, and disposal are larger. Context allocations are not isolated separately. |
| Disposal and per-node removal      | Supported as a clear/replace cost                                      | Disposal is 15.1 ms at 1,000-row clear and 149.8 ms at 10,000-row clear; replace disposes 19.6 ms and 190.9 ms. CDP traces observed no GC during clear. The clear version comparison did not identify a source regression.      |

## Artifacts and verification

- [Full release comparison, all nine rows](../../benchmarks/js-framework-benchmark/results/perf-p1-release-comparison.json)
- [Focused replace/clear rerun](../../benchmarks/js-framework-benchmark/results/perf-p1-release-focus.json)
- [CPU category timings and call counts](../../benchmarks/js-framework-benchmark/results/perf-p1-cpu-attribution.json)
- [Allocation sampling and heap snapshots](../../benchmarks/js-framework-benchmark/results/perf-p1-allocation-sampling.json)
- [Garbage-collection trace, all workloads](../../benchmarks/js-framework-benchmark/results/perf-p1-garbage-collection.json)
- The production rebuild and size gate passed at core 4,049 / 4,096 bytes and core + DOM 10,198 / 10,240 bytes. No runtime tests were changed or rerun because the production source was unchanged.

Stopped at the P1 review checkpoint. No design or optimization work has started.

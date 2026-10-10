# P3 compiled-path and attribution checkpoint

Date: 2026-10-10. Branch: `perf/initial-render`, based on `69106be`.

## Benchmark path confirmed

The create-benos template imports `@benosjs/vite` and calls `benos()` in [its Vite config](../../packages/create-benos/template/vite.config.ts). The plugin defaults production builds to `optimization: 'safe'`. The P3 benchmark builds use the built production plugin entry, the same `safe` transform, TSX source, and production core/DOM package entries.

The previous generic js-framework-benchmark adapter was hand-written JavaScript using runtime `jsx` calls. Its Vite entry selector therefore skipped the compiler transform. I added an idiomatic TSX adapter with the same operations and wired the generic and table TSX fixtures through `packages/vite/dist/js/index.production.js`. The table fixture was already TSX, but it now uses that same built plugin entry and explicit `safe` optimization. These changes correct the harness; they do not change framework code.

The v0.1.2 baseline was built from commit `e029073`, whose core and DOM package versions are both 0.1.2. The current and baseline artifacts were rebuilt with the same Vite version, production defines, minification, browser, and trace protocol. The protocol was two warmups and seven interleaved rounds, measuring click through paint in Chromium.

## Corrected nine-operation comparison

Times are milliseconds, median [minimum–maximum]. The ratio is current Benos / Solid.

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

The compiled path increases the measured gap on create 1k (about 1.6× previously, 2.09× now), replace 1k (about 1.8×, 2.26×), create 10k (about 1.4–1.6×, 2.07×), and clear (about 2.4–2.7×, 3.65×). This is a harness correction, not a regression between v0.1.2 and current: their medians are close and their spreads overlap on all rows. No source change between `e029073` and current affects the compiler or Vite transform; both versions now exercise the same transform path.

## Compiled table comparison

Initial render and sort results use the same two-warmup, seven-round protocol. Times are milliseconds, median [minimum–maximum].

| Workload               | Native DOM baseline | Compiled TSX baseline | Benos registry table |         Solid table | Registry / Solid |
| ---------------------- | ------------------: | --------------------: | -------------------: | ------------------: | ---------------: |
| Initial render, 5,000  |    77.1 [68.3–86.5] |   135.4 [132.7–154.6] |  146.6 [138.2–149.5] |    71.4 [65.4–75.6] |            2.05× |
| Sort, 5,000            |                   — |                     — |    92.7 [81.8–173.8] |    79.9 [73.4–81.9] |            1.16× |
| Initial render, 10,000 | 142.8 [137.3–159.2] |   276.9 [270.5–313.1] |  279.7 [262.0–291.6] | 137.6 [131.1–149.5] |            2.03× |
| Sort, 10,000           |                   — |                     — |  178.0 [156.4–226.7] | 156.7 [152.3–208.5] |            1.14× |

Both Benos table paths compile through the Vite plugin. The registry component adds 11.2 ms over the compiled hand-written table at 5k rows and 2.8 ms at 10k in these medians; the main initial-render gap is present in the compiled framework path itself.

## Compiled-path CPU attribution

Production defines were active; minification was disabled and source maps were enabled. Temporary performance marks measured exclusive function spans, with nested spans subtracted. Values are median [minimum–maximum] milliseconds across seven rounds after two warmups. GC is measured separately and may overlap these spans.

| Workload        |            Template |             Binding |            Owner |         Signal |           Effect |           Events |       DOM insert |            Disposal |
| --------------- | ------------------: | ------------------: | ---------------: | -------------: | ---------------: | ---------------: | ---------------: | ------------------: |
| Create 1k       |    18.5 [16.0–18.8] |     11.2 [9.7–12.5] |    3.8 [2.8–5.7] |  0.7 [0.1–2.2] |    2.1 [1.4–3.4] |    1.6 [1.0–2.2] |    5.9 [4.2–7.6] |       2.4 [2.1–3.9] |
| Replace 1k      |    16.2 [13.2–18.5] |     10.5 [8.8–14.2] |    2.3 [1.8–3.0] |  0.5 [0.3–0.9] |    1.6 [1.0–2.7] |    1.6 [1.1–1.9] |    5.2 [3.8–6.2] |    27.7 [26.5–31.3] |
| Clear 1k        |       0.0 [0.0–0.0] |       0.0 [0.0–0.1] |    0.0 [0.0–0.0] |  0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.1] |    24.6 [23.5–25.9] |
| Create 10k      | 167.1 [155.2–184.6] |  114.1 [99.2–300.3] | 30.2 [21.0–65.7] | 5.3 [4.5–12.6] | 21.8 [17.0–32.7] | 14.4 [12.5–20.9] | 64.6 [56.1–75.1] |    25.1 [21.6–28.0] |
| Replace 10k     | 184.8 [166.2–199.5] | 115.1 [104.7–130.3] | 30.8 [23.9–44.4] |  5.4 [4.4–7.8] | 23.1 [14.5–37.0] | 15.5 [14.5–34.6] | 78.0 [71.5–84.1] | 254.4 [244.5–285.5] |
| Clear 10k       |       0.0 [0.0–0.0] |       0.0 [0.0–0.1] |    0.0 [0.0–0.0] |  0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.0] |    0.0 [0.0–0.0] | 229.7 [219.6–308.8] |
| Table mount 5k  |    50.0 [46.9–58.0] |    34.3 [30.0–39.6] |  10.3 [7.3–15.7] |  2.5 [1.9–7.8] |  11.6 [7.2–12.9] |    0.2 [0.1–0.4] | 17.0 [12.7–25.6] |       2.4 [1.5–9.0] |
| Table mount 10k |   96.2 [82.4–106.1] |    62.5 [56.4–75.0] | 19.6 [17.4–25.7] |  4.3 [3.1–5.1] | 23.3 [17.2–28.4] |    0.2 [0.1–0.3] | 28.0 [24.9–41.6] |       4.8 [3.4–7.6] |

The corrected 10k create GC median is 362.0 ms on the renderer main thread [317.3–394.7], with 682.6 ms total renderer-thread GC CPU [647.3–835.3]. Replace 10k records 1,059.4 ms main-thread GC [1,006.5–1,122.7] and 1,657.0 ms all-thread CPU [1,625.8–1,776.8]. Clear 10k has a highly variable GC spread (0–342.2 ms); its median is 6.2 ms, so that GC contribution is not repeatable in this sample. The compiled table mount caused no GC in the measured windows.

## Allocation call-site attribution

Heap allocation tracking on the compiled TSX path rendered 1,000 rows, forced collection, then grouped retained object deltas by source-mapped allocation stack. The list for each framework stops after reaching at least 90% of both retained JS object count and retained JS bytes. Counts and bytes are per row. For Benos, the selected sites cover 90.5% of retained JS objects and 92.1% of bytes: 238.5 retained JS objects and 8,384 bytes per row. For Solid, they cover 91.1% of objects and 90.2% of bytes: 26.5 objects and 913 bytes per row. A small portion has no usable V8 allocation trace; it is included as an explicitly un-attributed bucket.

| Benos allocation site                                | Objects / row | Bytes / row |
| ---------------------------------------------------- | ------------: | ----------: |
| `mountTemplate` — `packages/dom/src/index.ts:1382`   |          48.8 |       1,535 |
| `createOwner` — `packages/core/src/runtime.ts:164`   |          14.0 |       1,008 |
| `child` — `packages/dom/src/index.ts:1406`           |          33.5 |         937 |
| `onCleanup` — `packages/core/src/runtime.ts:403`     |          14.0 |         644 |
| `createEffect` — `packages/core/src/runtime.ts:979`  |          12.9 |         642 |
| `updateSlot` — `packages/dom/src/index.ts:262`       |          18.6 |         538 |
| `installDelegated` — `packages/dom/src/index.ts:509` |           8.0 |         301 |
| `track` — `packages/core/src/runtime.ts:572`         |           5.0 |         240 |
| `signal` — `packages/core/src/runtime.ts:732`        |           7.0 |         232 |
| `installEvent` — `packages/dom/src/index.ts:576`     |           6.0 |         184 |
| `event` — `packages/dom/src/index.ts:1435`           |           4.0 |         184 |
| `runEffect` — `packages/core/src/runtime.ts:848`     |           2.9 |         174 |
| benchmark handler — `src/main-benos.tsx:19`          |           6.0 |         167 |
| `mountValue` — `packages/dom/src/index.ts:333`       |           6.0 |         162 |
| child binding — `packages/dom/src/index.ts:1432`     |           7.5 |         150 |
| `createEntry` — `packages/dom/src/index.ts:970`      |           4.0 |         120 |
| benchmark handler — `src/main-benos.tsx:20`          |           3.6 |          98 |
| benchmark expression — `src/main-benos.tsx:26`       |           3.0 |          83 |
| benchmark expression — `src/main-benos.tsx:22`       |           2.6 |          70 |
| `instantiate` — `packages/dom/src/index.ts:1495`     |           2.9 |          69 |
| `jsx` — `packages/dom/src/index.ts:136`              |           2.0 |          69 |
| attribute binding — `packages/dom/src/index.ts:1394` |           2.0 |          57 |
| `mountComponent` — `packages/dom/src/index.ts:796`   |           1.7 |          57 |

| Solid allocation site                    | Objects / row | Bytes / row |
| ---------------------------------------- | ------------: | ----------: |
| `createComputation` — `solid.js:738`     |           4.0 |         216 |
| row expression — `src/main-solid.jsx:56` |           6.0 |         159 |
| un-attributed V8 allocation trace        |           3.8 |         139 |
| `insert` — `web.js:329`                  |           3.2 |          90 |
| `insertExpression` — `web.js:531`        |           0.0 |          66 |
| `createRoot` — `solid.js:178`            |           1.9 |          50 |
| `readSignal` — `solid.js:621`            |           3.2 |          45 |
| anonymous helper — `:3:11`               |           0.8 |          22 |
| row data creation — `src/data.js:71`     |           1.0 |          20 |
| `next` — native frame                    |           0.2 |          15 |

### Ranking update

The retained call sites change the P2 ranking. The largest sites are template instantiation, child creation, owner/effect allocation, cleanup registration, and slot updates. They account for much more retained work than event slots; event-related sites together account for a smaller share. Property-key arrays do not survive forced collection, and the allocation sampler did not surface them among the leading sampled sites. Keep property-key iteration and event slots as the first two controlled trials because they are the requested low-risk experiments, but do not treat either as the principal explanation for the gap. After those trials, prioritize the compiled template path, then owner/effect and cleanup creation. The detailed ranking and candidate designs are updated in [performance.md](../architecture/performance.md).

## Size, tests, and artifacts

Before runtime changes, `pnpm build` and `pnpm size` pass: core 4,049 / 4,096 bytes; core + DOM 10,198 / 10,240 bytes. `pnpm test` passes unchanged: 22 files, 233 tests. The newly added benchmark scripts initially exposed missing ESLint globals; those script-only lint annotations have been corrected. The full lint check is being rerun with this report.

Raw artifacts: [all-nine comparison](../../benchmarks/js-framework-benchmark/results/p3-compiled-release-comparison.json), [compiled table](../../benchmarks/js-framework-benchmark/results/p3-compiled-table.json), [CPU profile](../../benchmarks/js-framework-benchmark/results/perf-p3-compiled-cpu-attribution.json), [GC profile](../../benchmarks/js-framework-benchmark/results/perf-p3-compiled-garbage-collection.json), and [allocation profile](../../benchmarks/js-framework-benchmark/results/perf-p3-compiled-allocation-sampling.json).

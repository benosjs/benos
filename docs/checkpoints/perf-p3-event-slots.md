# P3 delegated event-slot checkpoint

Date: 2026-10-10. Branch: `perf/initial-render`. The property-key trial is recorded in [the previous checkpoint](./perf-p3-property-keys.md).

## Change and verification

The DOM event hub now stores the compiled handler getter directly in the event slot indexed by element and event type. This removes the per-handler `EventRecord`, the temporary props object, and the getter wrapper on the compiled path. Getter reads remain untracked at dispatch; multiple event handlers preserve order; cleanup remains owner-scoped. Two tests cover getter replacement without a setup read and multiple handlers on one element. The full event and renderer tests pass.

`pnpm build`, `pnpm size`, `pnpm test`, and `pnpm lint` pass. The unit suite reports 22 files and 236 tests. The Playwright suite passes all 405 Chromium, Firefox, and WebKit cases. Core is 4,049 / 4,096 B; core + DOM is 10,200 / 10,240 B, a 2 B increase over the 10,198 B baseline.

## Interleaved js-framework-benchmark

The production TSX adapter ran two warmups and seven rounds, rotating framework order. Times are milliseconds, median [minimum–maximum]. The baseline is the corrected compiled-path run; Solid values below are from the event-slot run.

| Operation                  |            Baseline Benos |         Event slots Benos |        Solid in event run | Benos / Solid |
| -------------------------- | ------------------------: | ------------------------: | ------------------------: | ------------: |
| create rows                |    52.907 [50.913–56.275] |    54.588 [50.398–58.677] |    27.310 [25.383–33.328] |         2.00× |
| replace all rows           |    58.035 [56.098–89.638] |    56.111 [54.454–58.733] |    25.776 [24.777–28.476] |         2.18× |
| partial update             |    14.413 [12.946–18.574] |    14.860 [13.634–17.367] |    14.638 [13.572–17.869] |         1.02× |
| select row                 |       1.248 [1.164–1.531] |      1.585 [1.149–16.142] |       0.863 [0.819–1.236] |         1.84× |
| swap rows                  |       3.779 [3.611–9.192] |       3.504 [3.442–3.684] |       2.889 [2.823–3.130] |         1.21× |
| remove row                 |      4.566 [4.402–12.156] |       4.492 [4.467–4.618] |       4.278 [4.200–4.347] |         1.05× |
| create many rows           | 492.144 [483.591–512.038] | 483.574 [475.313–515.434] | 237.234 [235.564–239.763] |         2.04× |
| append rows to large table |    59.130 [58.384–60.011] |    55.338 [54.834–55.595] |    35.270 [35.016–35.945] |         1.57× |
| clear rows                 |       9.312 [9.126–9.853] |       9.108 [8.976–9.724] |       2.637 [2.549–2.678] |         3.45× |

All nine Benos timing spreads overlap the baseline spreads. Replace and append medians improved slightly, create and partial update moved slightly slower, and select had a large outlier; this run does not show a repeatable click-to-paint speedup or regression. It supports retaining the change because the allocation reduction repeated. Ratios are included on every row.

## Allocation profile

Allocation sampling ran twice on the compiled production path after 1,000 rows were mounted and forced collection. Each Benos profile accounts for at least 90% of retained JS objects and bytes. Counts by type are shown separately from retained-site coverage totals.

| Profile             | Retained sites objects / row | Retained sites bytes / row | Arrays / row | Plain objects / row | Closures / row | Owner / effect calls |
| ------------------- | ---------------------------: | -------------------------: | -----------: | ------------------: | -------------: | -------------------: |
| Benos baseline      |                      238.541 |                   8383.552 |       53.991 |             123.001 |         60.000 |              20 / 10 |
| Benos event slots 1 |                      222.512 |                   7838.892 |       49.993 |             113.001 |         58.000 |              20 / 10 |
| Benos event slots 2 |                      222.534 |                   7838.132 |       49.993 |             113.001 |         58.000 |              20 / 10 |
| Solid reference     |                       26.499 |                    912.944 |        6.007 |              11.003 |          8.001 |                1 / 3 |

The event-slot build repeats at 222.512 objects / 7,838.892 B and 222.534 / 7,838.132 B, down from 238.541 / 8,383.552 B. That is about 16 retained objects and 545 B fewer per row. Arrays fell from 53.991 to 49.993, plain objects from 123.001 to 113.001, and closures from 60 to 58. The exact owner/effect call counts stayed at 20 / 10 per row. Solid remained around 26.5 retained objects / 913 B, with 8 closures, 11 plain objects, 6 arrays, one root, and three effects.

Source attribution shows the baseline `installEvent` site at 6.001 objects / 184 B per row and `installDelegated` at 8.001 / 301 B. The event-slot profile has no retained `installEvent` site; `installDelegated` is about 4.001 / 165 B. Event setup is a smaller share of the total cost than template, child, owner, and effect setup.

## Compiled table fixture

Times are milliseconds, median [minimum–maximum]. The registry sortable table has no per-row event handler, so these rows check that the renderer change did not disturb the table path.

| Table workload             |            Baseline Benos |         Event slots Benos |        Solid in event run |
| -------------------------- | ------------------------: | ------------------------: | ------------------------: |
| Initial render, 5000 rows  | 146.600 [138.200–149.500] | 147.000 [133.800–160.800] |    65.900 [63.300–74.600] |
| Sort, 5000 rows            |   92.700 [81.800–173.800] |   89.900 [77.300–101.900] |   75.500 [71.900–110.600] |
| Initial render, 10000 rows | 279.700 [262.000–291.600] | 286.000 [272.000–377.600] | 141.800 [130.700–156.200] |
| Sort, 10000 rows           | 178.000 [156.400–226.700] | 179.200 [160.800–251.500] | 174.200 [150.500–250.300] |

The table timings stay within overlapping spreads. No table regression is indicated.

## Budget-limited stable-handler refinement

A follow-up stored ordinary function-valued runtime event props directly and tagged getter-backed accessors so both forms could share the slot. The production build measured core + DOM at 10,260 B, 20 B over the fixed 10,240 B cap and 60 B above the retained getter-slot version. I reverted that refinement and kept the measured getter-slot implementation. Keeping raw stable-handler values would require either 20 additional budget bytes or a size reduction of at least 20 B that preserves all current features; no budget change was made.

Artifacts: `p3-event-slots.json`, `p3-event-slots-table.json`, `p3-event-slots-allocation-sampling.json`, and `p3-event-slots-allocation-sampling-confirm.json` under `benchmarks/js-framework-benchmark/results/`.

# Lazy effect-run owner checkpoint — 2026-10-11

**Branch:** `perf/initial-render`  
**Step 1 commit:** `79b0757 Verify direct output table sort against baseline`  
**Step 2 status:** implementation and verification complete; commit follows this checkpoint.

## Table sort regression check

The reported 135.4 ms (5k) and 231.9 ms (10k) results did not reproduce as a
direct-output regression. The current branch and `88f1bde` used the same table
fixture, production build, two warmups, seven interleaved rounds, and a
two-animation-frame timing boundary. Direct output measured 98.0 ms at 5k
versus 98.3 ms at the baseline, and 208.7 ms at 10k versus 194.6 ms. Their
spreads overlap broadly: 88f1bde was 86.4–216.3 / 163.8–338.9 ms; direct was
88.3–179.7 / 177.4–354.3 ms. The 10k median difference is 7.2%, within the
observed spread, so no regression was isolated to the direct compiler path.

The mapped `columns.map(...)` child does not reevaluate when rows move. The
browser regression test confirms its map-read count is unchanged after sort
and that a keyed row DOM node is preserved. Direct output removes template
plan setup, but the table still performs sorting, keyed reconciliation, and
row moves.

The 5k and 10k table mounts also show why registry-table initial render did not
materially improve with direct output: the earlier direct A/B measured
151.5 [141.0–172.6] ms / 303.1 [286.6–310.2] ms, while a handwritten Benos
table using the same direct path measured 116.6 [98.5–143.8] ms /
249.3 [227.0–278.4] ms. The registry component adds sort state, empty-state
and keyed-list behavior, and per-column bindings. Direct output does not remove
that work or insertion of 15k / 30k cell nodes.

## Lazy effect-run owners

An effect run now starts under its stable owner without allocating an empty
run owner. `onCleanup`, creation of a child effect/computed/owner, or Provider
creation materializes the run owner before registering that owned work. A
materialized run owner is disposed before the next genuine run. The callback's
errors still route through the run owner when present and through the stable
effect owner otherwise. `createRoot` stays detached.

The deterministic tests check resource-free effect runs, cleanup-only runs,
nested effects and computeds, Provider context scopes, error routing, disposal
ordering, and subscriber and queue release. An effect-created computed is
asserted disposed before the following run's computed is created.

### Generic compiled row allocations

Values are per 1,000-row sample from production code with minification disabled,
source maps, Chromium allocation sampling, and forced-GC snapshots. The site
profile accounts for 91.5% of retained objects and 91.8% of retained bytes.

| Metric per row              | Direct safe before | Lazy effect-run owner |
| --------------------------- | -----------------: | --------------------: |
| Owner creation calls        |                  8 |                     4 |
| Signal / effect calls       |              1 / 4 |                 1 / 4 |
| Retained closures           |                 24 |                    24 |
| Retained plain objects      |                 57 |                    53 |
| Retained arrays             |             15.993 |                15.993 |
| Retained plain-object bytes |            2,148 B |               1,860 B |

This is a repeatable structural reduction: 50% fewer owner creation calls and
four fewer retained plain objects (288 B) per generic row. It does not yet
meet the original two-owner target on every workload.

The sortable-table allocation profile currently measures Benos at 5 owner
calls, 1 signal, 9.999 effects, 30.002 closures, 67.190 plain objects, and
40.007 arrays per row. Solid measures 1 owner/root, 0 signals, 3 effects,
7.001 closures, 10.101 plain objects, and 2.008 arrays. These counts include
the table fixture's per-column render effects and registry behavior.

## Interleaved generic benchmark

Production Chrome trace, click through paint, two warmups and seven measured
rounds. Brackets give min–max spread for all nine operations.

| Operation         |             Benos (ms) |             Solid (ms) | Ratio |
| ----------------- | ---------------------: | ---------------------: | ----: |
| Create 1,000      |    35.50 [34.39–37.00] |    25.34 [25.07–27.02] | 1.40× |
| Replace 1,000     |    36.74 [36.06–39.28] |    25.84 [24.94–27.79] | 1.42× |
| Update every 10th |    13.54 [13.17–16.43] |    14.45 [13.93–26.34] | 0.94× |
| Select one row    |      1.27 [1.23–21.95] |       0.87 [0.84–1.31] | 1.45× |
| Swap rows         |      3.99 [3.80–13.72] |       2.90 [2.84–3.06] | 1.38× |
| Remove one row    |       5.04 [4.72–6.69] |       4.42 [4.19–4.74] | 1.14× |
| Create 10,000     | 328.71 [324.28–373.04] | 242.17 [239.60–245.86] | 1.36× |
| Append 1,000      |    47.81 [43.66–53.01] |    36.48 [35.47–42.65] | 1.31× |
| Clear             |       5.35 [2.65–6.18] |       2.70 [2.57–2.89] | 1.98× |

10k creation moved from 359.40 to 328.71 ms, but the ranges overlap; report
this as inconclusive, not a confirmed timing improvement. Select, swap, and
clear have isolated long samples.

### Sortable table profile

|   Rows | Variant           |        Initial (ms) |           Sort (ms) |
| -----: | ----------------- | ------------------: | ------------------: |
|  5,000 | Benos registry    | 162.0 [144.0–170.5] |  106.7 [88.6–174.7] |
|  5,000 | Handwritten Benos | 117.4 [100.0–146.0] |                   — |
|  5,000 | Solid             |    76.2 [67.4–86.3] |    87.9 [76.4–90.6] |
| 10,000 | Benos registry    | 286.3 [274.6–355.2] | 194.5 [186.5–275.1] |
| 10,000 | Handwritten Benos | 234.3 [203.5–290.0] |                   — |
| 10,000 | Solid             | 140.5 [136.3–158.8] | 160.6 [154.2–174.2] |

The registry sort medians are 1.21× Solid at both sizes. The 10k spread remains
wide, with a 275.1 ms high sample.

## Size and verification

| Bundle     |  Current |      Cap | Headroom | Delta from direct-output checkpoint |
| ---------- | -------: | -------: | -------: | ----------------------------------: |
| Core       |  4,108 B |  4,608 B |    500 B |                               +59 B |
| Core + DOM | 10,580 B | 11,264 B |    684 B |                               +72 B |

- `pnpm build` — passed.
- `pnpm size` — passed.
- `pnpm test` — 271 tests passed across 22 files.
- `pnpm typecheck:types` — passed.
- `pnpm lint` — passed after formatting the captured benchmark JSON.
- `pnpm test:browser` — 405 tests passed in Chromium, Firefox, and WebKit.

The full raw tables and profiles are recorded in
[`benchmarks/README.md`](../../benchmarks/README.md#lazy-effect-run-owners-2026-10-11),
[`lazy-owner-nine-2026-10-11.json`](../../benchmarks/js-framework-benchmark/lazy-owner-nine-2026-10-11.json),
[`lazy-owner-table-2026-10-11.json`](../../benchmarks/js-framework-benchmark/results/lazy-owner-table-2026-10-11.json),
and [`lazy-owner-allocation-2026-10-11.json`](../../benchmarks/js-framework-benchmark/results/lazy-owner-allocation-2026-10-11.json).

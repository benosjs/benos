# Performance track P4 checkpoint — 2026-10-11

## Changes

- Merged the standard CLI flags/info branch into `main`, then merged `main`
  into `perf/initial-render` before continuing this track.
- Added a three-column direct cell path to the registry `SortableTable`.
  Columns are captured once at component creation; tables with other column
  counts keep the generic mapped implementation. Public props, sorting,
  keyed row identity, accessibility, direction, and empty-state behavior are
  unchanged.
- Added browser coverage proving the three-column path maps only the header
  columns, the generic four-column fallback maps its cells, and rows retain
  identity through sorting.
- Bumped all eight publishable packages and the create-benos template ranges
  to `0.3.0`. Regenerated the registry payload and immutable item URLs for
  release `0.3.0`; minimum runtime requirements remain at `0.2.1` because the
  components need no newer API.
- Updated the changelog, roadmap, performance plan version, and benchmark
  record for the 0.3.0 release candidate.

## Table measurement

Production Chromium runs used two warmups and seven measured rounds with
frameworks interleaved. The post-change values pool two independent runs
(14 measured samples); the before values are one seven-round run. Full tables,
spreads, allocation counts, and raw JSON are in
[`benchmarks/README.md`](../../benchmarks/README.md#registry-sortable-table-static-three-column-row).

| Rows | Measure                           |         Before (ms) |          After (ms) |
| ---: | --------------------------------- | ------------------: | ------------------: |
|   5k | Registry initial render           | 141.6 [131.1–167.3] | 129.4 [118.5–160.5] |
|   5k | Handwritten Benos initial render  |  109.9 [95.9–122.7] |  118.3 [99.9–149.9] |
|   5k | Solid initial render              |    65.5 [64.4–83.7] |    74.3 [67.2–98.5] |
|   5k | Registry minus handwritten median |                31.7 |                11.1 |
|   5k | Registry / Solid sort             |         92.4 / 77.9 |         90.7 / 80.9 |
|  10k | Registry initial render           | 296.6 [257.5–432.1] | 248.3 [228.0–354.7] |
|  10k | Handwritten Benos initial render  | 225.2 [202.9–356.0] | 245.7 [210.6–288.0] |
|  10k | Solid initial render              | 152.0 [130.6–177.9] | 151.7 [133.4–215.0] |
|  10k | Registry minus handwritten median |                71.4 |                 2.6 |
|  10k | Registry / Solid sort             |       251.7 / 164.3 |       200.2 / 185.6 |

The median registry overhead over handwritten Benos fell by 65% at 5k and 96%
at 10k. Post-change initial render remains 1.74× Solid at 5k and 1.64× at 10k.
The current retained per-row profile is 44.2 plain objects, 19.0 arrays, and
19.0 closures/functions for Benos versus 10.1, 2.0, and 7.0 for Solid.

## Verification

| Check                                                  | Result                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm build`                                           | Passed                                                     |
| `pnpm test`                                            | 22 files; 271 tests passed                                 |
| `pnpm --filter benos test`                             | 6 passed                                                   |
| `pnpm --filter create-benos test`                      | 16 passed                                                  |
| `pnpm exec vitest run tests/create-benos.test.ts`      | Passed                                                     |
| `pnpm test:browser`                                    | 408 passed across Chromium, Firefox, and WebKit            |
| `pnpm typecheck:types`                                 | Passed                                                     |
| `pnpm check:jsx-types`                                 | Passed                                                     |
| `pnpm check:doc-examples`                              | Passed; 28 example files in both optimization modes        |
| `pnpm check:public-imports`                            | Passed                                                     |
| `pnpm check:packed`                                    | Passed for eight packages                                  |
| `pnpm audit:template`                                  | No engine/deprecation warnings; zero vulnerabilities       |
| `pnpm gallery:build` and gallery TypeScript check      | Passed                                                     |
| `pnpm check:engines`                                   | Passed for 1,117 manifests                                 |
| `pnpm lint` and `git diff --check`                     | Passed                                                     |
| `pnpm registry:check`                                  | Passed; 21 generated files                                 |
| `pnpm bench:guard`                                     | Passed; all five kernel workloads below 2× Preact          |
| `pnpm size`                                            | Passed; core 4,108 / 4,608 B, core + DOM 10,580 / 11,264 B |
| `BENOS_PACKAGE_MANAGER=npm pnpm test:packed-benos-cli` | Passed                                                     |

Local verification ran on macOS arm64 with Node 26.10.0. The PR workflow still
needs to confirm its Ubuntu, Windows, and macOS jobs, including the package
manager matrix. No release tag or package publication is part of this
checkpoint.

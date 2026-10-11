# P3 checkpoint: direct sortable-table rows

Date: 2026-10-11

Branch: `perf/initial-render`

## Finding and change

The registry `SortableTable` uses `columns.map(...)` inside each keyed row.
This pattern does not force the row through the template-plan fallback. The
safe compiler emits the row as a direct `<tr>` skeleton with a child slot for
the mapped cells; the callback's native `<td>` tree also compiles to a direct
template. The map result still creates a per-row array of child descriptors.

I kept the registry component's implementation and public API unchanged. A
compiler matrix fixture now asserts both direct skeletons and compares the
resulting DOM, owner lifecycle, and binding behavior between `none` and
`safe`, in development and production output.

## Table measurements

Production Chromium, two warmups, seven rounds, interleaved framework order.
Initial render and sort are measured through two animation frames; brackets
show min/max spread.

| Table operation      |             Native DOM |      Handwritten Benos | Registry `SortableTable` |                  Solid |
| -------------------- | ---------------------: | ---------------------: | -----------------------: | ---------------------: |
| Initial, 5,000 rows  |    72.0 [68.5–81.7] ms | 110.6 [100.1–129.0] ms |   148.7 [135.1–173.3] ms |    74.2 [71.8–76.7] ms |
| Sort, 5,000 rows     |                      — |                      — |    135.4 [87.3–172.1] ms |    91.6 [73.1–97.6] ms |
| Initial, 10,000 rows | 141.3 [136.9–151.4] ms | 232.8 [220.7–238.2] ms |   304.3 [280.3–350.0] ms | 142.4 [137.1–167.0] ms |
| Sort, 10,000 rows    |                      — |                      — |   231.9 [173.6–247.7] ms | 165.4 [158.6–358.7] ms |

The registry is 2.00× Solid on 5k initial render and 2.14× on 10k. Sort is
1.48× and 1.40×. The Solid 10k sort spread includes a 358.7 ms outlier; it is
shown rather than hidden.

| Production JS asset |      Raw |     Gzip |
| ------------------- | -------: | -------: |
| Native DOM          |  2.14 kB |  1.04 kB |
| Handwritten Benos   | 32.04 kB | 10.71 kB |
| Registry table      | 36.33 kB | 11.90 kB |
| Solid               | 15.27 kB |  6.25 kB |

Shared table CSS is 26.18 kB raw / 4.08 kB gzip in each build. The registry
gap includes component behavior beyond the handwritten benchmark: sortable
headers, dynamic column definitions, empty state, direction, and accessibility
semantics. The compiler now avoids a row-level plan and setup callback, though
the dynamic map still allocates the returned cell array.

## Verification and budgets

| Check                                  | Result                                         |
| -------------------------------------- | ---------------------------------------------- |
| Full unit suite                        | 267 passed across 22 files                     |
| Type-level checks                      | Pass                                           |
| ESLint and Prettier                    | Pass                                           |
| Full Chromium / Firefox / WebKit suite | 405 passed at the core checkpoint              |
| Focused table browser suite            | 18 passed across Chromium, Firefox, and WebKit |
| Core gzip size                         | 4,049 / 4,608 B                                |
| Core + DOM gzip size                   | 10,508 / 11,264 B                              |

No implementation or public API deviation was needed for the table. The
current table traces are in
[`safe-direct-baseline-table-2026-10-11.json`](../../benchmarks/js-framework-benchmark/results/safe-direct-baseline-table-2026-10-11.json).

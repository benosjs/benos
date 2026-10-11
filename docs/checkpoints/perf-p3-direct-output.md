# P3 checkpoint: direct output in safe mode

Date: 2026-10-11

Branch: `perf/initial-render`

## Change

The standard `optimization: 'safe'` compiler output now emits direct native
templates for eligible JSX trees. It caches the static template prototype per
Document, clones it per instance, resolves nodes by generated child paths, and
wires bindings through the existing renderer. Delegated handlers still use
the event slots, preserving native-before-delegated ordering, batching,
`stopPropagation`, and error reporting. Dynamic child values still use owned
ranges, so range identity and mount timing stay under the renderer. The
`optimization: 'none'` path remains the reference implementation.

Development output has readable direct definitions; production output uses
compact tuples. The generated binding and diagnostic source maps are checked
in both output modes.

The experiment record was committed on `perf/direct-compiler-output-ceiling`
as `3e93e17`; that same record commit is present on this branch as `919f2a1`.

## Verification

| Check                                      | Result                           |
| ------------------------------------------ | -------------------------------- |
| Production and development package build   | Pass                             |
| Unit and compiler fixture suite            | 264 tests passed across 22 files |
| Type-level checks                          | Pass                             |
| ESLint and Prettier                        | Pass                             |
| Browser suite, Chromium / Firefox / WebKit | 405 passed                       |
| Core gzip size                             | 4,049 / 4,608 B                  |
| Core + DOM gzip size                       | 10,508 / 11,264 B                |

The compiler matrix has 17 behavior fixtures. Each is run with `none` and
`safe` and compares DOM, owner lifetime, effect counts, evaluation order, and
error routing. The full suite includes direct-path URL safety, SVG and xlink
namespaces, boolean attributes, style/class/form properties, event ordering,
batching, throwing handlers, and development/production source-map checks.

## Performance results

Measurements use the compiled production path through the Vite plugin, Chrome
trace click-to-paint boundaries, two warmups, and seven interleaved rounds.
All nine rows, including spreads, are in
[`benchmarks/README.md`](../../benchmarks/README.md#p3-direct-output-in-the-standard-safe-path-2026-10-11).

| Operation      | Safe direct median [spread] |     Solid median [spread] | Ratio |
| -------------- | --------------------------: | ------------------------: | ----: |
| Create 1,000   |      34.84 [34.28–36.60] ms |    25.92 [25.36–27.13] ms | 1.34× |
| Replace 1,000  |      36.85 [36.48–37.19] ms |    26.36 [24.88–26.94] ms | 1.40× |
| Partial update |      13.92 [13.47–22.02] ms |    14.30 [14.04–16.88] ms | 0.97× |
| Select row     |         1.40 [1.26–1.65] ms |       0.93 [0.86–1.00] ms | 1.50× |
| Swap rows      |        4.15 [3.90–22.25] ms |       3.24 [2.86–3.57] ms | 1.28× |
| Remove row     |         4.96 [4.80–5.16] ms |       4.49 [4.25–4.59] ms | 1.10× |
| Create 10,000  |   325.86 [324.54–333.79] ms | 244.45 [243.08–246.10] ms | 1.33× |
| Append 1,000   |      45.02 [44.13–52.91] ms |    36.57 [36.22–37.36] ms | 1.23× |
| Clear 1,000    |         5.39 [5.31–6.27] ms |       2.63 [2.48–2.70] ms | 2.05× |

Selection and swap show paint/GC outliers in their min/max spreads. Medians
remain reported with the complete observed spread.

Allocation sampling after forced GC, per row:

| Category                    |    Runtime JSX |   Safe direct |       Solid |
| --------------------------- | -------------: | ------------: | ----------: |
| Closures / functions        |          33.00 |         24.00 |        8.00 |
| Plain objects               |          80.00 |         57.00 |       11.00 |
| Arrays                      |          31.00 |         15.99 |        6.01 |
| DOM wrappers                |          11.00 |         12.00 |       10.00 |
| Owner constructor calls     |              5 |             8 |           1 |
| Effect constructor calls    |              2 |             4 |           3 |
| Retained JS objects / bytes | 145.47 / 4,459 | 98.49 / 3,584 | 26.48 / 913 |

Relative to the previous compiled-safe profile, safe direct output reduces
retained closures 58→24, objects 106→57, arrays 56→16, owners 20→8, and
effects 10→4 per row. Relative to runtime JSX it retains 47 fewer JS objects
and 875 fewer bytes, while making more owner/effect constructor calls.

The generic app JavaScript asset is 33.73 kB raw / 11.29 kB gzip for safe
direct output, versus 30.23 kB / 10.56 kB for runtime JSX and 15.58 kB /
6.45 kB for Solid. The dashboard filter slice is 24.6 [22.7–34.4] ms for
Benos versus 13.0 [12.0–17.1] ms for Solid (1.89×).

## Table finding and next checkpoint

The sortable-table outer row does not fall back because of `columns.map(...)`.
Safe compilation emits a direct `<tr>` skeleton with a dynamic child slot for
the map result; each mapped `<td>` can compile to a direct template. The table
benchmark baseline is in the performance record: registry table initial mount
is 148.7 [135.1–173.3] ms at 5,000 rows and 304.3 [280.3–350.0] ms at 10,000
rows; sorting is 135.4 [87.3–172.1] ms and 231.9 [173.6–247.7] ms,
respectively. The table checkpoint adds a direct compiler regression fixture
for this shape and records the table result after that work.

## Safe-path fallbacks

The direct path declines an element containing a spread or ref, custom
elements/customized built-ins, `<template>`, dynamic child bindings in void,
raw-text, or RCDATA elements, and binding expressions with assignment/update,
`this`, `super`, `arguments`, or `new.target`. Static-only templates keep the
cached static-plan path. Components and control-flow retain their ordinary
descriptor and owner semantics; eligible native descendants inside them can
still use direct output. The old template/descriptor path handles every
declined subtree.

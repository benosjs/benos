# P3 compiled-path comparison and budget checkpoint

Date: 2026-10-11. Branch: `perf/initial-render`.

## Benchmark path and refreshed measurements

The current app path matches a create-benos project: production TSX is built
with the built `@benosjs/vite` plugin, `optimization: 'safe'`, and production
core/DOM entries. The previous P1 generic fixture used hand-written runtime
`jsx` calls and skipped that compiler path. The earlier results remain useful
as runtime-JSX history, but the compiled results below are the current release
comparison.

Rebuilt v0.1.2 core/DOM, current HEAD, and Solid with the same Vite and
Chromium. The trace run used two warmups and seven interleaved measured rounds,
click through paint, with expected row counts checked for every operation.
Times are median milliseconds [minimum–maximum].

| Operation         |                    v0.1.2 |          Current compiled |                     Solid | Current / Solid |
| ----------------- | ------------------------: | ------------------------: | ------------------------: | --------------: |
| Create 1,000      |    53.392 [51.851–54.015] |    51.294 [50.361–51.899] |    25.431 [25.236–27.323] |           2.02× |
| Replace 1,000     |    57.682 [57.396–62.965] |    56.470 [55.773–60.204] |    26.067 [24.881–26.884] |           2.17× |
| Update every 10th |    13.775 [13.313–19.756] |    13.823 [13.561–16.104] |    14.263 [14.011–15.895] |           0.97× |
| Select one row    |      7.054 [1.323–10.851] |      1.278 [1.212–12.927] |       0.870 [0.849–0.938] |           1.47× |
| Swap rows         |     10.688 [3.602–13.632] |       3.813 [3.611–4.022] |       3.045 [2.843–3.091] |           1.25× |
| Remove one row    |      4.585 [4.432–10.978] |       4.549 [4.418–5.404] |       4.470 [4.395–4.773] |           1.02× |
| Create 10,000     | 508.980 [500.780–530.606] | 498.929 [484.537–549.237] | 242.735 [241.177–255.059] |           2.06× |
| Append 1,000      |    62.163 [60.550–63.683] |    57.350 [56.284–61.652] |    36.473 [35.518–36.758] |           1.57× |
| Clear 1,000       |      9.820 [9.364–14.389] |       9.509 [9.077–9.996] |       2.621 [2.507–2.673] |           3.63× |

Relative to the earlier runtime-JSX figures, compiled create 1k moves from
1.55× to 2.02× Solid, replace from 1.66× to 2.17×, and create 10k from 1.64×
to 2.06×. Clear is 3.63× in the refreshed run; the 2.4× release record used a
faster Solid denominator and did not reproduce. This is a harness-path
difference, not a v0.1.2-to-HEAD regression: current and v0.1.2 spreads overlap
on all nine rows.

The raw run is
[`p3-budget-baseline.json`](../../benchmarks/js-framework-benchmark/results/p3-budget-baseline.json).

## Safe compiler output cost per row

The runtime-JSX adapter retained 153.5 JavaScript objects and 4,715 B per row:
33.9 functions, 86.4 plain objects, and 33.2 arrays. Compiled `safe` TSX before
the getter-slot change retained 237.0 objects and 8,223 B: 60 functions, 123.0
plain objects, and 54.0 arrays. The compiled adapter therefore added about
83.5 retained JS objects and 3,508 B per row in the paired fixtures. Current
getter-slot output is 221.0 objects / 7,679 B, leaving 67.5 objects / 2,964 B
above the runtime-JSX adapter. These are retained JavaScript objects, excluding
browser-native layout objects and DOM wrappers.

The matched 10k generic CPU marks show the safe path creates 14 template plans,
15 owners, and 8 effects per row; binding calls decrease by 10 per row. Marked
times are diagnostic function spans rather than an additive wall-time budget.

| Marked category      | Runtime JSX, ms | Compiled safe, ms | Change, ms | Calls, runtime → compiled |
| -------------------- | --------------: | ----------------: | ---------: | ------------------------: |
| Template instantiate |             0.0 |             167.1 |     +167.1 |               0 → 140,000 |
| Binding setup        |           200.0 |             114.1 |      −85.9 |         290,000 → 190,000 |
| Owner creation       |             7.0 |              30.2 |      +23.2 |          50,000 → 200,000 |
| Signal node creation |             7.4 |               5.3 |       −2.1 |           10,000 → 10,000 |
| Effect node creation |             4.1 |              21.8 |      +17.7 |          20,000 → 100,000 |
| Event setup          |            20.8 |              14.4 |       −6.4 |           40,000 → 40,000 |
| DOM insertion        |            44.7 |              64.6 |      +19.9 |         120,000 → 100,016 |
| Disposal             |             1.3 |              25.1 |      +23.8 |          10,004 → 140,004 |

The top runtime-JSX sampled allocation stacks are `mountElement` (932.5 KB per
1k rows), `applyProps` (623.9 KB), `jsx` (606.3 KB), and `mountValue`
(355.7 KB). The source-mapped compiled retained sites are `mountTemplate`
(48.8 objects / 1,535 B per row), `child` (33.5 / 937 B), `createOwner`
(14 / 1,008 B), `onCleanup` (14 / 644 B), `createEffect` (12.9 / 642 B), and
`updateSlot` (18.6 / 538 B). These profiles support a direct compiler-output
candidate, but do not establish that every byte or millisecond at those sites
can be removed.

## Candidate ranking change

Direct DOM output remains first. Its measured opportunity ceiling is the
167.1 ms / 10k generic-row template span and 96.2 ms / 10k table template span,
with `mountTemplate` retaining 48.8 objects / 1,535 B per row. The prototype
must measure its recovered fraction. Lazy physical owners are next: the owner
site contributes 14 calls / 1,008 B per row and 30.2 ms / 10k generic rows.
Disposal is third, with 229.7 ms on clear and 254.4 ms on replace at 10k.
Keyed-record fusion follows at about 4 objects / 120 B per row. Dependency
arrays remain closed because core already uses intrusive edges for one or two
sources.

The raw stable-handler variant will be reconsidered within the new limit. Safe
TSX currently passes getter-backed handlers directly to the event slots, so
the runtime-JSX raw-function optimization has no expected compiled-path gain;
it stays only if a paired runtime-JSX experiment shows a repeatable gain while
preserving getter timing.

## Budget update and verification

The approved limits are 4,608 B for core and 11,264 B for core + DOM, minified
and gzip-compressed. The fresh production rebuild measures 4,049 B and
10,200 B respectively, leaving 559 B and 1,064 B. The prior limits were
4,096 B and 10,240 B. The size checker now enforces the new approved values.

The three untracked P3 intermediates were reviewed: the two property-key JSON
profiles were superseded by tracked final/profiled runs, and the temporary
one-off documentation script was no longer needed. They were deleted. The
fresh baseline JSON was kept with the benchmark results.

The next implementation candidate is direct client DOM output from the
compiler's existing shared analysis. No candidate bytes have been spent yet.

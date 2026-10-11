# P3 follow-up: compiled costs and direct slot indexing

**Date:** 2026-10-11  
**Branch:** `perf/initial-render`  
**Build path:** production core and DOM, TSX compiled by the built
`@benosjs/vite` plugin with `optimization: 'safe'`  
**Trace protocol:** Chromium 153.0.8010.12 on macOS arm64, Node 26.10.0, two
warmups, seven interleaved rounds, Chrome trace click-to-paint. Values are
median ms [minimum–maximum].

The current published comparison in [benchmarks/README.md](../../benchmarks/README.md)
uses the compiled TSX path. Earlier runtime-JSX tables remain historical. This
checkpoint records the raw-handler budget reevaluation and the first kept
change in the top-ranked direct-output candidate.

## Stable raw-handler specialization: reverted

The trial recognized inline arrow/function handlers in safe compiler output,
evaluated them at mount, and installed the function directly. It preserved
getter dispatch for handler factories. The trial stayed within the newly
approved 11,264 B core + DOM limit, but it did not produce a repeatable timing
or retained-allocation gain.

| Operation         |                Base Benos |                   Trial 1 |                   Trial 2 |          Solid in trial 2 |
| ----------------- | ------------------------: | ------------------------: | ------------------------: | ------------------------: |
| Create 1,000      |    51.294 [50.361–51.899] |    51.330 [51.070–52.516] |    52.367 [51.375–58.611] |    25.752 [25.355–28.040] |
| Replace 1,000     |    56.470 [55.773–60.204] |    57.272 [53.965–64.048] |    57.347 [53.926–58.239] |    25.657 [25.384–26.706] |
| Update every 10th |    13.823 [13.561–16.104] |    14.300 [13.634–15.577] |    13.857 [13.578–15.769] |    14.463 [14.008–23.099] |
| Select one row    |      1.278 [1.212–12.927] |      1.522 [1.276–12.099] |       1.388 [1.251–1.648] |       0.915 [0.877–1.003] |
| Swap rows         |       3.813 [3.611–4.022] |     10.878 [3.684–16.177] |      4.199 [3.528–14.224] |      3.101 [2.988–22.278] |
| Remove one row    |       4.549 [4.418–5.404] |       4.883 [4.379–5.395] |       4.737 [4.481–5.220] |       4.418 [4.250–4.680] |
| Create 10,000     | 498.929 [484.537–549.237] | 496.440 [490.250–515.523] | 498.955 [487.198–518.390] | 242.346 [241.486–246.406] |
| Append 1,000      |    57.350 [56.284–61.652] |    57.220 [56.822–57.562] |    57.134 [56.613–57.852] |    36.482 [36.191–45.605] |
| Clear rows        |       9.509 [9.077–9.996] |       9.330 [9.119–9.997] |       9.367 [9.119–9.849] |       2.640 [2.556–2.741] |

The candidate added **59 B** to core + DOM; core stayed at 4,049 B. The
generated generic app increased by about **120 B raw / 70 B gzip**. The forced
GC profile retained the same 58 functions, 113 plain objects, and 49.993
arrays per row as the getter-slot build; source-mapped retained totals differed
by only sampling noise (about 0.02 objects and 34 B per row, slightly higher
in the trial). Neither trace timing nor allocation evidence supports keeping
the added bytes. The code and test-only candidate were reverted.

Raw data: `p3-stable-handler-1.json`, `p3-stable-handler-2.json`, and
`p3-stable-handler-allocation.json` in
[`benchmarks/js-framework-benchmark/results`](../../benchmarks/js-framework-benchmark/results/).

## Direct numeric template slots: kept

The first direct-output slice replaced the per-instance `Map<number, Node>` in
`mountTemplate` with a sparse `Node[]` indexed by the compiler's numeric slot
IDs. Slot paths are still computed once per cached template prototype. This
retains sparse slot behavior and does not change template plans, binding order,
ownership, or public APIs. The full compiler-emitted direct-DOM path remains a
future candidate.

| Operation         |                    Before |           Candidate run 1 |           Candidate run 2 |            Solid in run 2 | Benos / Solid |
| ----------------- | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------: |
| Create 1,000      |    51.568 [51.318–54.192] |    51.092 [50.549–51.849] |    51.121 [49.867–52.737] |    25.495 [25.367–26.681] |         2.01× |
| Replace 1,000     |    56.795 [55.964–57.837] |    53.487 [52.677–55.498] |    52.987 [52.575–59.255] |    25.423 [25.227–26.439] |         2.08× |
| Update every 10th |    15.179 [13.427–17.294] |    13.865 [13.635–15.218] |    15.458 [13.581–17.730] |    14.278 [14.141–15.781] |         1.08× |
| Select one row    |      1.630 [1.284–16.059] |      1.363 [1.246–13.647] |       1.307 [1.223–1.412] |       0.870 [0.829–0.952] |         1.50× |
| Swap rows         |      3.593 [3.489–12.161] |      3.588 [3.540–14.561] |      3.908 [3.519–12.752] |       3.129 [3.036–3.590] |         1.25× |
| Remove one row    |       4.625 [4.581–5.089] |       4.735 [4.451–5.087] |       4.636 [4.598–5.105] |       4.494 [4.379–4.921] |         1.03× |
| Create 10,000     | 494.412 [486.448–514.054] | 484.202 [478.725–506.820] | 486.265 [480.083–568.523] | 243.630 [241.184–248.700] |         2.00× |
| Append 1,000      |    57.380 [56.484–60.280] |    56.248 [55.913–57.155] |    56.207 [55.988–57.295] |    35.964 [35.372–37.671] |         1.56× |
| Clear rows        |      9.500 [9.233–16.586] |      9.585 [9.292–10.357] |       9.287 [9.015–9.527] |       2.622 [2.391–2.898] |         3.54× |

The two runs repeat about a 1.6–2.1% improvement on 10k create and about 2%
on append. Replace also improved in median, though its second-run spread is
wider. Update, select, swap, remove, and clear do not show a repeatable change;
none shows a consistent regression. The implementation stays because the
allocation reduction is repeatable and the create/append gains agree across
both trace runs.

### Retained allocations per row

| Profile measure                        |              Before |         Candidate 1 |         Candidate 2 |
| -------------------------------------- | ------------------: | ------------------: | ------------------: |
| Closures/functions                     |        58 / 1,624 B |        58 / 1,624 B |        58 / 1,624 B |
| Plain objects                          | 113.001 / 3,796.0 B | 106.001 / 3,684.0 B | 106.001 / 3,684.0 B |
| Arrays                                 |  49.993 / 2,258.6 B |  55.993 / 2,238.6 B |  55.993 / 2,238.6 B |
| Count across these JS categories       |             220.994 |             219.994 |             219.994 |
| Bytes across these JS categories       |           7,678.6 B |           7,546.6 B |           7,546.6 B |
| Source-mapped retained objects / bytes | 222.534 / 7,838.1 B | 221.510 / 7,705.8 B | 221.533 / 7,705.9 B |

The category profile shows seven fewer plain objects, six additional arrays,
and one fewer JavaScript object overall, saving **132 B per row**. The
source-mapped profile attributes the reduction mainly to `mountTemplate`,
from 47.668 objects / 1,493.7 B per row to 46.473 / 1,366.7 B in the first
profile and 45.668 / 1,334.2 B in the confirmation profile. Each source-mapped
profile accounts for over 90% of retained JS allocations.

### Size and related workload checks

| Artifact                         |           Before |        Candidate |       Change |   Budget |
| -------------------------------- | ---------------: | ---------------: | -----------: | -------: |
| Core minified + gzip             |          4,049 B |          4,049 B |          0 B |  4,608 B |
| Core + DOM minified + gzip       |         10,200 B |         10,199 B |         −1 B | 11,264 B |
| Generic compiled app, raw / gzip | 33.81 / 10.96 kB | 33.66 / 10.88 kB | −150 / −80 B |      n/a |

The production 5k/10k registry-table run measured Benos initial mount at 147.2
ms [139.3–157.2] and 308.4 [272.5–357.9], compared with Solid at 73.2
[66.8–78.7] and 148.1 [136.3–155.7]. Sort measured 90.1 [80.6–165.9] vs
80.2 [73.8–93.3] at 5k and 185.6 [164.4–283.8] vs 163.4 [159.7–211.8] at
10k. Compared with the earlier table trace, Solid's 10k baseline also rose
about 8%; the broad overlapping spreads do not establish a table regression.

The current dashboard filter slice measured 34.0 ms [31.4–38.1] for Benos and
12.2 [11.1–17.9] for Solid, with gzip bundles of 11,450 B and 6,590 B. The
previous record was 36.6 [32.2–43.9] vs 11.2 [9.8–16.5], so the refreshed
filter ratio is 2.79× versus 3.27× previously. This separate seven-round slice
does not isolate the array change from machine variation.

GC trace medians moved from 322.3 to 290.1 ms main-thread GC for 10k create,
and 1,004.4 to 859.2 ms for 10k replace; all-thread GC CPU moved from 636.4
to 581.9 ms and 1,614.9 to 1,439.3 ms respectively. The prior spreads were
wide and overlap the new measurements, so these are supportive direction
signals rather than an isolated causal result.

Raw artifacts: `p3-direct-slots-before.json`, `p3-direct-slots-1.json`,
`p3-direct-slots-2.json`, `p3-direct-slots-allocation.json`,
`p3-direct-slots-allocation-confirm.json`, `p3-direct-slots-table.json`,
`p3-direct-slots-dashboard-profile.json`, and
`p3-direct-slots-garbage-collection.json` in
[`benchmarks/js-framework-benchmark/results`](../../benchmarks/js-framework-benchmark/results/).

## Verification

At the checkpoint, focused DOM/compiler tests pass **70/70**. Final
verification also passes: **237 unit tests across 22 files**, the strict
type-level check, ESLint and Prettier, and **405 browser tests across
Chromium, Firefox, and WebKit**. A clean production build succeeds; the size
check reports core **4,049 / 4,608 B** and core + DOM **10,199 / 11,264 B**.

## Cleanup

The three untracked P3 intermediate files (`p3-property-keys-allocation-sampling.json`,
`p3-property-keys-garbage-collection.json`, and `update-p1-doc.py`) were
removed. They duplicated exploratory evidence covered by tracked final
profiles and checkpoint documents. The stable-handler and direct-slot raw
results listed above are preserved under the benchmark results folder.

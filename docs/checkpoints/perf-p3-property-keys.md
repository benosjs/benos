# P3 property-key iteration checkpoint

Date: 2026-10-10. Branch: `perf/initial-render`.

## Trial

Changed ordinary-props iteration from `Object.keys` to guarded `for...in`, keeping `Reflect.ownKeys` for non-plain prototypes. Added a semantic regression test for own enumerable string properties, getter evaluation order, and exclusion of symbols/non-enumerable properties. The candidate build measured core at 4,049 B and core + DOM at 10,208 B, a 10 B increase over the 10,198 B baseline.

The same production compiled-path harness ran two warmups and seven interleaved rounds for every js-framework-benchmark operation. Times are milliseconds, median [minimum–maximum].

| Operation                  |            Baseline Benos |             Trial 1 Benos |             Trial 2 Benos |             Trial 1 Solid |             Trial 2 Solid |
| -------------------------- | ------------------------: | ------------------------: | ------------------------: | ------------------------: | ------------------------: |
| create rows                |    52.907 [50.913–56.275] |    50.958 [50.713–52.000] |    57.305 [50.392–65.901] |    25.080 [24.861–29.066] |    25.915 [24.649–36.933] |
| replace all rows           |    58.035 [56.098–89.638] |    60.190 [55.478–62.459] |    57.574 [54.801–62.209] |    26.342 [25.378–29.941] |    25.609 [25.161–33.514] |
| partial update             |    14.413 [12.946–18.574] |    13.557 [13.088–17.575] |    13.051 [12.904–15.998] |    14.136 [13.733–15.454] |    13.557 [13.307–20.109] |
| select row                 |       1.248 [1.164–1.531] |       1.237 [1.190–1.725] |      1.268 [1.131–12.196] |       0.888 [0.826–1.030] |       0.850 [0.840–0.928] |
| swap rows                  |       3.779 [3.611–9.192] |      3.762 [3.460–11.937] |      7.549 [3.380–15.910] |       2.870 [2.814–3.055] |       3.009 [2.832–3.489] |
| remove row                 |      4.566 [4.402–12.156] |       4.515 [4.465–4.621] |       4.565 [4.375–5.198] |       4.295 [4.254–4.490] |      4.457 [4.148–14.077] |
| create many rows           | 492.144 [483.591–512.038] | 487.436 [482.611–507.587] | 502.134 [478.823–641.131] | 238.843 [237.235–250.400] | 238.980 [233.249–244.793] |
| append rows to large table |    59.130 [58.384–60.011] |    59.997 [59.075–61.290] |    59.761 [58.616–62.274] |    35.287 [34.710–36.350] |    35.168 [34.937–36.180] |
| clear rows                 |       9.312 [9.126–9.853] |       9.391 [9.168–9.831] |      9.812 [9.070–10.462] |       2.565 [2.525–2.634] |      2.594 [2.509–12.653] |

The create 1k improvement in trial 1 did not reproduce in trial 2; select, swap, and remove are sensitive to outlier rounds. Every operation's trial ranges overlap the baseline. Allocation sampling reports the same retained object counts and bytes per row (differences are below 0.02 objects and 0.3 B, within sampler noise); the property-key array was transient and not a leading retained site. CPU marks do not isolate prop iteration, and the same-profile GC check was mixed/noisy: create 10k main-thread GC was 447 ms [312–589] vs baseline 322 ms [298–409], replace 10k 1,038 [994–1,146] vs 1,004 [891–1,111], and table startup stayed within the baseline spread. This does not establish a reduction.

**Decision: revert the implementation.** Ordinary prop iteration did not provide a repeatable trace or allocation improvement, and cost 10 B. Keep the semantic test because it checks the existing prop behavior. Restore `Object.keys`; move to delegated event slots as the next controlled trial.

Artifacts: `p3-property-keys.json`, `p3-property-keys-confirm.json`, `p3-property-keys-allocation-sampling-final.json`, `p3-property-keys-cpu-attribution.json`, `p3-property-keys-garbage-collection-profiled.json`, and `p3-property-keys-table.json` under `benchmarks/js-framework-benchmark/results/`.

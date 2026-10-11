# P2 — Allocation-focused design

## Checkpoint

- P1 evidence: [perf-p1.md](./perf-p1.md).
- Design: [architecture/performance.md](../architecture/performance.md).
- Scope completed: documentation only. No runtime source, public API, test expectation, or documented semantics changed.
- No implementation work has started.

## Targets and evidence

The design sets retained per-row targets of at most 2 owners, 12 closures, 20 plain objects, and 10 arrays. P1 measured Benos at 5 owners, 33.9 closures, 86.4 plain objects, and 33.2 arrays; Solid measured 1, 8.9, 11.4, and 6.2 respectively. Object counts include owner objects and are not additive.

The highest value candidates by expected gain per added byte are direct ordinary-prop key iteration, direct delegated event slots, first-observation render-binding promotion, lazy physical owners, and compiler-emitted DOM operations. The design also covers For record fusion and disposal work because P1 identified those paths as relevant to retained allocations and clear/replace time. One-to-two-source computations already use linked dependency edges and allocate no dependency arrays; no change is proposed there.

The design explicitly records an attribution gap: the named proposals do not yet explain all of the retained-object and array gap on the runtime-JSX benchmark path. P3 must follow allocation call sites before claiming the targets are met. The benchmark adapters remain unchanged.

## Sizes and decision

The rebuilt production measurements remain core 4,049 / 4,096 bytes and core + DOM 10,198 / 10,240 bytes (minified + gzip), as recorded at P1. P2 requests no budget increase: 0 bytes. Estimated candidate costs are labeled as estimates in the design; P3 must replace them with actual measured deltas and stop if a candidate cannot fit the existing caps.

## Verification

No implementation tests were run because this checkpoint changes documentation only. Prettier passed, and all local Markdown links in the two new files resolve.

Stopped at the P2 design checkpoint for review.

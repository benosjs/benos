# ST-S1 — Streaming design documents

**Status:** Awaiting review. S0 was approved on 2026-10-31. The user's words: "Approve S0, start S1". No implementation code was written.

## Delivered

- **[ssr.md](../architecture/ssr.md)**, _Streaming (0.7.0 contract)_: the invariant, the public surface of `renderToStream` and the two new behaviors of `hydrate`, the shell and its timing, the `b:N:ID` marker extension, the patch shape, the runtime, progressive hydration step by step, the server fast path and its development rule, data under streaming, the request-record additions, the seams table with estimates and the two cap proposals, trade-offs against SolidStart, React, Qwik, and Astro, and the test plan for S2 to S4. The 0.6.0 sections are unchanged apart from the status line.
- **[async.md](../architecture/async.md)**, **[query.md](../architecture/query.md)**, **[router.md](../architecture/router.md)**: one paragraph or sentence each on their streaming seams.

## Two things the design changed against the brief

1. **Waiting happens at the boundary, not in the resource.** The brief said a resource inside a streamed boundary waits for the patch through a pending map. Reading the code showed a simpler shape: `Suspense` learns from the hydration that its claimed fallback carries a streamed ID and **does not stage its content at all** until the patch arrives, so the resources inside are created after their snapshots exist and seed through the unchanged 0.6.0 path. No resource ever waits, nothing fetches, and the content is claimed from the patched nodes because it is staged while the claim cursor sits on them. This removes a seam from `resource` and the pending map from the record; `pendingOf` and `whenPatched` replace it. If you prefer the brief's wording to stand, say so and I will keep the per-resource design, but it is more code for the same behavior.
2. **The fast path costs core nothing.** The brief allowed a core seam. The pending-read signal is a field on the request record that `@benosjs/async` calls where a resource read already observes a pending token, so core's runtime does not change and the core and core + DOM budgets do not move. The development-mode rule (keep the effect, refuse the late value, warn with the path) makes development HTML equal production HTML without a core hook either.

## Decisions for you

| #   | Decision                                                                                                                                                                                                | Recommendation                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | Boundary-level deferral instead of per-resource waiting (above)                                                                                                                                         | Approve                                        |
| 2   | `@benosjs/server` cap 6,144 → **8,448** (+2,304): streaming host, `renderToStream`, fast path, and the ~450 B runtime string; estimate 7,650–8,300                                                      | Approve; S3 asks with numbers if it lands over |
| 3   | `@benosjs/dom/hydrate` cap 3,328 → **4,096** (+768): shell wait, payload merge, marker suffix, handler, claim re-activation; estimate 3,560–3,760                                                       | Approve                                        |
| 4   | `track(promise, shell?)`: the router flags its initial navigation so the shell waits for loaders and for nothing else                                                                                   | Approve                                        |
| 5   | Runtime global `__benos_s`, patch shape (template, optional payload script, call script), end notice `e(rootId)`; all frozen with 0.7.0                                                                 | Approve                                        |
| 6   | `StreamOptions.onError` adds `phase: 'stream'` for errors after the status line has gone out (payload overflow, abort); `renderToString`'s type is untouched                                            | Approve                                        |
| 7   | The cumulative payload cap after the shell ends the stream with the end notice instead of rejecting, and reports through `onError`                                                                      | Approve                                        |
| 8   | Progressive hydration needs the client entry loaded with `async`; `hydrate` itself waits for the shell, so no new client option. The dashboard adds the attribute in S5 through its Vite HTML transform | Approve                                        |
| 9   | Development fast-path rule: keep the effect, refuse a settled binding's second value, warn with the path; production evaluates once                                                                     | Approve                                        |
| 10  | Eager serialization stays out of S2; S2 measures the binding fast path alone and proposes the next step with the number                                                                                 | Approve                                        |
| 11  | Shell ID scheme: decimal shell-order index per root, nested boundaries numbered as their patches are emitted                                                                                            | Approve                                        |

## Byte estimates (minified and gzipped)

| Package     | Now    | Estimate     | Cap now | Proposed |
| ----------- | ------ | ------------ | ------- | -------- |
| core        | 4,490  | +0           | 4,608   | —        |
| core + DOM  | 11,515 | +0           | 11,520  | —        |
| async       | 1,897  | +140–200     | 4,096   | —        |
| query       | 3,739  | +15–25       | 3,840   | —        |
| router      | 6,897  | +5–10        | 7,168   | —        |
| dom/hydrate | 3,158  | +400–600     | 3,328   | 4,096    |
| server      | 5,898  | +1,750–2,400 | 6,144   | 8,448    |

## Risks named in the design

- **Shell wait in `hydrate`** relies on the root's closing marker being a direct child of the host; that is true of every page `renderToString` or `renderToStream` produces and is the documented host contract.
- **Claim re-activation** turns the claim hook on for a nested mount after the root finished. The hook is global to the DOM renderer; the design keeps the activation synchronous around the continuation so an unrelated `render` call cannot run under it. S4 tests two roots on one page to pin this.
- **Server time** after the fast path is an estimate until S2 measures it; the design says so and defers eager serialization to the measurement.

## Checks run

`pnpm check:doc-examples` passes (53 files; it covers the guides, not `docs/architecture`, so the new `ts` block in `ssr.md` was checked by hand against the 0.6.0 `RenderOptions` and the registry types), `pnpm lint`, and Prettier on every touched document.

## Next

On approval: S2, the server fast path, measured in `bench:ssr`. Stop at the `st-s2` checkpoint with the ratio against Solid and the byte count.

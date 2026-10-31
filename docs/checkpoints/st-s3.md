# ST-S3 — `renderToStream` and patches

**Status:** Approved on 2026-10-31. The user's words: "Approve S3, start S4". S2 was approved on 2026-10-31 with the rule as built. The user's words: "Approve S2, start S3".

## Delivered

- **`renderToStream(app, options)`** in `@benosjs/server` ([`stream.ts`](../../packages/server/src/stream.ts)): resolves to `{ status, headers, stream, done }` once the router has settled; `stream` carries the shell, one patch per streamed boundary in settle order, and the end notice; `done` settles when the stream closes and never rejects. `StreamOptions` adds `nonce` and the `'stream'` error phase. [`render.ts`](../../packages/server/src/render.ts) is now a shared request session (`beginRequest`, `settle`) that `renderToString` and `renderToStream` both use; `renderToString`'s behavior and output are unchanged.
- **Shell timing:** `track(promise, shell?)` on the request record; the router flags its initial navigation. The shell waits for that and nothing else; `renderToString` still waits for everything.
- **Streamed boundaries:** the host records every stage it prepares per request; a committed fallback (ordinal 0) with a held content (ordinal 1) is a streamed boundary, its fallback marker becomes `<!--b:0:ID-->`, and its content is serialized as a patch when it commits. Nested boundaries found inside patched content get their own IDs and patches.
- **Patch shape**, as designed: `<template id="b:ROOTID:ID">` with the content stage, a payload script carrying only new snapshots (omitted when empty), and a call script `__benos_s.p("ROOTID","ID")` that removes itself. The runtime (`RUNTIME` in `stream.ts`, 520 B before compression) is sent once before the first patch and removes itself; the end notice `__benos_s.e("ROOTID")` closes.
- **The invariant holds**: applying the patches in a DOM and serializing gives `renderToString`'s markup between the root markers, and the payload union matches. Pinned in Node (happy-dom, executing the runtime and every call script) and in three browsers (the real parser, through `document.write` of the chunks into an iframe).
- **Hydrate reader extension** ([`hydrate.ts`](../../packages/dom/src/hydrate.ts)): `isOpen`, `stageIndex`, and the leftover sweep accept `b:N:ID`, so a boundary the end notice handed to the client (its fallback still marked) hydrates through the unchanged claim code; +39 B in the hydrate entry.
- **Tests:** [`stream.test.ts`](../../packages/server/tests/stream.test.ts) (11): shell/patch/end sequence and content; the invariant; shell-only output for a page without pending data; nested boundaries in settle order with the invariant; a failed fetch handed to the client; the router's loaders awaited before the shell with 200, 404, and 302 + `Location`; nonce on every inline script and never on the payload; abort after the shell ends with the end notice; abort and setup errors before the shell reject as `renderToString` does; the cumulative payload cap after the shell ends the stream and reports `phase: 'stream'`; two roots on one page. [`stream.spec.ts`](../../tests/browser/stream.spec.ts) in Chromium, Firefox, and WebKit: a streamed page's patches apply as parsed, templates and scripts are gone, the applied DOM equals `renderToString`'s, hydration claims it with zero mismatches and no refetch, and a binding is live afterwards; a boundary the server could not settle shows its fallback, hydrates, and fetches once on the client. [`test-server-runtime.mjs`](../../scripts/test-server-runtime.mjs) gained a streaming fixture (shell, patch, nonce, end notice) for the production build on Node and Bun.
- **[ssr.md](../architecture/ssr.md)** records the S3 specifics: the runtime object's shape, the shell-only case, when the end notice is sent, and the note on boundaries without a codec.

## Found while building

1. **Boundaries without a codec are streamed too.** The host finds streamed boundaries from stage state, which does not say whether a boundary's resource is tracked. A boundary whose resource has no codec (never settles on the server) therefore also carries `b:0:ID` and is resolved by the end notice, which hands it to the client exactly as 0.6.0's plain fallback was; the reader extension makes this hydrate cleanly. The cost is one unnecessary ID per such boundary; distinguishing them would need `Suspense` to tell the host which tokens are tracked, which I judged not worth a seam. Your call if you disagree.
2. **The call script removes itself** instead of being removed by `p`, because a script cannot be found by position from inside `p` once a hydration handler takes the patch (S4). The runtime definition also removes itself. After a stream has been fully applied the host contains only what `renderToString` would have written plus the payload scripts, which `hydrate` consumes.
3. **No Bun on this machine.** The streaming fixture in `test-server-runtime.mjs` passed on Node; CI's `server-bun` job runs the same file on Bun.

## Sizes (minified + gzip)

| Bundle                                | Before S3 | After S3  | Cap   |
| ------------------------------------- | --------- | --------- | ----- |
| `@benosjs/server`                     | 6,416     | **7,645** | 8,448 |
| `@benosjs/dom/hydrate`                | 3,158     | **3,197** | 4,096 |
| `@benosjs/router`                     | 6,897     | 6,899     | 7,168 |
| core, core + DOM, async, query, forms | unchanged | unchanged |       |

S3 added 1,229 B to the server: the session refactor, stage records, streamed-boundary detection, patch and payload-delta serialization, stream plumbing, and the runtime string (about a third). S1 estimated 1,750–2,400 B for S2 and S3 together; built: 1,747 B. S4's hydrate work has 899 B of headroom.

## Checks run

`pnpm test` (55 files, 566 tests), `pnpm test:browser` (522 passed on three engines, including the new streaming spec and the 0.6.0 hydration and dashboard specs; three WebKit primitives tests timed out while lint ran alongside the suite and passed when re-run alone, 68 of 68), `pnpm lint`, `pnpm size`, `typecheck:types`, `check:public-imports`, `check:packed`, `test-server-runtime.mjs` on Node, the dashboard client and SSR builds with `test-dashboard-ssr.mjs`.

## Next

On approval: S4, progressive hydration (`hydrate` waits for the shell, merges every payload script, registers the `__benos_s` handler, defers streamed boundaries through `pendingOf` and `whenPatched`, and claims patched content with the cursor re-activated). Stop at the `st-s4` checkpoint.

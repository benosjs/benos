# ST-S4 — Progressive hydration

**Status:** Approved on 2026-10-31. The user's words: "Approve S4, start S5". S3 was approved on 2026-10-31. The user's words: "Approve S3, start S4".

## Delivered

- **`hydrate` on a streaming page** ([`hydrate.ts`](../../packages/dom/src/hydrate.ts)): called before the shell has been parsed, it waits for the root's closing marker (or the end of parsing) and then claims; it merges every payload script for the root, the shell's and each patch's; it registers a handler on the host window's `__benos_s` so patches that arrive after it started are handed to it; and it knows the stream is over from the end notice or from `DOMContentLoaded` without one. Its signature is unchanged.
- **Streamed boundaries defer** ([`async`](../../packages/async/src/index.ts)): `Suspense` asks `request.pendingOf(marker)` after claiming its marker; a boundary whose fallback was marked `<!--b:0:ID-->` commits that fallback and stages nothing until `request.whenPatched(ID, continue)` runs the continuation under the boundary's owner. When the patch lands, the hydration inserts the content pair before the boundary's marker, registers it as the claimable stage of ordinal 1, re-activates the claim cursor around the continuation, and sweeps leftover markers; the content is claimed, not re-created.
- **Held data** (`async` and [`query`](../../packages/query/src/index.ts)): a resource with a codec and no snapshot, under a hydrating root whose stream is unfinished, holds (pending, with a token) through `request.whenSnapshot(key, next)` instead of fetching; it seeds when a payload with its key is merged and fetches at the end of the stream. The query observer's inner resource holds the same way because its codec key is now the entry's hash; the observer's fetcher seeds the entry from a snapshot that arrived late. `entryFor` and that path share one `seedEntry`.
- **Runtime shape finalized** ([`stream.ts`](../../packages/server/src/stream.ts)): the runtime installs `p` and `e` on whatever `__benos_s` object exists, because a hydration that starts first creates the store without them.
- **Tests:** [`progressive.test.ts`](../../packages/server/tests/progressive.test.ts) (7, happy-dom with the document marked as parsing): hydrate before the patch (claimed fallback, no fetch, no content, typed input kept; then the patch is claimed with no fetch and the end notice changes nothing; same DOM as hydrating the fully applied page); hydrate after all patches; a boundary the end notice leaves unpatched fetches exactly once; a hydration started after the stream finished fetches at once; hydrate between the patches of nested boundaries with no fetch and the same DOM as `renderToString`; the end of parsing without an end notice releases the holds; a patch for a disposed hydration is dropped and leaks nothing. [`stream.spec.ts`](../../tests/browser/stream.spec.ts) gained two tests in Chromium, Firefox, and WebKit: hydrate mid-stream (right after the shell) claims the patch when it lands with no fetch and a live binding afterwards; `hydrate` called before the shell exists waits for it. Every 0.6.0 hydration and query test is unchanged and passes.
- **[ssr.md](../architecture/ssr.md)** records the hold, the finished rule, and the built byte counts.

## Found while building (your decision)

1. **Deferral alone was not enough.** S1 argued that resources inside a deferred boundary are created after their snapshots exist. True, but a resource is usually created in the page's setup and read inside the boundary, and it launches at creation. The first test caught it: the client fetched while the patch was in flight. The resource-level hold the brief originally described came back, alongside deferral, which is still needed so content is staged onto the patched nodes. Both are in; `whenSnapshot` joins the request record. If you would rather the brief's S1 wording stand as the record, say so; the architecture document now describes what is built.
2. **"Stream in progress" is a document property.** A resource must not hold on a page rendered by `renderToString`, which never sends an end notice. The rule: a stream is in progress only while `document.readyState` is `loading` and the root has not sent its end notice; `DOMContentLoaded` without one (a dropped connection) also ends it. A non-streamed page hydrated by an `async` entry therefore fetches at `DOMContentLoaded` at the latest. The unit tests mark the document as parsing to exercise the hold.
3. **One hydration per root ID per page.** The handler for a root ID is a single slot on the store; a second `hydrate` for the same ID on the same page takes it over. Two roots must use different IDs, which the 0.6.0 contract already requires.

## Sizes (minified + gzip)

| Bundle                          | Before S4 | After S4  | Cap   | Headroom |
| ------------------------------- | --------- | --------- | ----- | -------- |
| `@benosjs/dom/hydrate`          | 3,197     | **3,962** | 4,096 | 134      |
| `@benosjs/async`                | 1,923     | **2,084** | 4,096 | 2,012    |
| `@benosjs/query`                | 3,739     | **3,744** | 3,840 | 96       |
| `@benosjs/server`               | 7,645     | 7,668     | 8,448 | 780      |
| core, core + DOM, router, forms | unchanged | unchanged |       |          |

The hydrate entry grew 765 B in S4 against the S1 estimate of 400–600 B for S3 and S4 together (built: 804). The hold and the runtime handler are the difference. It fits the approved cap with 134 B to spare; S5 and S6 add no client code.

## Checks run

`pnpm test` (56 files, 573 tests), `pnpm test:browser` (531 passed on three engines, none failed), `pnpm lint`, `pnpm size`, `typecheck:types`, `check:public-imports`, `test-server-runtime.mjs` on Node (Bun is not installed here; CI runs it).

## Next

On approval: S5, the validation app and measurements: the dashboard streams a deliberately slow opted-in query on Node and Bun with an `async` entry, CI coverage, TTFB and settled-page timings, server render time after the fast path, hydration cost of a streamed page on three engines, and `docs/ssr-findings.md` updated. Stop at the `st-s5` checkpoint.

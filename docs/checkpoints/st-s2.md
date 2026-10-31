# ST-S2 — Server fast path

**Status:** Approved on 2026-10-31 with the rule as built and S3 next (eager serialization stays a follow-up). The user's words: "Approve S2, start S3". S1 was approved on 2026-10-31 with all eleven decisions. The user's words: "Approve S1, start S2".

## Delivered

- **The fast path in `@benosjs/server`** ([`host.ts`](../../packages/server/src/host.ts), `bind`): every dynamic binding (element attribute getters, direct-template attribute and child bindings, plan text, attribute, and child bindings, dynamic `children`, and the sources of `Show`, `For`, `Switch`, and `Dynamic`) is evaluated once under `untrack` and applied; a render effect is created only while a tracked resource is pending in the request. Development evaluates once as production does, then keeps an effect whose runs refuse and report a late write, so development HTML equals production HTML.
- **The seam** ([`async`](../../packages/async/src/index.ts)): a resource with a codec increments `request.pendingCount` when it launches under a server root and decrements it when it settles or fails. Core gains the optional type field and no runtime code.
- **Three structural fixes found by profiling the production path**, all inside `@benosjs/server`: direct-template skeletons are compiled once per definition and replayed in place (no per-row parse, no holder fragment move); the per-element and per-range cleanup closures that duplicated the slot's range removal are gone, and removal is skipped while the root is torn down after serialization; a primitive slot value gets a text node and no branch owner.
- **Tests**: [`fast-path.test.ts`](../../packages/server/tests/fast-path.test.ts) (development: late write refused and named, no warning for a write before the read, pending content still re-renders including through a computed over a plain `value()` read) and [`fast-path.production.test.ts`](../../packages/server/tests/fast-path.production.test.ts) (production, with the registry's render-effect factory wrapped to count: zero effects for a page without pending data, first value kept for a late write without a warning, settled values through a cached computed, an opted-in resource read outside `Suspense`, and once-evaluation for a list mounted after its data settled). Every existing server fixture is unchanged.
- **Caps** in `check-size.mjs` set to the S1 values: `@benosjs/server` 8,448, `@benosjs/dom/hydrate` 4,096.
- **[ssr.md](../architecture/ssr.md)** _Server fast path_ rewritten to the rule as built; the seams table and `async.md`/`query.md` follow.

## The rule changed, and why (your decision 1)

S1 said: once, unless the binding **read pending data**, with `@benosjs/async` reporting the read. Building it showed the per-binding signal cannot be made sound without core help:

- A resource's `value()` and `state()` are plain signals. A binding over `user.value()?.name`, or over a `computed` caching it, reads no token, so a per-read hook never fires for it, and the binding would be evaluated once and go stale when the resource settled. The first version of the tests caught exactly this (`<b></b>` instead of `<b>Ada</b>`).
- A read inside a `computed` is not the hole I feared at S1: core rejects `onCleanup` during computed evaluation, so `user.read()` cannot be called from a computed at all. The `value()` path above is the real one.

The rule as built: **once, unless any tracked resource is still pending in this request** (`pendingCount > 0`). It is sound because only a settle can change what a binding shows during a request, and every settle comes from a tracked resource. It is coarser than S1's rule during the window in which data is pending: every binding created then gets an effect, which is today's cost; bindings created before the first launch and after the last settle are evaluated once. For a page without opted-in data, nothing pays. Core stays at 0 bytes; `query` needs no change because an observer's inner resource is what counts.

## Measured

`pnpm bench:ssr`, Node 26.10, medians of 7 per run, three runs each, on a machine that was not idle (the spread shows it):

| Rows  | Before (0.6.0)      | After                               | Solid        | Ratio after |
| ----- | ------------------- | ----------------------------------- | ------------ | ----------- |
| 1,000 | 9.1 ms (35–45×)     | 6.1, 7.5, 8.6 ms (4.6 ms when idle) | 0.27–0.37 ms | **17–23×**  |
| 5,000 | ~44 ms (same ratio) | 35.7, 38.1, 42.2 ms                 | 1.25–1.51 ms | **25–30×**  |

About **half the time is gone**; the ratio is not in single digits. Where the remaining time goes (production build, 5,000 rows, CPU profile under `renderToString`): mounting the direct templates and their slots 48% (`updateSlot`, `For` items, node allocation); serializing the finished tree 21% (`escapeText` 9%); core owner creation and ordinals 10%; the rest is the request root and small fixed costs. Garbage collection no longer appears in the profile. In other words, the reactive overhead is paid down and what remains is the **node tree itself**: every row still allocates its elements, text nodes, slot markers, a `Slot` record, and an item owner, then the whole tree is walked again to produce the string.

Bundle sizes (minified + gzip): `@benosjs/server` 5,898 → **6,416** of 8,448 (+518: the primitive, skeleton compiler, teardown flag, and the development path; the S1 estimate for the fast path alone was 300–450). `@benosjs/async` 1,897 → 1,923 (+26). core, DOM, query, router, forms, hydrate unchanged.

## Decision for you (2): what to do about the remaining 17–23×

The brief's S2 says: if the ratio is still above single digits, report where the time goes and propose the next step with the number.

- **Option A — proceed to S3 now (recommended).** Streaming is the track's purpose and builds on the host as it stands; the measured cost for a real page (the dashboard) is low single-digit milliseconds, and the table benchmark is the worst case. Eager serialization is listed as a follow-up for the track's findings document and the roadmap, to be built when a user's page shows it is needed.
- **Option B — an S2b for eager serialization before S3.** Serialize a settled direct template to a string at mount time instead of building nodes, keeping nodes only for pending boundaries and for slot markers. The profile puts the ceiling at roughly 60% of the remaining time (mount 48% is not all avoidable, serialization 21% mostly is), so I would expect 1,000 rows in about **2–3 ms, 8–10×**, not parity: markers, owners, and ordinals remain by design. It changes how ranges are represented in the host, which S3's streaming host also touches, so doing it first would make S3 simpler to reason about but cost one more checkpoint before any streaming exists.

## Checks run

`pnpm test` (54 files, 555 tests), `pnpm lint`, `pnpm size`, `tsc` for the server package, `test-server-runtime.mjs` (production build on Node), the dashboard client and SSR builds and `test-dashboard-ssr.mjs`, `bench:ssr` at 1,000 and 5,000 rows. Not run here: the browser suite and Bun (unchanged client code; S3 runs both).

## Next

On your decision: S3 (`renderToStream`, patches, the runtime, the invariant) or S2b (eager serialization). Either stops at its checkpoint.

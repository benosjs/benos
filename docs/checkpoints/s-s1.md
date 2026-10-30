# S1 — Design documents

**Status:** Approved on 2026-10-28 with all twelve decisions, including the query cap of 3,840 B. The user's words: "Approve S1 with all 12 decisions, including the query cap of 3,840 B. Start S2: the server renderer. Stop at the s-s2 checkpoint." S2 has begun. S0 was approved on 2026-10-28. The user's words: "Approve SSR S0. Start S1: update ssr.md to the 0.6.0 contract and stop at the s-s1 checkpoint." No implementation code was written.

## Delivered

- [ssr.md](../architecture/ssr.md) rewritten from the Phase 2 design to the 0.6.0 contract: public signatures, request root and server mode, the server host, marker grammar v1, payload format v1, data integration for resources, queries, the router, and forms, deterministic IDs, the hydration algorithm with mismatch recovery, every core and module seam with a byte estimate, budgets, trade-offs, the test plan, the hard-to-reverse list, and what is kept open for streaming.
- SSR notes updated in [async.md](../architecture/async.md) (codec behavior and the compatibility check), [query.md](../architecture/query.md) (rule 5), [router.md](../architecture/router.md) (the SSR seam), [forms.md](../architecture/forms.md) (IDs), and the [architecture index](../architecture/README.md).

## Decisions that need your approval

1. **Server mode is the existing gate.** The request root is held at gate 1 for its whole life: user effects and `onMount` never run; render-tier bindings do run and subscribe, because staged Suspense content must show settled values before serialization. This withdraws the Phase 2 statement that bindings evaluate once. No new scheduler mechanism.
2. **A second renderer for the server tree, not a shared one.** `@benosjs/server` reimplements value mounting and control flow over the same descriptors and the same owner kinds; `Suspense` and `RouterOutlet` are shared by giving internal control mounts a `host` argument (markers, insertion, removal, staging). The alternative, making `@benosjs/dom`'s renderer generic over a host, would put the 11 KB budget and every renderer test at risk.
3. **Positional claiming with a uniform delimiter pair.** Static nodes carry no markers. Every dynamic position is `<!--b-->` … `<!--/b-->`; the root is `<!--benos:ROOTID:1-->` … `<!--/benos:ROOTID-->`. After hydration the DOM equals client-rendered DOM for the same state.
4. **Payload in a `<script type="application/json" data-benos>`** inside `result.html`, with `result.payload` for custom placement; 1 MiB default limit that rejects the render.
5. **Failure is fallback.** A resource or query that fails on the server is not serialized and its boundary renders the Suspense fallback, never error UI; the client refetches. Server fetch errors reach `onError` only.
6. **IDs from creation ordinals.** `createUniqueId` keeps its signature; under server and hydrating roots it returns root ID + owner path (per-parent creation ordinals, effect run owners inheriting their effect's ordinal, `For` items keyed) + call ordinal. The derivation lives in `@benosjs/server` and `@benosjs/dom/hydrate`; core only records ordinals and calls the root's ID factory.
7. **Typed input survives hydration** because every attribute and property binding skips its first write while the claim cursor is active.
8. **`Portal` content is client-only**; the server emits an empty pair.
9. **Server builds compile with `optimization: 'none'`** so the server walks the plan; the client may keep direct templates, with a paired fixture proving structural equality.
10. **Development-only checks** for parser-repaired structures (`<tr>` outside a table section, nested `<p>`/`<a>`/`<form>`, block inside `<p>`), ownerless-signal writes during a request, and `createRoot` during a request. Production relies on mismatch recovery.
11. **Budgets:** `@benosjs/server` 6,144 B and `@benosjs/dom/hydrate` 2,048 B. **Query cap raised to 3,840 B** (+256): client-side snapshot seeding cannot fit in its 86 B of headroom. **Core + DOM unchanged for now**: the seams are estimated at 210–300 B against 258 B of headroom; S3 measures and, only if savings in `@benosjs/dom` cannot close the gap, asks for at most +128 B with the measured number.
12. **Response codes:** the router writes `404` for the not-found view and `302` with `Location` for a route `redirect`; nothing else in 0.6.0 sets status.

## Byte estimates by package

| Package | Estimate  | Headroom today | Note                                           |
| ------- | --------- | -------------- | ---------------------------------------------- |
| core    | 190–280 B | 305 B          | ordinals, request field, ID hook, gate cleanup |
| dom     | 210–300 B | 258 B (pair)   | claim cursor, control `host`, `For` key        |
| async   | 220–300 B | 2,452 B        | server-root resource behavior, seeding         |
| query   | 180–240 B | 86 B           | needs the raised cap                           |
| router  | 120–180 B | 429 B          | track, status, outlet `host`                   |
| forms   | −10 B     | 194 B          | prefix from `createUniqueId`                   |

Estimates are from the current source; S2 and S3 report measured numbers.

## Things I checked against the code

- The gate mechanism (`setInternalOwnerGate`, `ownerIsGated`) already holds user effects and mount jobs at level 1 and render effects at level 2; `gatedEffects` is only pruned on the next gate change, hence the disposal cleanup in the seams.
- `Suspense` and `RouterOutlet` are registered internal controls whose only DOM dependencies are `createComment`, `insertBefore`, `remove`, `instanceof Document`, and `prepareInternalStage`, which is why a `host` argument suffices.
- The DOM renderer's slot marker is a trailing comment that is removed when a range is a single element; the closing `<!--/b-->` maps onto it directly.
- `createUniqueId` is a process-wide counter today; `formModel` uses its own counter (`f1-`, `f2-`); `query`'s default cache is module-global; `resolveCache()` already honors `QueryCacheProvider`; `memoryHistory` exists and reads no browser global.
- `@benosjs/vite` passes `optimization` from its options or the build command; it does not yet distinguish the SSR environment.

## Next

On approval: S2, the server renderer. Stop at the S2 checkpoint.

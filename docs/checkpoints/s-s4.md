# S4 — Data and routing integration

**Status:** Approved on 2026-10-28. The user's words: "Approve S4. Start S5: tooling and the validation app. Stop at the s-s5 checkpoint." S5 has begun. S3 was approved on 2026-10-28 with both caps. The user's words: "Approve S3. Raise the core+DOM cap to 11,520 B and set the @benosjs/dom/hydrate cap to 3,328 B. Start S4: data and routing integration. Stop at the s-s4 checkpoint."

## Delivered

- **Queries** ([`packages/query/src/index.ts`](../../packages/query/src/index.ts)): `QueryOptions.ssr` as [query.md](../architecture/query.md) documented; a request-local cache per server request (`WeakMap` by request record, disposed through the record's new `cleanup` hook); every fetch that cache starts is tracked by the request; opted-in entries are recorded as `[id, keyHash, serialize(data)]` on success; under a hydrating root the page default cache seeds an entry from the payload on first lookup, fresh from that moment. An observer of a query without `ssr` never fetches on the server; `query.load` in a loader always does.
- **Router** ([`packages/router/src/index.ts`](../../packages/router/src/index.ts)): the initial navigation is tracked by the request; the response gets `404` for an empty committed branch with a not-found view and `302` + `Location` for a route `redirect`; `RouterOutlet` mounts through the `host` argument; under a request a loader is awaited directly in its own root (aborted with it) instead of through a resource watched by a user effect.
- **Core** ([`runtime.ts`](../../packages/core/src/runtime.ts)): a `createRoot` made during a request inherits the request record, so loader roots share the request's cache and ids. The S1 development warning for this case is withdrawn; the record gains the `cleanup` hook.
- **Forms** ([`packages/forms/src/index.ts`](../../packages/forms/src/index.ts)): field ids come from `createUniqueId()`, so they are deterministic under server and hydrating roots.
- **Async**: a resource codec may serialize to `undefined` to record nothing; the query observer's inner resource uses that so the entry serializes itself.
- **Hydrate** ([`hydrate.ts`](../../packages/dom/src/hydrate.ts)): the claim stays active until promises the app tracked (the router's navigation) settle, then the root finishes as before, so routed content that commits after its loaders claims the server's stage pair. The disposer is immediate either way.
- **Flagship** ([`examples/flagship/tests/server.ssr.test.tsx`](../../examples/flagship/tests/server.ssr.test.tsx), [`vitest.ssr.config.ts`](../../examples/flagship/vitest.ssr.config.ts)): a plan-only vitest project renders the editor on the server, parses it, hydrates it with the same module graph, and saves through it.
- [ssr.md](../architecture/ssr.md) records all of the above in its request-root, queries, and router sections.

## Decisions taken in S4 (within S1's approvals)

1. **Loaders bypass the resource under a request.** The router's resource-plus-`effect` loader cannot settle while the request root is gated; the direct path is about 100 B in the router and is only taken when a request record exists.
2. **Nested roots inherit the request** instead of warning. A loader's `query.load` otherwise lands in the page default cache and is never serialized.
3. **Hydration finishes after tracked promises.** A synchronous finish would leave routed content to be client rendered. During that window a second `hydrate` on the same page would take over the claim hook; the first root then creates its late nodes fresh, which is safe but worth stating.
4. **A codec-less query observer stays pending on the server**, matching resources; `query.load` fetches because the navigation needs it, and the data is simply not serialized.

## Measured sizes (minified + gzip)

| Package                 | Before S4 | After S4 | Cap    | Headroom |
| ----------------------- | --------- | -------- | ------ | -------- |
| `@benosjs/core`         | 4,478     | 4,490    | 4,608  | 118 B    |
| `@benosjs/core` + `dom` | 11,508    | 11,515   | 11,520 | 5 B      |
| `@benosjs/async`        | 1,886     | 1,897    | 4,096  | —        |
| `@benosjs/query`        | 3,498     | 3,739    | 3,840  | 101 B    |
| `@benosjs/router`       | 6,739     | 6,897    | 7,168  | 271 B    |
| `@benosjs/forms`        | 2,878     | 2,888    | 3,072  | —        |
| `@benosjs/dom/hydrate`  | 3,044     | 3,158    | 3,328  | 170 B    |
| `@benosjs/server`       | 5,379     | 5,404    | 6,144  | —        |

The S1 estimates were query 180–240 B (measured 241), router 120–180 B (158), forms −10 B (+10: `createUniqueId` costs a little more than the counter it replaced). No cap changes.

## Tests

| Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Result                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`packages/server/tests/integration.test.ts`](../../packages/server/tests/integration.test.ts): an opted-in query renders, serializes only its projection, and hydrates without a refetch; concurrent requests have separate caches and payloads; a codec-less query leaves the fallback and fetches on the client; a route loader's query data renders with status 200; 404 and 302 + `Location`; an aborted request cancels the loader fetch; routed content hydrates after the loader settles reusing the server nodes with no mismatch; form field ids are equal on both sides | 8 tests                                                  |
| Flagship SSR project: the editor renders the committed record, hydrates in place (same `<form>` node, labels linked by `b0-…` ids), and saves like a client render; each request gets its own record                                                                                                                                                                                                                                                                                                                                                                               | 2 tests                                                  |
| `pnpm test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 52 files, 546 tests passed                               |
| `pnpm test:browser`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 510 passed on Chromium, Firefox, and WebKit, none failed |
| `typecheck:types`, `check:public-imports`, `check:doc-examples`, `check:packed`, `check:flagship`, `lint`, `size`, `test:server-runtime` (Node 26.10, Bun 1.3.2)                                                                                                                                                                                                                                                                                                                                                                                                                   | Passed                                                   |

## Found and fixed while building

1. Route loaders ran through a resource observed by a user `effect`; under a gated request root the navigation never settled (server render and hydration both hung). The direct loader path above fixes it.
2. The query observer's inner resource had no codec, so no query ever fetched on the server; and when I first gave it one unconditionally, codec-less queries fetched too. It now gets the recording-free codec only when the definition opts in.
3. Loader roots were plain `createRoot`s outside the request, so loader data went to the page default cache and was never serialized; hence the inheritance.
4. A debugging mistake of mine reverted uncommitted S4 edits with `git checkout` on source files; they were restored from the edit scripts and the work is now snapshotted in WIP commits before any such step.

## Next

On approval: S5, tooling and the validation app. Stop at the S5 checkpoint.

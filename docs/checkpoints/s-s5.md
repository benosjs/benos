# S5 — Tooling and validation app

**Status:** Awaiting approval, with one superseded S1 decision to confirm. S4 was approved on 2026-10-28. The user's words: "Approve S4. Start S5: tooling and the validation app. Stop at the s-s5 checkpoint."

## Delivered

- **Server-rendered dashboard** ([`examples/dashboard`](../../examples/dashboard)): [`entry-server.tsx`](../../examples/dashboard/src/entry-server.tsx) exports `handle(request, template)`, a `Request → Response` function that creates one router per request on a `memoryHistory` at the request URL, renders through `@benosjs/server`, and returns the client build's `index.html` with the app in its host, the router's status, and the serialized project queries (both opted in). [`main.tsx`](../../examples/dashboard/src/main.tsx) hydrates a page that starts with the root marker and renders from scratch otherwise, so the dev server is unchanged. [`scripts/serve.mjs`](../../examples/dashboard/scripts/serve.mjs) serves the client assets and calls the handler over `node:http`; Bun runs the same file. `routes/manifest.tsx` became a factory, and the in-memory API no longer touches `window`.
- **Builds:** `pnpm --filter @benosjs/dashboard build:ssr` is an ordinary Vite SSR build with every `@benosjs/*` package external. The README documents the deployment shape.
- **Checks on Node and Bun:** [`scripts/test-dashboard-ssr.mjs`](../../scripts/test-dashboard-ssr.mjs) calls the built handler for four pages (200, 200, 200, 404), checks the markers, the payload, and that the client bundle carries no server renderer; CI runs it on Node in `verify` and on Bun in `server-bun`. [`tests/browser/dashboard-ssr.spec.ts`](../../tests/browser/dashboard-ssr.spec.ts) loads the served pages in Chromium, Firefox, and WebKit: status codes, payload, zero mismatches, **no client fetches after hydration**, and client navigation afterwards. Playwright starts the SSR server as a third web server.
- **Benchmarks:** [`benchmarks/ssr.mjs`](../../benchmarks/ssr.mjs) (`pnpm bench:ssr [rows]`) times `renderToString` for the same page in Benos (compiled by the real compiler) and Solid (the hand-lowered equivalent of its `ssr` templates). The hydration test in [`hydrate.spec.ts`](../../tests/browser/hydrate.spec.ts) times hydrating a 1,000-row table against a client render on three engines.
- **[docs/ssr-findings.md](../ssr-findings.md)**, for a developer coming from Next.js or SolidStart.
- **`@benosjs/server` renders direct templates** ([`host.ts`](../../packages/server/src/host.ts)): the `safe` optimization's skeleton is built from the compiler's four-token grammar; attributes arrive typed by path; child anchors become slot pairs. `@benosjs/vite` compiles the SSR environment exactly like the client.

## Decision superseded (needs your confirmation)

**S1 decision 9 — "server builds compile with `optimization: 'none'`" — is withdrawn.** The dashboard hydrated with a mismatch at its first layout element: the plan output nests a component-bearing element (the header with `<Link>`s) as its own template behind a dynamic slot, while the direct skeleton inlines it. So a plan-only server and a `safe` client disagree on where slot pairs are, and therefore on owners and ids; the "paired fixture" assumption of S1 held for nodes but not for dynamic positions. The rule is now: **both builds use one optimization, and the server renders both forms.** This cost about 500 B in `@benosjs/server` (5,404 → 5,898 of 6,144) and nothing on the client. [ssr.md](../architecture/ssr.md) and [compiler.md](../architecture/compiler.md) record it; the flagship SSR project now compiles with `safe` like the client.

## Measured

| Measurement                                                                     | Result                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Server render, header + filter form + 1,000-row table (`bench:ssr`, Node 26.10) | Benos 9.1 ms, Solid 0.22 ms: **35–45× slower** across runs; HTML 167 KB vs 82 KB (markers) |
| The same with 5,000 rows                                                        | ~44 ms vs 0.9 ms, same ratio                                                               |
| Hydrate a 1,000-row table vs client render, medians of 5, quiet machine         | Chromium 14.7 vs 14.3 ms; Firefox 22.0 vs 21.0 ms; WebKit 16.0 vs 21.0 ms                  |
| The same under the full browser suite's load                                    | Chromium 16.6 vs 12.1 ms; Firefox 42.0 vs 34.0 ms; WebKit 14.0 vs 18.0 ms                  |
| Dashboard `/projects/signals` hydrated                                          | 0 mismatches, 0 client requests (both queries seeded from the payload)                     |

The server number is the honest headline. A CPU profile of the 5,000-row page spends 29% in the garbage collector: every dynamic position creates an owner, a slot, an effect, and marker nodes, because the server runs the same reactive machinery as the client so Suspense can settle. Replacing per-element attribute `Map`s with objects took it from 10.4 to 9.1 ms; the rest is structural. The fix I recommend is a server fast path that evaluates bindings once without effects when no boundary is pending, plus a shorter dynamic-text marker, both in the streaming track that reworks serialization anyway. For a page like the dashboard the cost is single-digit milliseconds per request.

## Tests

| Check                                                                                                                              | Result                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `pnpm test`                                                                                                                        | 52 files, 547 tests passed |
| `pnpm test:browser` (includes the dashboard SSR spec and the hydration timing on three engines)                                    | 519 passed, none failed    |
| `test:dashboard-ssr` on Node 26.10 and Bun 1.3.2; `test:server-runtime` on both                                                    | Passed                     |
| `typecheck:types`, dashboard `tsc`, `check:public-imports`, `check:doc-examples`, `check:packed`, `check:flagship`, `lint`, `size` | Passed                     |

## Found and fixed while building

1. The plan/direct divergence above.
2. Direct-template bindings were resolved while earlier anchors were already turned into pairs, shifting sibling indices; targets now resolve first.
3. The page check compared raw HTML, where markers split dynamic text and `<code>` wraps the id; it now compares text content as the existing browser test does.

## Next

On approval: S6, release preparation for 0.6.0. Stop at the S6 checkpoint before any pull request update.

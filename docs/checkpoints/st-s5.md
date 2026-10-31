# ST-S5 — Validation app and measurements

**Status:** Approved on 2026-10-31. The user's words: "Approve S5, start S6". S4 was approved on 2026-10-31. The user's words: "Approve S4, start S5".

## Delivered

- **The dashboard streams** ([`examples/dashboard`](../../examples/dashboard)). `entry-server.tsx` renders through `renderToStream`, splits the client build's `index.html` around the host, and returns a `Response` whose body streams the head, the app's shell, its patches, and the tail; it also exports `createApp` and the bundled renderers for the benchmark. `scripts/serve.mjs` pipes the body as it arrives (`node:http`; Bun runs the same file). The project detail page gained a "Recent activity" card: an opted-in `activityQuery` read inside `Suspense`, backed by a deliberately slow in-memory call (600 ms, three times a normal request), so the shell goes out when the loaders settle and the activity follows as a patch with its payload. The built client entry loads `async` (a small Vite plugin, build only); `main.tsx` treats an empty host in a parsing document as a server page and calls `hydrate`, which waits for the shell. The dev server never streams and renders from scratch as before.
- **CI coverage.** [`test-dashboard-ssr.mjs`](../../scripts/test-dashboard-ssr.mjs) now reads the handler's body as chunks and checks that the detail page's shell carries the activity fallback marked with its ID and not the activity itself, that a later chunk is the patch with the activity and its serialized query, that the end notice follows, and that a page without pending data (`/projects`) sends no runtime; the existing four-page checks still run on Node and Bun. [`dashboard-ssr.spec.ts`](../../tests/browser/dashboard-ssr.spec.ts) checks the streamed order in the response, the hydrated page's zero mismatches, zero client requests (project, list, and activity all came from payloads), zero leftover templates, and the activity visible; a new test measures hydration against a client render. [`dashboard.spec.ts`](../../tests/browser/dashboard.spec.ts) accounts for the activity request in its cache test.
- **Measurements.** [`benchmarks/stream.mjs`](../../benchmarks/stream.mjs) (`pnpm bench:stream`) times the detail page's first byte and settled time through the handler and against the bundled `renderToString`.
- **A fix found by the app.** `RouterOutlet` stages and disposes candidates while it navigates; the stream's boundary finder treated a disposed candidate as a held content stage and gave the outlet's committed stage an ID. Stage records now carry `disposed`, and a pair whose held stage is disposed is skipped. The Node check and the browser spec accept whichever ID the activity boundary receives.
- **[docs/ssr-findings.md](../ssr-findings.md)** has a _Streaming (0.7.0)_ section written for a Next.js or SolidStart developer, and its 0.6.0 sentences that pointed at "the next track" now point at it. The dashboard README describes the streamed shape and the `async` entry. `ssr.md` records the disposed-stage rule.

## Measured

Node 26.10, macOS arm64, 2026-10-31, the built dashboard, `/projects/signals` (loaders 90 ms, activity 600 ms):

| Medians of 7                         | First byte | Settled |
| ------------------------------------ | ---------: | ------: |
| `renderToString` (whole page)        |     697 ms |  697 ms |
| `renderToStream` through the handler |     104 ms |  698 ms |
| `renderToStream` (renderer alone)    |      99 ms |  696 ms |

The shell leaves when the loaders settle, **about 600 ms earlier**; the settled time is unchanged, as it must be. Hydration of the streamed page (the synchronous claim of the shell, medians of 5, [`dashboard-ssr.spec.ts`](../../tests/browser/dashboard-ssr.spec.ts)):

| Engine   | Streamed page, `hydrate` | Dev server, `render` |
| -------- | -----------------------: | -------------------: |
| Chromium |                   1.8 ms |               1.0 ms |
| Firefox  |                   5.0 ms |               5.0 ms |
| WebKit   |                   5.0 ms |               2.0 ms |

The page is small and the browsers' timers are coarse at this scale (Firefox and WebKit round to milliseconds); the result is "about the same", not a ratio. Server render time after the fast path is the S2 measurement (1,000 rows 4.6–8.6 ms, 17–23× Solid) and did not change in S3–S5.

## Sizes

Unchanged from S4: server 7,668 of 8,448; hydrate 3,962 of 4,096; async 2,084; query 3,744 of 3,840; core, core + DOM, router, forms as before. The dashboard's client bundle grew by the activity card and the `async` attribute only.

## Checks run

`pnpm test` (56 files, 573 tests), `pnpm lint`, dashboard `tsc`, the dashboard client and SSR builds, `test-dashboard-ssr.mjs` on Node (Bun in CI), `pnpm bench:stream`, Playwright for `dashboard-ssr.spec`, `stream.spec`, `hydrate.spec`, `dashboard.spec`, `query.spec`, and `async.spec` on Chromium, Firefox, and WebKit.

## Next

On approval: S6, release preparation for 0.7.0: the server rendering guide gains streaming, the API reference gains `renderToStream` and `StreamOptions`, CHANGELOG, size report, release checklist, and full verification; the 0.7.0 bump is decided with you. Stop at the `st-s6` checkpoint before any pull request.

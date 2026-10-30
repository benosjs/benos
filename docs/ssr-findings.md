# Server rendering findings (S5)

Written for a developer who ships with Next.js or SolidStart and wants to know what Benos 0.6.0 server rendering is, what it costs, and what it leaves out. The numbers are from one machine (Node 26.10, macOS arm64, 2026-10-28) and the harness is in the repository; rerun it before quoting them.

## What you get

- **One app, two entries.** `renderToString(app, options)` from `@benosjs/server` runs the same components as the browser and returns `{ html, payload, status, headers }`. `hydrate(app, host)` from `@benosjs/dom/hydrate` claims that markup. There is no framework server: the dashboard's [`entry-server.tsx`](../examples/dashboard/src/entry-server.tsx) is a `Request → Response` function, and [`scripts/serve.mjs`](../examples/dashboard/scripts/serve.mjs) wires it to `node:http` in 60 lines. Bun runs the same files.
- **Data crosses the wire only when you say so.** A `resource` or `query` with an `ssr` codec is awaited on the server and its _projection_ is serialized into a `<script type="application/json">`; everything else renders its Suspense fallback and loads on the client. Next.js serializes whatever a server component passes as props; SolidStart's `createAsync` serializes its resolved value. Benos makes you name the fields. The dashboard's project queries opt in with identity codecs, so a hydrated project page performs **no client fetches** ([`dashboard-ssr.spec.ts`](../tests/browser/dashboard-ssr.spec.ts)).
- **Status codes from the router.** A route `redirect` becomes `302` with `Location`; the not-found view becomes `404`. Loaders run on the server and their query data is reused by the client's loader without a refetch.
- **Hydration that costs what a render costs.** Hydrating a 1,000-row table takes about as long as rendering it on the client: 14.7 vs 14.3 ms on Chromium, 22.0 vs 21.0 ms on Firefox, 16.0 vs 21.0 ms on WebKit (medians of 5, [`hydrate.spec.ts`](../tests/browser/hydrate.spec.ts)). Node identity is kept, so focus, typed input, and scroll survive; a mismatch is reported with a DOM path and recovered inside the nearest dynamic range, not by throwing the page away.
- **Routed content hydrates in place.** The client's `hydrate` keeps claiming until the router's loaders settle, so a page whose content depends on a loader still reuses the server's nodes. Next.js and SolidStart stream and hydrate per boundary; Benos 0.6.0 waits, then claims (streaming is the next track).

## What it costs on the server

The headline number is unflattering and worth stating plainly: **Benos server rendering is 35–45× slower than Solid's** for the same page (the ratio moves between runs; the medians below are from one run).

| Page (`benchmarks/ssr.mjs`)          | Benos `renderToString` | Solid `renderToString` | Ratio | HTML size        |
| ------------------------------------ | ---------------------: | ---------------------: | ----: | ---------------- |
| Header, filter form, 1,000-row table |                 9.1 ms |                0.22 ms |   42× | 167 KB vs 82 KB  |
| The same with 5,000 rows             |                 ~44 ms |                 0.9 ms |   46× | 836 KB vs 411 KB |

Why: Solid's compiler emits string-concatenating `ssr` templates, so its server render allocates almost nothing and runs no reactivity. Benos renders the server page through the same reactive machinery as the client, which is what lets Suspense settle and bindings re-run before serialization: every dynamic position creates an owner, a slot, an effect, and marker nodes, and a 1,000-row table has about 5,000 of them. A CPU profile of the 5,000-row page spends 29% of its time in the garbage collector. The HTML is twice the size because every dynamic text is wrapped as `<!--b-->…<!--/b-->` and every keyed item as `<!--i-->…<!--/i-->`; those markers are what make hydration positional and cheap.

For a page like the dashboard this is still single-digit milliseconds per request. For a large server-rendered table it is a real cost, and the right fix is not in 0.6.0: a server fast path that evaluates bindings once without effects when no boundary is pending, and a shorter marker for dynamic text, both belong to the streaming track, which reworks serialization anyway.

## Deployment shape

```
pnpm --filter @benosjs/dashboard build      # client: dist/benos (index.html + assets)
pnpm --filter @benosjs/dashboard build:ssr  # server: dist/server/entry-server.js
node scripts/serve.mjs --port 4175          # or: bun scripts/serve.mjs
```

The server build is an ordinary Vite SSR build of `entry-server.tsx`, with every `@benosjs/*` package external and compiled with the **same optimization as the client**. That last point is a rule, not a preference: the compiler's plan and direct outputs place dynamic positions differently, so a server compiled one way and a client compiled the other disagree on where markers, owners, and ids are. The S5 dashboard hit this before `@benosjs/server` learned to render direct templates; it now renders both forms and `@benosjs/vite` compiles both environments alike.

Compared with Next.js, there is no `app/` convention, no server components, no server actions, no `<head>` management, and no file-based routing: you own the HTML template, the router, and the server. Compared with SolidStart, there is no `createAsync` that serializes by default, no streaming, and no `"use server"`. Per-request state belongs inside the `app` factory; development warns when a module-level signal is written during a request.

## What is not there

- Streaming and out-of-order Suspense (the next track; the markers and payload leave room for it).
- Replay of events before hydration; the browser's defaults apply until the page is interactive.
- `<head>` and metadata management.
- A `create-benos --ssr` template; the dashboard is the reference.
- Automatic serialization of anything you did not give a codec.

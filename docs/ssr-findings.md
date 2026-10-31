# Server rendering findings

Written for a developer who ships with Next.js or SolidStart and wants to know what Benos server rendering is, what it costs, and what it leaves out. The first sections are from the 0.6.0 track (Node 26.10, macOS arm64, 2026-10-28); the section _Streaming (0.7.0)_ updates them with the streaming track's measurements (2026-10-31, same machine). The harness is in the repository; rerun it before quoting numbers.

## What you get

- **One app, two entries.** `renderToString(app, options)` from `@benosjs/server` runs the same components as the browser and returns `{ html, payload, status, headers }`. `hydrate(app, host)` from `@benosjs/dom/hydrate` claims that markup. There is no framework server: the dashboard's [`entry-server.tsx`](../examples/dashboard/src/entry-server.tsx) is a `Request → Response` function, and [`scripts/serve.mjs`](../examples/dashboard/scripts/serve.mjs) wires it to `node:http` in 60 lines. Bun runs the same files.
- **Data crosses the wire only when you say so.** A `resource` or `query` with an `ssr` codec is awaited on the server and its _projection_ is serialized into a `<script type="application/json">`; everything else renders its Suspense fallback and loads on the client. Next.js serializes whatever a server component passes as props; SolidStart's `createAsync` serializes its resolved value. Benos makes you name the fields. The dashboard's project queries opt in with identity codecs, so a hydrated project page performs **no client fetches** ([`dashboard-ssr.spec.ts`](../tests/browser/dashboard-ssr.spec.ts)).
- **Status codes from the router.** A route `redirect` becomes `302` with `Location`; the not-found view becomes `404`. Loaders run on the server and their query data is reused by the client's loader without a refetch.
- **Hydration that costs what a render costs.** Hydrating a 1,000-row table takes about as long as rendering it on the client: 14.7 vs 14.3 ms on Chromium, 22.0 vs 21.0 ms on Firefox, 16.0 vs 21.0 ms on WebKit (medians of 5, [`hydrate.spec.ts`](../tests/browser/hydrate.spec.ts)). Node identity is kept, so focus, typed input, and scroll survive; a mismatch is reported with a DOM path and recovered inside the nearest dynamic range, not by throwing the page away.
- **Routed content hydrates in place.** The client's `hydrate` keeps claiming until the router's loaders settle, so a page whose content depends on a loader still reuses the server's nodes. Next.js and SolidStart stream and hydrate per boundary; Benos 0.6.0 waited, then claimed. 0.7.0 streams and hydrates per boundary too; see _Streaming (0.7.0)_ below.

## What it costs on the server

The headline number is unflattering and worth stating plainly: **Benos server rendering is 35–45× slower than Solid's** for the same page (the ratio moves between runs; the medians below are from one run).

| Page (`benchmarks/ssr.mjs`)          | Benos `renderToString` | Solid `renderToString` | Ratio | HTML size        |
| ------------------------------------ | ---------------------: | ---------------------: | ----: | ---------------- |
| Header, filter form, 1,000-row table |                 9.1 ms |                0.22 ms |   42× | 167 KB vs 82 KB  |
| The same with 5,000 rows             |                 ~44 ms |                 0.9 ms |   46× | 836 KB vs 411 KB |

Why: Solid's compiler emits string-concatenating `ssr` templates, so its server render allocates almost nothing and runs no reactivity. Benos renders the server page through the same reactive machinery as the client, which is what lets Suspense settle and bindings re-run before serialization: every dynamic position creates an owner, a slot, an effect, and marker nodes, and a 1,000-row table has about 5,000 of them. A CPU profile of the 5,000-row page spends 29% of its time in the garbage collector. The HTML is twice the size because every dynamic text is wrapped as `<!--b-->…<!--/b-->` and every keyed item as `<!--i-->…<!--/i-->`; those markers are what make hydration positional and cheap.

For a page like the dashboard this is still single-digit milliseconds per request. For a large server-rendered table it is a real cost. The streaming track paid part of it down (below); the rest is the node tree the server builds before it serializes, and the shorter text marker would be a protocol change.

## Deployment shape

```
pnpm --filter @benosjs/dashboard build      # client: dist/benos (index.html + assets)
pnpm --filter @benosjs/dashboard build:ssr  # server: dist/server/entry-server.js
node scripts/serve.mjs --port 4175          # or: bun scripts/serve.mjs
```

The server build is an ordinary Vite SSR build of `entry-server.tsx`, with every `@benosjs/*` package external and compiled with the **same optimization as the client**. That last point is a rule, not a preference: the compiler's plan and direct outputs place dynamic positions differently, so a server compiled one way and a client compiled the other disagree on where markers, owners, and ids are. The S5 dashboard hit this before `@benosjs/server` learned to render direct templates; it now renders both forms and `@benosjs/vite` compiles both environments alike.

Compared with Next.js, there is no `app/` convention, no server components, no server actions, no `<head>` management, and no file-based routing: you own the HTML template, the router, and the server. Compared with SolidStart, there is no `createAsync` that serializes by default and no `"use server"`; streaming arrived in 0.7.0 (below). Per-request state belongs inside the `app` factory; development warns when a module-level signal is written during a request.

## Streaming (0.7.0)

`renderToStream(app, options)` resolves to `{ status, headers, stream, done }` once the router's loaders have settled. The stream carries the **shell** (the page with every data-bound Suspense boundary as its fallback), then one **patch** per boundary as its opted-in data settles, then an end notice. The browser shows the shell at once; a 500-byte inline runtime swaps each patch in as the parser meets it; and `hydrate`, loaded from an `async` entry, claims the shell as soon as it exists and the patches as they land. After the last patch the document is what `renderToString` would have produced, byte for byte between the root markers.

**What it buys.** The dashboard's project detail reads a deliberately slow activity query (600 ms) inside `Suspense`, next to loader-backed project data (90 ms):

| `/projects/signals` (`pnpm bench:stream`, medians of 7) | First byte | Settled |
| ------------------------------------------------------- | ---------: | ------: |
| `renderToString` (whole page)                           |     697 ms |  697 ms |
| `renderToStream` through the handler                    |     104 ms |  698 ms |

The shell arrives when the loaders settle; the slow boundary costs nothing until its own data is ready. Settled time is the same, as it must be: streaming changes when content arrives, not how long the data takes. Hydration of the streamed page is as cheap as before: the synchronous claim of the detail page's shell takes 1.8 ms on Chromium, 5.0 ms on Firefox, and 5.0 ms on WebKit, against a client render of the same page at 1.0, 5.0, and 2.0 ms (medians of 5, [`dashboard-ssr.spec.ts`](../tests/browser/dashboard-ssr.spec.ts); the timers are coarse at this scale). The streamed detail page performs **no client fetches**: the project data came in the shell's payload and the activity in its patch's.

**What it costs.** Nothing on a page without a streamed boundary: the stream is then the shell alone, identical to `renderToString`'s `html`, with no runtime and no scripts. A streamed boundary costs its fallback marker's ID (`<!--b:0:ID-->`), one `<template>` plus two scripts per patch, and the runtime once. On the client, progressive hydration lives in `@benosjs/dom/hydrate` (3,962 of 4,096 B) and `@benosjs/async` (2,084 of 4,096 B); core and `@benosjs/dom` did not grow, so client-only apps pay nothing.

**Server speed after the fast path.** The reactive overhead the 0.6.0 measurement pointed at is paid down: bindings are evaluated once unless a tracked resource is pending, template skeletons are compiled once, and the per-element cleanup closures are gone. The 1,000-row table went from 9.1 ms to 4.6–8.6 ms (the spread is the machine's), **17–23× Solid** instead of 35–45×; 5,000 rows from ~44 to 36–42 ms. What remains is the node tree: every row still allocates its elements, slots, and item owner, then the tree is serialized. The next step, serializing settled subtrees to strings as they mount, is a known follow-up, not part of 0.7.0.

**For a Next.js or SolidStart developer.** The shape is React's and SolidStart's: shell, then `<template>` patches moved into place by a script, then per-boundary hydration. Three differences. Benos resolves the status line before streaming (the shell waits for the router), so `404` and `302` keep their HTTP meaning and nothing is sent as a client-side redirect. Only opted-in data streams; a boundary whose resource has no codec renders its fallback and loads on the client, as before. And there is no `<head>` streaming, no event replay before hydration, and no server actions: you own the template, the router, and the server.

**How the client waits.** Two mechanisms, both invisible to application code. A Suspense boundary whose fallback carries an ID stages nothing until its patch lands, so its content is claimed from the patched nodes. A resource with a codec and no snapshot, created while the document is still parsing and the root has not sent its end notice, holds instead of fetching, then seeds from the payload that arrives with the patch. The end notice, or the end of parsing without one (a dropped connection), releases both to the ordinary client path, which fetches once.

## What is not there

- Replay of events before hydration; the browser's defaults apply until the page is interactive.
- `<head>` and metadata management.
- A `create-benos --ssr` template; the dashboard is the reference.
- Automatic serialization of anything you did not give a codec.

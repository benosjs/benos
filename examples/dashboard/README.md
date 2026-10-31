# Dashboard example

This dashboard exercises the public Benos router, async, query, DOM, and UI
component APIs in a multi-page application. It includes typed project list and detail
routes, nested layouts, loader-backed data, a not-found view, mock
authentication, validated forms, a 5,000-row sortable/filterable table,
fetch-backed async state, a modal, an error boundary, and nested components.

Project loaders read through the `@benosjs/query` cache
(`src/data/queries.ts`) and finish before the route view is committed.
Revisiting a project you have already opened does not wait for the network.
The project list and detail routes are both children of the projects layout
and render through its `<Outlet>`. The detail route reads its typed
`projectId` and live cache entry from the matching route scope. Its editor is
a `@benosjs/forms` form bound to the route: it validates the name and owner
with a Valibot schema, saves through a mutation that writes the saved record
and refreshes the list, shows a name the server rejects under its field, and
asks before you leave with unsaved changes. Starring is optimistic; starring
a paused project is refused by the demo API, which rolls the change back.

## Run

```sh
pnpm --filter @benosjs/dashboard dev
```

## Server rendering

The same app renders on the server, and streams. `src/entry-server.tsx`
exports `handle(request, template)`, a plain `Request` to `Response`
function: it creates one router per request on a `memoryHistory` at the
request URL, renders through `renderToStream` from `@benosjs/server`, and
returns the client build's `index.html` with the app streaming into its
host, carrying the status the router set (`404` for an unknown path). The
shell goes out once the loaders have settled; the project detail's "Recent
activity" reads a deliberately slow query (600 ms) inside a `Suspense`
boundary, so its fallback is in the shell and its content follows as a patch
with its serialized data. The built client entry loads `async` and hydrates
as soon as the shell exists (`src/main.tsx`); patches that land afterwards
are claimed in place without a fetch. On the dev server, which never
streams, the entry renders from scratch as before.

```sh
pnpm --filter @benosjs/dashboard build && pnpm --filter @benosjs/dashboard build:ssr
pnpm --filter @benosjs/dashboard serve   # http://127.0.0.1:4175/
```

`scripts/serve.mjs` is a small `node:http` server (Bun runs it too) that
serves the client assets and pipes the handler's streamed body for every
other GET; a real deployment wires `handle` into whatever runtime it uses.
Both builds use the same compiler optimization, which server rendering
requires. `pnpm bench:stream` (from the repository root) times the detail
page's first byte and settled time against `renderToString`.

Open `/` for the overview, `/projects` for the project list, and
`/projects/signals` for a loader-backed detail page rendered inside the projects
layout. Unknown paths show the not-found view.

Build the equivalent Benos and Solid table/form slices, then measure the
5,000-row filter update with the same browser harness:

```sh
pnpm --filter @benosjs/dashboard build:compare
```

The comparison writes `comparison-results.json` and is summarized in
`docs/dashboard-findings.md`.

# Dashboard example

This dashboard exercises the public Benos router, async, query, DOM, and UI
component APIs in a multi-page application. It includes typed project list and detail
routes, nested layouts, loader-backed data, a not-found view, mock
authentication, a validated form, a 5,000-row sortable/filterable table,
fetch-backed async state, a modal, an error boundary, and nested components.

Project loaders read through the `@benosjs/query` cache
(`src/data/queries.ts`) and finish before the route view is committed.
Revisiting a project you have already opened does not wait for the network.
The project list and detail routes are both children of the projects layout
and render through its `<Outlet>`. The detail route reads its typed
`projectId` and live cache entry from the matching route scope. It renames a
project with a mutation that writes the saved record and refreshes the list,
and stars it optimistically; starring a paused project is refused by the demo
API, which rolls the change back.

## Run

```sh
pnpm --filter @benosjs/dashboard dev
```

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

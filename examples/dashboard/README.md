# Dashboard example

This is the Phase 5c API validation dashboard. It uses only public `@benosjs/core`
and `@benosjs/dom` imports and includes mock authentication, hand-rolled
navigation, a validated form, a 5,000-row sortable/filterable table, fetch-backed
async state, a modal, an error boundary, and nested components.

## Run

```sh
pnpm --filter @benosjs/dashboard dev
```

Build the equivalent Benos and Solid table/form slices, then measure the
5,000-row filter update with the same browser harness:

```sh
pnpm --filter @benosjs/dashboard build:compare
```

The comparison writes `comparison-results.json` and is summarized in
`docs/dashboard-findings.md`.

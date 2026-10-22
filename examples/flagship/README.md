# Flagship editor example

The Benos 0.5 flagship project editor as executable code, next to the same
editor in React with TanStack Router, Query, and Form. The code between
`// #region flagship` and `// #endregion` is exactly what
[`docs/architecture/flagship-integration.md`](../../docs/architecture/flagship-integration.md)
shows and counts.

- `src/shared`: the transports and the Zod schema both stacks use.
- `src/benos`: `data.ts`, `routes/refs.ts`, `routes/manifest.tsx`, and the
  lazy `pages/project-editor.tsx`.
- `src/react`: the route and query setup, the editor with native inputs, and
  the editor with shadcn/ui fields (minimal stand-ins in `components/ui`).
- `tests`: the flagship acceptance tests (`flagship.test.tsx`, run by
  `pnpm test` at the repository root) and type tests (`types.ts`).

## Run

```sh
pnpm --filter @benosjs/flagship dev
```

Open `/projects/atlas` or `/projects/beacon`.

## Check and measure

```sh
pnpm check:flagship
pnpm --filter @benosjs/flagship compare
```

`check:flagship` type-checks both stacks and fails if the documented code or
line counts differ from this example. `compare` builds all three variants,
with Zod and with a hand-written schema, and writes `comparison-results.json`.

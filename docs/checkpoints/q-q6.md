# Q6 — Release preparation

**Status:** Decided on 2026-10-20. The user's words: "Hold the version bump: merge-ready as unreleased work, and release query together with forms and the flagship in 0.5.0." The pull request (benosjs/benos#17) is ready for review with all 38 CI checks passing, including the Windows and macOS matrices. It is not merged, nothing is tagged or published, and all eleven packages stay at `0.4.0`.

## Delivered

- **Branch up to date.** `origin/main` (0.4.0 marked released, PR #16) is merged into `query` without conflicts.
- **Guide.** [docs/query.md](../query.md): defining queries, observers, freshness and gc, the retry policy, route loaders, mutations, caches, a TanStack Query mapping, and 0.5 limits. Its four `tsx` examples compile in both optimization modes and type-check through `pnpm check:doc-examples` (now 42 files).
- **API reference.** A [`@benosjs/query` section](../api-reference.md#benosjsquery), plus router notes on callable loader data and the loader owner contract.
- **CHANGELOG.** An `[Unreleased]` entry covering the query package, retries, mutations, route loaders, the `<Show>` fix (with its compatibility note), the router type change, and sizes. The heading becomes a version once you choose one.
- **Release tooling.** `@benosjs/query` is in the tag check, published-version verification, packed-metadata check, `benos info`, and the release workflow (published after `@benosjs/async`, which it depends on). The release tests now expect eleven packages.
- **Release checklist.** Eleven packages in the automated and manual procedures, and a one-time [first-publish procedure for `@benosjs/query`](../release-checklist.md#first-publish-of-benosjsquery-050): npm trusted publishing cannot be configured until the package exists, exactly as for async and router in 0.4.0.
- **Status docs.** README, roadmap, and the architecture index link the query guide and design.

## Verification

| Check                                                                                           | Result                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| Vitest unit suite                                                                               | 38 files, 402 tests passed         |
| Playwright, Chromium + Firefox + WebKit                                                         | 471 of 471 passed                  |
| Documentation examples                                                                          | 42 files compiled and type-checked |
| Build, engines (825 manifests), registry 0.4.0 build, JSX types, public imports, template audit | Passed                             |
| Packed metadata                                                                                 | Passed for 11 publishable packages |
| Type tests, lint, and Prettier                                                                  | Passed                             |
| Bundle budgets                                                                                  | Passed (table below)               |
| Kernel benchmark guard                                                                          | Passed                             |
| Dashboard and UI gallery type-check and build                                                   | Passed                             |

Three-OS coverage comes from the CI `create-benos` and UI CLI matrices (Ubuntu, Windows, macOS) on the pull request, as in R6. They were not run locally.

## Size

| Bundle                              |    0.4.0 | Query track |      Cap |
| ----------------------------------- | -------: | ----------: | -------: |
| core                                |  4,303 B |     4,303 B |  4,608 B |
| core + DOM                          | 11,010 B |    11,006 B | 11,264 B |
| async                               |  1,644 B |     1,644 B |  4,096 B |
| query                               |        — |     3,498 B |  3,584 B |
| router                              |  6,349 B |     6,349 B |  7,168 B |
| core + DOM + async + router         | 17,871 B |    17,865 B |        — |
| core + DOM + async + router + query |        — |    20,829 B |        — |

## Decision record

- **Version: held.** Query is merge-ready as unreleased work and ships with forms and the flagship integration in 0.5.0. The CHANGELOG entry stays under `[Unreleased]`.
- **Until 0.5.0:** do not cut a 0.4.x patch release from a `main` that contains this work without first deciding how to handle `@benosjs/query`, because the tag check and the publish workflow now include it and its first publish must be manual.
- Starter, first publish, and merge stay as proposed below: no starter change, the documented first-publish procedure at 0.5.0, and no merge without your go-ahead.

## Decisions as proposed

1. **Version.** All eleven packages are still `0.4.0`; `@benosjs/query` has never been published. Options:
   - **(Recommended) Merge without a version bump and release with forms.** The roadmap puts query, forms, and the flagship integration in 0.5.0 together. Query lands on `main` as unreleased work, and the forms track builds on it. Until 0.5.0, do not cut a 0.4.x patch release from `main` without first deciding how to handle `@benosjs/query`, because the tag check and workflow now include it.
   - **Release query now as 0.5.0** and move forms and the flagship to 0.6.0. This needs the version bump, registry minimums, starter ranges, and the first-publish procedure in this PR.
2. **Starter.** The recommendation is to keep query out of the default `create-benos` starter, as R6 did for the router: the starter stays one page and smallest. A later `--router`/`--data` option could add both. The starter is unchanged.
3. **First publish.** Whenever `@benosjs/query` is first released, follow the [first-publish procedure](../release-checklist.md#first-publish-of-benosjsquery-050) (reject the workflow's publish approval, publish all eleven manually in order, then configure trusted publishing). I have not published anything.
4. **Merge.** The PR is marked ready for review. I will not merge, tag, or publish.

## What the track delivered

| Step | Result                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------- |
| Q1   | Design: typed-reference identity, `affects`, defaults, router seam, budget                        |
| Q2   | Cache core: entries, deduplication, generations, staleness, gc, transient-only retries, observers |
| Q3   | Mutations: `writes`, `affects`, optimistic layers with rollback-or-invalidate                     |
| Q4   | `query.load` route integration; type-only router change; loader owner contract                    |
| Q5   | Dashboard validation and [query-findings.md](../query-findings.md)                                |
| Q5a  | `<Show>` keeps its branch while `when` stays present (restores the documented contract)           |
| Q6   | Guide, API reference, CHANGELOG, release wiring, verification                                     |

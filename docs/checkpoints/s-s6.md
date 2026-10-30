# S6 — Release preparation for 0.6.0

**Status:** Approved on 2026-10-28. The user's words: "Approve S6. Bump all thirteen packages to 0.6.0, open the pull request against main, and stop before merging." All thirteen packages are at 0.6.0 and the pull request is open; nothing is merged, tagged, or published. S5 was approved on 2026-10-28 with the same-optimization rule confirmed. The user's words: "Confirm the same-optimization rule and approve S5. Start S6: release preparation for 0.6.0. Stop at the s-s6 checkpoint before any pull request." No pull request has been opened and no version has been bumped.

## Delivered

- **[Server rendering guide](../ssr.md)**: rendering with a `Request → Response` handler, hydrating, opting data in, building, and the rules worth knowing. Its examples are type-checked by `check:doc-examples`, which now knows `@benosjs/server` and `@benosjs/dom/hydrate`.
- **[API reference](../api-reference.md)**: `@benosjs/server`, `@benosjs/dom/hydrate`, and the `ssr` option on `query` and `resource`.
- **[CHANGELOG.md](../../CHANGELOG.md)**: a `[0.6.0] — Unreleased` section (Added, Changed, Sizes) above the still-unreleased `0.5.1` section.
- **Release wiring for the thirteenth package:** `@benosjs/server` in the release workflow's publish steps (after forms), `check-release-tag.mjs`, `verify-published-versions.mjs`, `check:packed` (already), and `benos info`; the two release tests expect thirteen packages.
- **[Release checklist](../release-checklist.md)**: "First publish of `@benosjs/server` (0.6.0)" (reject the environment approval, publish all thirteen manually in order, then configure trusted publishing for the new package, then date the section), the manual-fallback commands, and the count-free wording for the automated release.
- **Roadmap, README, and architecture index** record what 0.6.0 ships and move streaming to the upcoming list.

## The version bump (your decision)

I propose **0.6.0 for all thirteen packages**, `@benosjs/server` included, as the brief says the bump is decided with you. It is not applied: every manifest is still `0.5.1`. Two things come first in this order:

1. **Release 0.5.1** from `main` (it carries the registry fix and the starter audit fix): configure trusted publishing for `@benosjs/query` and `@benosjs/forms`, tag `v0.5.1`, approve the publish job, date the changelog section. The automated release can handle it.
2. Then, on this branch: bump to 0.6.0, raise the starter template's ranges to `^0.6.0`, open the pull request, merge after CI, tag `v0.6.0`, reject the publish approval, publish all thirteen manually (the checklist order), configure trusted publishing for `@benosjs/server`, and date the `0.6.0` section.

The registry is built as release `0.6.0`: a minor bump must raise the item ranges and minimum Benos versions to `^0.6.0`/`0.6.0`, because the `benos` CLI refuses to add components into a project whose `@benosjs/dom` range is above what the registry declares (the UI CLI matrix on the pull request caught this). No registry component changed.

## Verification on this machine

| Check                                                                                                                                                                                                                             | Result                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `pnpm test`                                                                                                                                                                                                                       | 52 files, 547 tests passed      |
| `pnpm test:browser` (Chromium, Firefox, WebKit, including the dashboard SSR and hydration specs)                                                                                                                                  | 519 passed, none failed         |
| `typecheck:types`, `check:public-imports`, `check:jsx-types`, `check:doc-examples` (53 files), `check:packed` (13 packages), `check:engines`, `check:flagship`, `registry:check`, `audit:template`, `lint`, `size`, `bench:guard` | Passed                          |
| `test:server-runtime` and `test:dashboard-ssr` on Node 26.10 and Bun 1.3.2                                                                                                                                                        | Passed                          |
| `check-release-tag.mjs v0.5.1`                                                                                                                                                                                                    | Matches all 13 package versions |

The three-operating-system matrices (create-benos on npm 10 and 11, the UI CLI on four package managers, the Bun job) run in CI once the pull request exists; they cannot run here.

## Sizes shipped (minified + gzip)

| Bundle                  | Size   | Cap    |
| ----------------------- | ------ | ------ |
| `@benosjs/core`         | 4,490  | 4,608  |
| `@benosjs/core` + `dom` | 11,515 | 11,520 |
| `@benosjs/async`        | 1,897  | 4,096  |
| `@benosjs/query`        | 3,739  | 3,840  |
| `@benosjs/router`       | 6,897  | 7,168  |
| `@benosjs/forms`        | 2,888  | 3,072  |
| `@benosjs/dom/hydrate`  | 3,158  | 3,328  |
| `@benosjs/server`       | 5,898  | 6,144  |

Against 0.5.1: core +187 B, core + DOM +509 B (two cap changes approved at S1 and S3), query +241 B (cap +256 at S1), router +158 B, forms +10 B, async +253 B; the two new bundles are loaded only by apps that use them.

## Open after this track

- Server render speed (35–45× Solid) and the marker overhead: a no-effect server fast path and a shorter text marker, in the streaming track.
- Streaming itself, event replay, `<head>` management, and a `create-benos --ssr` template, all listed as out of scope in the brief.

## Next

On your decision: apply the bump, open the pull request, and stop before merging.

# RP1 — Pin the CLI registry to its release tag

**Status:** Implemented on branch `registry-pin` and waiting for approval. The plan was approved on 2026-10-27. The user's words: "Approved. Create the registry-pin branch and implement the plan inline, stopping at the rp-1 checkpoint." Nothing has been pushed, merged, tagged or published.

## Why

The daily "Published starter health" workflow failed from 2026-10-22 to 2026-10-26. `v0.5.0` had been merged to `main` before it was published, and `benos@0.4.0` read the registry index from `main`, whose items require `@benosjs/dom ^0.5.0`. New `npm create benos@latest -- --ui` projects installed `@benosjs/dom@0.4.0`, and `benos add button input` refused. The failures stopped once 0.5.0 was published, and a manual run (40484817668) passed on all six jobs.

## Delivered

- **`resolveRegistryUrl(url, version)`** in [`packages/benos/src/project.mjs`](../../packages/benos/src/project.mjs). The default registry (`DEFAULT_REGISTRY`, the `main` URL) resolves to `https://raw.githubusercontent.com/benosjs/benos/v<cli version>/registry/v1/index.json`. Any other URL or path is returned unchanged. The CLI version is read from the package's own `package.json`, the same way `index.mjs` reads it.
- **`loadIndex`** in [`packages/benos/src/registry.mjs`](../../packages/benos/src/registry.mjs) resolves the configured URL before fetching. `add`, `diff`, `update` and `list` all read the index through it, so this is the only call site. Error messages show the URL that was actually fetched.
- **`benos.json` is unchanged.** `init` still writes the `main` URL for `registry` and `$schema` (decisions 1 and 2 in [the plan](../registry-pin-plan.md)), so existing projects get the fix just by upgrading the CLI, and `benos init` stays idempotent across upgrades.
- **Docs:** [ui-registry.md](../architecture/ui-registry.md) (meaning of the default registry), [ui-cli.md](../architecture/ui-cli.md), [release-checklist.md](../release-checklist.md) (step 7: publish promptly, then run the starter health workflow), and an `[Unreleased]` "Fixed" entry in [CHANGELOG.md](../../CHANGELOG.md).

## Commits

| Commit    | Summary                                                          |
| --------- | ---------------------------------------------------------------- |
| `38cdee6` | docs: plan release-tag registry resolution for the benos CLI     |
| `ce7e397` | feat(benos): resolve the default registry to the CLI release tag |
| `c6f78bc` | fix(benos): read the default registry index from the release tag |
| `5e8d839` | fix(benos): read the CLI version without the URL global          |
| `c54e842` | docs: document release-tag registry resolution                   |

`5e8d839` is a lint fix: the plan's `new URL('../package.json', import.meta.url)` failed ESLint `no-undef` for `URL` in the CLI sources, so it now uses the `fileURLToPath`/`resolve` idiom from `index.mjs`. The same commit applies Prettier formatting to the plan.

## Tests

| Check                                                                        | Result                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`tests/benos-registry-url.test.ts`](../../tests/benos-registry-url.test.ts) | 4 tests: default → `v<version>` tag, explicit version, custom URLs/paths unchanged, and `loadIndex` requests only the tag URL (stubbed `fetch`). Seen failing before each change. |
| CLI suites (`benos-cli`, `benos-update`, new file)                           | 44 passed                                                                                                                                                                         |
| `pnpm test`                                                                  | 46 files, 489 tests passed                                                                                                                                                        |
| `pnpm build`, `pnpm check:packed`                                            | Passed; packed metadata for 12 packages                                                                                                                                           |
| `BENOS_PACKAGE_MANAGER=npm pnpm test:packed-benos-cli`                       | Passed. The packed tarball finds its own `package.json`, so the version lookup works when installed from npm                                                                      |
| `pnpm lint`, `pnpm check:doc-examples`                                       | Passed                                                                                                                                                                            |

Not run locally: the browser suite, the size check (the CLI has no budget), and the other package managers in the packed-CLI matrix. CI runs these.

## Open items

1. **CLIs up to 0.5.0 still read `main`** (decision 4). This can't be changed after the fact. When 0.6.0 is merged, a project on a 0.5.x CLI gets the existing "Upgrade it before adding component files" error until it upgrades. New starters are only at risk between the merge and the publish, and the checklist step covers that.
2. **Shipping needs a 0.5.1 release.** `check-release-tag.mjs` requires all twelve package versions to match the tag, so 0.5.1 bumps every package. That's a separate step that needs your authorization.
3. **Unrelated, still pending from 0.5.0:** trusted publishing for `@benosjs/query` and `@benosjs/forms`, and the date of the `0.5.0` section in `CHANGELOG.md`.

## Next

On approval: push `registry-pin` and open a PR against `main`.

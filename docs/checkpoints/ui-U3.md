# UI system checkpoint U3 — CLI and registry foundations

**Date:** 2026-10-03

**Status:** U3 implementation and expanded CLI verification are complete locally. `benos init`, `benos add`, and `benos list` are implemented; the static registry build and GitHub raw hosting setup are documented. The authorized 12-cell CI run is pending the `ui-system` push.

## What changed

- Added the unscoped `benos` CLI package with `init`, `add`, `list`, and `list --installed`. `diff` and `update` remain U5 work.
- `init` validates project setup and both `@/` aliases before writing, never edits an existing Vite config, initializes config and lock files, installs the token CSS, and adds `.benos/` to `.gitignore`.
- `add` resolves registry dependency graphs before writes, validates schemas and checksums, rejects path traversal, symlink escapes, case collisions, and Windows-invalid paths, and refuses to overwrite edits. Required npm dependencies are installed through an explicit, detected, or lockfile-selected package manager.
- `list` reports available or installed items and can use validated cached data when the registry transport is unavailable.
- Added schema-v1 JSON documents, deterministic registry build/check commands, immutable release-tag item URLs, and GitHub raw hosting/release instructions. The generated index is intentionally empty until U4 creates styled components.
- Added CI coverage for a fresh `create-benos` consumer on Ubuntu, Windows, and macOS with npm, pnpm, Yarn 4, and Bun. The consumer installs dependencies, runs `benos init` and both list modes, then type-checks, builds, tests, and lints the starter.
- Hardened cross-platform path validation and added regression coverage for unknown index item types and Windows-reserved/invalid filenames.
- Added a test-only fixture registry containing a component that depends on both another registry item and the npm package `clsx`. The consumer test verifies copied component/style files, installed dependency resolution, lock records, strict type-check/build/test/lint, and preservation plus refusal after a local edit.

## CLI behavior-to-test coverage

| Behavior                             | Test that verifies it                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal (`..`)                | `tests/benos-cli.test.ts` — “rejects traversal, absolute, and drive-qualified registry paths” (`components/../../escape.tsx` case)                                         |
| Absolute and drive/UNC paths         | `tests/benos-cli.test.ts` — “rejects traversal, absolute, and drive-qualified registry paths” (`/tmp`, `C:/`, and `//server/share` cases)                                  |
| Symlink escapes                      | `tests/benos-cli.test.ts` — “rejects a registry target that traverses a symlink outside the project”                                                                       |
| Case collisions                      | `tests/benos-cli.test.ts` — “rejects case-folded destination collisions on case-sensitive filesystems too”                                                                 |
| Windows-reserved names               | `tests/benos-cli.test.ts` — “rejects registry paths that are invalid on Windows filesystems” (`CON`, `?`, and trailing-dot cases)                                          |
| Checksum mismatch                    | `tests/benos-cli.test.ts` — “rejects a payload checksum mismatch before writing files”                                                                                     |
| Unknown schema version               | `tests/benos-cli.test.ts` — “rejects unsupported index and item schema versions” (index and item schemas)                                                                  |
| Dependency cycles                    | `tests/benos-cli.test.ts` — “resolves registry dependencies before their dependents and rejects cycles”                                                                    |
| Duplicate destinations               | `tests/benos-cli.test.ts` — “rejects two registry items that claim the same destination”                                                                                   |
| Edited-file conflict refusal         | `tests/benos-cli.test.ts` — “does not overwrite an edited destination even with --yes”; also verified after a real add in `scripts/test-ui-cli-project.mjs`                |
| Identical-content no-op              | `tests/benos-cli.test.ts` — “verifies, copies, locks, caches, and lists a registry component” (second add leaves it up to date)                                            |
| Cache fallback                       | `tests/benos-cli.test.ts` — “verifies, copies, locks, caches, and lists a registry component” (offline list and cached no-op add)                                          |
| Package-manager detection precedence | `tests/benos-cli.test.ts` — “refuses a package-manager lockfile conflict and respects explicit detection” (explicit, user agent, conflict, then sole lockfile/no evidence) |
| Dependency install failure           | `tests/benos-cli.test.ts` — “reports package-manager install failure after preserving source and lock writes”                                                              |

The end-to-end fixture and its 12-cell CI matrix are defined by
`tests/fixtures/ui-registry/`, `scripts/test-ui-cli-project.mjs`, and the
`ui-cli-consumer` job in `.github/workflows/ci.yml`.

## Verification

Commands ran locally under Node 22.18.0 unless noted. The full Playwright suite was run on this macOS host.

| Check                                         | Result                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`              | Pass                                                                                                 |
| `pnpm build`                                  | Pass                                                                                                 |
| `pnpm test`                                   | Pass — 204 tests in 19 files                                                                         |
| `pnpm --filter benos test`                    | Pass — 2 direct Node tests                                                                           |
| `pnpm typecheck:types`                        | Pass                                                                                                 |
| `pnpm lint`                                   | Pass — ESLint and Prettier                                                                           |
| `pnpm test:browser`                           | Pass — 102 tests in Chromium, Firefox, and WebKit                                                    |
| `pnpm check:jsx-types`                        | Pass                                                                                                 |
| `pnpm check:doc-examples`                     | Pass — 7 files                                                                                       |
| `pnpm check:public-imports`                   | Pass                                                                                                 |
| `pnpm check:packed`                           | Pass — 8 publishable packages                                                                        |
| `pnpm check:engines`                          | Pass — 1,626 package manifests checked                                                               |
| `pnpm audit:template`                         | Pass — no engine/deprecation warnings; 0 vulnerabilities                                             |
| `pnpm registry:build` / `pnpm registry:check` | Pass — deterministic empty v1 index                                                                  |
| `pnpm size`                                   | Pass — core 4,051/4,096 bytes; core + DOM 10,200/10,240 bytes                                        |
| `pnpm bench:guard`                            | Pass — all five workloads below 2× Preact                                                            |
| Fresh starter + fixture registry with npm     | Pass — init/list/add, dependency and lock checks, type-check, build, test, lint, edited-file refusal |
| Fresh starter + fixture registry with pnpm    | Pass — init/list/add, dependency and lock checks, type-check, build, test, lint, edited-file refusal |

The CLI behavior suite contains 18 passing Vitest tests. The fixture-backed add flow exercises the real CLI in a freshly scaffolded project and verifies that an edited destination survives and is refused on re-run. No tests were weakened.

### Production kernel benchmark medians

| Workload                            |   Benos |  Preact | Ratio |
| ----------------------------------- | ------: | ------: | ----: |
| Signal read                         | 6.40 ms | 5.02 ms | 1.27× |
| 20-deep computed chain write + read | 6.69 ms | 5.58 ms | 1.21× |
| 200-effect fanout write             | 2.12 ms | 1.24 ms | 1.76× |
| Dynamic dependency switch           | 3.67 ms | 2.66 ms | 1.44× |
| Repeated equal write                | 0.93 ms | 0.69 ms | 1.50× |

### Configured CI matrix

These 12 cells are present in `.github/workflows/ci.yml`; this follow-up will trigger them on the authorized `ui-system` push.

| Runner           | npm     | pnpm    | Yarn 4  | Bun     |
| ---------------- | ------- | ------- | ------- | ------- |
| `ubuntu-latest`  | Pending | Pending | Pending | Pending |
| `windows-latest` | Pending | Pending | Pending | Pending |
| `macos-latest`   | Pending | Pending | Pending | Pending |

## Sizes and deviations

U3 changed no `@benosjs/core` or `@benosjs/dom` implementation. The rebuilt bundles remain within the approved 4,096-byte and 10,240-byte gzip budgets.

The local fresh-project flow passed with npm and pnpm on macOS, including the new real registry dependency graph and the starter's strict TypeScript and Benos ESLint checks. Yarn, Bun, Ubuntu, and Windows will be verified by the pushed matrix. The U4 requirement that every production registry component passes unchanged is still pending the first U4 payload.

**Checkpoint result:** U3 implementation and local verification are complete. CI matrix results and U4 component-specific checks remain pending. Stop for review before U4.

# U5 checkpoint — `benos diff` and `benos update`

**Status:** Complete. Local verification and the GitHub Actions run passed for
all twelve OS/package-manager combinations. CI: [run 37304039785](https://github.com/benosjs/benos/actions/runs/37304039785).

## Coverage

| Requirement                                           | Test coverage                                                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diff`: unchanged                                     | `tests/benos-update.test.ts` — “classifies every per-file state without changing project files or cache”                                             |
| `diff`: local edits only                              | Same classification test                                                                                                                             |
| `diff`: upstream changes only                         | Same classification test                                                                                                                             |
| `diff`: both changed                                  | Same classification test                                                                                                                             |
| `diff`: missing locally                               | Same classification test                                                                                                                             |
| `diff`: new upstream files                            | Same classification test                                                                                                                             |
| Diff is read-only                                     | Same classification test confirms lock bytes stay unchanged and `.benos` is not created                                                              |
| Untouched component update                            | “updates an untouched component and advances its exact base in the lock”                                                                             |
| Non-overlapping local and upstream edits              | “merges a local edit with disjoint incoming changes” and generated disjoint-edit property test                                                       |
| Overlapping edits preserve source and lock            | “keeps all component files and its lock entry unchanged on overlap”; separate conflict artifacts contain base/local/incoming and resolution guidance |
| Deleted local file                                    | “reports and preserves a deleted local file as an explicit conflict”                                                                                 |
| Pinned base unavailable                               | “refuses when the pinned base is unavailable and preserves local files”                                                                              |
| Offline with valid cache                              | “updates offline from checksum-validated cached index, item, and pinned base”                                                                        |
| CRLF preservation                                     | Merge unit test, update test, and fresh-project consumer test; output remains CRLF                                                                   |
| One component conflict while another succeeds         | “updates independent components while preserving a component with conflicts”                                                                         |
| Minimum-version gate                                  | “refuses a newer Benos minimum with the detected package manager command”; reports the exact manager-specific upgrade command before writes          |
| Interrupted update detection and recovery             | “detects and rolls back a partially renamed component transaction”; diff detects a pending journal without mutating it                               |
| Three-way merge overlap and identical insertion rules | Merge unit tests plus 200-run fast-check disjoint-edit property test                                                                                 |
| Fresh-project CLI consumer update                     | `scripts/test-ui-cli-project.mjs` performs add, local CRLF edit, upstream update, diff, lock verification, then strict type-check/build/test/lint    |

The update is atomic per component. A journal stages file contents and backups;
the lock replacement marks commit. Recovery rolls back an uncommitted transaction
or removes a committed journal. Files removed upstream and local deletions are
conflicts, so `update` does not silently delete or restore source files. Invalid
UTF-8 and changed npm dependency requirements are refused for manual handling.

## Local verification

- `pnpm lint` — passed.
- `pnpm test` — 221 tests passed across 20 files.
- `pnpm --filter benos test` — 2 passed.
- `pnpm typecheck:types` — passed.
- `pnpm registry:check` — passed (21 generated registry files).
- `pnpm check:public-imports`, `pnpm check:packed`, and `pnpm check:doc-examples` — passed.
- `pnpm build` — passed.
- `pnpm test:browser` — 402 Chromium, Firefox, and WebKit tests passed.
- `BENOS_PACKAGE_MANAGER=pnpm node scripts/test-ui-cli-project.mjs` — passed locally.

## Bundle size

After a clean production build, the size check reported:

| Bundle                           |    Gzip size |        Limit | Result |
| -------------------------------- | -----------: | -----------: | ------ |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes | Pass   |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes | Pass   |

No runtime source in core or DOM changed for U5.

## CI consumer matrix

The CI workflow ran the packed fresh-project update test for all twelve
combinations below.

| Operating system | npm  | pnpm | Yarn | Bun  |
| ---------------- | ---- | ---- | ---- | ---- |
| Ubuntu           | Pass | Pass | Pass | Pass |
| Windows          | Pass | Pass | Pass | Pass |
| macOS            | Pass | Pass | Pass | Pass |

The workflow also passed its main verify job and create-benos checks on all
three operating systems. No platform-specific fixes were needed for U5; the
matrix exercised CRLF preservation during a real fresh-project update.

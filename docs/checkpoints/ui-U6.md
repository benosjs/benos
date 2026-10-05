# U6 checkpoint

**Status:** implementation and local verification are complete. The final
Ubuntu, Windows, and macOS CI matrix is pending the push for this checkpoint.

## What changed

- Added the [UI guide](../ui/README.md) and one page for each of the 19
  components. Pages cover APIs, variants, and accessibility. The guide includes
  installation, token theming, editing copied source, `diff`/`update` and
  conflict resolution, and the minimum-version gate. Select and Dropdown Menu
  document their current Zag 1.44.0 Tab behavior; RadioGroup documents WebKit's
  native RTL ArrowLeft behavior.
- Expanded `check:doc-examples` to run every guide TSX snippet through the
  Benos compiler in `none` and `safe` modes and then strict TypeScript checking.
- Added the default-No “Add Benos UI components?” prompt and `--ui`/`--no-ui`
  flags to create-benos. Opting in installs the generated app dependencies,
  runs `benos init`, adds Button and Input, and switches the starter to those
  components. The UI starter is 150 lines of TSX; its CSS reuses the existing
  76-line starter stylesheet plus two UI-specific rules.
- Added both opt-in and opt-out assertions to the existing OS/package-manager
  consumer matrix. The exact matrix is configured in `.github/workflows/ci.yml`:

| OS      | npm     | pnpm    | Yarn    | Bun     |
| ------- | ------- | ------- | ------- | ------- |
| Ubuntu  | Pending | Pending | Pending | Pending |
| Windows | Pending | Pending | Pending | Pending |
| macOS   | Pending | Pending | Pending | Pending |

- Added guide links for every component to the gallery and a production Vite
  build. [Deployment instructions](../ui-gallery-deployment.md) describe the
  Vercel settings; nothing has been deployed.
- Clarified the U5 conflict artifacts' resolution instructions so the guide's
  update workflow explains how to advance the pinned base without overwriting
  local edits.

## Verification

| Check                                                            | Result                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --lockfile-only` and frozen install                | Pass                                                                                                                                                           |
| `pnpm build`                                                     | Pass                                                                                                                                                           |
| `pnpm gallery:build`                                             | Pass; JavaScript 332.27 KB (86.29 KB gzip), CSS 30.73 KB (5.19 KB gzip)                                                                                        |
| `pnpm test`                                                      | Pass; 221 tests across 20 files                                                                                                                                |
| `pnpm --filter create-benos test`                                | Pass; 4 tests                                                                                                                                                  |
| Packed create-benos E2E                                          | Pass; packed CLI scaffolds and the generated app passes typecheck, build, test, and lint                                                                       |
| `pnpm check:doc-examples`                                        | Pass; 28 TSX examples compiled in both modes and strict type-checked                                                                                           |
| `pnpm typecheck:types` and `pnpm check:jsx-types`                | Pass                                                                                                                                                           |
| `pnpm lint`                                                      | Pass                                                                                                                                                           |
| `pnpm check:packed`, `check:public-imports`, and `check:engines` | Pass                                                                                                                                                           |
| `pnpm size`                                                      | Core 4,051/4,096 bytes; core + DOM 10,200/10,240 bytes                                                                                                         |
| Local `BENOS_PACKAGE_MANAGER=pnpm` UI CLI consumer run           | Pass; default No, `--no-ui`, and `--ui`; UI starter typecheck/build/test/lint all pass                                                                         |
| Focused updated catalog-state browser test                       | Pass in Chromium, Firefox, and WebKit                                                                                                                          |
| Full browser suite                                               | 402 passed; 3 failed on the old gallery label assertion. Updated the assertion; focused rerun passes in all three browsers. Full post-fix suite is part of CI. |
| Ubuntu/Windows/macOS × npm/pnpm/Yarn/Bun matrix                  | Pending CI                                                                                                                                                     |

## Release and deployment notes

`create-benos` now depends on the `benos` CLI workspace package. Packing
rewrites `workspace:^` to a normal semver range, and the packed E2E installs
the packed CLI archive. The CLI package must be published before a future
create-benos release containing this feature. No package was published here.

The starter's Website link remains omitted per the earlier instruction to skip
it until the public website URL is known. The gallery's component guide links
point to GitHub. No deployment was performed.

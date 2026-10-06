# U6 checkpoint

**Status:** complete. All local verification and the full GitHub Actions
workflow passed. No packages were published and the gallery was not deployed.

## What changed

- Added the [UI guide](../ui/README.md) and a guide page for each of the 19
  components. The guide covers installation with `benos init` and `benos add`,
  theme tokens, editing copied source, `diff`/`update`, conflict resolution,
  and minimum-version requirements. Select and Dropdown Menu describe their
  current Zag 1.44.0 Tab behavior; RadioGroup describes WebKit's native RTL
  ArrowLeft behavior.
- Expanded `check:doc-examples` to compile every guide example in `none` and
  `safe` optimization modes and then strict-type-check it.
- Added the default-No “Add Benos UI components?” prompt and `--ui`/`--no-ui`
  flags to create-benos. The opt-in path installs the app dependencies, runs
  `benos init`, adds Button and Input, and uses them in the starter.
- Added the opt-in and opt-out cases to the Ubuntu/Windows/macOS by
  npm/pnpm/Yarn/Bun consumer matrix.
- Added links from all 19 gallery entries to their guide pages and verified a
  production gallery build. [Deployment instructions](../ui-gallery-deployment.md)
  document the Vercel settings; no deployment was performed.

## Verification

The final refreshed workflow is [CI run 37419141945](https://github.com/benosjs/benos/actions/runs/37419141945),
triggered by commit `427178779be4a25901ad74832b2cd9aa7c6ac509`. All 16 jobs
passed: the verification job, three create-benos OS jobs, and all 12 UI CLI
matrix jobs.

| OS      | npm  | pnpm | Yarn | Bun  |
| ------- | ---- | ---- | ---- | ---- |
| Ubuntu  | Pass | Pass | Pass | Pass |
| Windows | Pass | Pass | Pass | Pass |
| macOS   | Pass | Pass | Pass | Pass |

| Check                                                        | Result                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm install --lockfile-only` and frozen install            | Pass                                                                                            |
| `pnpm build`                                                 | Pass                                                                                            |
| `pnpm gallery:build`                                         | Pass; JavaScript 332.27 KB (86.29 KB gzip), CSS 30.73 KB (5.19 KB gzip)                         |
| `pnpm test`                                                  | Pass; 221 tests across 20 files                                                                 |
| `pnpm --filter create-benos test`                            | Pass; 11 tests                                                                                  |
| Packed create-benos E2E                                      | Pass; generated app type-check, build, test, and lint passed on Ubuntu, Windows, and macOS      |
| UI CLI matrix                                                | Pass; all 12 OS/package-manager cells shown above                                               |
| `pnpm check:doc-examples`                                    | Pass; 28 TSX examples compiled in both modes and strict-type-checked                            |
| `pnpm typecheck:types`, `pnpm check:jsx-types`               | Pass                                                                                            |
| `pnpm lint`                                                  | Pass                                                                                            |
| `pnpm check:packed`, `check:public-imports`, `check:engines` | Pass                                                                                            |
| `pnpm audit:template`                                        | Pass; fresh packed scaffold install had no engine or deprecation warnings and 0 vulnerabilities |
| `pnpm size`                                                  | Core 4,051/4,096 bytes; core + DOM 10,200/10,240 bytes                                          |
| `pnpm bench:guard`                                           | Pass                                                                                            |
| `pnpm test:browser`                                          | Pass; 405 tests across Chromium, Firefox, and WebKit in 6.1 minutes                             |

The first U6 CI run found that `audit:template` executed the packed CLI before
installing its declared dependencies. The audit script now installs the packed
CLI and its packed `benos` dependency in the extracted package before running
it. The corrected run above passes.

## Release and deployment notes

`create-benos` depends on the `benos` CLI workspace package. Packing rewrites
`workspace:^` to a normal semver range, and the packed E2E installs the packed
CLI archive. Publish the CLI before a future create-benos release containing
this integration. No package was published here.

The starter's Website link remains omitted per the earlier instruction to skip
it until the public website URL is known. The gallery's component guide links
point to GitHub. No deployment was performed.

## Interactive-flow follow-up

**Status:** complete; local verification and refreshed CI passed.

- Missing directory names now prompt with `benos-app` as the default. The
  existing UI question remains default No. A third question asks whether to
  install with the detected package manager and start Vite; it defaults Yes.
- Added `--install`/`--no-install` and `--start`/`--no-start` alongside
  `--ui`/`--no-ui`, `--git`, and `--yes`. Non-TTY execution never prompts or
  starts a server without explicit `--start`. ESLint remains the starter
  linter; no linter-choice prompt was added.
- Installation failures report the failed command and manual recovery
  commands while leaving the generated project in place. Interactive Ctrl+C
  is forwarded to Vite, and the CLI exits after the server stops.
- Opting into UI while declining installation still creates the UI-ready
  starter and prints the ordered install, `benos init`, `benos add`, and dev
  commands; the CLI does not run a version gate before dependencies exist.
- Expanded the CI consumer matrix test to exercise both accepted and declined
  install/start choices through a pseudo-terminal, verify the printed URL,
  stop the server, and confirm that the URL no longer responds. The same test
  runs with each of npm, pnpm, Yarn, and Bun on Ubuntu, Windows, and macOS.
- Windows initially kept the UI CLI job alive after the generated app had
  passed its checks. The PTY test now disposes its event subscriptions and
  closes the ConPTY after exit. Windows npm, pnpm, Yarn, and Bun all complete
  successfully in the final run.

### Local verification

| Check                                                                                                                                      | Result                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                                                                                                               | Pass                                                                                                                |
| `pnpm test`                                                                                                                                | Pass; 221 tests across 20 files                                                                                     |
| `pnpm --filter create-benos test`                                                                                                          | Pass; 11 tests                                                                                                      |
| `tests/create-benos.test.ts`                                                                                                               | Pass; 1 packed consumer test                                                                                        |
| `pnpm test:ui-cli:matrix` with pnpm                                                                                                        | Pass; default install/start, clean stop, declined start, UI starter type-check/build/test/lint, registry CLI checks |
| `pnpm test:browser`                                                                                                                        | Pass; 405 Chromium, Firefox, and WebKit tests                                                                       |
| `pnpm gallery:build` and gallery type-check                                                                                                | Pass                                                                                                                |
| `pnpm typecheck:types`, `check:jsx-types`, `check:doc-examples`, `check:public-imports`, `check:packed`, `check:engines`, `registry:check` | Pass                                                                                                                |
| `pnpm audit:template`                                                                                                                      | Pass; no engine/deprecation warnings and zero vulnerabilities                                                       |
| `pnpm lint`                                                                                                                                | Pass                                                                                                                |
| `pnpm bench:guard`                                                                                                                         | Pass; every workload below 2× Preact                                                                                |
| `pnpm size`                                                                                                                                | Pass; local Node 24.8.0 measured core 4,049/4,096 bytes and core + DOM 10,198/10,240 bytes                          |

The final refreshed CI run [37419141945](https://github.com/benosjs/benos/actions/runs/37419141945)
passed all 16 jobs, including full verification, create-benos on Ubuntu,
Windows, and macOS, and the full matrix:

| OS      | npm  | pnpm | Yarn | Bun  |
| ------- | ---- | ---- | ---- | ---- |
| Ubuntu  | Pass | Pass | Pass | Pass |
| Windows | Pass | Pass | Pass | Pass |
| macOS   | Pass | Pass | Pass | Pass |

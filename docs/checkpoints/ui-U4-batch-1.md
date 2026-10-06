# UI checkpoint U4 batch 1 — styled components

**Date:** 2026-10-03

**Status:** Complete on `ui-system`. Local verification and GitHub Actions run [37136869920](https://github.com/benosjs/benos/actions/runs/37136869920) pass.

## What changed

- Added source-owned Button, Input, Textarea, Label, Card, Badge, and Separator components with one stylesheet per component.
- Components use only public `@benosjs/dom` APIs, preserve getter-backed props through `mergeProps`, use `splitProps` for local/native props, support callback refs, and expose optional root `id` values. Input and Textarea report invalid state through `aria-invalid` and a styling data attribute.
- Added seven schema-v1 registry items. Their payloads contain standalone TSX/CSS, have no npm or primitive-machine dependency, and are generated from `registry/source/` by `pnpm registry:build`.
- Added type-level assertions for all seven props/component exports, IDs, variants, native event props, and callback-ref element types.
- Extended the fresh create-benos consumer test to add the seven files unchanged, verify the lock records, and run strict type-check, build, test, and Benos ESLint/Prettier.
- Added a three-browser axe and keyboard suite. Axe checks run in light, dark, RTL, and dark RTL; keyboard checks cover LTR and RTL. The suite also verifies explicit IDs and non-null callback refs.
- Added `examples/ui-gallery/`, which imports the same component and CSS authoring files as the registry payloads and lays out all three preview modes side by side.

## Component coverage

| Component | Types and optional ID/ref                                                      | Fresh create-benos consumer | Keyboard coverage                                    | axe-core coverage                                     | Gallery modes/states                                           |
| --------- | ------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Button    | Pass; typed variants/sizes/native events; ID and non-null ref verified         | Pass unchanged              | Enter, Space, Tab; LTR and RTL                       | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Five variants, three sizes, disabled, hover and keyboard focus |
| Input     | Pass; typed text-input types/sizes/native events; ID and non-null ref verified | Pass unchanged              | Tab order, disabled skip, invalid field; LTR and RTL | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Three sizes, disabled and invalid                              |
| Textarea  | Pass; typed sizes/native events; ID and non-null ref verified                  | Pass unchanged              | Tab order, disabled skip, invalid field; LTR and RTL | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Three sizes, disabled and invalid                              |
| Label     | Pass; typed `for`, ID and non-null ref verified                                | Pass unchanged              | Click-to-focus and following Tab; LTR and RTL        | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Associated labels in all three modes                           |
| Card      | Pass; typed variants/native attributes; ID and non-null ref verified           | Pass unchanged              | Embedded action and following Tab; LTR and RTL       | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Default, outlined, raised                                      |
| Badge     | Pass; typed tones/native attributes; ID and non-null ref verified              | Pass unchanged              | Confirmed not added to the Tab sequence; LTR and RTL | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Neutral, brand, success, warning, danger                       |
| Separator | Pass; typed orientation/semantics; ID and non-null ref verified                | Pass unchanged              | Confirmed not added to the Tab sequence; LTR and RTL | Chromium, Firefox, WebKit; light, dark, RTL, dark RTL | Horizontal and vertical                                        |

No axe violations were reported for any of the seven components in the tested modes. Presentational Card, Badge, and Separator are not made focusable; the keyboard tests verify that focus continues to the next native control.

## Verification

| Check                                                                              | Result                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                                                       | Pass                                                                                                                      |
| `pnpm test`                                                                        | Pass — 204 tests in 19 files                                                                                              |
| `pnpm lint`                                                                        | Pass — ESLint and Prettier                                                                                                |
| `pnpm typecheck:types`                                                             | Pass — includes batch 1 `expect-type` assertions                                                                          |
| `pnpm registry:check`                                                              | Pass — generated index and seven item payloads are current                                                                |
| Public-import, packed-metadata, engine, JSX-type, and documentation-example checks | Pass                                                                                                                      |
| `pnpm gallery:build` and gallery strict `tsc`                                      | Pass                                                                                                                      |
| `pnpm audit:template`                                                              | Pass — no engine/deprecation warnings and zero vulnerabilities                                                            |
| Fresh consumer with pnpm                                                           | Pass — scaffold, add all seven unchanged, strict type-check, build, test, Benos ESLint/Prettier                           |
| `pnpm test:browser`                                                                | Pass — 147/147 tests across Chromium, Firefox, and WebKit; includes 45 batch 1 test executions (15 per browser)           |
| `pnpm size` after production rebuild                                               | Pass — core 4,051/4,096 bytes; core + DOM 10,200/10,240 bytes                                                             |
| `pnpm bench:guard`                                                                 | Pass — seven-run median below 2× Preact on every workload                                                                 |
| OS/package-manager CI matrix                                                       | Pass — all 12 Ubuntu/Windows/macOS × npm/pnpm/Yarn/Bun cells; all three create-benos jobs and main verification also pass |

## Bundle sizes and kernel benchmark medians

No core or DOM runtime implementation changed. The production sizes remain within the existing budgets:

| Artifact                         |         Size |       Budget |
| -------------------------------- | -----------: | -----------: |
| `@benosjs/core`                  |  4,051 bytes |  4,096 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 bytes | 10,240 bytes |

Production kernel guard results, median of seven comparisons (each comparison uses five timed samples):

| Workload                            |   Benos |  Preact | Ratio |
| ----------------------------------- | ------: | ------: | ----: |
| Signal read                         | 6.20 ms | 4.94 ms | 1.24× |
| 20-deep computed chain write + read | 6.41 ms | 5.27 ms | 1.22× |
| 200-effect fanout write             | 2.06 ms | 1.19 ms | 1.76× |
| Dynamic dependency switch           | 3.57 ms | 2.49 ms | 1.41× |
| Repeated equal write                | 0.84 ms | 0.53 ms | 1.60× |

## Deviations and review notes

- Component CSS is copied as a separate file by `benos add`; the consuming application imports each component stylesheet. The shared theme stylesheet remains owned by `benos init`.
- Playwright's WebKit build did not honor the macOS global full-keyboard preference. The existing traversal fixture explicitly adds `tabindex="0"` to the link to model inclusion in the Tab order; `docs/ui-plan.md` records that this does not emulate Safari's global setting.
- The first CI run found registry payload differences on Windows because checkout converted TSX/CSS source to CRLF. `.gitattributes` now pins registry authoring files to LF; the next run passed registry checks and fresh consumers in all 12 matrix cells.
- The second CI run found WebKit/Linux contrast violations on plain native buttons surrounding the component fixture, not on the components. Fixture-only controls now use theme tokens; the unmodified axe run passes after that correction.
- The local fresh-consumer run used pnpm; CI passed npm, pnpm, Yarn, and Bun on Ubuntu, Windows, and macOS.

## Gallery review

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @benosjs/ui-gallery dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`. The page shows Light, Dark, and RTL panels together. Hover buttons and use Tab/Shift+Tab to review interactive states.

**Checkpoint result:** batch 1 is locally and CI verified and ready for visual review. It remains on `ui-system`; no merge into `main` is included.

# F6 — Release preparation for 0.5.0

**Status:** Complete; awaiting approval. The pull request is ready for review, and nothing is merged, tagged, or published.

## Delivered

- **Approvals recorded.** [f-f5](f-f5.md) and [the track plan](../forms-plan.md) record the F5 approval of both options. The template's Vite pin is fixed separately in benosjs/benos#19. On 2026-10-22, you chose to bump to 0.5.0 in F6 (asked at the start of F6: "Bump to 0.5.0").
- **`"sideEffects": false`** on `@benosjs/async` and `@benosjs/router`. `pnpm size` now reports what a core, DOM, and forms app pays for the router import when it does not use the router (decision 1 of F5).
- **Registry 0.5.0** ([`registry/v1`](../../registry/v1)). Item ranges are raised to `^0.5.0` and minimum Benos versions to `0.5.0`, and every item URL points to the `v0.5.0` tag. Includes:
  - The new `field` item (`registry:style`, `css/field.css`, depends on `@benosjs/forms@^0.5.0`).
  - The F4 fixes: `Input` and `Textarea` bind `aria-invalid` and `data-invalid`, so they follow `invalid` after the first render. `Checkbox` and `Switch` put `aria-describedby` on the input that has their role.
  - The expected-to-fail browser test is now a passing test. It also checks the checkbox's error and the switch's description as accessible descriptions.
- **Version bump.** All twelve publishable packages are at `0.5.0`, and the starter's Benos ranges are `^0.5.0`. The starter does not include the router, query, or forms.
- **Release wiring for `@benosjs/forms`.** It is now in the tag check, the packed-metadata check, published-version verification, `benos info`, and the publish workflow (after the router, which it depends on). The release tests now expect twelve packages. [release-checklist.md](../release-checklist.md) covers twelve packages and the one-time manual first publish of query and forms.
- **Docs:**
  - New [forms guide](../forms.md); its 8 TSX examples are compiled and type-checked by `pnpm check:doc-examples`, which now resolves `zod`.
  - The [API reference](../api-reference.md) has a forms section and `blockNavigation`.
  - The CHANGELOG `[0.5.0] — Unreleased` section covers query, forms, the blocker, the compiler and registry fixes, the metadata change, and sizes.
  - README, roadmap, architecture index, and the forms package README are updated.

## Size report (0.5.0)

| Bundle                                      |    0.4.0 |    0.5.0 |      Cap |
| ------------------------------------------- | -------: | -------: | -------: |
| core                                        |  4,303 B |  4,303 B |  4,608 B |
| core + DOM                                  | 11,010 B | 11,006 B | 11,264 B |
| async                                       |  1,644 B |  1,644 B |  4,096 B |
| router                                      |  6,349 B |  6,739 B |  7,168 B |
| query (new)                                 |        — |  3,498 B |  3,584 B |
| forms (new)                                 |        — |  2,878 B |  3,072 B |
| core + DOM + async + router + query + forms |        — | 23,565 B |        — |

`pnpm size` measures the forms-without-router cost with every forms export: 13,701 B, of which 160 B is the router import. F5 measured 375 B for an app importing only `formModel` and `text`; that number is larger because gzip has less forms code to share patterns with. Either way it is down from 944 B.

## Verification

- `pnpm test`: **485 / 485**.
- Also passing: `pnpm lint`, `pnpm typecheck:types`, `pnpm check:jsx-types`, `pnpm check:doc-examples` (50 files), `pnpm check:public-imports`, `pnpm check:packed`, `pnpm check:engines`, `pnpm registry:check`, `pnpm bench:guard`, `pnpm check:flagship`, and `pnpm size`.
- `pnpm test:browser`: **497 / 498** in Chromium, Firefox, and WebKit. The one failure was the WebKit Select keyboard test in `batch2.spec.ts` (a highlighted option after End), which no F6 change touches. It ran while the machine was loaded, and the test passed 5 times out of 5 when rerun alone.
- `BENOS_PACKAGE_MANAGER=pnpm pnpm test:ui-cli:matrix` passes against the 0.5.0 registry and packages. The dashboard and gallery build.
- **Three operating systems** come from this pull request's CI: the create-benos npm 10/11 jobs and the UI CLI matrix on Ubuntu, macOS, and Windows.
- **`pnpm audit:template`** still fails on this branch until benosjs/benos#19 is merged and `main` is merged into `forms`.

## Release steps (not done)

Nothing is merged, tagged, or published. When you authorize the release:

1. Merge benosjs/benos#19, then merge `main` into `forms` so `audit:template` passes.
2. Merge benosjs/benos#18 after CI is green.
3. Follow [the first publish of query and forms](../release-checklist.md#first-publish-of-benosjsquery-and-benosjsforms-050): push `v0.5.0`, reject the workflow's publish approval, publish the twelve packages manually in order, configure trusted publishing for query and forms, and date the CHANGELOG section.

## Notes

- **The registry on `main`.** Once #18 merges, `main`'s registry index points to `v0.5.0` item URLs, which do not resolve until the tag is pushed. As in 0.4.0, merge and tag together.
- **No UI CLI test for `field`.** The UI CLI matrix adds registry items in fixed batches that do not include `field`. The item is validated by the registry build and checks, but `benos add field` is not run in CI; adding it needs `@benosjs/forms` and its dependencies in the matrix's local package registry.

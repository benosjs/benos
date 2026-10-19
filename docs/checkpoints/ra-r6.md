# R6 — Release preparation (0.4.0)

**Status:** Complete up to the pull request. Nothing is merged, tagged, or
published.

## Delivered

- **Guides.** [Router guide](../router.md) and [async guide](../async.md),
  with every `tsx` example compiled in both optimization modes and
  type-checked in CI. The React migration guide gained a route-state section.
- **Package readiness.** `@benosjs/async` and `@benosjs/router` gained a
  README, LICENSE, repository, keywords, homepage, and bugs metadata.
- **Versions.** All ten publishable packages are `0.4.0`. The starter's Benos
  dependency ranges are `^0.4.0`. Registry minimum versions stay at `0.3.0`
  because no registry component needs a 0.4 API.
- **Release tooling.** The tag check, packed-metadata check, published-version
  verification, `benos info`, and the publish workflow include async and
  router. The workflow publishes `core`, `dom`, `async`, `router`, then the
  existing order.
- **CHANGELOG.** Added the 0.4.0 entry and dated the published 0.3.1 and
  0.3.3 entries.
- **Docs status.** README, roadmap, plan, architecture index, and design
  status lines now describe 0.4.0.

## Verification

| Check                                                                                    | Result                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Vitest unit suite                                                                        | 33 files, 336 tests passed         |
| Playwright, Chromium + Firefox + WebKit                                                  | 446 of 447 passed; see note        |
| Documentation examples                                                                   | 38 files compiled and type-checked |
| Build, engines, registry, gallery, type tests, JSX types, public imports, template audit | Passed                             |
| Packed metadata                                                                          | Passed for 10 packages             |
| Lint and Prettier                                                                        | Passed                             |
| Bundle budgets                                                                           | Passed                             |
| Kernel benchmark guard                                                                   | Passed                             |
| Dashboard and UI gallery type-check                                                      | Passed                             |

The one browser failure was the Chromium `select` keyboard test during the
full parallel run. It passed 8 of 8 repeats alone and 618 of 618 when the
UI component specs ran twice under full parallelism, so it is a load-related
flake, not a regression.

Three-OS coverage comes from the CI `create-benos` and UI CLI matrices on the
pull request. They were not run locally.

## Decisions for review

1. **Starter integration.** The recommendation is to keep the router out of
   the default starter for 0.4.0. The original starter requirements keep
   router, forms, and query out, and a one-page starter stays smallest. A
   later `--router` option could add a two-route example. The starter is
   unchanged in this release.
2. **First publish of the new packages.** npm trusted publishing can only be
   configured on an existing package. The
   [release checklist](../release-checklist.md#first-publish-of-benosjsasync-and-benosjsrouter-040)
   describes a one-time manual publish for 0.4.0. Automated releases resume
   at 0.4.1.
3. **DOM bytes.** The R5 fix adds 33 B to core + DOM, within the cap. See
   [ra-r5](./ra-r5.md).

# U4 batch 3 checkpoint

**Date:** 2026-10-05

**Status:** Complete; final CI run passed on `ui-system`.

### Compatibility follow-up

Before Batch 4, registry payloads gained a required `minimumBenosVersions`
array. `benos add` checks the installed packages in the full resolved item
graph and defers registry cache writes until this preflight succeeds. An old
or absent package produces a manager-specific upgrade command without
changing component files, `package.json`, or `benos.lock.json`. New tests cover
both refusal and successful installation. Overlay items require core 0.1.3
because their primitive adapters use `createUniqueId()`; until core 0.1.3 is
published, projects with core 0.1.2 will be asked to upgrade.

## Coverage

| Component     | Types and IDs                                                 | Fresh create-benos project                                                        | Keyboard and behavior                                                                                                    | axe-core                                       | Gallery                                                                                     |
| ------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Dialog        | `tests/ui-batch3.types.ts`; typed props, optional ID override | Passed unchanged with pnpm: strict type-check, build, test, Benos ESLint/Prettier | Chromium, Firefox, WebKit: focus enters, Tab trap, Escape closes, focus returns; scroll lock and background inert/hidden | All three browsers; light, dark, RTL, dark RTL | Opens from each light, dark, and RTL panel; portal theme, direction, and layer tested       |
| Popover       | `tests/ui-batch3.types.ts`; typed props, optional ID override | Passed unchanged with pnpm: strict type-check, build, test, Benos ESLint/Prettier | Chromium, Firefox, WebKit: trigger, Escape dismissal, focus return                                                       | All three browsers; light, dark, RTL, dark RTL | Opens from each light, dark, and RTL panel; portal scope and viewport-edge placement tested |
| Tooltip       | `tests/ui-batch3.types.ts`; typed props, optional ID override | Passed unchanged with pnpm: strict type-check, build, test, Benos ESLint/Prettier | Chromium, Firefox, WebKit: keyboard Tab focus, hover, Escape; essential instructions remain visible                      | All three browsers; light, dark, RTL, dark RTL | Opens from each light, dark, and RTL panel; portal scope tested                             |
| Dropdown Menu | `tests/ui-batch3.types.ts`; typed props, optional ID override | Passed unchanged with pnpm: strict type-check, build, test, Benos ESLint/Prettier | Chromium, Firefox, WebKit: arrows, Home/End, Escape, focus; Tab behavior recorded below                                  | All three browsers; light, dark, RTL, dark RTL | Opens from each light, dark, and RTL panel; portal scope and viewport-edge placement tested |
| Toast         | `tests/ui-batch3.types.ts`; typed props, optional ID override | Passed unchanged with pnpm: strict type-check, build, test, Benos ESLint/Prettier | Chromium, Firefox, WebKit: polite status announcement, no focus stealing, dismissal                                      | All three browsers; light, dark, RTL, dark RTL | Opens from each light, dark, and RTL panel; portal scope tested                             |

The fresh-project script adds all 18 registry components to one newly scaffolded
project and runs the project checks without editing installed component files.
The full run passed strict TypeScript, Vite production build, Vitest, and Benos
ESLint/Prettier with pnpm. The browser suite contains 363 test cases. The
focused Batch 3 WebKit run passed all 39 cases; the final full CI browser suite passed all 363 cases across
Chromium, Firefox, and WebKit. An earlier local run needed two automatic retries;
the final CI result did not report retries or failures.

Each batch 3 axe fixture is scanned in four theme/direction modes in all three
browsers (60 component/mode/browser scans). All five overlays are checked for
their token layer, effective direction, and theme when portaled outside the
styled owner subtree. Dialog tests cover focus placement and return, its Tab
trap, Escape, scroll locking, and hiding the background from assistive
technology. Popover, Tooltip, and Dropdown Menu are measured near viewport
edges. Tooltip tests show it on keyboard focus and hover while essential text
remains visible. Toast uses a polite live region and leaves focus on the
trigger. Reduced-motion tests cover all five.

## Direction and keyboard notes

- The adapter derives effective direction from the component's host element
  (or the document root), passes it to Zag's machine, and filters Zag's
  generated `dir` from DOM props unless the caller explicitly provided one.
  This lets every one of the eleven machine-backed primitives inherit LTR or
  RTL without an emitted `dir="ltr"`. Browser tests cover both directions for
  all eleven. `dir` is still forwarded when explicitly set.
- The Zag direction reflection behavior and the adapter interoperability
  question are documented in the unfiled
  [upstream note](../upstream/zag-direction-default.md). The note does not
  claim Zag chooses LTR when its option is omitted.
- Dropdown Menu Tab behavior remains as in Zag 1.44.0 and is linked to the
  existing [upstream issue draft](../upstream/zag-menu-tab.md). Benos adds no
  key-interception workaround.
- The test runner calls Playwright directly and contains no macOS
  `AppleKeyboardUIMode` reads or writes. WebKit tab navigation tests use
  explicit focusable elements in the fixture.
- The Tooltip trigger now has `tabIndex={0}`. This makes the native trigger
  reachable by the WebKit fixture's explicit sequential keyboard navigation.

## Verification and sizes

- `pnpm build`: passed with Node 22.18.0.
- `pnpm test`: 204 tests passed across 19 files.
- `pnpm typecheck:types`, `pnpm lint`, `pnpm check:engines`,
  `pnpm audit:template`, `pnpm registry:check`, `pnpm check:doc-examples`,
  `pnpm check:public-imports`, `pnpm check:packed`, `pnpm check:jsx-types`,
  and `pnpm gallery:build`: passed.
- Full packed fresh-project validation: passed with pnpm; no engine or
  deprecation warnings, no audit vulnerabilities, all 18 components added,
  then type-check, build, test, and lint passed.
- Rebuilt production sizes: core 4,051 / 4,096 gzip bytes; core + DOM
  10,200 / 10,240 gzip bytes. No core or DOM runtime source changed.
- The median-of-seven production benchmark table is recorded in
  [benchmarks/README.md](../../benchmarks/README.md); all five workload ratios
  pass the 2× guard.
- Final GitHub Actions run: [37276102544](https://github.com/benosjs/benos/actions/runs/37276102544)
  passed on commit `fd7776b`. The `verify` job passed build, registry and gallery
  checks, type checks, lint, size and benchmark guards, and all 363 browser tests.
  All 12 OS/package-manager consumer cells and all three create-benos OS jobs
  passed.
- CI issues fixed before the successful run: Windows checked out the new shared
  registry TypeScript source with CRLF, which changed its generated checksum;
  `.gitattributes` now keeps that registry source at LF. WebKit axe initially
  flagged fixture-only native button colors (`#fff` on `#c0c0c0`); the fixture
  now applies the same theme tokens and focus treatment as its component
  fixtures. No component runtime or public API change was needed.

## Compatibility note

The fresh-project script substitutes local packed workspace builds for
`@benosjs/core` and `@benosjs/primitives` while validating this unreleased
registry work. The current published `@benosjs/core@0.1.2` predates the
public `createUniqueId()` export used by the primitives. Do not publish or
serve these registry items against the current public core until a compatible
core package version is released.

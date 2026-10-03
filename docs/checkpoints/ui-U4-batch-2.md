# U4 batch 2 checkpoint

**Date:** 2026-10-03  
**Status:** Implementation and local verification complete.

## Coverage

| Component  | Types                            | Fresh create-benos strict type-check + lint | Keyboard                                                                                   | axe-core                                 | Gallery states                               |
| ---------- | -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| Checkbox   | Pass; `tests/ui-batch2.types.ts` | Pass unchanged with pnpm and Yarn 4.5.0     | Pass in Chromium, Firefox, WebKit; light, dark, RTL, dark RTL                              | Pass in all 12 browser/mode combinations | Checked                                      |
| Switch     | Pass; `tests/ui-batch2.types.ts` | Pass unchanged with pnpm and Yarn 4.5.0     | Pass in Chromium, Firefox, WebKit; light, dark, RTL, dark RTL                              | Pass in all 12 browser/mode combinations | On; accessibility tree asserts `switch` role |
| RadioGroup | Pass; `tests/ui-batch2.types.ts` | Pass unchanged with pnpm and Yarn 4.5.0     | Pass in Chromium, Firefox, WebKit; light, dark, RTL, dark RTL                              | Pass in all 12 browser/mode combinations | Selected option                              |
| Select     | Pass; `tests/ui-batch2.types.ts` | Pass unchanged with pnpm and Yarn 4.5.0     | Pass in Chromium, Firefox, WebKit; light, dark, RTL, dark RTL; Tab behavior recorded below | Pass in all 12 browser/mode combinations | Selected and open                            |
| Tabs       | Pass; `tests/ui-batch2.types.ts` | Pass unchanged with pnpm and Yarn 4.5.0     | Pass in Chromium, Firefox, WebKit; light, dark, RTL, dark RTL                              | Pass in all 12 browser/mode combinations | Selected tab and panel                       |
| Accordion  | Pass; `tests/ui-batch2.types.ts` | Pass unchanged with pnpm and Yarn 4.5.0     | Pass in Chromium, Firefox, WebKit; light, dark, RTL, dark RTL                              | Pass in all 12 browser/mode combinations | Expanded item                                |

The browser matrix ran 207 tests across Chromium, Firefox, and WebKit. The six
axe tests each scan four modes, for 72 component/mode/browser scans with no
violations. Keyboard tests exercise all four modes for each component. Controlled
state and explicit ID overrides are also checked in each browser. The gallery
test asserts all six controls appear in selected or open states in its light,
dark, and Arabic RTL panels.

The fresh-project test was run locally with pnpm and Yarn 4.5.0 and passed
strict type-check, production build, Vitest, and Benos ESLint/Prettier without
edits to installed component source. The starter uses Yarn's
`nodeLinker: node-modules`; the test harness adds a loopback-only HTTP whitelist
for its temporary local package registry. The CI workflow defines the 3 OS ×
4 package-manager matrix.

The initial CI attempts exposed and fixed three test-infrastructure issues:
the consumer matrix now builds workspace packages before packing them; Yarn 4
uses a loopback-only whitelist for the temporary HTTP registry; and the browser
fixture's continuation button uses the Benos button class so Linux WebKit does
not report a contrast issue from the unrelated native default button.

## Accessibility behavior and deviations

- Switch applies `role="switch"` to the checkbox input. Its accessibility-tree
  assertion reports `switch "Product updates"`; axe passes.
- Select's Tab behavior remains a Zag 1.44.0 issue: Tab is prevented, the
  popup remains open, and focus remains in the list region. No local key
  interception was added. The minimal upstream issue draft is
  [zag-select-tab.md](../upstream/zag-select-tab.md).
- WebKit's RTL radio ArrowLeft behavior matches native radio inputs: WebKit
  keeps the first option selected, while Chromium and Firefox move to the next
  option. The cross-browser regression assertion retains this documented
  platform behavior.
- The browser runner enables macOS full keyboard access for WebKit tests and
  restores the prior system setting on completion.
- Select imports the public `collection` helper from its declared
  `@zag-js/select@1.44.0` dependency. That dependency is listed in the registry
  item; the root development dependency makes the copied registry TSX resolve
  during monorepo type-checking. No private or internal package subpath is
  imported.
- No axe violations or known adapter-specific accessibility issues remain.

## Verification and sizes

- `pnpm build`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 204 tests passed.
- `pnpm test:browser`: 207 tests passed in Chromium, Firefox, and WebKit.
- `pnpm typecheck:types` and gallery TypeScript check: passed.
- `pnpm test:ui-cli:matrix` with `BENOS_PACKAGE_MANAGER=pnpm`: fresh starter
  type-check, build, test, and lint passed.
- `pnpm registry:check`, `pnpm check:public-imports`, `pnpm check:engines`,
  `pnpm check:packed`, `pnpm check:doc-examples`, `pnpm check:jsx-types`, and
  `pnpm gallery:build`: passed.
- `pnpm bench:guard`: all five production kernel workloads passed the 2×
  Preact guard. Medians and bundle sizes are recorded in
  [benchmarks/README.md](../../benchmarks/README.md).
- The packed starter audit passed under Node 22.18.0 with no engine or
  deprecation warnings and zero vulnerabilities. The local Node 24.8.0 is below
  the supported 24.11 floor, so engine warnings from commands run directly on
  that Node are expected.
- Core: 4,051 / 4,096 gzip bytes. Core + DOM: 10,200 / 10,240 gzip bytes.
- Review screenshot: `/tmp/benos-u4-batch2-gallery.png`. Run `pnpm gallery`
  from the repository root and visit `http://localhost:5173`.

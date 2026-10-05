# U4 batch 2 checkpoint

**Date:** 2026-10-04

**Status:** Implementation, review fixes, and local verification complete.

## Coverage

| Component  | Types and IDs                                                     | Fresh create-benos checks                                                                 | Keyboard                                                                                    | axe-core                                       | Gallery coverage                                             |
| ---------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Checkbox   | `tests/ui-batch2.types.ts`; typed props and explicit ID override  | Passed unchanged with pnpm and Yarn 4.5.0; strict type-check, build, test, and Benos lint | Chromium, Firefox, WebKit; LTR and RTL; Space toggles                                       | All three browsers; light, dark, RTL, dark RTL | Checked, unchecked, disabled, and contrast in both themes    |
| Switch     | `tests/ui-batch2.types.ts`; typed props and explicit ID override  | Passed unchanged with pnpm and Yarn 4.5.0; strict type-check, build, test, and Benos lint | Chromium, Firefox, WebKit; LTR and RTL; Space toggles                                       | All three browsers; light, dark, RTL, dark RTL | On/off; accessibility-tree assertion exposes `role="switch"` |
| RadioGroup | `tests/ui-batch2.types.ts`; typed values and explicit ID override | Passed unchanged with pnpm and Yarn 4.5.0; strict type-check, build, test, and Benos lint | Chromium, Firefox, WebKit; arrows, Home/End, LTR and RTL                                    | All three browsers; light, dark, RTL, dark RTL | Selected option in LTR and Arabic RTL                        |
| Select     | `tests/ui-batch2.types.ts`; typed values and explicit ID override | Passed unchanged with pnpm and Yarn 4.5.0; strict type-check, build, test, and Benos lint | Chromium, Firefox, WebKit; arrows, Home/End, typeahead, Escape, Tab behavior recorded below | All three browsers; light, dark, RTL, dark RTL | Selected, closed/open layout, clear control, and options     |
| Tabs       | `tests/ui-batch2.types.ts`; typed values and explicit ID override | Passed unchanged with pnpm and Yarn 4.5.0; strict type-check, build, test, and Benos lint | Chromium, Firefox, WebKit; arrows, Home/End, LTR and RTL                                    | All three browsers; light, dark, RTL, dark RTL | Selected tab and panel; RTL visual order and text alignment  |
| Accordion  | `tests/ui-batch2.types.ts`; typed values and explicit ID override | Passed unchanged with pnpm and Yarn 4.5.0; strict type-check, build, test, and Benos lint | Chromium, Firefox, WebKit; Enter/Space, arrows, Home/End, LTR and RTL                       | All three browsers; light, dark, RTL, dark RTL | Expanded/collapsed answers and stateful plus/minus indicator |

The fresh-project validation installs each registry component unchanged into a
new create-benos project and runs strict TypeScript, production build, tests,
and Benos ESLint/Prettier. The CI matrix covers Ubuntu, Windows, and macOS with
npm, pnpm, Yarn, and Bun (12 OS/package-manager cells). The preceding matrix
run passed all cells; this checkpoint's push reruns the matrix against these
review fixes.

The browser suite has **213 passing tests** across Chromium, Firefox, and
WebKit. Each axe fixture is scanned in light, dark, RTL, and dark RTL, for 72
component/mode/browser scans with no violations. The Switch accessibility
assertion queries the accessibility role and accessible name (`switch`,
“Product updates”). The Select layout regression measures its closed and open
states and verifies the following control does not move.

## Review fixes and behavior

- The RTL Tabs issue came from Zag 1.44.0 adding `dir="ltr"` to the root,
  tab list, triggers, and panels when no direction was specified. The styled
  component now forwards an explicit direction to those elements only when
  supplied, allowing them to inherit an enclosing RTL direction otherwise.
  The browser test checks computed RTL direction, selected-tab placement on
  the right, start alignment, and the Arabic period-bearing panel text.
- Checkbox marks use the same `--benos-color-on-brand` token as Primary button
  text: white in light mode and navy in dark mode. The automated contrast
  assertion checks both themes against the 3:1 minimum; measured ratios are
  approximately 12.64:1 in light mode and 9.17:1 in dark mode.
- Select's Tab behavior remains a Zag 1.44.0 issue: Tab is prevented, the
  popup remains open, and focus stays in the list region. No local key
  interception was added. The minimal upstream report is
  [zag-select-tab.md](../upstream/zag-select-tab.md).
- WebKit's RTL radio ArrowLeft behavior matches native radio inputs: WebKit
  keeps the first option selected, while Chromium and Firefox move to the
  next option. Zag forwards direction and delegates arrow movement to native
  radio controls; this is documented as WebKit behavior, not a Zag defect.
- An earlier browser-wrapper revision set and restored macOS
  `AppleKeyboardUIMode=2`; this was removed in batch 3 review. The browser
  runner now never reads or changes host operating-system settings. Playwright
  WebKit did not honor that setting in the earlier probe; the deterministic
  traversal fixture explicitly includes its link with `tabindex="0"`, as
  described in the [U4 preflight notes](../ui-plan.md#u4-preflight-findings-investigation-only-no-u4-implementation).
- No axe violations or known adapter-specific accessibility issues remain.

## Verification and sizes

- `pnpm test`: 204 tests passed.
- `pnpm test:browser`: 213 tests passed across Chromium, Firefox, and WebKit.
- `pnpm lint`, gallery type-check, `pnpm registry:check`, and
  `pnpm gallery:build`: passed.
- The full CI workflow includes the fresh-project OS/package-manager matrix,
  browser suite, type-level suite, and release gates. CI for the checkpoint
  commit is reported with the checkpoint summary.
- The fresh local Node 24.8.0 production rebuild measured core at 4,049 / 4,096
  gzip bytes and core + DOM at 10,198 / 10,240 gzip bytes. The earlier Node
  22.18.0 checkpoint measured 4,051 / 10,200 bytes. No core or DOM runtime
  code changed, and both measurements are under budget.
- The production benchmark guard's isolated median-of-seven results were
  signal read 5.97 / 4.72 ms (1.27×), computed chain 6.21 / 4.99 ms (1.26×),
  effect fanout 2.01 / 1.16 ms (1.74×), dependency switch 3.63 / 2.35 ms
  (1.54×), and equal write 0.69 / 0.48 ms (1.44×). Full values are in
  [benchmarks/README.md](../../benchmarks/README.md).
- Review gallery: `/tmp/benos-u4-batch2-gallery-review-final.png`. Run
  `pnpm gallery` from the repository root and open `http://localhost:5173`.

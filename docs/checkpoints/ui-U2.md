# UI system checkpoint U2 — primitives and Zag adapter

**Date:** 2026-10-03

**Status:** Complete. `@benosjs/primitives` adapts Zag.js 1.44.0 through public `@benosjs/core` APIs. U2 verification is complete; known Zag/APG behavior differences are recorded below. Stop here before U3.

## What changed

- Added public `createUniqueId(): string` to `@benosjs/core`. Client IDs use one monotonic counter shared across roots. The zero-argument API leaves room for SSR to derive IDs from a request/root namespace, deterministic owner-tree path, and per-owner call ordinal. The plan is documented in [ssr.md](../architecture/ssr.md).
- Added `@benosjs/primitives` adapters for Accordion, Checkbox, Dialog, Menu, Popover, RadioGroup, Select, Switch, Tabs, Toast, and Tooltip. Each factory accepts optional `id`; explicit IDs override generated IDs.
- Added owner-bound machine startup, reactive controlled-prop synchronization, subscriptions, cleanup, prop normalization, per-machine runtime subpaths, and type assertions covering optional IDs.
- Kept the package root type-only. Runtime imports are only the eleven machine subpaths.
- Fixed adapter API lookup so reading a machine method does not subscribe the containing component to every state revision and remount its DOM subtree. Reactive prop descriptors read the state revision when their values are evaluated; API lookup itself stays stable.
- Added DOM-free import tests for every machine subpath, production consumer tree-shaking checks, a per-primitive unit matrix, and cross-browser keyboard/axe fixtures.
- Completed the approved brand, palette, starter, README, and `create-benos` test-script updates described in the U2 brief.

## Coverage matrix

Each unit row exercises controlled and uncontrolled state when supported by the Zag machine, an explicit ID override, distinct generated IDs across instances and roots, and owner disposal that stops the machine and clears its subscription and cleanup collections. Toast has no controlled `open`/`onOpenChange` contract in Zag 1.44.0, so its controlled-state case is N/A; its uncontrolled dismissal is tested.

| Primitive     | Unit                                       | Keyboard                                                         | axe-core in Chromium, Firefox, WebKit | DOM-free import |
| ------------- | ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------- | --------------- |
| Checkbox      | Pass                                       | Pass — Space and Tab                                             | Pass — 3 engines, no violations       | Pass            |
| Switch        | Pass                                       | Pass — Space                                                     | Pass — 3 engines, no violations       | Pass            |
| Radio group   | Pass                                       | Pass — arrows and Tab                                            | Pass — 3 engines, no violations       | Pass            |
| Select        | Pass                                       | Pass — Home/End, typeahead, Enter, Escape; Tab gap recorded      | Pass — 3 engines, no violations       | Pass            |
| Tabs          | Pass                                       | Pass — arrows, Home/End, Tab                                     | Pass — 3 engines, no violations       | Pass            |
| Accordion     | Pass                                       | Pass — Enter/Space and Tab                                       | Pass — 3 engines, no violations       | Pass            |
| Dialog        | Pass                                       | Pass — trapped Tab/Shift+Tab, Escape, focus return               | Pass — 3 engines, no violations       | Pass            |
| Popover       | Pass                                       | Pass — Escape and focus return; WebKit Tab probe documented      | Pass — 3 engines, no violations       | Pass            |
| Tooltip       | Pass                                       | Pass — Tab focus and Escape                                      | Pass — 3 engines, no violations       | Pass            |
| Dropdown menu | Pass                                       | Pass — arrows, Home/End, typeahead, Escape, Tab behavior checked | Pass — 3 engines, no violations       | Pass            |
| Toast         | Pass — uncontrolled; controlled N/A in Zag | Pass — status focus and dismissal behavior checked               | Pass — 3 engines, no violations       | Pass            |

RTL arrow behavior is tested for RadioGroup and Tabs in all three engines. The final primitive browser matrix ran **72 tests with one worker and retries disabled**: 24 cases per browser (11 keyboard, 11 axe, and 2 RTL cases). All passed. The 33 axe runs reported no violations.

A separate production consumer build confirms that importing `@benosjs/primitives/checkbox` includes the checkbox adapter but none of the other ten machine entries; a consumer importing no primitive includes zero primitive modules.

## Zag behaviors that differ from APG expectations

These are observations of Zag 1.44.0's public connectors, not adapter patches. Axe reports no violations for the tested fixtures.

- **Switch role:** Zag's connector exposes a hidden checkbox input (role `checkbox`) and marks its visible control `aria-hidden`; it does not expose the APG `switch` role. The adapter preserves Zag's output.
- **Select Tab:** Zag leaves the popup open and keeps focus on the listbox when Tab is pressed, while the APG Select-Only Combobox pattern expects Tab to leave the popup. This occurs in Chromium, Firefox, and WebKit and is recorded without adapter key interception.
- **Dropdown menu Tab:** Zag's `isValidTabEvent` guard keeps the menu open when Tab is pressed, while the APG Menu Button pattern expects Tab to leave and close the menu. The test records the observed behavior rather than changing it.
- **Toast keyboard model:** Zag renders the toast as a focusable `status` and dismisses it on Escape. This differs from the APG Alert pattern, where alerts do not take focus and have no keyboard interaction. Toast's status behavior is documented rather than patched.
- **Radio group RTL in WebKit:** Zag delegates arrow selection to the native radio behavior; in WebKit, ArrowLeft in RTL leaves the first radio selected. Chromium and Firefox move selection as expected. The browser-specific result is asserted and recorded; the adapter does not synthesize a replacement key model.
- **Popover Tab order in WebKit:** a diagnostic traversal from the autofocus input moved to the following outside button rather than the close trigger; Chromium and Firefox moved to the close trigger. Popover has no dedicated APG pattern, axe reported no violation, and this WebKit-specific result has not been isolated to the browser or Zag connector, so no adapter workaround was added.

## Verification

All commands were run locally with Node 22.18.0. Production output was rebuilt before measuring bundle sizes.

| Check                                                                                | Result                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm build`                                                                         | Pass                                                              |
| `pnpm size`                                                                          | Pass; measured sizes below                                        |
| `pnpm test`                                                                          | Pass — 186 tests                                                  |
| `pnpm exec playwright test --workers=4 --retries=0`                                  | Pass — 102 browser tests across Chromium, Firefox, and WebKit     |
| `pnpm exec playwright test tests/browser/primitives.spec.ts --workers=1 --retries=0` | Pass — 72 primitive cases, no retries                             |
| `pnpm lint`                                                                          | Pass — ESLint and Prettier                                        |
| `pnpm typecheck:types`                                                               | Pass                                                              |
| `pnpm check:doc-examples`                                                            | Pass — 7 files                                                    |
| `pnpm check:jsx-types`                                                               | Pass — generated declarations current                             |
| `pnpm check:public-imports`                                                          | Pass                                                              |
| `pnpm check:packed`                                                                  | Pass — 7 publishable packages                                     |
| `pnpm check:engines`                                                                 | Pass — 1,625 package manifests checked                            |
| `pnpm --filter create-benos test`                                                    | Pass — 2 CLI tests; scoped to the CLI test file                   |
| `pnpm bench:guard`                                                                   | Pass — all five production kernel workload ratios below 2× Preact |

The kernel benchmark medians are recorded in [benchmarks/README.md](../../benchmarks/README.md).

## Production bundle sizes

| Artifact                         |          Measured |       Budget | Remaining |
| -------------------------------- | ----------------: | -----------: | --------: |
| `@benosjs/core`                  |  4,051 gzip bytes |  4,096 bytes |  45 bytes |
| `@benosjs/core` + `@benosjs/dom` | 10,200 gzip bytes | 10,240 bytes |  40 bytes |

Both approved budgets pass. `createUniqueId()` runs during primitive setup, not on signal, computed, or effect update paths.

## Remaining scope

U2 delivers headless Zag machine adapters, not styled registry components. Applications and the later registry own their rendered markup and styling. Toast also requires Zag's public toast-group `parent` service. The primitive package root has no runtime export; consumers import a machine from its public subpath.

**Checkpoint result:** U2 test coverage is complete. The deviations above remain documented Zag behavior. Stop for review before U3.

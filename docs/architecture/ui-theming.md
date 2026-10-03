# UI theming and visual tokens

**Status:** U1 design approved; U2 brand assets are in use; U4 token implementation later. Token names are a hard-to-reverse API and remain provisional until U4 review.

**Scope label:** designed now, built later (U4; required for 0.2.0).

## Goals

- Provide a recognizable Benos default theme with light and dark schemes.
- Let copied components be restyled through readable CSS variables without a utility framework.
- Support system preference, explicit theme override, RTL, keyboard focus, and reduced motion.
- Keep token CSS optional and outside @benosjs/core and @benosjs/dom.

## Non-goals

- A visual theme editor, runtime styling engine, or design-tool integration.
- Requiring Tailwind, CSS-in-JS, or a CSS build plugin.
- Hard-coded left-to-right layout or a required downloadable font.
- Treating logo pixels as a complete accessible palette without contrast testing.

## Brand reference and palette

The approved marks are `assets/brand/benos-mark-navy.png` and `assets/brand/benos-mark-light.png`; they match the variants used on the Benos website. The navy artwork's measured primary color is **#12306B**. Use the navy mark against light surfaces and the white mark against dark surfaces, selected with `<picture>`/`prefers-color-scheme` for the starter and favicon. GitHub/npm Markdown has no reliable color-scheme image selection, so READMEs use the navy mark on their light rendering surface. Do not use the old `assets/benos-logo.png` in new UI assets.

Proposed semantic color tokens, with values to validate against WCAG contrast during U4:

- --benos-color-brand and --benos-color-brand-strong: #12306B and a darker pressed/focus value, with accessible foreground contrast.
- --benos-color-canvas: light page surface selected to complement the mark while meeting contrast requirements.
- --benos-color-surface and --benos-color-surface-raised: cards, fields, menus, and overlays.
- --benos-color-text and --benos-color-text-muted: primary and secondary text.
- --benos-color-border and --benos-color-focus: boundaries and a high-contrast focus indicator.
- --benos-color-danger, --benos-color-success, and --benos-color-warning: semantic states independent of brand blue.
- --benos-color-on-brand: foreground on brand fills, chosen after contrast checks.

Dark tokens are semantic remappings, not opacity inversions. Preserve legibility, boundaries, focus rings, disabled contrast, and status meaning. The supplied white mark is used on dark surfaces; the dark canvas and interactive brand surface must remain distinct from the mark and meet contrast requirements. Use the white variant when system or explicit theme selects dark mode; test normal and large text sizes against actual assets.

## Token set

| Family     | Proposed names                                                                                                                                                                                                                                                                                                  | Notes                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Color      | --benos-color-brand, --benos-color-brand-strong, --benos-color-canvas, --benos-color-surface, --benos-color-surface-raised, --benos-color-text, --benos-color-text-muted, --benos-color-border, --benos-color-focus, --benos-color-danger, --benos-color-success, --benos-color-warning, --benos-color-on-brand | Semantic names mapped separately per scheme.      |
| Spacing    | --benos-space-1, --benos-space-2, --benos-space-3, --benos-space-4, --benos-space-5, --benos-space-6, --benos-space-7, --benos-space-8                                                                                                                                                                          | A small scale; fluid values only when documented. |
| Radius     | --benos-radius-sm, --benos-radius-md, --benos-radius-lg, --benos-radius-pill                                                                                                                                                                                                                                    | Shared control/surface rounding.                  |
| Typography | --benos-font-sans, --benos-font-mono, --benos-text-xs, --benos-text-sm, --benos-text-md, --benos-text-lg, --benos-text-xl, --benos-line-height-body, --benos-line-height-heading                                                                                                                                | System-first stacks avoid font downloads.         |
| Shadow     | --benos-shadow-sm, --benos-shadow-md, --benos-shadow-overlay                                                                                                                                                                                                                                                    | Elevation is never the only grouping cue.         |
| Motion     | --benos-motion-fast, --benos-motion-normal, --benos-ease-standard                                                                                                                                                                                                                                               | Honor reduced-motion preferences.                 |
| Layering   | --benos-z-dropdown, --benos-z-popover, --benos-z-dialog, --benos-z-toast                                                                                                                                                                                                                                        | A shared documented overlay scale.                |

The listed names are the complete proposed public token set; exact values and whether every token ships are U4 decisions. Renaming published tokens is costly. Keep tokens under :root/theme selectors and avoid a broad reset that changes host typography or box sizing.

## CSS API: theme selection and token contract

benos init installs one token stylesheet at the configured path. Each copied component uses semantic tokens and may define private --_benos-* variables for calculations.

- With no explicit attribute, prefers-color-scheme: dark selects the dark map.
- data-theme="light" or data-theme="dark" on the app root overrides the system.
- data-theme="auto" returns to system preference. CSS alone must render a usable initial theme.
- Tokens inherit into nested containers. Portal content outside a themed subtree needs an explicit theme on the portal target/content or the app must theme the target.
- U1 does not require persisted preference or an inline script. If a later starter adds persistence, document a CSP-compatible mechanism.

Classes are namespaced, e.g. .benos-button and .benos-dialog. Public customization uses documented class props, CSS variables, and ordinary selectors. Examples use class, not className, because Benos rejects className in JSX. No runtime JavaScript is required for theme selection.

## RTL and writing direction

Use logical CSS such as margin-inline, padding-block, inset-inline-start, border-inline-start, and text-align: start. Markup inherits dir from the application. Use :dir(rtl) only for cases logical properties cannot express, such as direction-specific icon artwork. Do not globally set direction from a component stylesheet.

Overlay placement and keyboard behavior use logical start/end. Horizontal-navigation arrow behavior follows each component interaction contract and is tested in RTL. Numeric inputs and code labels keep their natural direction unless specified.

## Styling decision: plain CSS

Plain CSS plus custom properties is the v0.2.0 default. Copied source should work with the Vite setup already shipped by create-benos. A mandatory Tailwind pipeline would bind every consumer to extra build configuration and a utility version. CSS keeps tokens inspectable and lets users edit a component without learning generator-specific class syntax. One stylesheet per copied component keeps ownership clear; benos init adds the shared token file once.

Trade-offs: CSS names can collide, and importing every stylesheet may include unused rules. Namespacing, per-component files, and production consumer tests reduce this risk. A Tailwind preset is **later** work, not a second required API.

## Trade-offs versus related libraries

| Project                                                                 | Styling                                                    | Benos comparison                                                                                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [shadcn/ui](https://ui.shadcn.com/docs)                                 | Source copied to apps, commonly Tailwind-driven.           | Similar source ownership; plain CSS avoids requiring Tailwind in each Benos project, at the cost of stylesheet files. |
| [Radix](https://www.radix-ui.com/primitives/docs/overview/introduction) | Unstyled React primitives.                                 | Radix leaves styling to apps. Benos supplies editable defaults and tokens while behavior comes from Zag.              |
| [Ark UI](https://ark-ui.com/docs/overview/about)                        | Zag-based cross-framework components, styled by consumers. | Benos follows machine separation and includes source-owned CSS defaults.                                              |
| [Kobalte](https://kobalte.dev/docs/core/overview/introduction/)         | Unstyled Solid components.                                 | Kobalte fits Solid's ecosystem; Benos uses ordinary CSS to avoid a framework-specific style dependency.               |

## Edge cases

- Host resets: keep selectors local; never inject a global reset from component CSS.
- Missing/nested theme attributes: system preference and inherited tokens are the fallback.
- Portal target outside themed subtree: document and test token inheritance.
- Forced-colors mode: preserve high contrast and focus; do not hide outlines.
- Reduced motion: remove nonessential transitions when requested by the OS.
- Invalid user token override: rely on CSS fallback/inheritance; do not add runtime validation.
- Treat the supplied logo variants and their actual backgrounds as authoritative; do not assume transparency or synthesize a variant that is not present.

## Test plan for U4

- Screenshot/computed-style fixtures for light, dark, auto, nested theme, and explicit override.
- axe-core and contrast checks for text, focus, status, disabled, and overlay states; manually review what automation cannot judge.
- Chromium, Firefox, WebKit keyboard/focus runs in LTR and RTL.
- Assert logical CSS properties and that dark mode works without a JS toggle.
- Emulate reduced motion and forced colors.
- Production build confirms token and component CSS enter only when imported/copied.

## Hard-to-reverse decisions

- Public token names and semantics.
- Light/dark activation and explicit/system precedence.
- CSS file ownership, namespace, class names, and plain-CSS default.
- Whether component styles inherit global resets or emit global styles.
- RTL interaction direction and portal theme inheritance.

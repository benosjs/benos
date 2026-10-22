# F4 — Field and UI adapter

**Status:** F4 approved on 2026-10-22 with the recommended registry option. The user's words: "Approve F4 with the recommended option: fix the registry gaps in F6. Start F5." The `Input`/`Textarea` `aria-invalid` binding and the `Checkbox`/`Switch` `aria-describedby` forwarding are fixed in F6 with the 0.5.0 registry build. F5 has begun.

## Delivered

- **Approval recorded.** [f-f3](f-f3.md), [the track plan](../forms-plan.md), and [forms.md](../architecture/forms.md) record the F3 approval and the cap decision: the forms cap is **3,072 B** (from 2,560 B), still 721 B below Modular Forms (3,793 B). `pnpm size` enforces it.
- **`<form.Field>`** in [`packages/forms/src/index.ts`](../../packages/forms/src/index.ts): a `benos-field` wrapper with `data-invalid`, a `<label for>` (or the label as the control's children or `label` prop, per adapter), the control with `id`, `name`, the bound value and handlers, `invalid`, and a merged `aria-describedby` (description, visible error, then the caller's ids), an optional description, and an error paragraph rendered only while an error is visible, with no live-region role.
- **Field handles** gain `id`, `errorId`, and `describedBy()` for headless layouts.
- **Adapters:** `text` (default; `Input`, `Textarea`), `checked` (`Checkbox`, `Switch`), `choice` (`RadioGroup`), and `select` (single-choice `Select`). See the [F4 implementation notes](../architecture/forms.md#f4-implementation-notes) for why there are four.
- **Focus:** a failed submit focuses the first invalid field in JSX order, reaching into composite controls for their focusable element.
- **Field CSS:** [`registry/source/css/field.css`](../../registry/source/css/field.css) (wrapper, description, and error styles with existing tokens). Its registry item is added with the 0.5.0 registry build in F6 (implementation note 8).
- **`@benosjs/dom`** is now a runtime dependency of `@benosjs/forms` (public `jsx`, `Show`, `mergeProps`, `splitProps`).

## Finding 1: compiler bug, fixed

`<form.Field>` compiled to `__benos_jsx("form".Field, …)`, which throws "Invalid Benos JSX element type". The compiler turned the lowercase object of a JSX member tag into a string, as if it were an intrinsic element. The flagship editor uses exactly this form, so it could not have run. [`packages/compiler/src/index.ts`](../../packages/compiler/src/index.ts) now compiles member tags as values in both optimization modes. Regression test: [`compiler.test.ts`](../../packages/compiler/tests/compiler.test.ts) › `compiles member tags with a lowercase object as component values` (`form.Field` and `ui.forms.Input`, `none` and `safe`). The compiler has no size budget and no public API change; existing compiler tests and the full browser suite pass.

## Finding 2: registry gaps — decision needed

The browser tests found two accessibility gaps in the **0.4.0 registry components**. `<form.Field>` passes the right props; the components do not apply them as the flagship assumes:

1. **`Input` and `Textarea` read `invalid` once during setup.** `aria-invalid`, `data-invalid`, and the danger border keep their initial value. After a failed submit, the field's error is rendered and linked by `aria-describedby`, but the input still says `aria-invalid="false"`. Pinned by the expected-to-fail browser test `registry Input reflects invalid after a failed submit`, which will start passing (and must then lose its `test.fail`) when the components are fixed.
2. **`Checkbox` and `Switch` put `aria-describedby` on their root `<label>`,** not on the hidden input that has the checkbox or switch role, so a screen reader does not read the description or error for them. `RadioGroup` and `Select` put it on their root group, which works.

Fixing either changes the registry source, and therefore the immutable **0.4.0** item payloads and checksums that `pnpm registry:check` pins. Options:

- **(Recommended) Fix both in F6** with the 0.5.0 registry build, which already has to add the `field` item. Make `aria-invalid` a binding in `Input` and `Textarea`, and forward `aria-describedby` to the hidden input in `Checkbox` and `Switch`. The flagship statement "no UI component API change is assumed" stays true: these are behavior fixes, not API changes. Until then, F5's flagship editor shows linked errors and focus, but not `aria-invalid` on inputs.
- **Fix them now on `forms`** and rebuild the registry with `--release 0.5.0` early. This repoints every item URL to a `v0.5.0` tag that does not exist yet, so this branch must not merge to `main` before the release.

## Tests

| F4 gate from the plan                                                      | Test                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label, id, name, description, error, `aria-describedby`                    | [`field.test.ts`](../../packages/forms/tests/field.test.ts) › `wires the label, id, name, value, description, and error`; [`forms.spec.ts`](../../tests/browser/forms.spec.ts) › `labels, descriptions, and errors are linked to the controls` (accessible names and descriptions computed by each browser)                                                                              |
| User `aria-describedby` merging, blur marks touched                        | `field.test.ts` › `merges a user aria-describedby and marks the field touched on blur`                                                                                                                                                                                                                                                                                                   |
| Focus of the first invalid field                                           | `field.test.ts` › `focuses the first invalid field in JSX order after a failed submit`; `forms.spec.ts` › keyboard test (Enter in a text input submits, focus lands on the unchecked `Checkbox`'s input)                                                                                                                                                                                 |
| Registry `Input`, `Textarea`, `Checkbox`, `Switch`, `Select`, `RadioGroup` | `forms.spec.ts` › `keyboard entry, focus on the first invalid field, and a successful save`: typing, Tab, Space on checkbox, switch, and radio, the Select listbox, and the saved values                                                                                                                                                                                                 |
| axe                                                                        | `forms.spec.ts` › `axe before and after a failed submit in light, dark, RTL, and dark RTL` (no violations, including with five errors shown)                                                                                                                                                                                                                                             |
| RTL layout                                                                 | `forms.spec.ts` › `inherit RTL direction without forcing LTR`, plus the RTL axe runs                                                                                                                                                                                                                                                                                                     |
| Adapters                                                                   | `field.test.ts` › `checked`, `choice`, and `select` adapter tests (label placement, value mapping, touched on change)                                                                                                                                                                                                                                                                    |
| Unique ids per form                                                        | `field.test.ts` › `gives each form instance its own ids`                                                                                                                                                                                                                                                                                                                                 |
| Types                                                                      | [`types.test.ts`](../../packages/forms/tests/types.test.ts) › `checkFieldTypes` against the real registry component types: valid pairs for all six controls; errors for a misspelled name, `text` on a `number` field, `checked` on a `string` field, `choice` with `Select`, a forwarded prop of the wrong type, an unknown prop, a missing label, and a controlled prop passed by hand |

Each browser test runs in Chromium, Firefox, and WebKit.

Totals: `pnpm test` **454 / 454** in 43 files, with the forms suite at 52 / 52 (7 new field tests) and 1 new compiler test. In the first run, `tests/consumer-project.test.ts` failed while the full browser suite was using the same machine; it passed when rerun alone. `pnpm test:browser`: **486 tests: 483 passed**, counting the known-gap test's 3 expected failures (one per browser) as passes, and **3 failed**. The 3 failures were Chromium-only, in `batch3.spec.ts` (dropdown menu keyboard, toast axe) and `primitives.spec.ts` (radio group keyboard). None of them touch forms. They ran while the unit suite loaded the machine, and both files passed in full on an isolated Chromium rerun (82 / 82). `pnpm typecheck:types`, `pnpm lint`, `pnpm build`, `pnpm registry:check`, `pnpm check:doc-examples`, `pnpm check:public-imports`, `pnpm check:jsx-types`, `pnpm check:engines`, and `pnpm bench:guard` pass.

**CI for F3 (`aa96063`, PR #18):** passed, all checks, both runs. No failures to fix.

## Size

| Bundle                                      |       F3 |          F4 |     Cap |
| ------------------------------------------- | -------: | ----------: | ------: |
| **forms**                                   |  2,058 B | **2,774 B** | 3,072 B |
| core + DOM + async + router + query + forms | 22,490 B |    23,085 B |       — |

Core, DOM, async, router, and query are unchanged: **0 B** added to budgeted packages. The compiler fix changes no runtime package.

### Bytes per part

| Part                                                       | F1 estimate |       Measured |
| ---------------------------------------------------------- | ----------: | -------------: |
| Form core (F2)                                             | 910–1,240 B |        1,487 B |
| Validation (F3)                                            |   220–300 B |         +571 B |
| `<form.Field>`, ids, aria wiring, adapters (F4), all parts |   320–440 B |     **+716 B** |
| — of which the `Field` view and the `text` adapter         |             |         ~404 B |
| — of which `checked` / `choice` / `select`                 |             | 41 / 22 / 38 B |
| — of which focus on the first invalid field                |             |         ~107 B |
| — the rest: handle ids and `describedBy`, DOM imports      |             |          ~87 B |
| Leave policy wiring (F5)                                   |     50–80 B |              — |

Per-part figures come from builds with one part removed; gzip makes them approximate. The `pnpm size` row counts every export, including all four adapters; an application pays only for the adapters it imports. **Headroom is 298 B** for F5, whose forms-side estimate is 50–80 B, so the 3,072 B cap is not at risk. The router blocker is a router change with its own report in F5.

## Next

On approval, F5 implements the router navigation blocker and `leave` policy, the flagship editor as executable code with exact line counts, an editor in `examples/dashboard`, the measured React comparison, and `docs/forms-findings.md`.

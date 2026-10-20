# F3 — Standard Schema validation

**Status:** Awaiting approval, including one size decision below. F4 has not begun.

## Delivered

- **Approval recorded.** [f-f2](f-f2.md) and [the track plan](../forms-plan.md) record the F2 approval.
- **Validation** in [`packages/forms/src/index.ts`](../../packages/forms/src/index.ts): the `validate` option (`submit` by default, `blur`, `change`), revalidation on every change after a submit attempt, sync results applied in the same call, async results guarded by a generation counter, `validating()`, thrown and rejected validators as root issues, and `submit` validating its own snapshot and passing the schema **output** to the mutation.
- **Issues:** `form.issues()`, `field.error()`, and `field.invalid()`; path normalization for `PropertyKey` and `{ key }` segments; mapping to the exact field, then the nearest ancestor field, then the root; symbol segments as root issues; and a development warning once per unmatched path. `form.error()` shows the first root issue after a submit attempt, and the save error otherwise.
- **Server issues:** a mutation error carrying Standard Schema issues (for example a 422) maps to fields.
- **Libraries:** `zod` 4.6.7, `valibot` 1.5.0, and `arktype` 2.2.8 as dev dependencies of `@benosjs/forms` only.
- **Design notes:** [F3 implementation notes](../architecture/forms.md#f3-implementation-notes) list six refinements. One changes behavior: in `change` mode, an edit marks the field touched, so its error shows without waiting for blur.

## Tests

| F3 gate from the plan                         | Test ([`validation.test.ts`](../../packages/forms/tests/validation.test.ts))                                                                                                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod, Valibot, and ArkType                     | `zod/valibot/arktype schemas › block invalid input and map nested and array issues to fields`: the same form with each library, nested (`address.city`) and array (`tags.1`) paths, and a valid submit passing parsed values                                                                                          |
| Nested and array paths, `PathSegment` objects | the library tests above (Valibot emits segment objects); `normalizes segment objects, maps to the nearest field, and falls back to the root`                                                                                                                                                                          |
| Root issues                                   | the mapping test above (no path, unknown field, symbol segment); `shows a root issue before the save error`                                                                                                                                                                                                           |
| Async validator superseded by a newer edit    | `drops a result superseded by a newer edit and tracks validating()`                                                                                                                                                                                                                                                   |
| Submit awaiting async validation              | `makes submit wait for the async result`                                                                                                                                                                                                                                                                              |
| Transforms with a different output type       | `passes the schema output, not the input, to the mutation` (Zod `coerce.number` and `transform`)                                                                                                                                                                                                                      |
| Invalid input never reaches the mutation      | the library tests (no mutation input after an invalid submit); `turns a throwing or rejecting validator into a root issue`                                                                                                                                                                                            |
| Timing modes and visibility                   | `does not validate before the first submit in 'submit' mode`; `revalidates on every change after a failed submit, in the same call`; `validates on blur in 'blur' mode…`; `validates and shows errors on every change in 'change' mode`; `clears issues and the attempt after a successful save, and on reset`        |
| Mutation errors carrying issues               | `maps a mutation error that carries Standard Schema issues to fields`; `keeps a plain mutation error as the form error`                                                                                                                                                                                               |
| Issues follow the record                      | `hides issues and the submit attempt after the source changes record`                                                                                                                                                                                                                                                 |
| Types                                         | [`types.test.ts`](../../packages/forms/tests/types.test.ts) › `checkLibraryTypes`: Zod input and output inference with `coerce` and `transform`, a mutation typed with the input rejected, Valibot array paths, ArkType nested paths and rejected names, the issue and error accessor types, and the `validate` modes |

Totals: `pnpm test` **447 / 447** in 42 files (17 new). `pnpm typecheck:types`, `pnpm lint`, `pnpm build`, `pnpm check:doc-examples`, `pnpm check:public-imports`, `pnpm check:jsx-types`, `pnpm check:engines`, and `pnpm bench:guard` pass. `pnpm test:browser` was not run locally: F3 adds no DOM behavior.

**CI for F2 (`fadeb3f`, PR #18):** passed, all 38 checks, including `verify` (unit and browser suites in Chromium, Firefox, and WebKit) and the UI CLI and `create-benos` matrices on Ubuntu, Windows, and macOS. No failures to fix.

## Size

| Bundle                                      |       F2 |          F3 |     Cap |
| ------------------------------------------- | -------: | ----------: | ------: |
| **forms**                                   |  1,487 B | **2,058 B** | 2,560 B |
| core + DOM + async + router + query + forms | 21,958 B |    22,490 B |       — |

Core, DOM, async, router, and query are unchanged (4,303, 11,006, 1,644, 6,349, and 3,498 B): **0 B** added outside the package.

### Bytes per part

| Part                                                                            |                    F1 estimate |   Measured |
| ------------------------------------------------------------------------------- | -----------------------------: | ---------: |
| Form core (F2: sources, paths, field store, values/reset/rebase, submission)    |                    910–1,240 B |    1,487 B |
| Validation (F3), all parts                                                      | 220–300 B + part of submission | **+571 B** |
| — of which mutation-error issue mapping                                         |                                |       38 B |
| — of which the nearest-ancestor fallback                                        |                                |       34 B |
| — of which the async path (`then`, `validating()`)                              |                                |       22 B |
| — of which `change` mode marking touched                                        |                                |       10 B |
| — the rest: generations, normalization, visibility, root error, modes, clearing |                                |     ~467 B |
| `<form.Field>`, ids, aria wiring, three adapters (F4)                           |                      320–440 B |          — |
| Leave policy wiring (F5)                                                        |                        50–80 B |          — |

The per-feature figures were measured by building copies with one feature removed; gzip makes them approximate and not additive. Validation cost about twice its estimate, and the form core about 30% more. **Headroom is now 502 B** for F4 and F5, whose estimates total 370–520 B. With the overrun seen so far, F4 alone is likely 450–650 B, so **the 2,560 B cap is at risk**. Deduplicating the record-tag checks saved only 7 B, because gzip already absorbs the repetition.

## Decision: the forms size cap

1. **(Recommended) Raise the forms cap to 3,072 B.** That is +512 B, still 721 B below Modular Forms (3,793 B) and about a quarter of TanStack Form's core (13,016 B). No behavior or flagship change.
2. **Keep 2,560 B and move `<form.Field>` to a subpath** (`@benosjs/forms/field`) with its own budget. `form.Field` cannot exist on the instance without importing it, so the flagship editor would write `<Field form={form} name="name" … />`: longer lines, and Prettier may wrap them, which changes the 13-line count.
3. **Keep 2,560 B and drop approved behavior:** server issue mapping, the ancestor fallback, and the async path together save about 94 B. That is probably not enough, and it removes approved features.

## Next

On approval, F4 builds `<form.Field>`, `form.field()` wiring, the `text`, `checked`, and `choice` adapters, focus on the first invalid field, and the registry field CSS, with browser and accessibility tests, and reports bytes per part against the approved cap.

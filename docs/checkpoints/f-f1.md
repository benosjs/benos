# F1 — Forms design review

**Status:** F1 approved on 2026-10-20. The user's words: "Approve all nine forms design decisions, including the router navigation blocker, apply the flagship amendments, and start F2." The flagship amendments are applied to [flagship-integration.md](../architecture/flagship-integration.md). F2 has begun.

## Deliverables

- [The track plan](../forms-plan.md) is the source of truth for F0–F6, in the format of the query track.
- [Forms architecture](../architecture/forms.md) specifies `formModel` and its three sources, the form instance and field handles, the epoch-tagged state model and identity rules, Standard Schema validation timing and issue mapping, submission through a query mutation, `<form.Field>` and its adapters with accessibility wiring, type inference and type errors, package boundary and budget, changes outside the package, flagship amendments, race cases, and trade-offs against TanStack Form, React Hook Form, Felte, and Modular Forms.
- The [architecture index](../architecture/README.md) links the new design.

## Decisions proposed for approval

1. **New package `@benosjs/forms`** with a **2,560 B** minified + gzip cap (core, DOM, async, router, and query external). The estimate is 1,500–2,060 B. It imports core and DOM public APIs, router only for the blocker (decision 6), and query **types only**.
2. **Identity from the committed source handle; pristine fields are derived.** A form's epoch is the `match.data()` handle (or the `source` result). Only edits hold state, tagged with their epoch. This gives all four identity rules without effects or reset writes: reset at commit and never before, pristine fields follow same-identity refetches, dirty fields are never overwritten, and `remoteChanged`/`acceptRemote` handle conflicts.
3. **Schema-only validation through Standard Schema v1.** The whole value is validated (the spec has no partial validation). Default timing is validate on submit, then on every change after the first submit (React Hook Form's default). Sync results apply in the same flush; async results are generation-guarded. Issues map to the exact field, then the nearest ancestor field, then the root, so none are dropped.
4. **Default mutation input `{ ...params, values }`** for route-bound forms, type-checked against the mutation's input, with an `input` option to override. This is what keeps the flagship `formModel` free of an `input` line. The alternative is to require `input` always (+1 setup line in the flagship).
5. **Submission semantics.** `form.submit` never rejects; a pending submission makes the next one resolve `busy`; the submission snapshots values and params; a failed validation focuses the first invalid field; success rebases only the fields still equal to what was submitted; a mutation error carrying Standard Schema `issues` maps to fields; a save that finishes after navigation or disposal writes no form state but still refreshes its record through `affects`.
6. **Router navigation blocker, and `leave: 'confirm'` as the forms default.** Runtime router change: an owner-bound `blockNavigation({ when, confirm })` that fills in the `blocked` navigation status 0.4 already reserves, adds `'blocked'` to `NavigationResult`, restores refused pops (which needs an entry index added to the history metadata), and handles `beforeunload`. Estimate **+200–300 B** against **819 B** of router headroom. Forms default to `window.confirm` while dirty; `'discard'` and a custom async confirm are options. **Fallback** if declined: no router change, and edits are discarded at commit (still never carried into the next record).
7. **`<form.Field>` lives in the package** and renders a label, the component, an optional description, and an error with stable ids, `aria-describedby`, and `invalid`. Adapters `text`, `checked`, and `choice` cover `Input`, `Textarea`, `Checkbox`, `Switch`, `Select`, and `RadioGroup` with no registry component API change. The registry gains a CSS-only `field` item for the `benos-field*` classes in F4. `form.field()` is the headless escape hatch.
8. **Flagship amendments** (listed in forms.md, not applied): `from` must be pure; the default input shape; `leave: 'confirm'`; what "root issues in the alert" means; the full set of props passed to `Input`. The editor block stays at 13 lines and the shared setup does not grow.
9. **Deferred from 0.5:** field arrays with keyed insert/remove/move, per-field validators, debounced async validation, wizards, file inputs, and SSR of forms.

## Size and repository boundary

Q6 measured core **4,303 / 4,608 B**, core + DOM **11,006 / 11,264 B**, async **1,644 / 4,096 B**, query **3,498 / 3,584 B** (86 B headroom), router **6,349 / 7,168 B** (819 B headroom), and core + DOM + async + router + query **20,829 B**. F1 is documentation only: **0 B added to any package**. The design expects 0 B in core, DOM, async, and query, and +200–300 B in the router if decision 6 is approved.

Peer surface measurements, made in an isolated temporary install with the query track's esbuild settings: `@tanstack/form-core` 1.33.5 **13,016 B**, `@tanstack/solid-form` **15,667 B**, `@tanstack/react-form` **17,483 B**, `react-hook-form` 7.90.0 **13,313 B** (14,662 B with the Standard Schema resolver), `@felte/solid` 1.2.14 **9,071 B**, and `@modular-forms/solid` 0.25.1 **3,793 B**. Method and export lists are in forms.md.

No dependency, configuration, source code, or public API was changed. The branch `forms` is cut from `query` at `dc83328` and holds only these documents.

## Validation and open risks

- Prettier checked the new documents. No runtime or type tests ran, because F1 is design only. The router claims were checked against the source: `navigation()` already types a `blocked` status that nothing produces, and `browserHistory` stores a random per-entry key without a position.
- **Whole-schema validation per keystroke after a failed submit.** Cheap for ordinary schemas, but an async refinement would hit the server on every keystroke. The guide must steer expensive checks to `validate: 'submit'` or to server-side `issues` from the mutation. Debouncing is deferred.
- **`FieldPath` depth.** Typed paths stop at depth 8 to bound checker cost; F2 measures it.
- **Ids are not hydration-stable.** A per-instance counter is fine for client rendering; the SSR track needs a request-scoped seed.
- **The blocker's pop restoration** is the riskiest router piece: a refused back navigation must restore the browser entry without a visible flash or a second navigation. F5 tests it in all three browsers; if it cannot be made reliable, the fallback is to block only link and programmatic navigations plus `beforeunload`, and document that a refused pop discards edits.
- **Router import from forms.** Decision 6 makes forms import the router for the blocker. F5 must measure that a non-route form does not pay for it; if it does, the route binding moves to a separate entry point.

## Next

All nine decisions are approved, including decision 6. F2 builds the form core. The router blocker is built in F5 with its own byte report; F2–F4 do not depend on it.

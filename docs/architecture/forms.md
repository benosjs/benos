# Forms, validation, and the flagship binding

**Status:** F1 design approved on 2026-10-20, including the router navigation blocker (decision 6). The form core (F2), Standard Schema validation (F3), `<form.Field>` with its adapters (F4), and the leave policy with the router navigation blocker (F5) are implemented; differences from this design are in the [F2](#f2-implementation-notes), [F3](#f3-implementation-notes), [F4](#f4-implementation-notes), and [F5](#f5-implementation-notes) implementation notes. [The track brief](../forms-plan.md) sets scope; [the flagship target](./flagship-integration.md) is the compatibility test; [query.md](./query.md) and [router.md](./router.md) define the contracts this package builds on. Numbered decisions refer to the list in the [F1 checkpoint](../checkpoints/f-f1.md#decisions-proposed-for-approval).

## Goals and boundary

A form is an editable copy of server data plus the rules for turning edits into a mutation. In Benos it must join the signal graph the same way a query observer does: synchronous reads, no component reruns, owner-bound lifetime, and async work (validation, saving) that completes through ordinary batched writes guarded by generations.

Design rules:

1. **Identity comes from the committed source, not from the component.** A form instance follows the identity of its source: for a route-bound form, the `QueryEntry` handle in `match.data()`. A new handle (which the router publishes only at commit) is a new identity; an in-place change of `value()` is a same-identity refetch. No `key` prop, remount, or reset effect is needed.
2. **Pristine fields are derived, dirty fields are owned.** A field the user has not changed has no state of its own: its value is read from the current server projection. Only an edit creates field state. So pristine fields follow refetches for free, and dirty fields cannot be overwritten because nothing writes them except the user.
3. **The schema is the only validator.** Validation goes through Standard Schema v1. There are no per-field validator functions in 0.5; cross-field and async rules live in the schema, and issue paths say where they belong.
4. **Submitting never throws.** `form.submit` resolves to a result and records failure in form state, like `mutation().run`.
5. **Accessible by default, headless when needed.** `<form.Field>` renders the label, description, and error with stable ids. `form.field()` exposes the same wiring for custom layouts.

Not in 0.5: field arrays with insert/remove/move helpers (array paths are addressable, but there are no keyed array operations), per-field validators, multi-step wizards, file inputs, SSR, and schema introspection (Standard Schema cannot list field names).

## Package boundary and size budget

The new public package is **`@benosjs/forms`**. Runtime imports:

| Package           | Used for                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@benosjs/core`   | `signal`, `computed`, `batch`, `untrack`, `onCleanup` (public API only)                                                                                       |
| `@benosjs/dom`    | JSX runtime, `Show`, `mergeProps`, `splitProps` for `<form.Field>` (public API only)                                                                          |
| `@benosjs/router` | `blockNavigation` for the leave policy, **only if decision 6 is approved**; otherwise no router import                                                        |
| `@benosjs/query`  | **Types only** (`Mutation`, `MutationHandle`, `MutationResult`, `QueryEntry`). Mutations are called through their own methods, so there is no runtime import. |

Route references are used structurally (`route.match()` is a method on the reference), so binding a form to a route needs no router import. Standard Schema types are vendored as types, as the specification recommends; there is no runtime dependency on any validation library. No module reads `window` or `document` at import.

Cap: **3,072 bytes** minified + gzip for the production entry (proposed at 2,560 B; raised at F3, approved 2026-10-20, after the form core and validation measured 2,058 B), with core, DOM, async, router, and query external, measured by a new `pnpm size` row. `pnpm size` also prints the fully bundled `core + dom + async + router + query + forms` total.

Estimate by part, after compression:

| Part                                                                         |          Estimate |
| ---------------------------------------------------------------------------- | ----------------: |
| Sources, identity epochs, and the server projection                          |         120–170 B |
| Path parsing, get/set-with-copy, and value equality                          |         120–170 B |
| Lazy field store, dirty, touched, `remoteChanged`                            |         300–400 B |
| `values()`, `reset`, `acceptRemote`, post-save rebase                        |         120–170 B |
| Standard Schema validation, generations, issue normalization and mapping     |         220–300 B |
| Submission, mutation binding, results, error messages, mutation-error issues |         250–330 B |
| `<form.Field>`, ids, label/description/error, aria wiring, three adapters    |         320–440 B |
| Leave policy wiring (decision 6)                                             |           50–80 B |
| **Total**                                                                    | **1,500–2,060 B** |

The original 2,560 B cap left about 500 B above the high estimate; F2 and F3 used most of it (see [f-f3](../checkpoints/f-f3.md#bytes-per-part)), so F3 raised the cap to 3,072 B. If F2–F4 cannot fit, stop with measured alternatives instead of dropping behavior silently. At Q6 the fully bundled `core + dom + async + router + query` total was 20,829 B, so the expected all-in total is about **22.3–22.9 KB**.

### Comparable production measurements

On 2026-10-20, an isolated temporary npm install (`--ignore-scripts --legacy-peer-deps`) measured the surfaces below with esbuild 0.28.2: `bundle`, `minify`, `treeShaking`, `platform: 'browser'`, `format: 'esm'`, `target: 'es2022'`, production/browser conditions, `process.env.NODE_ENV` set to `"production"`, no legal comments, default Node gzip. `react`, `react-dom`, `solid-js`, `zod`, and `valibot` were external; each package's own dependencies were bundled.

| Comparable public surface                                                                              | Minified bytes | Gzip bytes |
| ------------------------------------------------------------------------------------------------------ | -------------: | ---------: |
| `@tanstack/form-core` 1.33.5: `FormApi, FieldApi, standardSchemaValidators`                            |         46,125 | **13,016** |
| `@tanstack/solid-form` 1.33.5: `createForm, createField, Field`                                        |         60,676 | **15,667** |
| `@tanstack/react-form` 1.33.5: `useForm, useField, Field`                                              |         66,005 | **17,483** |
| `react-hook-form` 7.90.0: `useForm, useController, Controller, FormProvider, useFormContext`           |         37,415 | **13,313** |
| `react-hook-form` 7.90.0 + `@hookform/resolvers` 6.0.0 `standardSchemaResolver`                        |         40,486 | **14,662** |
| `@felte/solid` 1.2.14: `createForm, createField`                                                       |         26,158 |  **9,071** |
| `@modular-forms/solid` 0.25.1: `createForm, Form, Field, setValue, getValues, reset, submit, valiForm` |         10,683 |  **3,793** |

These are named-export surface measurements, not feature-for-feature benchmarks. TanStack Form and React Hook Form include field arrays, per-field validators, listeners, and much more; Modular Forms includes field arrays and its own validation helpers but has no Standard Schema adapter in the measured version (its exports offer `zodForm`/`valiForm`). The **3,072 B cap is 721 B below Modular Forms** and about a quarter of TanStack Form's core (the original 2,560 B proposal was 1,233 B below), and buys identity-aware server data, Standard Schema validation, mutation binding, and accessible field rendering. It does not buy field arrays.

## Defining a form model

```ts
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>
    readonly types?: { readonly input: Input; readonly output: Output }
  }
}
// StandardResult and StandardIssue follow the v1 specification verbatim:
// { value } | { issues }, and { message, path?: (PropertyKey | { key: PropertyKey })[] }.

type FormSource<D> =
  | { route: { match(): { params(): object; data(): D } } }
  | { source: () => D | false | null | undefined }
  | { initial: () => unknown }

type FormModelOptions<S extends StandardSchemaV1, D, I, O> = FormSource<D> & {
  schema: S
  from?: (data: SourceData<D>) => InferInput<S> // required for route and source
  save: Mutation<I, O>
  input?: (values: InferOutput<S>, context: { params: object }) => I
  validate?: 'submit' | 'blur' | 'change' // default 'submit'
  leave?: 'confirm' | 'discard' | LeaveConfirm // default 'confirm' (decision 6)
  message?: (error: unknown) => string
}

function formModel<S, D, I, O>(
  options: FormModelOptions<S, D, I, O>,
): FormModel<InferInput<S>, InferOutput<S>, O>

interface FormModel<In, Out, O> {
  (): Form<In, Out, O> // owner-bound instance, created during component setup
}
```

`SourceData<D>` is `T` when `D` is a `QueryEntry<T>` and `D` itself otherwise, so a route whose loader returns plain data also works; its identity is the data object and it has no same-identity refetches. The flagship model reads:

```ts
const projectForm = formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
```

`formModel` is stateless and safe at module level, like `query()` and `mutation()`. `projectForm()` must run under a component owner inside the route scope, because it calls `projectRoute.match()` and `saveProject()`.

**Three sources.** `route` binds to the committed match; `source` binds to any tracked accessor (for example a query observer's entry, or a record passed into a dialog) and treats a falsy result as "no identity yet"; `initial` is a create form whose identity never changes. Exactly one is allowed, which the option union enforces.

**`from` must be pure.** It runs inside a `computed`, so it cannot create signals or write state ([reactivity.md](./reactivity.md)). It projects the loaded record into editable fields and must not pass the server object through wholesale, as the flagship requires. For `initial`, the accessor itself returns the values and `from` is omitted.

## The form instance

```ts
interface Form<In, Out, O> {
  submit(event?: Event): Promise<FormSubmitResult<O>> // never rejects
  Field: FieldComponent<In>
  field<N extends FieldPath<In>>(name: N): FieldHandle<PathValue<In, N>>
  values: ReadonlySignal<In> // current values: server projection plus edits
  dirty: ReadonlySignal<boolean>
  remoteChanged: ReadonlySignal<boolean>
  validating: ReadonlySignal<boolean>
  submitting: ReadonlySignal<boolean>
  error: ReadonlySignal<string | undefined> // root issue or save failure
  issues: ReadonlySignal<readonly FormIssue[]>
  acceptRemote(name?: FieldPath<In>): void
  reset(): void
}

interface FieldHandle<V> {
  readonly name: string
  readonly id: string
  readonly errorId: string
  value: ReadonlySignal<V>
  set(value: V): void
  blur(): void // marks touched; validates in 'blur' mode
  error: ReadonlySignal<string | undefined> // first visible issue message
  invalid: ReadonlySignal<boolean>
  dirty: ReadonlySignal<boolean>
  touched: ReadonlySignal<boolean>
  remote: ReadonlySignal<V> // latest server value for this path
  remoteChanged: ReadonlySignal<boolean>
  describedBy: ReadonlySignal<string | undefined>
}

type FormSubmitResult<O> =
  | { ok: true; value: O }
  | { ok: false; reason: 'busy' | 'invalid' | 'no-source' }
  | { ok: false; reason: 'failed'; error: unknown; cancelled: boolean }

interface FormIssue {
  readonly path: string // '' for root issues
  readonly message: string
}
```

Field handles are created lazily and cached per path for the life of the instance, so `form.field('name') === form.field('name')`. Reading a handle allocates nothing reactive until a field is edited, touched, or has an issue.

## State model and identity rules

The instance keeps one **epoch** accessor: the identity of the current source value (`match.data()` for a route, the accessor result for `source`, a constant for `initial`). The **server projection** is `computed(() => from(entryValue()))`, where `entryValue()` is `match.data().value()` for a query entry and the data itself otherwise.

Each field that has been edited holds one signal: `{ epoch, value, base }`, where `base` is the projection's value at that path when the edit started. Touched flags and issues are tagged with the epoch they belong to in the same way. Everything else is derived:

| Field read        | Rule                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `value()`         | The edit's `value` if its epoch is current, otherwise the projection at this path.                                         |
| `dirty()`         | An edit exists for the current epoch and its value differs from the projection at this path.                               |
| `remote()`        | The projection at this path.                                                                                               |
| `remoteChanged()` | Dirty, and the projection differs from the edit's `base`: the server changed this field after the user started editing it. |
| `touched()`       | A touched flag exists for the current epoch.                                                                               |

The four identity rules follow from this without effects or reset writes:

1. **Reset on committed identity change.** The router publishes a new `match.data()` handle only in the commit batch that also changes params ([router.md](./router.md#matching-and-navigation-state)). The epoch changes in that batch, so every edit, touched flag, issue, and submission state tagged with A's epoch stops applying at the same moment the params become B's. There is no frame showing A's edits under B's URL, and nothing resets before commit, because a pending navigation keeps A's handle published. Stale epoch-tagged signals are cleared lazily on the next edit of that field.
2. **Pristine fields follow same-identity refetches.** A background refetch, a mutation's `writes`, or an optimistic update changes `value()` of the same handle. The projection recomputes and every pristine field reads the new value.
3. **Dirty fields are never overwritten.** Only `field.set`, `acceptRemote`, `reset`, and the post-save rebase write edits. A refetch writes the cache, never form state.
4. **`remoteChanged` reports conflicts.** When a refetch changes a field the user is editing, `field.remoteChanged()` and `form.remoteChanged()` become true. `form.acceptRemote(name?)` drops the edit for one field or all of them, so the field shows the server value. If the user edits a field back to the current server value, it is pristine again.

Equality is `Object.is` for primitives, element-wise for arrays (multi-select values), `getTime()` for dates, and key-wise one level deep for plain objects. Deep structural equality is not used.

`values()` builds the current values by copying the projection along each edited path and setting the edit; untouched branches keep their projection objects. `reset()` clears every edit, touched flag, and issue for the current epoch. After a cache gc, the next visit creates a new entry and a new handle, which is a new identity; that only happens to entries no committed route retained.

**Leaving with unsaved changes.** Rule 1 guarantees that A's edits never carry into B, but a same-route navigation would still discard them at commit. The leave policy (decision 6) blocks such a navigation while `dirty()` is true, before the router starts loading B.

## Validation with Standard Schema

**What is validated.** The whole `values()` object, through `schema['~standard'].validate(values)`. Standard Schema has no partial or per-field validation, so every run validates every field; the result's issues replace the current issue set.

**When.**

| Mode               | Before the first submit               | After the first submit             |
| ------------------ | ------------------------------------- | ---------------------------------- |
| `submit` (default) | Only on submit                        | On every `set`, and on submit      |
| `blur`             | On each field's `blur`, and on submit | On every `set`, `blur`, and submit |
| `change`           | On every `set`, and on submit         | Same                               |

The default matches React Hook Form's `onSubmit` mode with `reValidateMode: 'onChange'`: no errors while the user is still typing for the first time, and errors clear as soon as the user fixes them after a failed submit.

**Visibility.** A field's issues are visible when the field is touched or a submit has been attempted for the current epoch. In `submit` mode no issues exist before the first submit, so this rule only matters for `blur` and `change`.

**Sync and async.** A synchronous result is applied in the same call stack as `set` or `blur`, so an error disappears in the same flush as the keystroke that fixed it. A promise result increments a validation generation and sets `validating()`; only the latest generation may write issues, so an older async result cannot overwrite a newer one. Validation runs untracked and outside any computed. A thrown or rejected `validate` becomes a root issue with the error's message; it does not reach the event reporter.

**Issue-path mapping.** Each issue path is normalized to a dotted string: a `{ key }` segment contributes its key, numbers and strings contribute their text, and symbols are not addressable (the issue becomes a root issue). The issue is attached to:

1. the field whose name equals the path, if a handle exists; otherwise
2. the nearest ancestor path with a handle (an object-level refinement on `address` shows on `address` if that field exists); otherwise
3. the root, where `form.error()` shows the first root issue.

Rule 3 means an issue is never silently dropped. Development builds warn once per path that falls through to the root, because it usually means a field is missing from the JSX. Field names cannot be checked against the schema at runtime, since Standard Schema cannot list them; the type system does that instead.

**Output.** On success, the schema's output (`InferOutput<S>`, after transforms and coercions) is what the mutation receives. The input type drives field values; the output type drives the mutation. Invalid input never reaches the mutation.

## Submission through a mutation

`form.submit(event?)` calls `event.preventDefault()` when given an event, so `<form onSubmit={form.submit}>` works as in the flagship. Then:

1. If a submission for the current epoch is pending, resolve `{ ok: false, reason: 'busy' }`. This is the double-submit guard; the flagship's disabled button is a visual hint, not the guard.
2. Snapshot `values()`, the epoch, and (for routes) `match.params()`, untracked. Clear the previous save error. Set `submitting()`.
3. Validate the snapshot and await an async result. On issues: apply them, mark the attempt, move focus to the first invalid field in document order, clear `submitting()`, and resolve `{ ok: false, reason: 'invalid' }`.
4. Build the mutation input. With `input`, call it with the output and the snapshot's params. Without it, a route-bound form passes `{ ...params, values: output }` and other forms pass `output` itself. The type system checks that the default shape is assignable to the mutation's input (decision 4).
5. Call `handle.run(input)` on the mutation handle the instance created during setup. Its promise never rejects.
6. **Success:** if the epoch is still the snapshot's, then in one batch drop each edit whose current value still equals the submitted value (those fields become pristine and show the server value, which `awaitRefetch` has already refreshed), keep edits made during the submission dirty, and clear touched flags and the attempt marker. Resolve `{ ok: true, value }`.
7. **Failure:** if the epoch is current, record the error. If the error has an `issues` array in Standard Schema issue shape (a server returning 422 field errors), map those issues like validation issues; otherwise `form.error()` shows `message(error)`, by default `error.message` when it is a non-empty string and "Could not save." otherwise. Resolve `{ ok: false, reason: 'failed', error, cancelled }`. The next submit clears it.

`submitting()` and `error()` read submission state tagged with the epoch, so after a same-route navigation B never shows A's spinner or A's save error. A save that finishes after navigation or disposal writes no form state; the mutation still applies its `writes` and `affects`, so A's record is refreshed for the next visit ([query.md](./query.md#mutations)). A form without a source identity yet (a `source` accessor returning nothing) resolves `{ ok: false, reason: 'no-source' }`.

The instance does not cancel a save on disposal; `query` already defines that disposal does not abort mutations.

## Field adapter and accessibility

```tsx
<form.Field name="name" component={Input} label="Name" />
<form.Field name="ownerEmail" component={Input} label="Owner email" description="We send ownership notices here." type="email" />
<form.Field name="archived" component={Checkbox} bind={checked} label="Archived" />
```

`<form.Field>` renders, under the component owner of the form:

```html
<div class="benos-field" data-invalid="false">
  <label class="benos-label" for="f1-name">Name</label>
  <!-- the component, with id, name, value, events, invalid, aria-describedby -->
  <p class="benos-field-description" id="f1-name-description">…</p>
  <p class="benos-field-error" id="f1-name-error">…</p>
</div>
```

| Prop          | Behavior                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | A `FieldPath<In>`, checked at compile time. The value type at that path must match the adapter.                                                                                                                        |
| `component`   | Any component whose props accept the adapter's controlled props. The registry `Input` already accepts `id`, `name`, `value`, `onInput`, `onBlur`, `invalid`, and `aria-describedby`; no registry API change is needed. |
| `label`       | Required text. Rendered as a `<label for>` for `text` and `choice` with an element label, passed as children for `checked`, or as the `label` prop for components that render their own (registry `Select`).           |
| `description` | Optional hint, rendered with an id and always included in `aria-describedby`.                                                                                                                                          |
| `bind`        | An adapter; default `text`.                                                                                                                                                                                            |
| `id`          | Optional override of the generated id.                                                                                                                                                                                 |
| other props   | Forwarded to `component`, typed as its props minus the controlled ones. A user `aria-describedby` is merged, not replaced.                                                                                             |

**Wiring.** The component receives `id` (the label's `for` target), `name` set to the dotted path, the bound value and change handler, `onBlur` calling `field.blur()`, `invalid` from `field.invalid()`, and `aria-describedby` listing the description id and, only while an error is visible, the error id. The registry `Input` turns `invalid` into `aria-invalid="true"`. The error element is rendered only while there is an error (a `<Show>`), and it has no live-region role: many fields announcing at once is noisy. Instead, a failed submit moves focus to the first invalid field, whose description and error are then read, and the form-level `<p role="alert">{form.error()}</p>` in the flagship announces root and save errors.

**Ids.** Each instance takes its prefix from `createUniqueId()` and appends the sanitized path. Ids are unique per document, and under a server or hydrating root they are deterministic, because `createUniqueId` derives them from the owner path ([ssr.md](./ssr.md), 0.6.0).

**Adapters.** An adapter is a small object: the value type it accepts, a function from a field handle to controlled props, where the label goes, and how to focus the control.

| Adapter          | Field value      | Controlled props                                                  | Registry components    |
| ---------------- | ---------------- | ----------------------------------------------------------------- | ---------------------- |
| `text` (default) | `string`         | `value`, `onInput` (reads `currentTarget.value`), `onBlur`        | `Input`, `Textarea`    |
| `checked`        | `boolean`        | `checked`, `onCheckedChange` (reads `details.checked === true`)   | `Checkbox`, `Switch`   |
| `choice`         | `string \| null` | `value`, `onValueChange`; maps to and from `[value]` for `Select` | `Select`, `RadioGroup` |

A number field uses a schema coercion (`z.coerce.number()` and its Valibot and ArkType equivalents) with the `text` adapter, so its input type stays `string`; using `text` on a field whose input type is `number` is a type error. Custom adapters follow the same shape, so app-local components can bind without changes to the package.

**Headless use.** `form.field(name)` returns the same handle `<form.Field>` uses, with `id`, `errorId`, and `describedBy()`, so a custom layout can wire any element by hand.

**Native validation.** If a field passes `required` or `pattern` through to the input, the browser validates before `submit` fires. Forms that rely only on the schema should set `noValidate` on the `<form>`. This is documented, not automatic.

## Type inference and type errors

```ts
// projectForm: FormModel<EditProject, EditProject, Project>
// projectForm(): Form<EditProject, EditProject, Project>
// form.field('ownerEmail'): FieldHandle<string>
// <form.Field name="ownr" … />: error, not a FieldPath<EditProject>
```

`FieldPath<T>` produces dotted paths for nested plain objects and `${number}` segments for arrays, up to a depth of 8 to keep type checking fast. Deeper paths are not offered; F2 measures the checker cost and may raise the limit. `PathValue<T, P>` gives the value type at a path.

Type-level tests (with `expect-type` and `@ts-expect-error`, included by `pnpm typecheck:types`) in F2–F4 must cover:

- `In` and `Out` inference from Zod, Valibot, and ArkType schemas, including a transform where they differ.
- `from` returning something not assignable to `InferInput<S>` is an error; `from`'s parameter is `Project` for a route whose loader returns `projectQuery.load(...)`, and the loader data itself for a plain loader.
- A route without a loader, or a `source` together with `route`, is an error.
- The default mutation input: `saveProject` with input `{ projectId: string; values: EditProject }` is accepted; a mutation expecting `{ id: string; values: EditProject }` is an error unless `input` is given; a mutation whose `values` type is incompatible with the schema output is an error.
- Field names: misspelled, nonexistent, and too-deep paths are errors; `text` on a `number` field and `checked` on a `string` field are errors; forwarded props are checked against the component's props.
- `FormSubmitResult<O>` narrows on `ok` and `reason`.

## Required changes outside `@benosjs/forms`

| Package | Change                                                                                                                                                                                                                        | Public impact                                  |                       Gzip estimate |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------: |
| core    | None. Forms use public `signal`, `computed`, `batch`, `untrack`, and `onCleanup`.                                                                                                                                             | None                                           |                                 0 B |
| DOM     | None. `<form.Field>` uses the JSX runtime, `Show`, `mergeProps`, and `splitProps`. A component passed as a prop is rendered as an ordinary component descriptor.                                                              | None                                           |                                 0 B |
| async   | None. Async validation is a plain promise with a generation guard; forms do not suspend.                                                                                                                                      | None                                           |                                 0 B |
| query   | None. Forms call the mutation handle's `run` and read `QueryEntry.value()`, and import only types (`QueryEntry`, `Mutation`, `MutationHandle`, `MutationResult` are already exported). Query's 86 B of headroom is untouched. | None                                           |                                 0 B |
| router  | **Runtime, decision 6:** an owner-bound `blockNavigation({ when, confirm })`. It fills in the `blocked` navigation status that 0.4 already reserves in its types, and adds `'blocked'` to `NavigationResult`. Details below.  | New export; `NavigationResult` gains a variant | +200–300 B (measured at F5: +390 B) |

**Navigation blocker (decision 6).** The 0.4 router has `{ status: 'blocked'; destination }` in its navigation type but no way to block. Proposed:

```ts
function blockNavigation(options: {
  when: (destination: {
    location: string
    reason: 'link' | 'programmatic' | 'pop' | 'unload'
  }) => boolean
  confirm: (destination: { location: string }) => boolean | Promise<boolean>
}): void // owner-bound; released by onCleanup
```

Before matching a new navigation, the router asks each active blocker's `when`. If one returns true, `navigation()` becomes `blocked` with the destination and the router awaits `confirm`. On true the navigation continues; on false it resolves `{ status: 'blocked' }` and nothing loads. A `pop` has already moved the browser. `browserHistory` stores a random per-entry key in `history.state` today, but no position, so the blocker adds an entry index to that metadata; on refusal the router restores the previous entry with `history.go(previousIndex - currentIndex)` and ignores the resulting `popstate`. `memoryHistory` restores its index directly. While any blocker's `when({ reason: 'unload' })` is true, the router installs a `beforeunload` listener and removes it when none is. Router headroom is 819 B, so +200–300 B leaves 519–619 B.

The forms leave policy uses it: `leave: 'confirm'` (the proposed default) blocks while `dirty()` is true and not submitting, and confirms with `window.confirm("Discard unsaved changes?")`; `leave: 'discard'` does not block; `leave: (destination) => boolean | Promise<boolean>` supplies an app dialog (for example the registry `Dialog`). A form with `leave: 'discard'` or no route never imports the blocker at runtime if the package splits the route binding into its own module, which F5 must measure.

**Fallback if decision 6 is declined:** no router change. Forms ship without a leave policy; edits are discarded at the commit of a different identity (they still never carry into B), and an app can read `form.dirty()` to warn in its own UI. The flagship's "explicit blocker policy" requirement would then be met only by documentation.

## Flagship sketch amendments

The [flagship target](./flagship-integration.md) works on this design unchanged. The editor block stays at **13 lines** and the shared setup at its current size. These clarifications were approved at F1 and are applied to flagship-integration.md:

1. `from` runs inside a `computed` and must be pure; the flagship `from` already is.
2. The default mutation input for a route-bound form is `{ ...params, values }`. The flagship's `saveProject` input `{ projectId: string; values: EditProject }` matches exactly, which is why `formModel` needs no `input` line.
3. The flagship's "explicit blocker policy" is `leave: 'confirm'` by default (decision 6); the editor gains no line.
4. "Root issues appear in the form alert" means `form.error()` shows the first root issue, or the save error when there is no root issue.
5. "`<form.Field>` … passing `invalid` to `Input`" also passes `onBlur`, `name`, and a merged `aria-describedby`, all of which `Input` already accepts.

## Failure and race cases

- A → B same-route navigation while A has edits: with `leave: 'confirm'`, the navigation waits for confirmation and does not start loading B until confirmed. With `discard`, B's handle commits and A's edits stop applying in the same batch.
- A background refetch of A resolves after the router committed B: it writes only A's entry; B's handle and B's projection are unaffected.
- A save of A finishes after navigating to B: no form state is written (epoch mismatch); A's entry is refreshed by `affects`.
- A save finishes while the user kept typing: fields changed during submission stay dirty; others become pristine and show the refreshed server value.
- An async validation resolves after a newer edit: its generation is old, so it is dropped. A submit always validates its own snapshot and awaits that result.
- The schema throws or rejects: a root issue, `{ ok: false, reason: 'invalid' }`, and nothing reaches the event reporter.
- The form's owner is disposed during async validation or a save: later writes to its signals are unobserved; no blocker or listener remains, because the blocker is owner-bound.
- A refetch changes a dirty field: the field keeps the user's value and `remoteChanged()` turns true; `acceptRemote('name')` takes the server value.
- An optimistic mutation on the same record updates pristine fields; its rollback restores them. Dirty fields are unaffected either way.
- An entry is gc'd between visits: the next visit has a new handle and starts clean.

## Prior art and trade-offs

**TanStack Form** ([validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [async initial values](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values)) is headless, framework-agnostic, and broad: form- and field-level validators for change, blur, submit, and mount, async debouncing, listeners, linked fields, field arrays, and Standard Schema support. Benos borrows its Standard Schema-first validation and typed deep paths. It differs in three ways: identity comes from the committed route/query handle, so there is no `key` remount and no `defaultValues` update to coordinate; the schema is the only validator (no per-field validators or debouncing in 0.5); and `<form.Field>` renders accessible markup instead of a render prop. TanStack Form's 13,016 B core is the price of its breadth. Benos cannot claim a validator-compatibility advantage: TanStack Form already supports Standard Schema.

**React Hook Form** ([`useForm` `values` and `resetOptions`](https://react-hook-form.com/docs/useform)) optimizes React by keeping inputs uncontrolled and registering them through refs, which avoids React rerenders. Its `values` prop with `resetOptions: { keepDirtyValues: true }` is the closest existing equivalent of the Benos same-identity rule; Benos makes that rule the default and derives it from the cache rather than a prop. Benos inputs are controlled, which is cheap because a keystroke updates one binding without rerunning a component. Its default `onSubmit` + `reValidateMode: 'onChange'` timing is the Benos default. Benos has no `useFieldArray` equivalent in 0.5.

**Felte and Modular Forms** are the closest fine-grained designs. [Felte](https://felte.dev/) reads values from the DOM through a `use:form` action and validates through adapter packages; Benos keeps values in signals so pristine fields can be derived from server data, which a DOM-sourced form cannot do without writing to inputs. [Modular Forms](https://modularforms.dev/) is a small Solid-native store with `Field` render props, field arrays, and Zod/Valibot adapters (`zodForm`, `valiForm`); it is the size reference (3,793 B). Benos is smaller by having no field arrays, and it adds identity-aware server data, Standard Schema, mutation binding, and rendered accessible markup.

**Costs of the Benos choices.**

- Whole-schema validation on every keystroke after a failed submit. For ordinary schemas this is microseconds, but an async refinement (for example a username availability check) would call the server per keystroke. The guide must say: put expensive async checks behind `validate: 'submit'` or in the mutation, whose `issues` map to fields. Debounced async validation is a candidate for later.
- No field arrays in 0.5. Array paths are addressable and validated, but insert/remove/move with stable item identity is deferred; apps compose them with `field.set` on the array path.
- Controlled inputs: every edited field holds a signal. That is one signal per edited field, not per field.
- `<form.Field>` renders opinionated markup and class names. `form.field()` is the escape hatch, and the registry gains a field CSS item (decision 7).
- `leave: 'confirm'` uses `window.confirm` by default, which cannot be styled. Apps replace it with a function.

## Test plan before implementation

1. Identity: epoch change only at commit, in the same batch as params; pending navigation keeps A's edits; B never shows A's edits, issues, touched flags, submission state, or save error.
2. Same-identity refetch, `writes`, optimistic update, and rollback with pristine and dirty fields; `remoteChanged`; `acceptRemote` for one field and all; editing back to the server value.
3. `values()` copying only edited paths, nested objects, arrays, and the equality rules.
4. Validation modes, visibility, sync-in-the-same-flush, async generations, thrown validators, and issue mapping (exact, ancestor, root, symbol segments) with Zod, Valibot, and ArkType.
5. Submission: busy guard, snapshot isolation, invalid focus order, default and explicit input, success rebase with edits during submission, failure messages, mutation errors with `issues`, cancellation, save after navigation, save after disposal, and no event-reporter traffic.
6. `<form.Field>` and adapters with every registry form control: ids, `for`, `aria-describedby` merging, `aria-invalid`, error element presence, focus, keyboard, axe, RTL, in Chromium, Firefox, and WebKit.
7. Router blocker (if approved): link, programmatic, pop restoration, unload, confirm true/false/async, owner release, and the R4 loader gates unchanged.
8. Type-level tests listed above, and a size row for the forms package.

## F2 implementation notes

F2 implements `formModel` with the three sources, identity epochs, the field store, `values()`, dirty, touched, `remoteChanged`, `acceptRemote`, `reset`, and submission through the mutation handle. These points refine or narrow the design above:

1. **The epoch is a fresh token per identity change, not the handle itself.** `load()` returns one handle per entry, so after A → B → A the router publishes A's original handle again. Tagging edits with the handle would bring A's discarded edits back. The epoch is now a new token whenever the identity differs from the previous one, so A → B → A starts clean. The comparison runs when the epoch is read; a form whose fields nobody reads across A → B → A could keep its token, which no rendered form does.
2. **`form.field()` creates two signals** (the edit and the touched flag) when a path is first requested, instead of allocating nothing until the first edit. It must therefore be called during setup or in an effect, never inside a `computed`, which the kernel forbids from creating signals. `<form.Field>` (F4) calls it during setup.
3. **Field accessors are plain functions over signals,** as query observers are. Only the server projection and `values()` are `computed` nodes, because they allocate.
4. **No validation yet.** `submit` passes the values through to the mutation; F3 validates the snapshot at that point. `issues`, `validating`, and the field error accessors arrive in F3; `Field`, `id`, `errorId`, and `describedBy` arrive in F4.
5. **A create form returns to its initial values after a successful save,** because every submitted edit is dropped by the rebase rule and the initial accessor has not changed.
6. **A `source` form's values may be missing.** Its model is `FormModel<In, Out, O, true>`, whose `values()`, `value()`, and `remote()` include `undefined`. A new object from the source is a new record; a query entry handle is the same record across refetches.
7. **Mutation input checks follow method bivariance.** `Mutation.run` is declared as a method, so a mutation whose `values` type is a supertype of the schema output is accepted. Incompatible shapes (a different params key, a `number` where the output has a `string`) are errors, and the type tests cover them.
8. **`reset()` keeps a pending save's state;** it clears a finished save's error.

## F3 implementation notes

F3 implements validation timing, sync and async `validate` with generations, issue normalization and mapping, root issues, `form.error()` precedence, and mutation errors that carry issues. These points refine the design above:

1. **In `change` mode an edit counts as touching the field.** With the visibility rule alone (touched or submitted), an error in `change` mode stayed hidden until blur, which is what `blur` mode is for. The field is now marked touched by `set` in `change` mode only.
2. **Issue mapping reads the field registry when an accessor is read.** Fields are created during setup, before any validation, so this matches the design. A field created after issues were reported finds its issues on its next read, but nothing notifies an existing binding.
3. **A thrown or rejected validator** becomes one root issue whose message is the error's message, or "Could not validate." when it has none. `submit` resolves `invalid`.
4. **Server issues.** A mutation error whose `issues` is an array of objects with string `message`s is mapped like validation issues, and `form.error()` stays empty for that failure. Server issues last until the next validation replaces them, so the next edit after a failed save (which always counts as a submit attempt) clears them if the schema passes.
5. **Clearing.** A successful save clears the record's issues and submit attempt. `reset()` also cancels any in-flight async validation by advancing the generation.
6. **The development warning** for an issue path with no field fires once per path per form instance. Production builds strip it; the flag must be declared above its first use for the minifier to fold it, which an early F3 build did not do (it shipped 97 B of warning code).

## F4 implementation notes

F4 implements `<form.Field>`, the handle's `id`, `errorId`, and `describedBy`, four adapters, focus on the first invalid field, and the field CSS. These points refine the design above:

1. **Four adapters, not three.** The registry `Select` takes `value: string[]` and `RadioGroup` takes `string | null`, so one `choice` adapter cannot type both. `choice` binds `RadioGroup`; a new `select` adapter maps a single `string | null` field to and from a one-item array for `Select`. Unused adapters are tree-shaken from applications.
2. **No `id` override prop.** Ids are always the form's prefix plus the path (`f1-address-city`), so `describedBy`, the error element, and focus never disagree. A custom id would have to flow into the handle, which costs bytes for little benefit.
3. **Focus follows registration order.** Fields register when `<form.Field>` or `form.field()` is first called during setup, which is their JSX order. After a failed submit, focus moves to the first invalid field that has an element: the element with the field's id when it is focusable, otherwise its first focusable descendant (the hidden input of `Checkbox`, `Switch`, and `RadioGroup`, the trigger of `Select`). Headless handles without an element are skipped. Comparing document positions instead cost 28 B more and is not needed.
4. **Change adapters mark the field touched.** `checked`, `choice`, and `select` call `blur()` after `set`, because those controls emit no blur event to the field; `blur` mode would otherwise never show their errors before a submit.
5. **Type errors for an incompatible component** surface as "not assignable to `never`" on the `component` prop. They are caught, but the message is not self-explanatory; the guide must show the adapter for each registry component.
6. **Compiler fix.** `<form.Field>` compiled to `"form".Field`: the compiler treated the lowercase object of a JSX member tag as an intrinsic element name. Member tags are now always values (`form.Field`, `ui.forms.Input`, `this.View`), as in TypeScript and React. This was a 0.4 compiler bug that the flagship editor would have hit.
7. **Registry gaps (not fixed in F4).** The 0.4.0 registry `Input` and `Textarea` compute `aria-invalid` once during setup, so it does not follow `invalid` after the first render. `Checkbox` and `Switch` put `aria-describedby` on their root `<label>`, not on the hidden input that has the checkbox role. Fixing either changes immutable 0.4.0 registry payloads, so it belongs to the 0.5.0 registry build (see [f-f4](../checkpoints/f-f4.md)).
8. **Field CSS** is in `registry/source/css/field.css`. Its registry item is added with the 0.5.0 registry build in F6, because adding it now would publish an item URL under the `v0.4.0` tag, where the file does not exist.

## F5 implementation notes

F5 implements the router navigation blocker, the forms leave policy, the flagship editor as executable code, and the dashboard editor. These points refine the design above:

1. **The leave policy applies to route-bound forms only.** `leave` is an option of the route overload; `source` and `initial` forms never block. The default blocks while `dirty()` is true and `submitting()` is false and asks `window.confirm("Discard unsaved changes?")`; a function receives `{ location }` and resolves true to leave. A save in flight does not block, and a successful save rebases the submitted fields, so leaving after a save does not ask.
2. **Any navigation away is held, even one that keeps the record.** The blocker sees only the destination URL, so a hash or search change on the same record also asks while the form is dirty. Telling whether a destination keeps the same identity would need the router to match the URL first; it is not done in 0.5.
3. **A missing or throwing confirm refuses.** The router treats a throwing `confirm` as a refusal, so where `window.confirm` does not exist (happy-dom, some embedded views), the default policy keeps the user on a dirty form. Tests stub `confirm` or use `leave: 'discard'`, as the identity tests in `route.test.ts` do.
4. **Router bytes: +390 B** (6,349 → 6,739 B; 429 B headroom left), above the 200–300 B estimate. Measured by removing each part: holding and confirming about 220 B, pop restoration (entry positions and the silent `go`) about 97 B, and the unload warning about 66 B. The outlet registration moved from module load to `RouterOutlet` at +11 B.
5. **Forms bytes: +104 B** (2,774 → 2,878 B; 194 B headroom left), above the 50–80 B estimate, for the policy option, the blocker call, and the shared `dirty` and `submitting` accessors.
6. **A form without a route still pays for the router import.** `@benosjs/forms` imports `blockNavigation` statically. Moving the router's outlet registration out of module load cut what an app using forms without the router pays from 874 B to about 400 B. The rest, about 544 B, is `@benosjs/async`, whose module-level `Suspense` registration is kept because the router imports `resource`. An app of core, DOM, and forms measures 12,474 B with the router external and 13,418 B with it bundled. Removing the remainder needs an async change or a separate forms entry point; see the [F5 checkpoint](../checkpoints/f-f5.md).
7. **Server issues in the dashboard.** The dashboard's `PUT` returns a 422 whose `issues` follow Standard Schema, so "Another project already uses this name." appears under the name field, linked by `aria-describedby`, with no form-level alert.

## Hard-to-reverse decisions

Identity from the committed source handle, derived pristine fields, the epoch-tagged state model, schema-only validation through Standard Schema, the issue-mapping fallback to the nearest field and then the root, the default validation timing, `submit` never rejecting, the default mutation input `{ ...params, values }`, the adapter shape, the rendered markup and class names of `<form.Field>`, and the router blocker API are public behavior.

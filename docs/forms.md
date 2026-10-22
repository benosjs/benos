# Forms guide

`@benosjs/forms` turns server data into an editable form and the form's
values into a mutation. A form follows the record it edits: fields you have
not touched show the latest server data, fields you have edited keep your
value, and moving to another record starts a clean form. Validation uses any
[Standard Schema](https://standardschema.dev) library, such as Zod, Valibot,
or ArkType.

```sh
npm install @benosjs/forms @benosjs/query @benosjs/router zod
npx benos add field
```

`benos add field` copies the field layout styles into your project; the
registry `Input`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`, and
`Select` work with it. The [architecture document](architecture/forms.md)
holds the full semantics.

## Define a form model

`formModel()` describes a form once, outside any component. A form bound to a
route reads its record from the route's loader data, validates with
`schema`, and saves through a [mutation](query.md#change-data-with-mutations).

```tsx
import { formModel } from '@benosjs/forms'
import { mutation, query } from '@benosjs/query'
import { route } from '@benosjs/router'
import { z } from 'zod'

interface Project {
  id: string
  name: string
  ownerEmail: string
}
interface EditProject {
  name: string
  ownerEmail: string
}
declare function getProject(id: string, signal: AbortSignal): Promise<Project>
declare function putProject(id: string, values: EditProject): Promise<Project>

const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
})
const saveProject = mutation({
  run: (input: { projectId: string; values: EditProject }) =>
    putProject(input.projectId, input.values),
  affects: (input) => [projectQuery.key(input.projectId)],
})
export const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
export const projectForm = formModel({
  route: projectRoute,
  schema: z.object({
    name: z.string().trim().min(2, 'Names need at least two characters.'),
    ownerEmail: z.email('Enter a valid email address.'),
  }),
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
```

`from` projects the loaded record into the form's fields. It runs inside a
`computed`, so it must be pure, and it should copy only the fields the form
edits. The form's field names and value types come from the schema's input
type; the values that reach the mutation are the schema's output.

By default a route-bound form saves `{ ...params, values }`, which is exactly
`saveProject`'s input here, so no `input` option is needed. When the shapes
differ, TypeScript asks for one:

```tsx
import { formModel } from '@benosjs/forms'
import { mutation, query } from '@benosjs/query'
import { route } from '@benosjs/router'
import { z } from 'zod'

const projectQuery = query({
  fetch: (id: string) => Promise.resolve({ id, name: 'Atlas' }),
})
const rename = mutation({
  run: (input: { id: string; name: string }) => Promise.resolve(input),
  affects: (input) => [projectQuery.key(input.id)],
})
const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})

export const renameForm = formModel({
  route: projectRoute,
  schema: z.object({ name: z.string().min(2) }),
  from: (project) => ({ name: project.name }),
  save: rename,
  input: (values, { params }) => ({ id: params.projectId, name: values.name }),
})
```

## Render the fields

Call the model during component setup. `<form.Field>` renders a label, the
control, an optional description, and the field's error, with stable ids and
`aria-describedby` linking them. Pass `form.submit` to `onSubmit`.

```tsx
import { formModel } from '@benosjs/forms'
import { mutation } from '@benosjs/query'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const createProject = mutation({
  run: (values: { name: string; summary: string }) => Promise.resolve(values),
})
const newProjectForm = formModel({
  initial: () => ({ name: '', summary: '' }),
  schema: z.object({
    name: z.string().trim().min(2, 'Names need at least two characters.'),
    summary: z.string().max(280, 'Keep the summary under 280 characters.'),
  }),
  save: createProject,
})

export function NewProject() {
  const form = newProjectForm()
  return (
    <form onSubmit={form.submit}>
      <form.Field name="name" component={Input} label="Name" />
      <form.Field
        name="summary"
        component={Textarea}
        label="Summary"
        description="Shown on the project list."
        rows={3}
      />
      <p role="alert">{form.error()}</p>
      <Button type="submit" disabled={form.submitting()}>
        Create
      </Button>
    </form>
  )
}
```

The control receives `id`, `name`, the bound value and handlers, `invalid`,
and a merged `aria-describedby`; any other prop, such as `rows`, is passed
through. The `name` must be a field of the schema's input, and the default
`text` adapter needs a string field.

Other controls take an adapter through `bind`:

| Adapter          | Field type       | Controls                |
| ---------------- | ---------------- | ----------------------- |
| `text` (default) | `string`         | `Input`, `Textarea`     |
| `checked`        | `boolean`        | `Checkbox`, `Switch`    |
| `choice`         | `string \| null` | `RadioGroup`            |
| `select`         | `string \| null` | `Select` (single value) |

```tsx
import { checked, choice, formModel } from '@benosjs/forms'
import { mutation } from '@benosjs/query'
import { z } from 'zod'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup } from '@/components/ui/radio-group'

const saveSettings = mutation({
  run: (values: { notify: boolean; plan: string | null }) =>
    Promise.resolve(values),
})
const settingsForm = formModel({
  initial: () => ({ notify: true, plan: null as string | null }),
  schema: z.object({
    notify: z.boolean(),
    plan: z
      .string()
      .nullable()
      .refine((plan) => plan !== null, 'Choose a plan.'),
  }),
  save: saveSettings,
})

export function Settings() {
  const form = settingsForm()
  return (
    <form onSubmit={form.submit}>
      <form.Field
        name="notify"
        component={Checkbox}
        bind={checked}
        label="Email me a weekly summary"
      />
      <form.Field
        name="plan"
        component={RadioGroup}
        bind={choice}
        label="Plan"
        items={[
          { value: 'free', label: 'Free' },
          { value: 'team', label: 'Team' },
        ]}
      />
      <button type="submit">Save</button>
    </form>
  )
}
```

For a layout `<form.Field>` does not fit, `form.field(name)` returns the
field's handle: `value()`, `set()`, `blur()`, `error()`, `invalid()`,
`dirty()`, `touched()`, `remote()`, `remoteChanged()`, and the `id`,
`errorId`, and `describedBy()` to wire your own markup. Call it during setup,
not inside a `computed`.

After a failed submit, focus moves to the first invalid field in the order
the fields were created, which is their JSX order.

## Validation

The schema validates the whole form; Standard Schema has no per-field
validation. `validate` chooses when validation starts:

- `'submit'` (default): on submit, then on every change after the first
  submit attempt.
- `'blur'`: also when a field loses focus.
- `'change'`: on every change, showing a field's error as soon as it is
  edited.

A field's error shows once the field is touched or a submit was attempted.
Each issue goes to the field at its path, or to the nearest ancestor field,
or to the form: `form.error()` shows the first form-level issue, so none is
dropped. A synchronous schema updates errors in the same call; an async
schema is awaited, and a result made stale by a newer edit is dropped. A
schema that throws becomes a form-level issue.

An async check that calls the server, such as a uniqueness check, runs on
every change after a failed submit. Keep it out of `validate: 'change'`
forms, or let the server do it: a mutation error whose `issues` follow
Standard Schema is mapped to fields like a validation result.

```tsx
declare function putProject(
  id: string,
  values: { name: string },
): Promise<Response>

export async function saveName(id: string, values: { name: string }) {
  const response = await putProject(id, values)
  if (response.status === 422)
    // The form shows this under the name field.
    throw Object.assign(new Error('Invalid project'), {
      issues: [{ message: 'Another project uses this name.', path: ['name'] }],
    })
  return response.json() as Promise<{ id: string; name: string }>
}
```

## Saving

`form.submit()` validates, saves the schema's output through the mutation,
and never rejects. It resolves `{ ok: true, value }` with the mutation's
result, or `{ ok: false, reason }` with `'invalid'`, `'busy'` (a save is
already running), `'no-source'` (no record yet), or `'failed'` with the
error. While the save runs, `form.submitting()` is true; a failed save keeps
the edits and shows `form.error()`, which the `message` option can word. The
next submit clears it.

After a successful save, each field whose value was saved becomes pristine
and shows the refreshed server value. A field you kept editing while the save
ran stays dirty. A save that finishes after you navigated away writes no form
state, but its `affects` still refresh the record it saved.

## Server changes while you edit

A refetch of the same record, a mutation's `writes`, or an optimistic update
changes the fields you have not edited; edited fields keep your value. When
the server changes a field you are editing, `field.remoteChanged()` and
`form.remoteChanged()` turn true. `form.acceptRemote(name)` drops your edit
for one field, and `form.acceptRemote()` for all of them. `form.reset()`
drops every edit, touched flag, and error.

```tsx
import { Show } from '@benosjs/dom'
import type { Form } from '@benosjs/forms'

export function ServerChanged(props: {
  form: Form<{ name: string }, { name: string }, unknown>
}) {
  return (
    <Show when={props.form.remoteChanged()}>
      <p role="status">
        Someone else changed this record.{' '}
        <button type="button" onClick={() => props.form.acceptRemote()}>
          Use their version
        </button>
      </p>
    </Show>
  )
}
```

Navigating to another record resets the form when the router commits the
new record, never before; the same component stays mounted, so no `key` is
needed.

## Leaving with unsaved changes

A route-bound form asks before you navigate away while it has unsaved
changes. The `leave` option sets the policy:

- `'confirm'` (default): ask with `window.confirm`, whose message is
  "Discard unsaved changes?". Links, `navigate()`, the browser's Back and
  Forward buttons, and closing or reloading the page all ask.
- `'discard'`: never ask; the edits are dropped when the next record commits.
- A function: ask with your own dialog. It receives `{ location }` and
  resolves `true` to leave.

```tsx
import { formModel } from '@benosjs/forms'
import { mutation, query } from '@benosjs/query'
import { route } from '@benosjs/router'
import { z } from 'zod'

declare function askToDiscard(): Promise<boolean>

const noteQuery = query({
  fetch: (id: string) => Promise.resolve({ id, text: '' }),
})
const saveNote = mutation({
  run: (input: { noteId: string; values: { text: string } }) =>
    Promise.resolve(input),
})
const noteRoute = route('/notes/:noteId', {
  loader: ({ params, signal }) => noteQuery.load(params.noteId, signal),
})

export const noteForm = formModel({
  route: noteRoute,
  schema: z.object({ text: z.string() }),
  from: (note) => ({ text: note.text }),
  save: saveNote,
  leave: () => askToDiscard(),
})
```

A form that is saving does not ask, and a saved form is pristine, so leaving
after a save does not ask either. Any navigation away is held, including a
hash or search change on the same record. Where `window.confirm` does not
exist, as in happy-dom, a missing or throwing confirm counts as staying; use
`leave: 'discard'` or stub `confirm` in tests.

The policy uses the router's `blockNavigation({ when, confirm })`, which you
can also call from any component under a `RouterOutlet`.

## Forms without a route

A `source` form follows any tracked value; a new object is a new record,
and a query entry is the same record across refetches. Its values are
`undefined` until the source has a record, and `submit()` resolves
`'no-source'` until then. An `initial` form, as in the examples above, is a
create form whose identity never changes; after a successful save it returns
to its initial values. Neither kind blocks navigation.

```tsx
import { signal } from '@benosjs/core'
import { formModel } from '@benosjs/forms'
import { mutation } from '@benosjs/query'
import { z } from 'zod'

interface Profile {
  name: string
}
const profile = signal<Profile | undefined>(undefined)
const saveProfile = mutation({
  run: (values: Profile) => Promise.resolve(values),
})

export const profileForm = formModel({
  source: profile,
  schema: z.object({ name: z.string().min(1) }),
  from: (current) => ({ name: current.name }),
  save: saveProfile,
})
```

## Coming from TanStack Form or React Hook Form

| React                                             | Benos                                                    |
| ------------------------------------------------- | -------------------------------------------------------- |
| `useForm({ defaultValues })` in a keyed component | `formModel({ route, from })`; no `key`                   |
| `defaultValues` changing while untouched          | Pristine fields always follow the server, field by field |
| `resetOptions: { keepDirtyValues: true }`         | The default; `remoteChanged()` reports conflicts         |
| `validators: { onChange: schema }` / resolvers    | `schema` with `validate: 'submit' \| 'blur' \| 'change'` |
| `<form.Field>{(field) => …}</form.Field>`         | `<form.Field name component label />` or `form.field()`  |
| `setError` from a server response                 | Throw an error with Standard Schema `issues`             |
| `mutateAsync` in `onSubmit`, then `reset`         | `save: mutation`; saved fields become pristine           |
| `useBlocker({ shouldBlockFn: () => isDirty })`    | `leave: 'confirm'` by default                            |

## Limits in 0.5

- No field arrays with insert, remove, and move; array paths can be read,
  set, and validated.
- No per-field validators or debounced async validation; the schema is the
  only validator.
- Field ids are not stable across server rendering.
- The leave policy cannot tell a same-record navigation from leaving.

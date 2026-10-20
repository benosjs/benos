# Flagship integration target for 0.5.0

**Status:** R1 design, amended at query Q1 (approved 2026-10-19): `fetch` takes `(args, { signal })`, the redundant `key` line is gone, and route data is a query entry handle. Amended again at forms F1 (approved 2026-10-20): `from` is pure, the default mutation input is `{ ...params, values }`, the blocker policy is `leave: 'confirm'`, and the field and alert wiring are spelled out ([forms.md](./forms.md)). Route and async pieces shipped in 0.4.0; query cache, mutations, and forms below are **0.5.0 targets**, not implemented APIs. This replaces the old sketch: its one-time `projectQuery.value(params())` lookup went stale, and its refetch effect overwrote edits.

## Project editor slice

The declarations outside the editor establish the transport, Standard Schema validator, route, cache identity, and mutation policy. Both examples below assume the same `Project`, `EditProject`, `getProject`, and `putProject` transports. `editSchema` may be made by Zod, Valibot, or ArkType. This shared setup is not counted as editor lines.

```tsx
const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
})
const saveProject = mutation({
  run: (input: { projectId: string; values: EditProject }) =>
    putProject(input.projectId, input.values),
  affects: (input) => [projectQuery.key(input.projectId)],
})
// routes/refs.ts has no component import
const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
const projectForm = formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
// routes/manifest.ts imports refs, but never imports the page eagerly
const router = createRouter({
  routes: [
    mountRoute(projectRoute, {
      lazy: () => import('./pages/project-editor'),
      pending: () => <p role="status">Loading project…</p>,
      error: ({ retry }) => (
        <button onClick={retry}>Could not load project. Retry</button>
      ),
    }),
  ],
})
```

`params.projectId` is inferred as `string` from the path literal. `projectQuery.load` is a 0.5 adapter to the 0.4 route loader/resource contract: it resolves to the cache entry's `QueryEntry<Project>` handle, so `projectRoute.match().data()` is that handle and `match.data().value()` is a live cache signal ([query.md](./query.md#router-loaders-share-identity-with-queries)). The query definition is the cache namespace, so no key function is needed for a single string argument. `affects` is a **declarative identity rule** evaluated from the completed mutation input. The mutation executor refreshes precisely those entries after success. It uses the saved record's ID, even if the user has navigated elsewhere by the time saving finishes. A failed save does not refresh. Nothing in the component manually invalidates a cache entry.

`<form.Field>` is a proposed 0.5 form/UI adapter: it renders a visible label, the existing registry `Input`, and a field error with stable `id`/`aria-describedby`, passing `id`, `name`, `value`, `onInput`, `onBlur`, `invalid`, and a merged `aria-describedby` to `Input`. The current `Input` already accepts those props; no UI component API change is assumed. The editor calls the form model bound to its route reference; no runtime import of the router instance is needed.

```tsx
function ProjectEditor() {
  const form = projectForm()
  return (
    <form onSubmit={form.submit}>
      <form.Field name="name" component={Input} label="Name" />
      <form.Field name="ownerEmail" component={Input} label="Owner email" />
      <p role="alert">{form.error()}</p>
      <Button type="submit" disabled={form.submitting()}>
        Save
      </Button>
    </form>
  )
}
```

`formModel.from` projects the loaded `Project` into editable `EditProject` fields; it must not pass the server object wholesale into the form. It runs inside a `computed`, so it must be pure. `projectForm()` reads `projectRoute.match()` under its current component owner and binds mutation input from the current **committed** match identity and validated form output: by default `{ ...params, values }`, which is exactly `saveProject`'s `{ projectId, values }` input, so no `input` option is needed. Its source is the route's stable loader-data signal, read as `match.data().value()`: a new handle at commit is a new identity, and an in-place change of `value()` is a same-identity refetch; the router starts loading before the initial editor render and updates that signal when same-route params change. The form captures an editable copy when an identity first becomes ready. A background refetch for the **same** identity updates pristine fields/baseline but never overwrites dirty fields; if server data conflicts, the form exposes `remoteChanged`. A different identity resets from the new committed data only after navigation commits. Unsaved changes during navigation use an explicit blocker policy: `leave: 'confirm'` is the default and asks before a navigation while the form is dirty, through the router's owner-bound `blockNavigation` (a 0.5 router addition). Either way, this sketch never carries record A's edits into B.

Submission calls `schema['~standard'].validate`, awaits async validators, maps issue paths to fields (an unmatched path goes to the nearest ancestor field, then to the root), blocks invalid input, and passes parsed output to the mutation. `form.error()` shows the first root issue, or the save error when there is none. A rejected mutation is captured as `form.error()` and `form.submitting()` covers the save. It does not throw from a browser event callback. [Standard Schema](https://standardschema.dev/) supplies validation, input/output types, and issue paths, but does not introspect field names or render fields; field names remain explicit in JSX.

Initial loading and loader failure are route-level states above the editor. The shared layout can read owner-bound `navigation()` for an accessible pending-navigation indicator without importing `routes/manifest.ts`. A same-route param change retains the old editor while the new loader runs, then changes match params and data in one commit without remounting `ProjectEditor`. The form identity rule resets at that commit. A failed loader commits the destination URL with its route error recovery view; retry is explicit. The editor never calls `createRoot`: its component owner supplies lifetime and disposal.

## Equivalent React stack

This editor uses React, TanStack Router, TanStack Query, and TanStack Form with the same transport and schema. Its route primes the Query cache. A keyed editor resets form state on a record change; a same-record refetch uses TanStack Form's changing defaults behavior. The [async initial values guide](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values) discusses these choices. The exact combination is illustrative and should be compile-tested against pinned versions before being published as executable code.

```tsx
const projectOptions = (id: string) =>
  queryOptions({
    queryKey: ['project', id],
    queryFn: ({ signal }) => getProject(id, signal),
  })
const Route = createFileRoute('/projects/$projectId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(projectOptions(params.projectId)),
  pendingComponent: () => <p role="status">Loading project…</p>,
  errorComponent: ({ reset }) => (
    <button onClick={reset}>Could not load project. Retry</button>
  ),
  component: ProjectPage,
})
```

```tsx
function ProjectPage() {
  const { projectId } = Route.useParams()
  const project = useSuspenseQuery(projectOptions(projectId))
  return (
    <ProjectEditor
      key={projectId}
      projectId={projectId}
      project={project.data}
    />
  )
}
function ProjectEditor({
  projectId,
  project,
}: {
  projectId: string
  project: Project
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (values: EditProject) => putProject(projectId, values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const form = useForm({
    defaultValues: { name: project.name, ownerEmail: project.ownerEmail },
    validators: { onChange: editSchema },
    onSubmit: ({ value }) => save.mutateAsync(value),
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="name-error"
            />
            <p id="name-error">{field.state.meta.errors[0]?.message}</p>
          </>
        )}
      </form.Field>
      <form.Field name="ownerEmail">
        {(field) => (
          <>
            <label htmlFor="owner-email">Owner email</label>
            <input
              id="owner-email"
              value={field.state.value}
              onInput={(event) => field.handleChange(event.currentTarget.value)}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="owner-email-error"
            />
            <p id="owner-email-error">{field.state.meta.errors[0]?.message}</p>
          </>
        )}
      </form.Field>
      <p role="alert">{save.error?.message}</p>
      <button type="submit" disabled={save.isPending}>
        Save
      </button>
    </form>
  )
}
```

The native inputs expose the field wiring. TanStack Router's [external data loading guide](https://tanstack.com/router/latest/docs/guide/external-data-loading) recommends coordinating the loader and cache. TanStack Query's [mutation API](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useMutation) documents success invalidation. TanStack Form [supports Standard Schema](https://tanstack.com/form/latest/docs/framework/react/guides/validation), so Benos does not claim a validator-compatibility advantage.

### React with shadcn/ui fields

The alternative below uses the **same** React route/query setup above, the same TanStack Form model, and shadcn/ui's current `Field`, `FieldLabel`, `FieldError`, `Input`, and `Button` composition. This is the closer UI comparison because the Benos example uses its UI `Input` and a proposed field adapter. It follows the [official shadcn TanStack Form pattern](https://ui.shadcn.com/docs/forms/tanstack-form); these are app-local generated shadcn components, whose implementation lines are excluded just as Benos registry component implementation lines are excluded.

```tsx
function ProjectPageShadcn() {
  const { projectId } = Route.useParams()
  const project = useSuspenseQuery(projectOptions(projectId))
  return (
    <ProjectEditorShadcn
      key={projectId}
      projectId={projectId}
      project={project.data}
    />
  )
}

function ProjectEditorShadcn({
  projectId,
  project,
}: {
  projectId: string
  project: Project
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (values: EditProject) => putProject(projectId, values),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const form = useForm({
    defaultValues: { name: project.name, ownerEmail: project.ownerEmail },
    validators: { onChange: editSchema, onSubmit: editSchema },
    onSubmit: ({ value }) => save.mutateAsync(value),
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => {
          const invalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={invalid}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={invalid}
                aria-describedby="name-error"
              />
              {invalid && (
                <FieldError id="name-error" errors={field.state.meta.errors} />
              )}
            </Field>
          )
        }}
      </form.Field>
      <form.Field name="ownerEmail">
        {(field) => {
          const invalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={invalid}>
              <FieldLabel htmlFor="owner-email">Owner email</FieldLabel>
              <Input
                id="owner-email"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={invalid}
                aria-describedby="owner-email-error"
              />
              {invalid && (
                <FieldError
                  id="owner-email-error"
                  errors={field.state.meta.errors}
                />
              )}
            </Field>
          )
        }}
      </form.Field>
      <p role="alert">{save.error?.message}</p>
      <Button type="submit" disabled={save.isPending}>
        Save
      </Button>
    </form>
  )
}
```

All three code samples are formatted by repository Prettier with **no ignore directives**. Counts below use nonblank lines inside the shown TSX fences after formatting. The full slice adds the shared route/query setup to each respective editor; imports, shared types/schema/transports, and UI component implementations are excluded for all three. The shadcn variant shares the React route/query block, counted once for its full-slice total.

| Formatted nonblank lines | Benos target | React native inputs | React shadcn/ui |
| ------------------------ | -----------: | ------------------: | --------------: |
| Page/editor block        |           13 |                  73 |              92 |
| Full shown slice         |           46 |                  87 |             106 |

Both React variants use typed TanStack Router params, a route loader that primes Query, TanStack Form's dirty-field-preserving defaults, and explicit success invalidation. The Benos target uses a typed route reference, atomic route data/identity commit, the proposed form adapter, and a mutation's typed `affects` rule. The shadcn example connects its field errors to shadcn `Input` through `FieldError`; the native version renders its own error text.

**Design gate:** the line-count advantage is a proposed 0.5 API result, not a 0.4 deliverable or runtime benchmark. It disappears if `projectForm` needs manual sync/reset/invalidate logic, if `<form.Field>` cannot use the existing `Input` without hidden behavior, or if the router remounts this editor to fix param changes. R5 should prototype the route/data part. The 0.5 implementation must test Zod, Valibot, and ArkType and measure the equivalent React example before making a product claim.

## Acceptance tests reserved for 0.5

- Type errors for a wrong route param, unrelated cache key in `affects`, invalid field name, and incompatible schema output/mutation input.
- A → B navigation with the same editor owner changes data only at commit; a background A result cannot alter B.
- A same-record refetch updates pristine fields without overwriting dirty edits; a save finishing after navigation refreshes its input record's key.
- Standard Schema sync/async validation and nested issue paths produce field errors linked by `aria-describedby`; root issues appear in the form alert.
- Mutation failure remains in form state and does not reach the DOM event error reporter; retry clears it.

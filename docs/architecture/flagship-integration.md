# Flagship integration target for 0.5.0

**Status:** R1 design, amended at query Q1 (approved 2026-10-19): `fetch` takes `(args, { signal })`, the redundant `key` line is gone, and route data is a query entry handle. Amended again at forms F1 (approved 2026-10-20): `from` is pure, the default mutation input is `{ ...params, values }`, the blocker policy is `leave: 'confirm'`, and the field and alert wiring are spelled out ([forms.md](./forms.md)). Made executable at forms F5: every code block below is the `// #region flagship` code of [`examples/flagship`](../../examples/flagship), the line counts are measured from it, and `pnpm check:flagship` fails if this page and the code drift apart. The React stack is pinned and compile-tested. Route and async pieces shipped in 0.4.0; the query cache, mutations, forms, and the navigation blocker are implemented on the `forms` branch and ship in 0.5.0. This replaces the old sketch: its one-time `projectQuery.value(params())` lookup went stale, and its refetch effect overwrote edits.

## Project editor slice

The declarations outside the editor establish the transport, Standard Schema validator, route, cache identity, and mutation policy. Both stacks use the same `Project`, `EditProject`, `getProject`, and `putProject` transports ([`src/shared/project.ts`](../../examples/flagship/src/shared/project.ts)) and the same Zod `editSchema` ([`src/shared/schema.ts`](../../examples/flagship/src/shared/schema.ts)); the flagship tests also run the editor with Valibot and ArkType schemas. This shared setup is not counted as editor lines. It is three modules: `data.ts`, `routes/refs.ts`, and `routes/manifest.tsx`. The router is created by a function so the app passes `browserHistory()` and the tests pass `memoryHistory()`.

```tsx
// data.ts: the cached query and the save mutation's identity rule
export const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
})
export const saveProject = mutation({
  run: (input: { projectId: string; values: EditProject }) =>
    putProject(input.projectId, input.values),
  affects: (input) => [projectQuery.key(input.projectId)],
})
// routes/refs.ts has no component import
export const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
export const projectForm = formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
// routes/manifest.tsx imports refs, but never imports the page eagerly
export const createAppRouter = (history: RouterHistory) =>
  createRouter({
    history,
    routes: [
      mountRoute(projectRoute, {
        lazy: () => import('../pages/project-editor.js'),
        pending: () => <p role="status">Loading project…</p>,
        error: ({ retry }) => (
          <button onClick={retry}>Could not load project. Retry</button>
        ),
      }),
    ],
  })
```

`params.projectId` is inferred as `string` from the path literal. `projectQuery.load` is a 0.5 adapter to the 0.4 route loader/resource contract: it resolves to the cache entry's `QueryEntry<Project>` handle, so `projectRoute.match().data()` is that handle and `match.data().value()` is a live cache signal ([query.md](./query.md#router-loaders-share-identity-with-queries)). The query definition is the cache namespace, so no key function is needed for a single string argument. `affects` is a **declarative identity rule** evaluated from the completed mutation input. The mutation executor refreshes precisely those entries after success. It uses the saved record's ID, even if the user has navigated elsewhere by the time saving finishes. A failed save does not refresh. Nothing in the component manually invalidates a cache entry.

`<form.Field>` is the 0.5 form/UI adapter: it renders a visible label, the existing registry `Input`, and a field error with stable `id`/`aria-describedby`, passing `id`, `name`, `value`, `onInput`, `onBlur`, `invalid`, and a merged `aria-describedby` to `Input`. The current `Input` already accepts those props; no UI component API change is assumed. The editor calls the form model bound to its route reference; no runtime import of the router instance is needed.

```tsx
export default function ProjectEditor() {
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

`formModel.from` projects the loaded `Project` into editable `EditProject` fields; it must not pass the server object wholesale into the form. It runs inside a `computed`, so it must be pure. `projectForm()` reads `projectRoute.match()` under its current component owner and binds mutation input from the current **committed** match identity and validated form output: by default `{ ...params, values }`, which is exactly `saveProject`'s `{ projectId, values }` input, so no `input` option is needed. Its source is the route's stable loader-data signal, read as `match.data().value()`: a new handle at commit is a new identity, and an in-place change of `value()` is a same-identity refetch; the router starts loading before the initial editor render and updates that signal when same-route params change. The form captures an editable copy when an identity first becomes ready. A background refetch for the **same** identity updates pristine fields/baseline but never overwrites dirty fields; if server data conflicts, the form exposes `remoteChanged`. A different identity resets from the new committed data only after navigation commits. Unsaved changes during navigation use an explicit blocker policy: `leave: 'confirm'` is the default and asks before a navigation while the form is dirty, through the router's owner-bound `blockNavigation` (a 0.5 router addition), including the browser's Back and Forward buttons and page unload. Either way, the editor never carries record A's edits into B.

Submission calls `schema['~standard'].validate`, awaits async validators, maps issue paths to fields (an unmatched path goes to the nearest ancestor field, then to the root), blocks invalid input, and passes parsed output to the mutation. `form.error()` shows the first root issue, or the save error when there is none. A rejected mutation is captured as `form.error()` and `form.submitting()` covers the save. It does not throw from a browser event callback. [Standard Schema](https://standardschema.dev/) supplies validation, input/output types, and issue paths, but does not introspect field names or render fields; field names remain explicit in JSX.

Initial loading and loader failure are route-level states above the editor. The shared layout can read owner-bound `navigation()` for an accessible pending-navigation indicator without importing `routes/manifest.ts`. A same-route param change retains the old editor while the new loader runs, then changes match params and data in one commit without remounting `ProjectEditor`. The form identity rule resets at that commit. A failed loader commits the destination URL with its route error recovery view; retry is explicit. The editor never calls `createRoot`: its component owner supplies lifetime and disposal.

## Equivalent React stack

This editor uses React 19.3.0, TanStack Router 1.170.41, TanStack Query 5.104.1, and TanStack Form 1.33.5 with the same transport and schema; [`src/react`](../../examples/flagship/src/react) is compile-tested with `pnpm check:flagship`. Its route primes the Query cache. It uses code-based routes (`createRootRouteWithContext`, `createRoute`) so it compiles without the file-route generator, and its setup creates the router, as the Benos setup does. A keyed editor resets form state on a record change; a same-record refetch uses TanStack Form's changing defaults behavior. The [async initial values guide](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values) discusses these choices.

For the same behavior as the Benos editor, the React editors also block navigation while the form differs from its defaults (`useBlocker`, with `enableBeforeUnload`), and reset the form to the saved values after a successful save, so leaving after saving does not ask. The Benos form gets both from `leave: 'confirm'` and its post-save rebase.

```tsx
export const projectOptions = (id: string) =>
  queryOptions({
    queryKey: ['project', id],
    queryFn: ({ signal }) => getProject(id, signal),
  })
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()()
export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(projectOptions(params.projectId)),
  pendingComponent: () => <p role="status">Loading project…</p>,
  errorComponent: ({ reset }) => (
    <button onClick={reset}>Could not load project. Retry</button>
  ),
  component: lazyRouteComponent(() => import('./native.js')),
})
export const createAppRouter = (history: RouterHistory) =>
  createRouter({
    routeTree: rootRoute.addChildren([projectRoute]),
    context: { queryClient: new QueryClient() },
    history,
  })
```

```tsx
export default function ProjectPage() {
  const { projectId } = projectRoute.useParams()
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
    onSubmit: async ({ value, formApi }) => {
      await save.mutateAsync(value)
      formApi.reset(value)
    },
  })
  useBlocker({
    shouldBlockFn: () =>
      !form.state.isDefaultValue && !window.confirm('Discard unsaved changes?'),
    enableBeforeUnload: () => !form.state.isDefaultValue,
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

The alternative below uses the **same** React route/query setup above, the same TanStack Form model, and shadcn/ui's current `Field`, `FieldLabel`, `FieldError`, `Input`, and `Button` composition. This is the closer UI comparison because the Benos example uses its UI `Input` and a proposed field adapter. It follows the [official shadcn TanStack Form pattern](https://ui.shadcn.com/docs/forms/tanstack-form). shadcn components are generated into the app; the example has minimal app-local stand-ins with the same props ([`src/react/components/ui`](../../examples/flagship/src/react/components/ui)), whose implementation lines are excluded just as Benos registry component implementation lines are excluded.

```tsx
export default function ProjectPage() {
  const { projectId } = projectRoute.useParams()
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
    validators: { onChange: editSchema, onSubmit: editSchema },
    onSubmit: async ({ value, formApi }) => {
      await save.mutateAsync(value)
      formApi.reset(value)
    },
  })
  useBlocker({
    shouldBlockFn: () =>
      !form.state.isDefaultValue && !window.confirm('Discard unsaved changes?'),
    enableBeforeUnload: () => !form.state.isDefaultValue,
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

All code samples are formatted by repository Prettier with **no ignore directives**. Counts below are nonblank lines inside the shown TSX fences, measured by [`count-lines.mjs`](../../examples/flagship/scripts/count-lines.mjs). The full slice adds the shared route/query setup to each respective editor; imports, shared types/schema/transports, and UI component implementations are excluded for all three. The shadcn variant shares the React route/query block, counted once for its full-slice total.

| Formatted nonblank lines | Benos | React native inputs | React shadcn/ui |
| ------------------------ | ----: | ------------------: | --------------: |
| Page/editor block        |    13 |                  81 |             100 |
| Full shown slice         |    49 |                 104 |             123 |

The R1 sketch estimated 13 / 73 / 92 and 46 / 87 / 106. The Benos editor block is unchanged. The Benos setup grew by three lines: the router factory with its `history` option (the sketch omitted `history`, which `createRouter` requires) and a third file comment. Each React editor grew by eight lines for the leave policy and the post-save reset described above. The React setup grew from 14 to 23 lines because it now defines its root route and creates its router, which the sketch left out and the Benos setup always counted.

Production bundles of the whole slice, gzipped ([`comparison-results.json`](../../examples/flagship/comparison-results.json), `pnpm --filter @benosjs/flagship compare`):

| Gzipped JavaScript         |    Benos | React native inputs | React shadcn/ui |
| -------------------------- | -------: | ------------------: | --------------: |
| With the Zod schema        | 47,875 B |           147,815 B |       148,268 B |
| With a hand-written schema | 24,923 B |           124,879 B |       125,328 B |

The second row replaces Zod with a hand-written Standard Schema that makes the same checks, so it measures each stack alone. The React builds include React DOM and TanStack Router, Query, and Form; the Benos build includes core, DOM, async, router, query, forms, and the registry `Input` and `Button`.

Both React variants use typed TanStack Router params, a route loader that primes Query, TanStack Form's dirty-field-preserving defaults, explicit success invalidation, and a navigation blocker. The Benos editor uses a typed route reference, atomic route data/identity commit, the form adapter, a mutation's typed `affects` rule, and the default leave policy. The shadcn example connects its field errors to shadcn `Input` through `FieldError`; the native version renders its own error text.

**Design gate, measured at F5:** the line-count advantage holds in executable code. `projectForm` needs no manual sync, reset, or invalidation; `<form.Field>` uses the existing registry `Input` with no hidden behavior; and a same-route param change keeps the editor mounted (the acceptance tests assert the same `<form>` element before and after). The editor is tested with Zod, Valibot, and ArkType. The line counts are an authoring result, not a runtime benchmark. [forms-findings.md](../forms-findings.md) discusses what they do and do not show.

## Acceptance tests

Each item is tested against the executable slice in [`examples/flagship/tests`](../../examples/flagship/tests), with the package tests that cover the same rule in more cases:

- Type errors for a wrong route param, unrelated cache key in `affects`, invalid field name, and incompatible schema output/mutation input: [`tests/types.ts`](../../examples/flagship/tests/types.ts), plus `packages/forms/tests/types.test.ts` and `packages/query/tests/types.test.ts`.
- A → B navigation with the same editor owner changes data only at commit; a background A result cannot alter B: `changes data only at the commit of B, in the same editor` and `ignores a background result for A after B committed` in [`flagship.test.tsx`](../../examples/flagship/tests/flagship.test.tsx), plus `packages/forms/tests/route.test.ts`.
- A same-record refetch updates pristine fields without overwriting dirty edits; a save finishing after navigation refreshes its input record's key: `updates pristine fields on a same-record refetch and keeps dirty ones` and `refreshes the saved record when the save finishes after navigating away`.
- Standard Schema sync/async validation and nested issue paths produce field errors linked by `aria-describedby`; root issues appear in the form alert: `links schema errors to their fields and focuses the first one`, `awaits an async validator and shows root issues in the alert`, and `validates the same editor with valibot/arktype`. Nested and array paths are in `packages/forms/tests/validation.test.ts`, which the flagship schema has none of.
- Mutation failure remains in form state and does not reach the DOM event error reporter; retry clears it: `keeps a failed save in form state without reporting it, and retry clears it`.
- Unsaved changes ask before leaving (`leave: 'confirm'`): `asks before leaving unsaved changes`, plus the dashboard browser tests for links and a refused Back in Chromium, Firefox, and WebKit.

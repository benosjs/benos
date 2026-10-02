# Flagship integration type sketch

**Status:** Phase 5d checkpoint ready. This is a type-level design exercise;
route, query, forms, mutation, and cache packages are not implemented here.

The flagship slice is a project editor. A route supplies a typed `projectId`, a
query loads the corresponding project, a form validates an edit, a mutation
saves it, and the mutation invalidates the same query through a typed query
reference. Cache invalidation never accepts an unbranded string key.

## Typed references

```ts
import {
  computed,
  createRoot,
  effect,
  signal,
  type ReadonlySignal,
  type Signal,
} from '@benosjs/core'

interface ProjectParams {
  projectId: string
}

interface Project {
  id: string
  name: string
  ownerEmail: string
}

interface EditProject {
  name: string
  ownerEmail: string
}

type ProjectCacheKey = {
  readonly kind: 'project'
  readonly id: string
}

interface RouteRef<Params> {
  readonly params: ReadonlySignal<Params>
}

interface QueryRef<Params, Key, Value> {
  readonly route: RouteRef<Params>
  readonly key: (params: Params) => Key
  readonly value: (params: Params) => ReadonlySignal<Value | undefined>
}

interface Validation<T> {
  readonly value: T | undefined
  readonly errors: ReadonlyArray<string>
}

interface FormRef<Values> {
  readonly values: Signal<Values>
  readonly validation: ReadonlySignal<Validation<Values>>
  readonly submit: () => Promise<Values | undefined>
}

interface MutationRef<Input, Output, Query> {
  readonly execute: (input: Input) => Promise<Output>
  readonly invalidates: Query
}

type QueryKey<Q> = Q extends QueryRef<any, infer Key, any> ? Key : never

declare function route<Params>(pattern: string): RouteRef<Params>
declare function query<Params, Key, Value>(
  route: RouteRef<Params>,
  key: (params: Params) => Key,
): QueryRef<Params, Key, Value>
declare function form<Values>(
  initial: Values,
  validate: (values: Values) => Validation<Values>,
): FormRef<Values>
declare function mutation<Input, Output, Query>(
  query: Query,
  execute: (input: Input) => Promise<Output>,
): MutationRef<Input, Output, Query>
declare function invalidate<Q extends QueryRef<any, any, any>>(
  query: Q,
  key: QueryKey<Q>,
): void
declare function saveProjectToTransport(input: EditProject): Promise<Project>
```

`RouteRef`, `QueryRef`, `FormRef`, and `MutationRef` are object references with
generic relationships. Their runtime implementations may use strings for URLs
or transport details, but the application-facing cache operation receives a
`QueryRef` and its inferred `QueryKey`, not a string name.

## Flagship declaration

```ts
const projectRoute = route<ProjectParams>('/projects/:projectId')

const projectQuery = query<ProjectParams, ProjectCacheKey, Project>(
  projectRoute,
  (params) => ({ kind: 'project', id: params.projectId }),
)

const editProject = mutation<EditProject, Project, typeof projectQuery>(
  projectQuery,
  async (input) => saveProjectToTransport(input),
)

const projectForm = form<EditProject>(
  { name: '', ownerEmail: '' },
  (values) => ({
    value:
      values.name.trim() && values.ownerEmail.includes('@')
        ? values
        : undefined,
    errors: [
      ...(values.name.trim() ? [] : ['Name is required']),
      ...(values.ownerEmail.includes('@') ? [] : ['Email is invalid']),
    ],
  }),
)

function ProjectEditor() {
  return createRoot(() => {
    const params = projectRoute.params
    const project = projectQuery.value(params())
    const validation = projectForm.validation
    const saving = signal(false)
    const saveError = signal<unknown>(undefined)

    effect(() => {
      const current = project()
      if (current) projectForm.values.set(current)
    })

    const canSubmit = computed(
      () => validation().value !== undefined && !saving(),
    )

    const submit = async () => {
      const checked = validation().value
      if (!checked || !canSubmit()) return
      saving.set(true)
      saveError.set(undefined)
      try {
        const saved = await editProject.execute(checked)
        projectForm.values.set(saved)
        invalidate(editProject.invalidates, projectQuery.key(params()))
      } catch (error) {
        saveError.set(error)
      } finally {
        saving.set(false)
      }
    }

    return { params, project, validation, canSubmit, saving, saveError, submit }
  })
}
```

The example intentionally uses the current core's real generic contracts:
`Signal<T>` preserves writable value types, `ReadonlySignal<T>` preserves
read-only reads, `computed` returns a typed `ReadonlySignal<T>`, and
`createRoot`, `effect`, and `onCleanup` provide lifetime boundaries. The later
query/forms packages own the declarations around those primitives; no core
API expansion is needed for this shape.

The sketch also exposes one integration policy: the query's route parameters
and cache key are distinct types. A mutation tied to `typeof projectQuery`
cannot accidentally invalidate an unrelated query, even when two endpoints
happen to use similar transport strings.

## Type-level acceptance checks

The eventual consumer fixture should include assertions equivalent to these
`expect-type` checks:

```ts
expectTypeOf(projectRoute.params()).toEqualTypeOf<ProjectParams>()
expectTypeOf(project()).toEqualTypeOf<Project | undefined>()
expectTypeOf(
  projectQuery.key({ projectId: 'p-1' }),
).toEqualTypeOf<ProjectCacheKey>()
expectTypeOf(projectForm.values()).toEqualTypeOf<EditProject>()
expectTypeOf(projectForm.validation().value).toEqualTypeOf<
  EditProject | undefined
>()
expectTypeOf(
  editProject.execute({ name: 'A', ownerEmail: 'a@example.test' }),
).toEqualTypeOf<Promise<Project>>()
expectTypeOf(
  invalidate(editProject.invalidates, projectQuery.key({ projectId: 'p-1' })),
).toEqualTypeOf<void>()
// @ts-expect-error: an arbitrary string is not a typed query key.
invalidate(editProject.invalidates, 'project:p-1')
```

These assertions are a design gate for Phase 6's `expect-type` consumer tests.
They confirm that route parameters, query data, form validation, mutation
output, and cache invalidation remain connected through generic references while
the synchronous Benos core stays small.

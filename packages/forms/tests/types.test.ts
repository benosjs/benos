import { expectTypeOf } from 'expect-type'
import { expect, it } from 'vitest'
import { route } from '@benosjs/router'
import { mutation, query } from '@benosjs/query'
import { formModel } from '../src/index.js'
import type {
  FieldHandle,
  FieldPath,
  Form,
  FormModel,
  FormSubmitResult,
  InferInput,
  InferOutput,
  PathValue,
  StandardSchemaV1,
} from '../src/index.js'

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
declare const editSchema: StandardSchemaV1<EditProject>
/** A schema whose output differs from its input, like a transform. */
declare const countSchema: StandardSchemaV1<
  { count: string },
  { count: number }
>

const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
})
const saveProject = mutation({
  run: (input: { projectId: string; values: EditProject }) =>
    putProject(input.projectId, input.values),
  affects: (input) => [projectQuery.key(input.projectId)],
})
const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
const pick = (project: Project): EditProject => ({
  name: project.name,
  ownerEmail: project.ownerEmail,
})

function checkSchemaTypes(): void {
  expectTypeOf<InferInput<typeof editSchema>>().toEqualTypeOf<EditProject>()
  expectTypeOf<InferInput<typeof countSchema>>().toEqualTypeOf<{
    count: string
  }>()
  expectTypeOf<InferOutput<typeof countSchema>>().toEqualTypeOf<{
    count: number
  }>()
}
void checkSchemaTypes

function checkFlagshipTypes(): void {
  const projectForm = formModel({
    route: projectRoute,
    schema: editSchema,
    from: (project: Project): EditProject => ({
      name: project.name,
      ownerEmail: project.ownerEmail,
    }),
    save: saveProject,
  })
  expectTypeOf(projectForm).toEqualTypeOf<
    FormModel<EditProject, EditProject, Project>
  >()
  const form = projectForm()
  expectTypeOf(form).toEqualTypeOf<Form<EditProject, EditProject, Project>>()
  expectTypeOf(form.values()).toEqualTypeOf<EditProject>()
  expectTypeOf(form.field('ownerEmail')).toEqualTypeOf<FieldHandle<string>>()
  expectTypeOf(form.field('name').value()).toEqualTypeOf<string>()
  expectTypeOf(form.submit()).toEqualTypeOf<
    Promise<FormSubmitResult<Project>>
  >()
  expectTypeOf(form.error()).toEqualTypeOf<string | undefined>()
  // @ts-expect-error Field names are checked against the schema input.
  form.field('ownr')
  // @ts-expect-error Field values are typed.
  form.field('name').set(1)
  // @ts-expect-error acceptRemote takes a field name.
  form.acceptRemote('ownr')

  void form.submit().then((result) => {
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<Project>()
    else if (result.reason === 'failed')
      expectTypeOf(result.cancelled).toEqualTypeOf<boolean>()
  })

  // The loader data reaches `from` as the entry's value.
  formModel({
    route: projectRoute,
    schema: editSchema,
    from: (project) => {
      expectTypeOf(project).toEqualTypeOf<Project>()
      return pick(project)
    },
    save: saveProject,
  })
  const plainRoute = route('/plain/:projectId', {
    loader: () => ({ name: 'n', ownerEmail: 'e' }),
  })
  formModel({
    route: plainRoute,
    schema: editSchema,
    from: (data) => ({ name: data.name, ownerEmail: data.ownerEmail }),
    save: saveProject,
  })
}
void checkFlagshipTypes

function checkRejectedOptions(): void {
  // @ts-expect-error `from` must return the schema input.
  formModel({
    route: projectRoute,
    schema: editSchema,
    from: (project: Project) => ({ name: project.name }),
    save: saveProject,
  })
  const noLoader = route('/none/:projectId')
  // @ts-expect-error A route-bound form needs loader data.
  formModel({
    route: noLoader,
    schema: editSchema,
    from: pick,
    save: saveProject,
  })
  // @ts-expect-error Exactly one source: route, source, or initial.
  formModel({
    route: projectRoute,
    source: () => undefined,
    schema: editSchema,
    from: pick,
    save: saveProject,
  })

  const saveById = mutation({
    run: (input: { id: string; values: EditProject }) =>
      putProject(input.id, input.values),
  })
  // @ts-expect-error The default input { projectId, values } does not fit; `input` is required.
  formModel({
    route: projectRoute,
    schema: editSchema,
    from: pick,
    save: saveById,
  })
  formModel({
    route: projectRoute,
    schema: editSchema,
    from: pick,
    save: saveById,
    input: (values, { params }) => ({ id: params.projectId, values }),
  })
  const saveNumbers = mutation({
    run: (input: { projectId: string; values: { name: number } }) =>
      Promise.resolve(input.projectId),
  })
  // @ts-expect-error The schema output does not fit the mutation's values.
  formModel({
    route: projectRoute,
    schema: editSchema,
    from: pick,
    save: saveNumbers,
  })
}
void checkRejectedOptions

function checkOtherSources(record: () => Project | undefined): void {
  const saveValues = mutation({
    run: (values: EditProject) => putProject('p', values),
  })
  const sourced = formModel({
    source: record,
    schema: editSchema,
    from: pick,
    save: saveValues,
  })
  expectTypeOf(sourced).toEqualTypeOf<
    FormModel<EditProject, EditProject, Project, true>
  >()
  const form = sourced()
  expectTypeOf(form.values()).toEqualTypeOf<EditProject | undefined>()
  expectTypeOf(form.field('name').value()).toEqualTypeOf<string | undefined>()
  form.field('name').set('x')

  const created = formModel({
    initial: () => ({ count: '' }),
    schema: countSchema,
    save: mutation({ run: (input: { count: number }) => input.count }),
  })
  expectTypeOf(created().values()).toEqualTypeOf<{ count: string }>()
  expectTypeOf(created().submit()).toEqualTypeOf<
    Promise<FormSubmitResult<number>>
  >()
  // @ts-expect-error The mutation receives the schema output, not its input.
  formModel({
    initial: () => ({ count: '' }),
    schema: countSchema,
    save: mutation({ run: (input: { count: string }) => input.count }),
  })
}
void checkOtherSources

function checkPaths(): void {
  interface Profile {
    name: string
    address?: { city: string }
    tags: string[]
    rows: { id: string; done: boolean }[]
    born: Date
  }
  expectTypeOf<FieldPath<Profile>>().toEqualTypeOf<
    | 'name'
    | 'address'
    | 'address.city'
    | 'tags'
    | `tags.${number}`
    | 'rows'
    | `rows.${number}`
    | `rows.${number}.id`
    | `rows.${number}.done`
    | 'born'
  >()
  expectTypeOf<PathValue<Profile, 'address.city'>>().toEqualTypeOf<
    string | undefined
  >()
  expectTypeOf<PathValue<Profile, 'rows.0.done'>>().toEqualTypeOf<boolean>()
  expectTypeOf<PathValue<Profile, 'tags.3'>>().toEqualTypeOf<string>()
  expectTypeOf<PathValue<Profile, 'born'>>().toEqualTypeOf<Date>()
}
void checkPaths

it('compiles the public forms types', () => {
  expect(typeof formModel).toBe('function')
})

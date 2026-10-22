import { expectTypeOf } from 'expect-type'
import { expect, it } from 'vitest'
import { route } from '@benosjs/router'
import { mutation, query } from '@benosjs/query'
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import { checked, choice, formModel, select, text } from '../src/index.js'
import type * as checkbox from '../../../registry/source/components/checkbox.js'
import type * as input from '../../../registry/source/components/input.js'
import type * as radioGroup from '../../../registry/source/components/radio-group.js'
import type * as selectBox from '../../../registry/source/components/select.js'
import type * as toggle from '../../../registry/source/components/switch.js'
import type * as textarea from '../../../registry/source/components/textarea.js'
import type {
  FieldHandle,
  FieldPath,
  Form,
  FormIssue,
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

function checkLibraryTypes(): void {
  const zodSchema = z.object({
    age: z.coerce.number(),
    name: z.string().transform((name) => name.trim()),
  })
  expectTypeOf<InferInput<typeof zodSchema>>().toEqualTypeOf<{
    age: unknown
    name: string
  }>()
  expectTypeOf<InferOutput<typeof zodSchema>>().toEqualTypeOf<{
    age: number
    name: string
  }>()
  const zodForm = formModel({
    initial: () => ({ age: '1', name: 'x' }),
    schema: zodSchema,
    save: mutation({
      run: (input: { age: number; name: string }) => input.age,
    }),
  })()
  expectTypeOf(zodForm.values()).toEqualTypeOf<{ age: unknown; name: string }>()
  // @ts-expect-error The mutation receives the parsed output: age is a number.
  formModel({
    initial: () => ({ age: '1', name: 'x' }),
    schema: zodSchema,
    save: mutation({
      run: (input: { age: string; name: string }) => input.age,
    }),
  })

  const valibotSchema = v.object({
    email: v.pipe(v.string(), v.email()),
    tags: v.array(v.string()),
  })
  const valibotForm = formModel({
    initial: () => ({ email: '', tags: [] }),
    schema: valibotSchema,
    save: mutation({
      run: (input: { email: string; tags: string[] }) => input.email,
    }),
  })()
  expectTypeOf(valibotForm.field('tags.0').value()).toEqualTypeOf<string>()

  const arkSchema = type({ address: { city: 'string' }, count: 'number' })
  const arkForm = formModel({
    initial: () => ({ address: { city: '' }, count: 0 }),
    schema: arkSchema,
    save: mutation({
      run: (input: { address: { city: string }; count: number }) => input.count,
    }),
  })()
  expectTypeOf(arkForm.field('address.city').value()).toEqualTypeOf<string>()
  // @ts-expect-error Field names come from the schema.
  arkForm.field('address.town')

  expectTypeOf(arkForm.issues()).toEqualTypeOf<readonly FormIssue[]>()
  expectTypeOf(arkForm.validating()).toEqualTypeOf<boolean>()
  expectTypeOf(arkForm.field('count').error()).toEqualTypeOf<
    string | undefined
  >()
  expectTypeOf(arkForm.field('count').invalid()).toEqualTypeOf<boolean>()
  formModel({
    initial: () => ({ address: { city: '' }, count: 0 }),
    schema: arkSchema,
    save: mutation({
      run: (input: { address: { city: string }; count: number }) => input.count,
    }),
    validate: 'blur',
  })
  formModel({
    initial: () => ({ address: { city: '' }, count: 0 }),
    schema: arkSchema,
    save: mutation({
      run: (input: { address: { city: string }; count: number }) => input.count,
    }),
    // @ts-expect-error Validation timing is one of three modes.
    validate: 'input',
  })
}
void checkLibraryTypes

// Type-only: the registry components are TSX that vitest does not compile here.
declare const Checkbox: typeof checkbox.Checkbox
declare const Input: typeof input.Input
declare const RadioGroup: typeof radioGroup.RadioGroup
declare const Select: typeof selectBox.Select
declare const Switch: typeof toggle.Switch
declare const Textarea: typeof textarea.Textarea

function checkFieldTypes(): void {
  const settings = formModel({
    initial: () => ({
      name: '',
      bio: '',
      age: 0,
      archived: false,
      notify: true,
      tier: null as string | null,
      region: 'eu' as string | null,
    }),
    schema: {} as StandardSchemaV1<{
      name: string
      bio: string
      age: number
      archived: boolean
      notify: boolean
      tier: string | null
      region: string | null
    }>,
    save: mutation({ run: (input: { name: string }) => input.name }),
    input: (values) => ({ name: values.name }),
  })
  const form = settings()
  const Field = form.Field
  Field({ name: 'name', component: Input, label: 'Name', placeholder: 'Ada' })
  Field({ name: 'name', component: Input, label: 'Name', bind: text })
  Field({ name: 'bio', component: Textarea, label: 'Bio', rows: 4 })
  Field({ name: 'archived', component: Checkbox, bind: checked, label: 'A' })
  Field({ name: 'notify', component: Switch, bind: checked, label: 'N' })
  Field({
    name: 'tier',
    component: RadioGroup,
    bind: choice,
    label: 'T',
    items: [],
  })
  Field({
    name: 'region',
    component: Select,
    bind: select,
    label: 'R',
    items: [],
  })
  Field({
    name: 'name',
    component: Input,
    label: 'Name',
    'aria-describedby': 'hint',
  })
  // @ts-expect-error Field names come from the schema input.
  Field({ name: 'nmae', component: Input, label: 'Name' })
  // @ts-expect-error The default text adapter needs a string field.
  Field({ name: 'age', component: Input, label: 'Age' })
  // @ts-expect-error The checked adapter needs a boolean field.
  Field({ name: 'name', component: Checkbox, bind: checked, label: 'Name' })
  Field({
    name: 'region',
    // @ts-expect-error Select takes the select adapter, not choice.
    component: Select,
    bind: choice,
    label: 'R',
    items: [],
  })
  // @ts-expect-error Forwarded props are checked against the component.
  Field({ name: 'name', component: Input, label: 'Name', type: 'checkbox' })
  // @ts-expect-error Unknown props are rejected.
  Field({ name: 'name', component: Input, label: 'Name', colour: 'red' })
  // @ts-expect-error The label is required.
  Field({ name: 'name', component: Input })
  // @ts-expect-error Controlled props cannot be passed.
  Field({ name: 'name', component: Input, label: 'Name', value: 'x' })

  const handle = form.field('name')
  expectTypeOf(handle.id).toEqualTypeOf<string>()
  expectTypeOf(handle.errorId).toEqualTypeOf<string>()
  expectTypeOf(handle.describedBy()).toEqualTypeOf<string | undefined>()
}
void checkFieldTypes

it('compiles the public forms types', () => {
  expect(typeof formModel).toBe('function')
})

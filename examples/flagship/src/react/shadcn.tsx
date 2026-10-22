import { useForm } from '@tanstack/react-form'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import type { Project, EditProject } from '../shared/project.js'
import { putProject } from '../shared/project.js'
import { editSchema } from '../shared/schema.js'
import { Button } from './components/ui/button.js'
import { Field, FieldError, FieldLabel } from './components/ui/field.js'
import { Input } from './components/ui/input.js'
import { projectOptions, projectRoute } from './routes.js'

// #region flagship
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
// #endregion

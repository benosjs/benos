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
// #endregion

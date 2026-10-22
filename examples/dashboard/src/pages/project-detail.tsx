/** @jsxImportSource @benosjs/dom */

import { signal } from '@benosjs/core'
import { Show } from '@benosjs/dom'
import { formModel } from '@benosjs/forms'
import { Link } from '@benosjs/router'
import * as v from 'valibot'
import { Button } from '../../../../registry/source/components/button.js'
import { Card } from '../../../../registry/source/components/card.js'
import { Input } from '../../../../registry/source/components/input.js'
import { saveProject, toggleStar } from '../data/queries.js'
import type { Project } from '../data/projects.js'
import { projectRoute, projectsRoute } from '../routes/refs.js'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The request failed.'
}

const editSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(2, 'Names need at least two characters.'),
  ),
  owner: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter an owner.')),
})

// Follows the committed project: a different project resets the form at
// commit, a refetch of the same one updates only the fields not being edited.
const projectForm = formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project | null) => ({
    name: project?.name ?? '',
    owner: project?.owner ?? '',
  }),
  save: saveProject,
})

function StarButton(props: { project: () => Project }) {
  const star = toggleStar()
  const starError = () => {
    const state = star.state()
    return state.status === 'failed' ? message(state.error) : ''
  }
  return (
    <div class="detail-actions">
      <Button
        variant="outline"
        aria-pressed={props.project().starred}
        disabled={star.pending()}
        onClick={() =>
          void star.run({
            id: props.project().id,
            starred: !props.project().starred,
          })
        }
      >
        {props.project().starred ? '★ Starred' : '☆ Star'}
      </Button>
      <p class="form-error" role="alert">
        {starError()}
      </p>
    </div>
  )
}

function ProjectEditor() {
  const form = projectForm()
  const saved = signal(false)
  const status = () =>
    form.submitting()
      ? 'Saving…'
      : form.dirty()
        ? 'Unsaved changes'
        : saved()
          ? 'Saved.'
          : ''
  const submit = (event: Event) => {
    saved.set(false)
    void form.submit(event).then((result) => saved.set(result.ok))
  }
  return (
    <form class="form-stack" onSubmit={submit}>
      <form.Field name="name" component={Input} label="Project name" />
      <form.Field name="owner" component={Input} label="Owner" />
      <Show when={form.remoteChanged()}>
        <p class="form-status" role="status">
          This project changed on the server while you were editing.{' '}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => form.acceptRemote()}
          >
            Use the server version
          </Button>
        </p>
      </Show>
      <p class="form-error" role="alert">
        {form.error()}
      </p>
      <div class="detail-actions">
        <Button type="submit" disabled={form.submitting()}>
          Save changes
        </Button>
        <p class="form-status" role="status">
          {status()}
        </p>
      </div>
    </form>
  )
}

export default function ProjectDetailPage() {
  const match = projectRoute.match()
  const project = () => match.data().value()
  return (
    <Show
      when={project()}
      fallback={
        <Card>
          <p class="eyebrow">Project unavailable</p>
          <h2>No project matches “{match.params().projectId}”</h2>
          <p>
            The URL parameter is valid, but this project is not in the demo
            dataset.
          </p>
          <Link
            class="benos-button benos-button--outline benos-button--md"
            to={projectsRoute}
          >
            Back to projects
          </Link>
        </Card>
      }
    >
      {(current) => (
        <>
          <p class="page-intro">
            Project ID: <code>{match.params().projectId}</code>
            {match.data().fetching() ? ' · Refreshing…' : ''}
          </p>
          <Card>
            <p class="eyebrow">Project detail</p>
            <h2>{current().name}</h2>
            <p>{current().summary}</p>
            <div class="detail-grid">
              <Card variant="outlined">
                <span class="form-status">Team</span>
                <p class="detail-value">{current().team}</p>
              </Card>
              <Card variant="outlined">
                <span class="form-status">Owner</span>
                <p class="detail-value">{current().owner}</p>
              </Card>
              <Card variant="outlined">
                <span class="form-status">Open issues</span>
                <p class="detail-value">{current().openIssues}</p>
              </Card>
            </div>
            <p class="form-status">Last updated {current().updatedAt}</p>
            <StarButton project={current} />
            <ProjectEditor />
            <Link
              class="benos-button benos-button--secondary benos-button--md"
              to={projectsRoute}
            >
              Back to all projects
            </Link>
          </Card>
        </>
      )}
    </Show>
  )
}

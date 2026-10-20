/** @jsxImportSource @benosjs/dom */

import { signal } from '@benosjs/core'
import { Show } from '@benosjs/dom'
import { Link } from '@benosjs/router'
import { Button } from '../../../../registry/source/components/button.js'
import { Card } from '../../../../registry/source/components/card.js'
import { Input } from '../../../../registry/source/components/input.js'
import { renameProject, toggleStar } from '../data/queries.js'
import type { Project } from '../data/projects.js'
import { projectRoute, projectsRoute } from '../routes/refs.js'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The request failed.'
}

function ProjectEditor(props: { project: () => Project }) {
  const rename = renameProject()
  const star = toggleStar()
  const draft = signal(props.project().name)
  const status = () => {
    const state = rename.state()
    if (state.status === 'pending') return 'Saving…'
    if (state.status === 'failed') return message(state.error)
    if (state.status === 'succeeded') return 'Saved.'
    return ''
  }
  const starError = () => {
    const state = star.state()
    return state.status === 'failed' ? message(state.error) : ''
  }
  return (
    <>
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
      <form
        class="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          void rename.run({ id: props.project().id, name: draft() })
        }}
      >
        <label class="form-field">
          Project name
          <Input
            value={draft()}
            onInput={(event) => draft.set(event.currentTarget.value)}
          />
        </label>
        <div class="detail-actions">
          <Button type="submit" disabled={rename.pending()}>
            Save name
          </Button>
          <p class="form-status" role="status">
            {status()}
          </p>
        </div>
      </form>
    </>
  )
}

export default function ProjectDetailPage() {
  const match = projectRoute.match()
  const project = () => match.data().value()
  // <Show> recreates a function child whenever `when` changes, and every cache
  // write or refetch is a new object. Gate on presence so the editor (and its
  // mutation state) survives in-place updates; see docs/query-findings.md.
  const current = (): Project => project() as Project
  return (
    <Show
      when={project() !== null}
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
      {
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
            <ProjectEditor project={current} />
            <Link
              class="benos-button benos-button--secondary benos-button--md"
              to={projectsRoute}
            >
              Back to all projects
            </Link>
          </Card>
        </>
      }
    </Show>
  )
}

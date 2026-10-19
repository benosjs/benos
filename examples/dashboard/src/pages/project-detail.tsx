/** @jsxImportSource @benosjs/dom */

import { Show } from '@benosjs/dom'
import { Link } from '@benosjs/router'
import { Card } from '../../../../registry/source/components/card.js'
import { projectRoute, projectsRoute } from '../routes/refs.js'

export default function ProjectDetailPage() {
  const match = projectRoute.match()
  const project = match.data
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

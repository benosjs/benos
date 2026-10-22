/** @jsxImportSource @benosjs/dom */

import { For } from '@benosjs/dom'
import { Link } from '@benosjs/router'
import { Badge } from '../../../../registry/source/components/badge.js'
import { Card } from '../../../../registry/source/components/card.js'
import { projectRoute, projectsIndexRoute } from '../routes/refs.js'

const toneByStatus = {
  healthy: 'success',
  attention: 'warning',
  paused: 'neutral',
} as const

export default function ProjectsPage() {
  const projects = () => projectsIndexRoute.match().data().value()
  return (
    <>
      <p class="page-intro">
        This page reads the project list through the query cache. Revisiting it,
        or opening a project you have already seen, does not wait for the
        network.
      </p>
      <div class="projects-list">
        <For each={projects()} by={(project) => project.id}>
          {(project) => (
            <Link
              class="project-card-link"
              to={projectRoute}
              params={{ projectId: project().id }}
            >
              <Card class="project-card">
                <div class="project-card-heading">
                  <h2>
                    {project().starred ? (
                      <span class="star" aria-label="Starred">
                        ★{' '}
                      </span>
                    ) : null}
                    {project().name}
                  </h2>
                  <Badge tone={toneByStatus[project().status]}>
                    {project().status}
                  </Badge>
                </div>
                <p>{project().summary}</p>
                <div class="project-meta">
                  <span>{project().team}</span>
                  <span>Owner: {project().owner}</span>
                  <span>{project().openIssues} open issues</span>
                </div>
              </Card>
            </Link>
          )}
        </For>
      </div>
    </>
  )
}

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
  const projects = projectsIndexRoute.match().data
  return (
    <>
      <p class="page-intro">
        This page receives data from a route loader before the view is
        committed.
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
                  <h2>{project().name}</h2>
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

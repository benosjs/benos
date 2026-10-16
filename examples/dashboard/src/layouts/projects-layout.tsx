/** @jsxImportSource @benosjs/dom */

import type { Child } from '@benosjs/dom'
import { Outlet } from '@benosjs/router'
import { Link } from '@benosjs/router'
import { projectsRoute } from '../routes/refs.js'

export function ProjectsFrame(props: { children?: Child }) {
  return (
    <section class="projects-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Workspace</p>
          <h1>Projects</h1>
        </div>
        <Link
          class="benos-button benos-button--secondary benos-button--md"
          to={projectsRoute}
        >
          All projects
        </Link>
      </div>
      {props.children}
    </section>
  )
}

export default function ProjectsLayout() {
  return (
    <ProjectsFrame>
      <Outlet />
    </ProjectsFrame>
  )
}

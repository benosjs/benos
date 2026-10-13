/** @jsxImportSource @benosjs/dom */
import { Link, Outlet } from '@benosjs/router'
import { projectRoute, settingsRoute } from '../refs'

export default function ProjectsLayout() {
  return (
    <section>
      <Link to={projectRoute} params={{ projectId: 'p-2' }}>
        Second project
      </Link>
      <Link to={settingsRoute}>Settings</Link>
      <Outlet />
    </section>
  )
}

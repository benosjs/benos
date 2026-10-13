/** @jsxImportSource @benosjs/dom */
import { Link, Outlet, navigation } from '@benosjs/router'
import { projectsRoute, settingsRoute } from '../refs'

export default function AppLayout() {
  const pending = navigation()
  return (
    <main>
      <nav>
        <Link to={projectsRoute}>Projects</Link>
        <Link to={settingsRoute}>Settings</Link>
      </nav>
      <p role="status">{pending().status === 'loading' ? 'Loading…' : ''}</p>
      <Outlet />
    </main>
  )
}

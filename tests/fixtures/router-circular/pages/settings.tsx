/** @jsxImportSource @benosjs/dom */
import { Link } from '@benosjs/router'
import { projectRoute } from '../refs'

export default function Settings() {
  return (
    <section>
      <h1>Settings</h1>
      <Link to={projectRoute} params={{ projectId: 'p-1' }}>
        First project
      </Link>
    </section>
  )
}

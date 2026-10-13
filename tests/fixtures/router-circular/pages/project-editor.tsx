/** @jsxImportSource @benosjs/dom */
import { Link } from '@benosjs/router'
import { projectRoute, projectsRoute } from '../refs'

export default function ProjectEditor() {
  const match = projectRoute.match()
  return (
    <article>
      <h1>{match.data().name}</h1>
      <p>{match.params().projectId}</p>
      <Link to={projectsRoute}>All projects</Link>
    </article>
  )
}

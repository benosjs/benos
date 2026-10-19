import { jsx } from '@benosjs/dom'
import { Link } from '@benosjs/router'
import type { LinkProps } from '@benosjs/router'
import type { JSX } from '@benosjs/dom'
import { projectRoute, projectsRoute } from '../refs'

function ProjectsLink(props: LinkProps<typeof projectsRoute>): JSX.Element {
  return Link(props)
}

;(
  globalThis as typeof globalThis & {
    __routeImportProbe?: (name: string) => void
  }
).__routeImportProbe?.('project editor')

export default function ProjectEditor(): JSX.Element {
  const match = projectRoute.match()
  return jsx('article', {
    children: [
      jsx('h1', {
        get children() {
          return `Project ${match.params().projectId}`
        },
      }),
      jsx('p', {
        get children() {
          return match.params().projectId
        },
      }),
      ProjectsLink({ to: projectsRoute, children: 'All projects' }),
    ],
  })
}

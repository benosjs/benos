import { jsx } from '@benosjs/dom'
import { Link } from '@benosjs/router'
import type { LinkProps } from '@benosjs/router'
import type { JSX } from '@benosjs/dom'
import { projectRoute } from '../refs'

function ProjectLink(props: LinkProps<typeof projectRoute>): JSX.Element {
  return Link(props)
}

;(
  globalThis as typeof globalThis & {
    __routeImportProbe?: (name: string) => void
  }
).__routeImportProbe?.('settings page')

export default function Settings(): JSX.Element {
  return jsx('section', {
    children: [
      jsx('h1', { children: 'Settings' }),
      ProjectLink({
        to: projectRoute,
        params: { projectId: 'p-1' },
        children: 'First project',
      }),
    ],
  })
}

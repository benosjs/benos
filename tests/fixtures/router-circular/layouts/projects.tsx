import { jsx } from '@benosjs/dom'
import { Link, Outlet } from '@benosjs/router'
import type { LinkProps } from '@benosjs/router'
import type { JSX } from '@benosjs/dom'
import { projectRoute, settingsRoute } from '../refs'

function ProjectLink(props: LinkProps<typeof projectRoute>): JSX.Element {
  return Link(props)
}
function SettingsLink(props: LinkProps<typeof settingsRoute>): JSX.Element {
  return Link(props)
}

;(
  globalThis as typeof globalThis & {
    __routeImportProbe?: (name: string) => void
  }
).__routeImportProbe?.('projects layout')

export default function ProjectsLayout(): JSX.Element {
  return jsx('section', {
    children: [
      ProjectLink({
        to: projectRoute,
        params: { projectId: 'p-2' },
        children: 'Second project',
      }),
      SettingsLink({ to: settingsRoute, children: 'Settings' }),
      jsx(Outlet, {}),
    ],
  })
}

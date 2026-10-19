import { jsx } from '@benosjs/dom'
import { Link, Outlet, navigation } from '@benosjs/router'
import type { LinkProps } from '@benosjs/router'
import type { JSX } from '@benosjs/dom'
import { projectsRoute, settingsRoute } from '../refs'

function ProjectsLink(props: LinkProps<typeof projectsRoute>): JSX.Element {
  return Link(props)
}
function SettingsLink(props: LinkProps<typeof settingsRoute>): JSX.Element {
  return Link(props)
}

;(
  globalThis as typeof globalThis & {
    __routeImportProbe?: (name: string) => void
  }
).__routeImportProbe?.('app layout')

export default function AppLayout(): JSX.Element {
  const pending = navigation()
  return jsx('main', {
    children: [
      jsx('nav', {
        children: [
          ProjectsLink({ to: projectsRoute, children: 'Projects' }),
          SettingsLink({ to: settingsRoute, children: 'Settings' }),
        ],
      }),
      jsx('p', {
        role: 'status',
        get children() {
          return pending().status === 'loading' ? 'Loading…' : ''
        },
      }),
      jsx(Outlet, {}),
    ],
  })
}

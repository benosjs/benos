import { jsx } from '@benosjs/dom'
import { createRouter, memoryHistory, mountRoute } from '@benosjs/router'
import { projectRoute, projectsRoute, rootRoute, settingsRoute } from './refs'

export const router = createRouter({
  history: memoryHistory({ initialEntries: ['/projects/p-1'] }),
  routes: [
    mountRoute(rootRoute, {
      lazy: () => import('./layouts/app'),
      children: [
        mountRoute(projectsRoute, {
          lazy: () => import('./layouts/projects'),
          children: [
            mountRoute(projectRoute, {
              lazy: () => import('./pages/project-editor'),
            }),
          ],
        }),
        mountRoute(settingsRoute, {
          lazy: () => import('./pages/settings'),
        }),
      ],
    }),
  ],
  notFound: () => jsx('p', { children: 'Not found' }),
})

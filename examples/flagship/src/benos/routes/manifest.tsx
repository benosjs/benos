import { createRouter, mountRoute } from '@benosjs/router'
import type { RouterHistory } from '@benosjs/router'
import { projectRoute } from './refs.js'

// #region flagship
// routes/manifest.tsx imports refs, but never imports the page eagerly
export const createAppRouter = (history: RouterHistory) =>
  createRouter({
    history,
    routes: [
      mountRoute(projectRoute, {
        lazy: () => import('../pages/project-editor.js'),
        pending: () => <p role="status">Loading project…</p>,
        error: ({ retry }) => (
          <button onClick={retry}>Could not load project. Retry</button>
        ),
      }),
    ],
  })
// #endregion

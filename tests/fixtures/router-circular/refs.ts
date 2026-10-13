import { route } from '@benosjs/router'
import { loadProject } from './data'

export const rootRoute = route('/')
export const projectsRoute = route('/projects')
export const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => loadProject(params.projectId, signal),
})
export const settingsRoute = route('/settings')

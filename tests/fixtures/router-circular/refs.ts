import { route } from '@benosjs/router'

export const rootRoute = route('/')
export const projectsRoute = route('/projects')
export const projectRoute = route('/projects/:projectId')
export const settingsRoute = route('/settings')

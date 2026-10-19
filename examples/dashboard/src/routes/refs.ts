import { route } from '@benosjs/router'
import { loadProject, loadProjects } from '../data/projects.js'

export const rootRoute = route('/')
export const homeRoute = route('/')
export const projectsRoute = route('/projects')
export const projectsIndexRoute = route('/projects', { loader: loadProjects })
export const projectRoute = route('/projects/:projectId', {
  loader: loadProject,
})
export const recordsRoute = route('/records')
export const settingsRoute = route('/settings')

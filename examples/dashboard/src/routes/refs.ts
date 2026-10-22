import { route } from '@benosjs/router'
import { projectQuery, projectsQuery } from '../data/queries.js'

export const rootRoute = route('/')
export const homeRoute = route('/')
export const projectsRoute = route('/projects')
export const projectsIndexRoute = route('/projects', {
  loader: ({ signal }) => projectsQuery.load(signal),
})
export const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
export const recordsRoute = route('/records')
export const settingsRoute = route('/settings')

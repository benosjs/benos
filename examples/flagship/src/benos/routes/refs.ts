import { formModel } from '@benosjs/forms'
import { route } from '@benosjs/router'
import { editSchema } from '../../shared/schema.js'
import type { EditProject, Project } from '../../shared/project.js'
import { projectQuery, saveProject } from '../data.js'

// #region flagship
// routes/refs.ts has no component import
export const projectRoute = route('/projects/:projectId', {
  loader: ({ params, signal }) => projectQuery.load(params.projectId, signal),
})
export const projectForm = formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
// #endregion

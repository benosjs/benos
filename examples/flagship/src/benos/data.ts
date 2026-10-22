import { mutation, query } from '@benosjs/query'
import { getProject, putProject } from '../shared/project.js'
import type { EditProject } from '../shared/project.js'

// #region flagship
// data.ts: the cached query and the save mutation's identity rule
export const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
})
export const saveProject = mutation({
  run: (input: { projectId: string; values: EditProject }) =>
    putProject(input.projectId, input.values),
  affects: (input) => [projectQuery.key(input.projectId)],
})
// #endregion

import { mutation, query } from '@benosjs/query'
import {
  getProject,
  getProjects,
  putProjectName,
  putProjectStar,
} from './projects.js'
import type { Project } from './projects.js'

export const projectsQuery = query({
  fetch: (_, { signal }) => getProjects(signal),
  staleTime: 30_000,
})

export const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
  staleTime: 30_000,
})

export const renameProject = mutation({
  run: (input: { id: string; name: string }, { signal }) =>
    putProjectName(input.id, input.name, signal),
  writes: (input, saved) => [projectQuery.key(input.id).set(saved)],
  affects: () => [projectsQuery],
})

const withStar =
  (id: string, starred: boolean) =>
  (projects: readonly Project[]): readonly Project[] =>
    projects.map((project) =>
      project.id === id ? { ...project, starred } : project,
    )

export const toggleStar = mutation({
  run: (input: { id: string; starred: boolean }, { signal }) =>
    putProjectStar(input.id, input.starred, signal),
  optimistic: (input) => [
    projectQuery
      .key(input.id)
      .update((project) => project && { ...project, starred: input.starred }),
    projectsQuery.key().update(withStar(input.id, input.starred)),
  ],
  writes: (input, saved) => [projectQuery.key(input.id).set(saved)],
  affects: () => [projectsQuery],
})

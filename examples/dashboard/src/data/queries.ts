import { mutation, query } from '@benosjs/query'
import {
  getProject,
  getProjects,
  putProject,
  putProjectStar,
} from './projects.js'
import type { Project, ProjectEdit } from './projects.js'

// Both queries opt in to server serialization: a page rendered on the
// server hydrates with its data already in the cache.
export const projectsQuery = query({
  fetch: (_, { signal }) => getProjects(signal),
  staleTime: 30_000,
  ssr: {
    id: 'projects',
    serialize: (projects) => projects,
    deserialize: (raw) => raw as readonly Project[],
  },
})

export const projectQuery = query({
  fetch: (id: string, { signal }) => getProject(id, signal),
  staleTime: 30_000,
  ssr: {
    id: 'project',
    serialize: (project) => project,
    deserialize: (raw) => raw as Project | null,
  },
})

export const saveProject = mutation({
  run: (input: { projectId: string; values: ProjectEdit }, { signal }) =>
    putProject(input.projectId, input.values, signal),
  writes: (input, saved) => [projectQuery.key(input.projectId).set(saved)],
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

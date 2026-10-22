/**
 * Type-level acceptance tests for the flagship slice, checked by
 * `pnpm --filter @benosjs/flagship typecheck`. Each `@ts-expect-error` must fail.
 */
import { formModel } from '@benosjs/forms'
import { mutation, query } from '@benosjs/query'
import type { RouterHistory } from '@benosjs/router'
import { z } from 'zod'
import { saveProject } from '../src/benos/data.js'
import { projectForm, projectRoute } from '../src/benos/routes/refs.js'
import { createAppRouter } from '../src/benos/routes/manifest.js'
import type { EditProject, Project } from '../src/shared/project.js'
import { editSchema } from '../src/shared/schema.js'

declare const history: RouterHistory
const router = createAppRouter(history)

// A wrong route param.
void router.navigate({ to: projectRoute, params: { projectId: 'atlas' } })
// @ts-expect-error projectRoute has no `id` param
void router.navigate({ to: projectRoute, params: { id: 'atlas' } })

// An unrelated cache key in `affects`.
const usersQuery = query({ fetch: (id: number) => Promise.resolve({ id }) })
mutation({
  run: (input: { projectId: string }) => Promise.resolve(input),
  // @ts-expect-error a raw array is not a cache key
  affects: (input) => [['project', input.projectId]],
})
mutation({
  run: (input: { projectId: string }) => Promise.resolve(input),
  // @ts-expect-error usersQuery takes a number, not the saved project id
  affects: (input) => [usersQuery.key(input.projectId)],
})

// An invalid field name.
export function Fields() {
  const form = projectForm()
  form.field('name')
  // @ts-expect-error `owner` is not a field of EditProject
  form.field('owner')
}

// A schema whose output does not fit the mutation input: ownerEmail parses to a
// number, but saveProject takes a string, so the default input needs an `input`.
// @ts-expect-error no overload accepts the mismatched schema
formModel({
  route: projectRoute,
  schema: z.object({ name: z.string(), ownerEmail: z.coerce.number() }),
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})

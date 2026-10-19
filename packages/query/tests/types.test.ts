import { expectTypeOf } from 'expect-type'
import { expect, it } from 'vitest'
import type { Resource, ResourceState } from '@benosjs/async'
import { createQueryCache, mutation, query } from '../src/index.js'
import type {
  MutationHandle,
  MutationResult,
  MutationState,
  QueryCache,
  QueryWrite,
  QueryKey,
  QueryObserver,
  QueryTarget,
} from '../src/index.js'

interface Project {
  id: string
  name: string
}
declare function getProject(id: string, signal: AbortSignal): Promise<Project>

function checkQueryTypes(id: () => string, cache: QueryCache): void {
  const projectQuery = query({
    fetch: (projectId: string, { signal }) => getProject(projectId, signal),
  })
  const observer = projectQuery(id)
  expectTypeOf(observer).toEqualTypeOf<QueryObserver<Project>>()
  expectTypeOf(observer).toMatchTypeOf<Resource<Project>>()
  expectTypeOf(observer.value()).toEqualTypeOf<Project | undefined>()
  expectTypeOf(observer.read()).toEqualTypeOf<Project | undefined>()
  expectTypeOf(observer.state()).toEqualTypeOf<ResourceState>()
  expectTypeOf(observer.fetching()).toEqualTypeOf<boolean>()
  expectTypeOf(observer.failureCount()).toEqualTypeOf<number>()
  expectTypeOf(observer.refresh()).toEqualTypeOf<Promise<Project | undefined>>()
  expectTypeOf(projectQuery.key('p-1')).toEqualTypeOf<QueryKey<Project>>()
  expectTypeOf(projectQuery.peek('p-1', cache)).toEqualTypeOf<
    Project | undefined
  >()
  projectQuery(() => (Math.random() > 0.5 ? 'p-1' : null))
  projectQuery.prefetch('p-1')
  projectQuery.prefetch('p-1', cache)

  // @ts-expect-error The argument type comes from fetch.
  projectQuery.key(42)
  // @ts-expect-error The source must return the argument type.
  projectQuery(() => 42)
  projectQuery.where((value) => {
    expectTypeOf(value).toEqualTypeOf<string>()
    return true
  })

  const targets: QueryTarget[] = [
    projectQuery,
    projectQuery.key('p-1'),
    projectQuery.where(() => true),
  ]
  void cache.invalidate(...targets)
  // @ts-expect-error Raw string keys are not cache targets.
  void cache.invalidate('project')
  // @ts-expect-error Raw array keys are not cache targets.
  void cache.invalidate(['project', 'p-1'])

  const syncQuery = query({ fetch: (n: number) => n * 2 })
  expectTypeOf(syncQuery(() => 1).value()).toEqualTypeOf<number | undefined>()

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- argument-free query
  const me = query({ fetch: (_: void, { signal }) => getProject('me', signal) })
  expectTypeOf(me().value()).toEqualTypeOf<Project | undefined>()
  me(() => true)
  expectTypeOf(me.key()).toEqualTypeOf<QueryKey<Project>>()
  me.peek(cache)

  const filtered = query({
    key: (filter: { owner: string; since: Date }) => ({
      owner: filter.owner,
      since: filter.since.toISOString(),
    }),
    fetch: (filter) => [filter.owner],
  })
  expectTypeOf(filtered.key).parameter(0).toEqualTypeOf<{
    owner: string
    since: Date
  }>()

  // @ts-expect-error A Date argument cannot be a key without a key function.
  query({ fetch: (since: Date) => since.getTime() })
  query({
    // @ts-expect-error A key function must return a canonical key part.
    key: (value: string) => new Map([[value, value]]),
    fetch: (value: string) => value,
  })
  query({
    fetch: (value: string) => value,
    retry: (failureCount, error) => {
      expectTypeOf(failureCount).toEqualTypeOf<number>()
      expectTypeOf(error).toEqualTypeOf<unknown>()
      return failureCount < 3
    },
    retryDelay: (failureCount) => failureCount * 100,
  })
  // @ts-expect-error retry accepts false, a count, or a predicate.
  query({ fetch: (value: string) => value, retry: true })
}
void checkQueryTypes

interface EditProject {
  name: string
}
declare function putProject(
  id: string,
  values: EditProject,
  signal: AbortSignal,
): Promise<Project>

function checkMutationTypes(cache: QueryCache): void {
  const projectQuery = query({
    fetch: (id: string, { signal }) => getProject(id, signal),
  })
  const listQuery = query({ fetch: () => [] as Project[] })
  const saveProject = mutation({
    run: (input: { projectId: string; values: EditProject }, { signal }) =>
      putProject(input.projectId, input.values, signal),
    writes: (input, saved) => {
      expectTypeOf(saved).toEqualTypeOf<Project>()
      return [projectQuery.key(input.projectId).set(saved)]
    },
    affects: (input, saved) => {
      expectTypeOf(saved).toEqualTypeOf<Project | undefined>()
      return [listQuery, projectQuery.key(input.projectId)]
    },
    optimistic: (input) => [
      projectQuery
        .key(input.projectId)
        .update((previous) => ({ ...previous, ...input.values })),
    ],
  })
  const handle = saveProject()
  expectTypeOf(handle).toEqualTypeOf<
    MutationHandle<{ projectId: string; values: EditProject }, Project>
  >()
  expectTypeOf(handle.state()).toEqualTypeOf<MutationState<Project>>()
  expectTypeOf(handle.pending()).toEqualTypeOf<boolean>()
  void handle.run({ projectId: 'p-1', values: { name: 'x' } }).then((r) => {
    expectTypeOf(r).toEqualTypeOf<MutationResult<Project>>()
    if (r.ok) expectTypeOf(r.value).toEqualTypeOf<Project>()
    else expectTypeOf(r.cancelled).toEqualTypeOf<boolean>()
  })
  const state = handle.state()
  if (state.status === 'succeeded')
    expectTypeOf(state.value).toEqualTypeOf<Project>()
  void saveProject.run({ projectId: 'p-1', values: { name: 'x' } }, cache)
  // @ts-expect-error The input type comes from run.
  void handle.run({ projectId: 1 })

  const write: QueryWrite = projectQuery
    .key('p-1')
    .set({ id: 'p-1', name: 'x' })
  cache.write(write)
  // @ts-expect-error A write must match the query data type.
  projectQuery.key('p-1').set({ id: 'p-1' })
  // @ts-expect-error An update must return the query data type.
  projectQuery.key('p-1').update(() => 'renamed')
  // @ts-expect-error A raw value is not a write.
  cache.write({ id: 'p-1', name: 'x' })
  mutation({
    run: () => 'ok',
    // @ts-expect-error affects returns cache targets, not raw keys.
    affects: () => [['project', 'p-1']],
  })
  mutation({
    run: () => 'ok',
    // @ts-expect-error writes returns write descriptors.
    writes: () => [projectQuery.key('p-1')],
  })
}
void checkMutationTypes

it('compiles the public query types', () => {
  expect(typeof createQueryCache).toBe('function')
})

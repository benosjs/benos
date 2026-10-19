import { expectTypeOf } from 'expect-type'
import { expect, it } from 'vitest'
import type { Resource, ResourceState } from '@benosjs/async'
import { createQueryCache, query } from '../src/index.js'
import type {
  QueryCache,
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

it('compiles the public query types', () => {
  expect(typeof createQueryCache).toBe('function')
})

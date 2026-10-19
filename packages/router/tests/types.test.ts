import { expectTypeOf } from 'expect-type'
import { expect, it } from 'vitest'
import { getRouter, Link, route } from '../src/index.js'
import type { PathParams } from '../src/index.js'

function checkRouterTypes(): void {
  const project = route('/projects/:projectId')
  const details = route('details', { parent: project })
  const search = route('/search', {
    search: {
      parse(raw: URLSearchParams) {
        return {
          tab:
            raw.get('tab') === 'members'
              ? ('members' as const)
              : ('details' as const),
        }
      },
      stringify(value: { tab: 'members' | 'details' }) {
        return new URLSearchParams({ tab: value.tab })
      },
    },
  })
  const immutable = route('/immutable', {
    search: {
      parse: () => ({ nested: { value: 'ready' as const } }),
      stringify: () => new URLSearchParams(),
    },
  })
  const loadedProject = route('/loaded/:projectId', {
    loader: async ({ params, signal, context }) => {
      expectTypeOf(params.projectId).toEqualTypeOf<string>()
      expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
      expectTypeOf(context).toBeUnknown()
      return { id: params.projectId, name: 'Project' }
    },
  })
  const loadedSearch = route('/loaded-search', {
    search: {
      parse(raw: URLSearchParams) {
        return { page: Number(raw.get('page')) }
      },
      stringify: (value: { page: number }) =>
        new URLSearchParams({ page: String(value.page) }),
    },
    loader: ({ search }) => {
      expectTypeOf(search.page).toEqualTypeOf<number>()
      return { page: search.page }
    },
  })
  const parentSearchRoute = route('/teams/:teamId')
  const nestedLoadedSearch = route('search', {
    parent: parentSearchRoute,
    search: {
      parse(raw: URLSearchParams) {
        return { query: raw.get('q') ?? '' }
      },
      stringify: (value: { query: string }) =>
        new URLSearchParams({ q: value.query }),
    },
    loader: ({ params, search }) => {
      expectTypeOf(params.teamId).toEqualTypeOf<string>()
      expectTypeOf(search.query).toEqualTypeOf<string>()
      return { resultCount: search.query.length }
    },
  })
  expectTypeOf<PathParams<'/projects/:projectId'>>().toEqualTypeOf<{
    projectId: string
  }>()
  expectTypeOf<PathParams<'/files/*rest'>>().toEqualTypeOf<{ rest: string }>()
  expectTypeOf(project.match().params().projectId).toEqualTypeOf<string>()
  expectTypeOf(details.path).toEqualTypeOf<'/projects/:projectId/details'>()
  expectTypeOf(search.match().search().tab).toEqualTypeOf<
    'members' | 'details'
  >()
  expectTypeOf(immutable.match().search().nested.value).toEqualTypeOf<'ready'>()
  const loadedProjectData = loadedProject.match().data()
  expectTypeOf(loadedProjectData.id).toEqualTypeOf<string>()
  expectTypeOf(loadedProjectData.name).toEqualTypeOf<string>()
  expectTypeOf(loadedSearch.match().data().page).toEqualTypeOf<number>()
  expectTypeOf(
    nestedLoadedSearch.match().params().teamId,
  ).toEqualTypeOf<string>()
  expectTypeOf(
    nestedLoadedSearch.match().data().resultCount,
  ).toEqualTypeOf<number>()
  // @ts-expect-error Routes without a loader do not expose loader data.
  project.match().data()
  // @ts-expect-error Match snapshots are deeply readonly.
  immutable.match().search().nested.value = 'ready'

  Link({
    to: project,
    params: { projectId: 'p-1' },
    title: 'Open project',
    rel: 'bookmark',
    'aria-label': 'Open project p-1',
  })
  Link({ to: details, params: { projectId: 'p-1' } })
  Link({ to: search, search: { tab: 'members' } })
  // @ts-expect-error Missing required path parameter.
  Link({ to: project })
  // @ts-expect-error Misspelled parameter.
  Link({ to: project, params: { project: 'p-1' } })
  // @ts-expect-error Search values are inferred from the route codec.
  Link({ to: search, search: { tab: 'invalid' } })
  // @ts-expect-error Search is required for routes with a codec.
  Link({ to: search })
  // @ts-expect-error Dynamic route paths do not preserve parameter inference.
  route('dynamic' as string)
  // @ts-expect-error Splat must be terminal.
  route('/files/*rest/more')
  // @ts-expect-error Named parameters must be nonempty.
  route('/files/:')
  // @ts-expect-error Duplicate parameter names are rejected.
  route('/files/:id/:id')
  // @ts-expect-error A relative child cannot reuse an ancestor parameter name.
  route(':projectId', { parent: project })
  expectTypeOf(getRouter()).toEqualTypeOf<import('../src/index.js').Router>()
}
void checkRouterTypes

it('exports the route and link constructors', () => {
  expect(typeof route).toBe('function')
  expect(typeof Link).toBe('function')
})

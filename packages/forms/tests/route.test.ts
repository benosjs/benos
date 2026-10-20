// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsx, render } from '@benosjs/dom'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  route,
  RouterOutlet,
} from '@benosjs/router'
import {
  createQueryCache,
  mutation,
  query,
  QueryCacheProvider,
} from '@benosjs/query'
import type { QueryCache } from '@benosjs/query'
import { formModel } from '../src/index.js'
import type { Form, StandardSchemaV1 } from '../src/index.js'

interface Project {
  id: string
  name: string
  ownerEmail: string
  updatedAt: number
}
interface EditProject {
  name: string
  ownerEmail: string
}

/** F2 does not validate yet; a pass-through schema supplies the types. */
const editSchema: StandardSchemaV1<EditProject> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: value as EditProject }),
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const roots: Array<() => void> = []
const caches: QueryCache[] = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  while (caches.length) caches.pop()?.dispose()
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** The flagship editor slice: a route loader, a cached query, a save mutation, and a form. */
function setup(options: { gcTime?: number; save?: 'manual' } = {}) {
  const cache = createQueryCache()
  caches.push(cache)
  const server = new Map<string, Project>([
    ['a', { id: 'a', name: 'Alpha', ownerEmail: 'a@x.test', updatedAt: 1 }],
    ['b', { id: 'b', name: 'Beta', ownerEmail: 'b@x.test', updatedAt: 1 }],
  ])
  const gates = new Map<string, ReturnType<typeof deferred<undefined>>>()
  const fetches: string[] = []
  const projectQuery = query({
    fetch: async (id: string) => {
      fetches.push(id)
      await gates.get(id)?.promise
      const project = server.get(id)
      if (!project) throw Object.assign(new Error('missing'), { status: 404 })
      return { ...project }
    },
    staleTime: Infinity,
    gcTime: options.gcTime ?? 300_000,
  })
  const saves: Array<{ projectId: string; values: EditProject }> = []
  const saveGates: Array<ReturnType<typeof deferred<undefined>>> = []
  const saveProject = mutation({
    run: async (input: { projectId: string; values: EditProject }) => {
      saves.push(input)
      if (options.save === 'manual') {
        const gate = deferred<undefined>()
        saveGates.push(gate)
        await gate.promise
      }
      const current = server.get(input.projectId)
      if (!current) throw new Error('missing')
      if (input.values.name === 'fail') throw new Error('Name rejected.')
      const saved = {
        ...current,
        ...input.values,
        name: input.values.name.trim(),
        updatedAt: current.updatedAt + 1,
      }
      server.set(input.projectId, saved)
      return saved
    },
    affects: (input) => [projectQuery.key(input.projectId)],
  })
  const projectRoute = route('/projects/:projectId', {
    loader: ({ params, signal }) =>
      projectQuery.load(params.projectId, signal, cache),
  })
  const projectForm = formModel({
    route: projectRoute,
    schema: editSchema,
    from: (project: Project): EditProject => ({
      name: project.name,
      ownerEmail: project.ownerEmail,
    }),
    save: saveProject,
  })
  let form!: Form<EditProject, EditProject, Project>
  let mounts = 0
  const router = createRouter({
    history: memoryHistory({ initialEntries: ['/projects/a'] }),
    routes: [
      mountRoute(projectRoute, {
        component: () => {
          mounts++
          form = projectForm()
          const match = projectRoute.match()
          const name = form.field('name')
          return jsx('p', {
            get children() {
              return `${match.params().projectId}:${name.value()}`
            },
          })
        },
      }),
    ],
  })
  // Loaders take the cache explicitly; the mutation handle finds it in context.
  roots.push(
    render(
      () =>
        jsx(QueryCacheProvider, {
          cache,
          children: jsx(RouterOutlet, { router }),
        }),
      document.body,
    ),
  )
  const text = () => document.querySelector('p')?.textContent
  const go = (projectId: string) =>
    router.navigate({ to: projectRoute, params: { projectId } })
  return {
    cache,
    server,
    gates,
    fetches,
    saves,
    saveGates,
    projectQuery,
    router,
    text,
    go,
    form: () => form,
    mounts: () => mounts,
  }
}

type App = ReturnType<typeof setup>
function project(app: App, id: string): Project {
  const value = app.server.get(id)
  if (!value) throw new Error(`no project ${id}`)
  return value
}
function gate(app: App, index: number) {
  const value = app.saveGates[index]
  if (!value) throw new Error(`no save ${index}`)
  return value
}

const flush = () => new Promise((done) => setTimeout(done, 0))

describe('route-bound form identity', () => {
  it('captures the committed record and tracks edits per field', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    const name = form.field('name')
    expect(form.field('name')).toBe(name)
    expect(form.values()).toEqual({ name: 'Alpha', ownerEmail: 'a@x.test' })
    expect(form.dirty()).toBe(false)
    name.set('Alpha 2')
    expect(app.text()).toBe('a:Alpha 2')
    expect(name.dirty()).toBe(true)
    expect(form.dirty()).toBe(true)
    expect(form.values()).toEqual({ name: 'Alpha 2', ownerEmail: 'a@x.test' })
    name.set('Alpha')
    expect(name.dirty()).toBe(false)
    expect(form.dirty()).toBe(false)
  })

  it('resets at the commit of a different record and never before', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    const name = form.field('name')
    name.set('Edited A')
    name.blur()
    const gate = deferred<undefined>()
    app.gates.set('b', gate)
    const navigation = app.go('b')
    await flush()
    // B is loading: A's edit and touched flag stay, and the URL is still A's.
    expect(app.text()).toBe('a:Edited A')
    expect(name.touched()).toBe(true)
    expect(form.dirty()).toBe(true)
    gate.resolve(undefined)
    await navigation
    expect(app.text()).toBe('b:Beta')
    expect(app.mounts()).toBe(1)
    expect(name.dirty()).toBe(false)
    expect(name.touched()).toBe(false)
    expect(form.values()).toEqual({ name: 'Beta', ownerEmail: 'b@x.test' })
  })

  it('does not bring back earlier edits after A → B → A', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    app.form().field('name').set('Unsaved A')
    await app.go('b')
    await app.go('a')
    expect(app.text()).toBe('a:Alpha')
    expect(app.form().dirty()).toBe(false)
  })

  it('ignores a late refetch of A after B committed', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const gate = deferred<undefined>()
    app.gates.set('a', gate)
    app.server.set('a', { ...project(app, 'a'), name: 'Alpha late' })
    void app.cache.invalidate(app.projectQuery.key('a'))
    await app.go('b')
    gate.resolve(undefined)
    await flush()
    expect(app.text()).toBe('b:Beta')
    expect(app.form().values().name).toBe('Beta')
  })

  it('starts clean when a collected entry is loaded again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const app = setup({ gcTime: 1_000 })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    app.form().field('name').set('Unsaved A')
    await app.go('b')
    vi.advanceTimersByTime(1_000)
    await app.go('a')
    expect(app.fetches).toEqual(['a', 'b', 'a'])
    expect(app.text()).toBe('a:Alpha')
    expect(app.form().dirty()).toBe(false)
  })
})

describe('same-record refetches', () => {
  it('update pristine fields and keep dirty ones, reporting conflicts', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    const name = form.field('name')
    const email = form.field('ownerEmail')
    email.set('mine@x.test')
    app.server.set('a', {
      ...project(app, 'a'),
      name: 'Alpha remote',
      ownerEmail: 'theirs@x.test',
    })
    await app.cache.invalidate(app.projectQuery.key('a'))
    expect(name.value()).toBe('Alpha remote')
    expect(name.dirty()).toBe(false)
    expect(email.value()).toBe('mine@x.test')
    expect(email.remote()).toBe('theirs@x.test')
    expect(email.remoteChanged()).toBe(true)
    expect(form.remoteChanged()).toBe(true)
    form.acceptRemote('ownerEmail')
    expect(email.value()).toBe('theirs@x.test')
    expect(form.remoteChanged()).toBe(false)
  })

  it('does not report a conflict when the server value did not move', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const email = app.form().field('ownerEmail')
    email.set('mine@x.test')
    app.server.set('a', { ...project(app, 'a'), name: 'Other change' })
    await app.cache.invalidate(app.projectQuery.key('a'))
    expect(email.dirty()).toBe(true)
    expect(email.remoteChanged()).toBe(false)
  })

  it('lets a field edited back to the server value follow later refetches', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const name = app.form().field('name')
    name.set('Temporary')
    name.set('Alpha')
    app.server.set('a', { ...project(app, 'a'), name: 'Alpha remote' })
    await app.cache.invalidate(app.projectQuery.key('a'))
    expect(name.value()).toBe('Alpha remote')
  })

  it('acceptRemote() with no name drops every edit', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    form.field('name').set('One')
    form.field('ownerEmail').set('two@x.test')
    form.acceptRemote()
    expect(form.dirty()).toBe(false)
    expect(form.values()).toEqual({ name: 'Alpha', ownerEmail: 'a@x.test' })
  })

  it('reset() clears edits and touched flags', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    const name = form.field('name')
    name.set('Changed')
    name.blur()
    form.reset()
    expect(name.value()).toBe('Alpha')
    expect(name.touched()).toBe(false)
  })
})

describe('submission through the mutation', () => {
  it('passes { ...params, values } and refreshes the record', async () => {
    const app = setup()
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    form.field('name').set('  Renamed  ')
    const event = new Event('submit', { cancelable: true })
    const pending = form.submit(event)
    expect(event.defaultPrevented).toBe(true)
    expect(form.submitting()).toBe(true)
    const result = await pending
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ name: 'Renamed', updatedAt: 2 }),
    })
    expect(app.saves).toEqual([
      {
        projectId: 'a',
        values: { name: '  Renamed  ', ownerEmail: 'a@x.test' },
      },
    ])
    expect(form.submitting()).toBe(false)
    // The submitted edit is dropped; the field shows the refreshed server value.
    expect(form.field('name').dirty()).toBe(false)
    expect(app.text()).toBe('a:Renamed')
  })

  it('rejects a second submit while one is pending', async () => {
    const app = setup({ save: 'manual' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    const first = form.submit()
    await expect(form.submit()).resolves.toEqual({ ok: false, reason: 'busy' })
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(1))
    gate(app, 0).resolve(undefined)
    await expect(first).resolves.toMatchObject({ ok: true })
    expect(app.saves).toHaveLength(1)
  })

  it('keeps fields edited during the submission dirty', async () => {
    const app = setup({ save: 'manual' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    const name = form.field('name')
    const email = form.field('ownerEmail')
    name.set('Saved name')
    email.set('first@x.test')
    const pending = form.submit()
    email.set('second@x.test')
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(1))
    gate(app, 0).resolve(undefined)
    await pending
    expect(name.dirty()).toBe(false)
    expect(name.value()).toBe('Saved name')
    expect(email.dirty()).toBe(true)
    expect(email.value()).toBe('second@x.test')
  })

  it('records a failure, keeps the edits, and clears it on the next submit', async () => {
    const app = setup({ save: 'manual' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    form.field('name').set('fail')
    const first = form.submit()
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(1))
    gate(app, 0).resolve(undefined)
    expect(await first).toEqual({
      ok: false,
      reason: 'failed',
      error: new Error('Name rejected.'),
      cancelled: false,
    })
    expect(form.error()).toBe('Name rejected.')
    expect(form.field('name').value()).toBe('fail')
    form.field('name').set('Fixed')
    const second = form.submit()
    expect(form.error()).toBeUndefined()
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(2))
    gate(app, 1).resolve(undefined)
    await expect(second).resolves.toMatchObject({ ok: true })
  })

  it('writes no form state when the save finishes after navigating away, but refreshes its record', async () => {
    const app = setup({ save: 'manual' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    form.field('name').set('fail')
    const pending = form.submit()
    await app.go('b')
    form.field('name').set('Edited B')
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(1))
    gate(app, 0).resolve(undefined)
    await pending
    // A's failure belongs to A: B shows no error and keeps its own edit.
    expect(form.error()).toBeUndefined()
    expect(form.submitting()).toBe(false)
    expect(form.field('name').value()).toBe('Edited B')
  })

  it('refreshes the saved record after navigating away', async () => {
    const app = setup({ save: 'manual' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    form.field('name').set('Saved later')
    const pending = form.submit()
    await app.go('b')
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(1))
    gate(app, 0).resolve(undefined)
    await pending
    expect(app.text()).toBe('b:Beta')
    await app.go('a')
    expect(app.text()).toBe('a:Saved later')
  })

  it('still refreshes the record when the save finishes after disposal', async () => {
    const app = setup({ save: 'manual' })
    await vi.waitFor(() => expect(app.text()).toBe('a:Alpha'))
    const form = app.form()
    form.field('name').set('After disposal')
    const pending = form.submit()
    roots.pop()?.()
    await vi.waitFor(() => expect(app.saveGates).toHaveLength(1))
    gate(app, 0).resolve(undefined)
    await expect(pending).resolves.toMatchObject({ ok: true })
    expect(project(app, 'a').name).toBe('After disposal')
  })
})

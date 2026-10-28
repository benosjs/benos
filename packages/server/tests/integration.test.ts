// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onMount } from '@benosjs/core'
import { Suspense } from '@benosjs/async'
import { jsx, type Child } from '@benosjs/dom'
import { hydrate, type HydrationMismatch } from '@benosjs/dom/hydrate'
import { formModel } from '@benosjs/forms'
import { mutation, query } from '@benosjs/query'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  redirect,
  route,
  RouterOutlet,
} from '@benosjs/router'
import { renderToString } from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const tick = async (times = 3): Promise<void> => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

interface User {
  name: string
  secret: string
}
const codec = {
  id: 'user',
  serialize: (user: User) => ({ name: user.name }),
  deserialize: (raw: unknown) => ({ ...(raw as { name: string }), secret: '' }),
}

function stripMarkers(html: string): string {
  return html
    .replace(
      /<!--benos:[^>]*-->|<!--\/benos:[^>]*-->|<!--\/?[bi](?::\d+)?-->|<!---->/g,
      '',
    )
    .replace(/<script type="application\/json"[^>]*>.*<\/script>$/s, '')
}

function host(html: string): HTMLDivElement {
  const element = document.createElement('div')
  document.body.append(element)
  element.innerHTML = html
  return element
}

describe('queries on the server and under hydration', () => {
  it('renders an opted-in query, serializes its projection, and hydrates without a refetch', async () => {
    let fetches = 0
    const users = query({
      fetch: (id: number): Promise<User> => {
        fetches++
        return Promise.resolve({ name: `Ada ${id}`, secret: 'hunter2' })
      },
      ssr: codec,
    })
    const app = () => {
      const user = users(() => 7)
      return jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () =>
            jsx('b', {
              get children() {
                return user.read()?.name
              },
            }),
          {},
        ),
      })
    }
    const result = await renderToString(app)
    expect(stripMarkers(result.html)).toBe('<b>Ada 7</b>')
    expect(result.payload).toBe(
      '{"v":1,"r":[],"q":[["user","7",{"name":"Ada 7"}]]}',
    )
    expect(result.html).not.toContain('hunter2')
    expect(fetches).toBe(1)
    const page = host(result.html)
    const b = page.querySelector('b')
    roots.push(hydrate(app, page))
    await tick()
    expect(page.querySelector('b')).toBe(b)
    expect(page.textContent).toBe('Ada 7')
    expect(fetches).toBe(1)
    expect(users.peek(7)).toEqual({ name: 'Ada 7', secret: '' })
  })

  it('gives concurrent requests separate caches and payloads', async () => {
    let fetches = 0
    const users = query({
      fetch: (id: number): Promise<User> =>
        new Promise((done) =>
          setTimeout(() => {
            fetches++
            done({ name: `User ${id}`, secret: 's' })
          }, 1),
        ),
      ssr: codec,
    })
    const app = (id: number) => () => {
      const user = users(() => id)
      return jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () =>
            jsx('b', {
              get children() {
                return user.read()?.name
              },
            }),
          {},
        ),
      })
    }
    const [a, b] = await Promise.all([
      renderToString(app(1), { rootId: 'a' }),
      renderToString(app(2), { rootId: 'b' }),
    ])
    expect(stripMarkers(a.html)).toBe('<b>User 1</b>')
    expect(stripMarkers(b.html)).toBe('<b>User 2</b>')
    expect(a.payload).toBe(
      '{"v":1,"r":[],"q":[["user","1",{"name":"User 1"}]]}',
    )
    expect(b.payload).toBe(
      '{"v":1,"r":[],"q":[["user","2",{"name":"User 2"}]]}',
    )
    expect(fetches).toBe(2)
    expect(users.peek(1)).toBeUndefined()
  })

  it('leaves the fallback for a query without a codec and fetches on the client', async () => {
    let fetches = 0
    const users = query({
      fetch: (id: number): Promise<User> => {
        fetches++
        return Promise.resolve({ name: `Ada ${id}`, secret: 'x' })
      },
    })
    const app = () => {
      const user = users(() => 3)
      return jsx(Suspense, {
        fallback: jsx('i', { children: 'loading' }),
        children: jsx(
          () =>
            jsx('b', {
              get children() {
                return user.read()?.name
              },
            }),
          {},
        ),
      })
    }
    const result = await renderToString(app)
    expect(stripMarkers(result.html)).toBe('<i>loading</i>')
    expect(result.payload).toBe('')
    expect(fetches).toBe(0)
    const page = host(result.html)
    roots.push(hydrate(app, page))
    await tick(6)
    expect(page.textContent).toBe('Ada 3')
    expect(fetches).toBe(1)
  })
})

describe('the router on the server and under hydration', () => {
  interface Project {
    id: string
    name: string
  }
  function setup(initial: string, options: { hold?: boolean } = {}) {
    let fetches = 0
    let loaderSignal: AbortSignal | undefined
    const projects = query({
      fetch: (id: string, { signal }): Promise<Project> => {
        fetches++
        loaderSignal = signal
        return options.hold
          ? new Promise(() => undefined)
          : Promise.resolve({ id, name: id.toUpperCase() })
      },
      ssr: {
        id: 'project',
        serialize: (project: Project) => project,
        deserialize: (raw: unknown) => raw as Project,
      },
    })
    const home = route('/')
    const old = route('/old')
    const project = route('/projects/:id', {
      loader: ({ params, signal }) => projects.load(params.id, signal),
    })
    const events: string[] = []
    function ProjectPage(): Child {
      const match = project.match()
      onMount(() => events.push('mount'))
      return jsx('h1', {
        get children() {
          return match.data().value().name
        },
      })
    }
    const app = () => {
      const router = createRouter({
        history: memoryHistory({ initialEntries: [initial] }),
        routes: [
          mountRoute(home, { component: () => jsx('p', { children: 'home' }) }),
          mountRoute(old, { redirect: redirect({ to: home }) }),
          mountRoute(project, {
            component: ProjectPage,
            pending: () => jsx('p', { role: 'status', children: 'pending' }),
          }),
        ],
        notFound: () => jsx('p', { children: 'missing' }),
      })
      return jsx(RouterOutlet, { router })
    }
    return { app, events, fetches: () => fetches, signal: () => loaderSignal }
  }

  it('awaits a route loader, renders its query data, and answers 200', async () => {
    const { app, fetches } = setup('/projects/atlas')
    const result = await renderToString(app)
    expect(result.status).toBe(200)
    expect(stripMarkers(result.html)).toContain('<h1>ATLAS</h1>')
    expect(stripMarkers(result.html)).not.toContain('pending')
    expect(result.payload).toContain(
      '["project","\\"atlas\\"",{"id":"atlas","name":"ATLAS"}]',
    )
    expect(fetches()).toBe(1)
  })

  it('answers 404 for the not-found view and 302 with Location for a redirect', async () => {
    const missing = await renderToString(setup('/nowhere').app)
    expect(missing.status).toBe(404)
    expect(stripMarkers(missing.html)).toContain('<p>missing</p>')
    const moved = await renderToString(setup('/old').app)
    expect(moved.status).toBe(302)
    expect(moved.headers.get('Location')).toBe('/')
  })

  it('cancels the loader fetch when the request aborts', async () => {
    const { app, signal } = setup('/projects/atlas', { hold: true })
    const controller = new AbortController()
    const pending = renderToString(app, { signal: controller.signal })
    await tick()
    controller.abort(new Error('gone'))
    await expect(pending).rejects.toThrow('gone')
    expect(signal()?.aborted).toBe(true)
  })

  it('hydrates routed content after the loader settles, reusing the server nodes', async () => {
    const { app, events, fetches } = setup('/projects/atlas')
    const result = await renderToString(app)
    const page = host(result.html)
    const h1 = page.querySelector('h1')
    expect(h1?.textContent).toBe('ATLAS')
    const mismatches: HydrationMismatch[] = []
    const serverEvents = events.splice(0)
    expect(serverEvents).toEqual([])
    roots.push(
      hydrate(app, page, { onMismatch: (info) => mismatches.push(info) }),
    )
    expect(events).toEqual([])
    await tick(8)
    expect(page.querySelector('h1')).toBe(h1)
    expect(page.querySelector('h1')?.textContent).toBe('ATLAS')
    expect(events).toEqual(['mount'])
    expect(mismatches).toEqual([])
    expect(fetches()).toBe(1)
    expect(page.innerHTML).not.toMatch(/benos|<!--\/?[bi]/)
  })
})

describe('forms under hydration', () => {
  it('gives fields the same ids on the server and the client', async () => {
    const save = mutation({ run: async (input: { name: string }) => input })
    const model = formModel({
      initial: () => ({ name: 'Ada' }),
      save,
    })
    const app = () => {
      const form = model()
      const field = form.field('name')
      return jsx('label', {
        for: field.id,
        children: jsx('input', {
          id: field.id,
          get value() {
            return field.value()
          },
        }),
      })
    }
    const result = await renderToString(app)
    const page = host(result.html)
    const input = page.querySelector('input')
    const id = input?.id
    expect(id).toMatch(/^b0-.*-name$/)
    expect(page.querySelector('label')?.htmlFor).toBe(id)
    roots.push(hydrate(app, page))
    await tick()
    expect(page.querySelector('input')).toBe(input)
    expect(page.querySelector('input')?.id).toBe(id)
  })
})

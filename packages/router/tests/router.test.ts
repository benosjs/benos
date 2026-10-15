import { describe, expect, it } from 'vitest'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  redirect,
  route,
} from '../src/index.js'
import type { RouterHistory } from '../src/index.js'
import { compilePath, matchPath } from '../src/path.js'

const empty = () => null
async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('router core', () => {
  it('requires a route match to be read inside its matching route owner', () => {
    const item = route('/items/:id')
    expect(() => item.match()).toThrow(/matching route scope/)
  })

  it('prefers static, then named, then catch-all routes', async () => {
    const named = route('/projects/:id')
    const fixed = route('/projects/new')
    const rest = route('/projects/*rest')
    const history = memoryHistory()
    const router = createRouter({
      history,
      routes: [
        mountRoute(rest, { component: empty }),
        mountRoute(named, { component: empty }),
        mountRoute(fixed, { component: empty }),
      ],
    })
    await router.navigate({ to: fixed })
    expect(router.matches().at(-1)?.route).toBe(fixed)
    await router.navigate({ to: named, params: { id: 'p 1' } })
    expect(router.location()).toBe('/projects/p%201')
    expect(router.matches().at(-1)?.params).toEqual({ id: 'p 1' })
    await router.navigate({ to: rest, params: { rest: 'a/b' } })
    expect(router.location()).toBe('/projects/a/b')
    expect(router.matches().at(-1)?.route).toBe(rest)
  })

  it('does not let an empty catch-all shadow an exact parent route', async () => {
    const projects = route('/projects')
    const rest = route('/projects/*rest')
    const router = createRouter({
      history: memoryHistory(),
      routes: [
        mountRoute(rest, { component: empty }),
        mountRoute(projects, { component: empty }),
      ],
    })
    await router.navigate({ to: projects })
    expect(router.matches()[0]?.route).toBe(projects)
  })

  it('retains an encoded slash inside a parameter and rejects malformed escapes', async () => {
    const item = route('/items/:id')
    const history = memoryHistory({ initialEntries: ['/items/a%2Fb'] })
    const router = createRouter({
      history,
      routes: [mountRoute(item, { component: empty })],
    })
    const release = router.mount()
    await flushAsync()
    expect(router.matches()[0]?.params).toEqual({ id: 'a/b' })
    expect(router.href({ to: item, params: { id: 'a/b' } })).toBe(
      '/items/a%2Fb',
    )
    release()
    expect(() =>
      matchPath(compilePath('/items/:id'), '/items/%E0%A4%A', true),
    ).toThrow()
    expect(() => compilePath('/items/:id/:id')).toThrow(/duplicate/)
    expect(() => compilePath('/items/*rest/extra')).toThrow(/terminal/)
  })

  it('canonicalizes a direct trailing slash and preserves a typed destination hash', async () => {
    const item = route('/items/:id')
    let raw = '/items/a/?draft=1#field'
    const history: RouterHistory = {
      location: () => raw,
      push: (url) => {
        raw = url
      },
      replace: (url) => {
        raw = url
      },
      listen: () => () => undefined,
      back: () => undefined,
      forward: () => undefined,
    }
    const router = createRouter({
      history,
      routes: [mountRoute(item, { component: empty })],
    })
    const release = router.mount()
    await flushAsync()
    expect(router.location()).toBe('/items/a?draft=1#field')
    expect(raw).toBe('/items/a?draft=1#field')
    expect(router.href({ to: item, params: { id: 'b' }, hash: 'edit' })).toBe(
      '/items/b#edit',
    )
    release()
  })

  it('sorts typed search, round-trips it, and leaves the committed URL on parse failure', async () => {
    const query = route('/search', {
      search: {
        parse: (raw: URLSearchParams) => {
          const page = Number(raw.get('page'))
          if (!Number.isInteger(page) || page < 1) throw new Error('bad page')
          return { page }
        },
        stringify: (value: { page: number }) =>
          new URLSearchParams({
            z: 'last',
            page: String(value.page),
            a: 'first',
          }),
      },
    })
    const router = createRouter({
      history: memoryHistory(),
      routes: [mountRoute(query, { component: empty })],
    })
    expect(router.href({ to: query, search: { page: 2 } })).toBe(
      '/search?a=first&page=2&z=last',
    )
    await router.navigate({ to: query, search: { page: 2 } })
    expect(router.matches()[0]?.search).toEqual({ page: 2 })
    expect(router.location()).toBe('/search?a=first&page=2&z=last')
    await expect(
      router.navigate({ to: query, search: { page: 0 } }),
    ).rejects.toThrow(/bad page/)
    expect(router.location()).toBe('/search?a=first&page=2&z=last')
  })

  it('surfaces search serialization failures before changing history', async () => {
    const search = route('/search', {
      search: {
        parse: () => ({ query: '' }),
        stringify: () => {
          throw new Error('cannot serialize search')
        },
      },
    })
    const history = memoryHistory()
    const router = createRouter({
      history,
      routes: [mountRoute(search, { component: empty })],
    })

    expect(() =>
      router.href({ to: search, search: { query: 'term' } }),
    ).toThrow(/cannot serialize search/)
    expect(() =>
      router.navigate({ to: search, search: { query: 'term' } }),
    ).toThrow(/cannot serialize search/)
    expect(history.entries()).toEqual(['/'])
    expect(router.location()).toBe('/')
  })

  it('follows redirects, detects cycles, and rejects unregistered references', async () => {
    const home = route('/')
    const old = route('/old')
    const foreign = route('/foreign')
    const router = createRouter({
      history: memoryHistory(),
      routes: [
        mountRoute(home, { component: empty }),
        mountRoute(old, { redirect: redirect({ to: home }) }),
      ],
    })
    expect(await router.navigate({ to: old })).toEqual({
      status: 'redirected',
      location: '/',
    })
    expect(router.location()).toBe('/')
    expect(() => router.href({ to: foreign })).toThrow(/Unregistered/)
    const a = route('/a')
    const b = route('/b')
    const cyclic = createRouter({
      history: memoryHistory(),
      routes: [
        mountRoute(a, { redirect: redirect({ to: b }) }),
        mountRoute(b, { redirect: redirect({ to: a }) }),
      ],
    })
    await expect(cyclic.navigate({ to: a })).rejects.toThrow(/Redirect cycle/)
  })

  it('supports memory back and forward with a not-found result', async () => {
    const home = route('/')
    const second = route('/second')
    const history = memoryHistory()
    const router = createRouter({
      history,
      routes: [
        mountRoute(home, { component: empty }),
        mountRoute(second, { component: empty }),
      ],
      notFound: empty,
    })
    const release = router.mount()
    await router.navigate({ to: second })
    expect(history.entries()).toEqual(['/', '/second'])
    router.back()
    await flushAsync()
    expect(router.location()).toBe('/')
    router.forward()
    await flushAsync()
    expect(router.location()).toBe('/second')
    release()
  })

  it('infers a relative child path from its parent reference', async () => {
    const project = route('/projects/:id')
    const details = route('details', { parent: project })
    const router = createRouter({
      history: memoryHistory(),
      routes: [
        mountRoute(project, {
          component: empty,
          children: [mountRoute(details, { component: empty })],
        }),
      ],
    })
    await router.navigate({ to: details, params: { id: 'p-1' } })
    expect(router.location()).toBe('/projects/p-1/details')
    expect(router.matches()[0]?.params).toEqual({ id: 'p-1' })
    expect(router.matches()[1]?.params).toEqual({ id: 'p-1' })
  })

  it('loads views only after matching and supersedes an older lazy navigation', async () => {
    const a = route('/a')
    const b = route('/b')
    let finish!: (view: { default: () => null }) => void
    let imports = 0
    const router = createRouter({
      history: memoryHistory(),
      routes: [
        mountRoute(a, {
          lazy: () => {
            imports++
            return new Promise((resolve) => (finish = resolve))
          },
        }),
        mountRoute(b, { component: empty }),
      ],
    })
    expect(imports).toBe(0)
    const first = router.navigate({ to: a })
    expect(imports).toBe(1)
    await router.navigate({ to: b })
    finish({ default: empty })
    expect(await first).toEqual({ status: 'superseded' })
    expect(router.location()).toBe('/b')
    await router.navigate({ to: a })
    expect(imports).toBe(1)
  })
})

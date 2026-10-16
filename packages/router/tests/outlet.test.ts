// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { jsx, render } from '@benosjs/dom'
import {
  createRouter,
  getRouter,
  Link,
  memoryHistory,
  mountRoute,
  Outlet,
  route,
  RouterOutlet,
} from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})
async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('router outlet and links', () => {
  it('requires the router context when accessed outside a route owner', () => {
    expect(() => getRouter()).toThrow(/RouterOutlet owner/)
  })

  it('captures the router during component setup for event callbacks', async () => {
    const source = route('/source')
    const destination = route('/destination')
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/source'] }),
      routes: [
        mountRoute(source, {
          component: () => {
            const currentRouter = getRouter()
            return jsx('button', {
              onClick: () => void currentRouter.navigate({ to: destination }),
              children: 'Continue',
            })
          },
        }),
        mountRoute(destination, {
          component: () => jsx('p', { children: 'Destination' }),
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await flushAsync()
    document.querySelector('button')?.click()
    await flushAsync()
    expect(router.location()).toBe('/destination')
    expect(document.querySelector('p')?.textContent).toBe('Destination')
  })

  it('preserves nested layouts and a same-route owner while params update', async () => {
    const root = route('/')
    const projects = route('/projects')
    const item = route('/projects/:id')
    let rootMounts = 0
    let projectMounts = 0
    let itemMounts = 0
    function Root() {
      rootMounts++
      return jsx('main', {
        children: [jsx('h1', { children: 'App' }), jsx(Outlet, {})],
      })
    }
    function Projects() {
      projectMounts++
      return jsx('section', { children: jsx(Outlet, {}) })
    }
    function Item() {
      itemMounts++
      const match = item.match()
      return jsx('p', {
        get children() {
          return match.params().id
        },
      })
    }
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/projects/a'] }),
      routes: [
        mountRoute(root, {
          component: Root,
          children: [
            mountRoute(projects, {
              component: Projects,
              children: [mountRoute(item, { component: Item })],
            }),
          ],
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await flushAsync()
    expect(document.querySelector('main')?.textContent).toBe('Appa')
    await router.navigate({ to: item, params: { id: 'b' } })
    expect(document.querySelector('main')?.textContent).toBe('Appb')
    expect([rootMounts, projectMounts, itemMounts]).toEqual([1, 1, 1])
  })

  it('renders an index route inside a pathless layout and a not-found page', async () => {
    const root = route('/')
    const home = route('/')
    const history = memoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      history,
      routes: [
        mountRoute(root, {
          component: () => jsx('main', { children: jsx(Outlet, {}) }),
          children: [
            mountRoute(null, {
              component: () => jsx('section', { children: jsx(Outlet, {}) }),
              children: [
                mountRoute(home, {
                  index: true,
                  component: () => jsx('p', { children: 'Home' }),
                }),
              ],
            }),
          ],
        }),
      ],
      notFound: () => jsx('p', { children: 'Missing' }),
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await flushAsync()
    expect(document.querySelector('main')?.textContent).toBe('Home')
    history.push('/unknown')
    history.back()
    history.forward()
    await flushAsync()
    expect(document.querySelector('p')?.textContent).toBe('Missing')
  })

  it('emits href and active state, intercepting only unmodified primary clicks', async () => {
    const home = route('/')
    const item = route('/items/:id')
    let clickCount = 0
    const router = createRouter({
      history: memoryHistory({ initialEntries: ['/'] }),
      routes: [
        mountRoute(home, {
          component: () =>
            jsx('nav', {
              children: jsx(Link, {
                to: item,
                params: { id: 'a b' },
                title: 'Open item',
                rel: 'bookmark',
                onClick: () => clickCount++,
                children: 'Item',
              }),
            }),
        }),
        mountRoute(item, {
          component: () => jsx('p', { children: 'Item page' }),
        }),
      ],
    })
    roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
    await flushAsync()
    const anchor = document.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('/items/a%20b')
    expect(anchor?.title).toBe('Open item')
    expect(anchor?.rel).toBe('bookmark')
    expect(anchor?.hasAttribute('aria-current')).toBe(false)
    const modified = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    })
    anchor?.dispatchEvent(modified)
    expect(modified.defaultPrevented).toBe(false)
    expect(clickCount).toBe(1)
    expect(router.location()).toBe('/')
    const primary = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
    anchor?.dispatchEvent(primary)
    expect(primary.defaultPrevented).toBe(true)
    expect(clickCount).toBe(2)
    await flushAsync()
    expect(router.location()).toBe('/items/a%20b')
    expect(document.querySelector('p')?.textContent).toBe('Item page')
  })
})

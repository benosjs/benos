// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signal } from '@benosjs/core'
import { jsx, render, Show } from '@benosjs/dom'
import {
  blockNavigation,
  createRouter,
  Link,
  memoryHistory,
  mountRoute,
  route,
  RouterOutlet,
} from '../src/index.js'
import type { NavigationBlocker, NavigationResult } from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

/** An editor page that blocks while `dirty` is true, and a second page. */
function setup(
  options: {
    confirm?: NavigationBlocker['confirm']
    initialEntries?: string[]
    loader?: (id: string) => unknown
  } = {},
) {
  const dirty = signal(true)
  const mounted = signal(true)
  const editor = route('/editor/:id', {
    loader: ({ params }) => options.loader?.(params.id) ?? params.id,
  })
  const other = route('/other')
  const confirm = vi.fn(options.confirm ?? (() => false))
  const when = vi.fn(() => dirty())
  const history = memoryHistory({
    initialEntries: options.initialEntries ?? ['/editor/a'],
  })
  const router = createRouter({
    history,
    routes: [
      mountRoute(editor, {
        component: () =>
          jsx(Show, {
            get when() {
              return mounted()
            },
            children: () => {
              blockNavigation({ when, confirm })
              return jsx('div', {
                children: [
                  jsx('p', { children: 'Editor' }),
                  jsx(Link, { to: other, children: 'Other' }),
                ],
              })
            },
          }),
      }),
      mountRoute(other, { component: () => jsx('p', { children: 'Other' }) }),
    ],
  })
  roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
  return {
    router,
    history,
    editor,
    other,
    dirty,
    mounted,
    confirm,
    when,
  }
}

describe('navigation blocker', () => {
  it('holds a programmatic navigation, refuses it, and loads nothing', async () => {
    const loader = vi.fn((id: string) => id)
    const app = setup({ loader })
    await flushAsync()
    expect(loader).toHaveBeenCalledTimes(1)
    const result = await app.router.navigate({
      to: app.editor,
      params: { id: 'b' },
    })
    expect(result).toEqual({ status: 'blocked' })
    expect(app.when).toHaveBeenCalledWith({
      location: '/editor/b',
      reason: 'programmatic',
    })
    expect(app.confirm).toHaveBeenCalledWith({ location: '/editor/b' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(app.router.location()).toBe('/editor/a')
    expect(app.history.entries()).toEqual(['/editor/a'])
    expect(app.router.navigation()).toEqual({ status: 'idle' })
  })

  it('continues when confirm resolves true', async () => {
    const app = setup({ confirm: () => Promise.resolve(true) })
    await flushAsync()
    const result = await app.router.navigate({ to: app.other })
    expect(result).toEqual({ status: 'committed', location: '/other' })
    expect(document.body.textContent).toContain('Other')
  })

  it('reports blocked while an async confirm is pending', async () => {
    let answer!: (value: boolean) => void
    const app = setup({
      confirm: () => new Promise<boolean>((done) => (answer = done)),
    })
    await flushAsync()
    const pending = app.router.navigate({ to: app.other })
    expect(app.router.navigation()).toEqual({
      status: 'blocked',
      destination: '/other',
    })
    answer(false)
    expect(await pending).toEqual({ status: 'blocked' })
    expect(app.router.navigation()).toEqual({ status: 'idle' })
  })

  it('lets a newer navigation supersede one waiting for confirm', async () => {
    const answers: Array<(value: boolean) => void> = []
    const app = setup({
      confirm: () => new Promise<boolean>((done) => answers.push(done)),
    })
    await flushAsync()
    const first = app.router.navigate({ to: app.other })
    const second = app.router.navigate({ to: app.editor, params: { id: 'b' } })
    answers[0]?.(true)
    answers[1]?.(true)
    const results: NavigationResult[] = [await first, await second]
    expect(results).toEqual([
      { status: 'superseded' },
      { status: 'committed', location: '/editor/b' },
    ])
    expect(app.router.location()).toBe('/editor/b')
  })

  it('treats a throwing confirm as a refusal', async () => {
    const app = setup({
      confirm: () => {
        throw new Error('dialog failed')
      },
    })
    await flushAsync()
    expect(await app.router.navigate({ to: app.other })).toEqual({
      status: 'blocked',
    })
  })

  it('does not ask while when is false', async () => {
    const app = setup()
    await flushAsync()
    app.dirty.set(false)
    expect(await app.router.navigate({ to: app.other })).toEqual({
      status: 'committed',
      location: '/other',
    })
    expect(app.confirm).not.toHaveBeenCalled()
  })

  it('holds a link navigation with the link reason', async () => {
    const app = setup()
    await flushAsync()
    document.querySelector('a')?.click()
    await flushAsync()
    expect(app.when).toHaveBeenCalledWith({
      location: '/other',
      reason: 'link',
    })
    expect(app.router.location()).toBe('/editor/a')
  })

  it('restores the history entry after a refused pop', async () => {
    const app = setup({ initialEntries: ['/other', '/editor/a'] })
    await flushAsync()
    expect(app.history.index()).toBe(1)
    app.router.back()
    await flushAsync()
    expect(app.when).toHaveBeenCalledWith({ location: '/other', reason: 'pop' })
    expect(app.history.index()).toBe(1)
    expect(app.history.location()).toBe('/editor/a')
    expect(app.router.location()).toBe('/editor/a')
    expect(document.body.textContent).toContain('Editor')
  })

  it('lets a confirmed pop through', async () => {
    const app = setup({
      initialEntries: ['/other', '/editor/a'],
      confirm: () => true,
    })
    await flushAsync()
    app.router.back()
    await flushAsync()
    expect(app.history.index()).toBe(0)
    expect(app.router.location()).toBe('/other')
  })

  it('releases the blocker with its owner', async () => {
    const app = setup()
    await flushAsync()
    app.mounted.set(false)
    expect(await app.router.navigate({ to: app.other })).toEqual({
      status: 'committed',
      location: '/other',
    })
    expect(app.confirm).not.toHaveBeenCalled()
  })

  it('does not hold the initial navigation', async () => {
    const app = setup()
    await flushAsync()
    expect(app.when).not.toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'programmatic' }),
    )
    expect(app.router.location()).toBe('/editor/a')
  })

  it('warns before unload only while when is true', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const app = setup()
    await flushAsync()
    const listeners = () =>
      add.mock.calls.filter(([type]) => type === 'beforeunload').length -
      remove.mock.calls.filter(([type]) => type === 'beforeunload').length
    expect(listeners()).toBe(1)
    expect(app.when).toHaveBeenCalledWith({
      location: '/editor/a',
      reason: 'unload',
    })
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    app.dirty.set(false)
    await flushAsync()
    expect(listeners()).toBe(0)
    app.dirty.set(true)
    await flushAsync()
    expect(listeners()).toBe(1)
    app.mounted.set(false)
    await flushAsync()
    expect(listeners()).toBe(0)
    add.mockRestore()
    remove.mockRestore()
  })
})

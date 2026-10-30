import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HydrationMismatch } from '@benosjs/dom/hydrate'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
  vi.resetModules()
})

/**
 * Renders the flagship slice on the server, parses it, and hydrates it with
 * the same module graph, as a page would.
 */
async function serve(initial = '/projects/atlas', name = 'Atlas') {
  vi.resetModules()
  const { renderToString } = await import('@benosjs/server')
  const { hydrate } = await import('@benosjs/dom/hydrate')
  const { memoryHistory, RouterOutlet } = await import('@benosjs/router')
  const { createAppRouter } = await import('../src/benos/routes/manifest.js')
  const { api } = await import('../src/shared/project.js')
  api.delay = 0
  const app = () => {
    const router = createAppRouter(memoryHistory({ initialEntries: [initial] }))
    return <RouterOutlet router={router} />
  }
  const result = await renderToString(app)
  const host = document.createElement('div')
  document.body.append(host)
  host.innerHTML = result.html
  const mismatches: HydrationMismatch[] = []
  const form = host.querySelector('form')
  roots.push(
    hydrate(app, host, { onMismatch: (info) => mismatches.push(info) }),
  )
  // Hydration finishes after the route's loader settles.
  await vi.waitFor(() => expect(host.innerHTML).not.toMatch(/<!--benos/))
  expect(host.querySelector('input')?.value).toBe(name)
  const input = (label: string) => {
    const element = [...host.querySelectorAll('label')].find(
      (candidate) => candidate.textContent === label,
    )
    const control = element && document.getElementById(element.htmlFor)
    if (!(control instanceof HTMLInputElement))
      throw new Error(`No input labelled ${label}`)
    return control
  }
  const type = (label: string, value: string) => {
    const control = input(label)
    control.value = value
    control.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const save = () =>
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  return { api, host, result, form, mismatches, input, type, save }
}

describe('flagship editor on the server', () => {
  it('renders the committed record, hydrates it in place, and saves like a client render', async () => {
    const app = await serve()
    expect(app.result.status).toBe(200)
    expect(app.result.html).toContain('value="Atlas"')
    expect(app.result.html).toContain('value="ada@example.com"')
    expect(app.result.html).not.toMatch(/<p role="status">Loading/)
    expect(app.mismatches).toEqual([])
    expect(app.host.querySelector('form')).toBe(app.form)
    expect(app.host.innerHTML).not.toMatch(/<!--benos|<!--\/?[bi](?::\d+)?-->/)
    expect(app.input('Name').value).toBe('Atlas')
    expect(app.input('Owner email').value).toBe('ada@example.com')
    expect(app.input('Name').id).toMatch(/^b0-/)
    expect(app.input('Name').id).toBe(app.host.querySelector('label')?.htmlFor)
    app.type('Name', 'Atlas 2')
    app.save()
    await vi.waitFor(() =>
      expect(app.api.projects.get('atlas')?.name).toBe('Atlas 2'),
    )
    expect(app.input('Name').value).toBe('Atlas 2')
  })

  it('serves each request its own record', async () => {
    const a = await serve('/projects/atlas', 'Atlas')
    expect(a.result.html).toContain('value="Atlas"')
    expect(a.result.html).not.toContain('Beacon')
    const b = await serve('/projects/beacon', 'Beacon')
    expect(b.result.html).toContain('value="Beacon"')
    expect(b.result.html).not.toContain('Atlas')
  })
})

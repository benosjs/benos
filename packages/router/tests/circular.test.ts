// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

const probe = globalThis as typeof globalThis & {
  __routeImportProbe?: (name: string) => void
}
afterEach(() => {
  delete probe.__routeImportProbe
  document.body.replaceChildren()
})

describe('circular-prone route graph', () => {
  it('does not evaluate page and layout modules while creating the manifest', async () => {
    vi.resetModules()
    const imports: string[] = []
    probe.__routeImportProbe = (name) => imports.push(name)
    const { router } =
      await import('../../../tests/fixtures/router-circular/manifest.js')
    expect(router.location()).toBe('/projects/p-1')
    expect(imports).toEqual([])
    const [{ jsx, render }, { RouterOutlet }, { projectRoute }] =
      await Promise.all([
        import('@benosjs/dom'),
        import('@benosjs/router'),
        import('../../../tests/fixtures/router-circular/refs.js'),
      ])
    const dispose = render(() => jsx(RouterOutlet, { router }), document.body)
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('h1')?.textContent).toBe('Project p-1'),
      )
      expect([...imports].sort()).toEqual(
        ['app layout', 'projects layout', 'project editor'].sort(),
      )
      await router.navigate({ to: projectRoute, params: { projectId: 'p-2' } })
      await vi.waitFor(() =>
        expect(document.querySelector('h1')?.textContent).toBe('Project p-2'),
      )
      expect([...imports].sort()).toEqual(
        ['app layout', 'projects layout', 'project editor'].sort(),
      )
    } finally {
      dispose()
    }
  })

  it('accepts an intentionally reversed import order without a manifest cycle', async () => {
    vi.resetModules()
    const imports: string[] = []
    probe.__routeImportProbe = (name) => imports.push(name)
    const page =
      await import('../../../tests/fixtures/router-circular/pages/project-editor.js')
    expect(typeof page.default).toBe('function')
    const { router } =
      await import('../../../tests/fixtures/router-circular/manifest.js')
    expect(router.location()).toBe('/projects/p-1')
    expect(imports).toEqual(['project editor'])
  })
})

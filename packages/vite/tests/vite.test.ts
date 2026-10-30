import { describe, expect, it } from 'vitest'
import benos from '../src/index.js'

type TransformHook = (
  this: { warn: (warning: { message: string }) => void },
  code: string,
  id: string,
  options?: { ssr?: boolean },
) => unknown

describe('@benosjs/vite', () => {
  it('pre-optimizes the compiler runtime subpath', () => {
    const plugin = benos()
    const config = plugin.config as () => {
      optimizeDeps: { include: string[] }
    }
    expect(config().optimizeDeps.include).toContain('@benosjs/dom/internal')
  })

  it('runs as a pre plugin and transforms raw TSX', async () => {
    const plugin = benos()
    expect(plugin.enforce).toBe('pre')
    const warnings: string[] = []
    const hook = plugin.transform as TransformHook
    const result = await hook.call(
      { warn: (warning) => warnings.push(warning.message) },
      'export const App = () => <button class="save">Save</button>',
      '/src/App.tsx',
    )
    expect(result).toMatchObject({ code: expect.stringContaining('__benos_') })
    expect(warnings).toEqual([])
  })

  it('fails clearly when another JSX transform ran first', async () => {
    const plugin = benos()
    const hook = plugin.transform as TransformHook
    await expect(
      Promise.resolve().then(() =>
        hook.call(
          { warn: () => undefined },
          'const App = () => jsx("div", {})',
          '/src/App.tsx',
        ),
      ),
    ).rejects.toThrow(/already-lowered JSX/)
  })

  it('compiles a server build exactly like the client build', async () => {
    const plugin = benos({ optimization: 'safe' })
    const hook = plugin.transform as TransformHook
    const source =
      'export const App = (props: { n: number }) => <p class="x">Count: {props.n}</p>'
    const client = (await hook.call(
      { warn: () => undefined },
      source,
      '/src/App.tsx',
    )) as { code: string }
    const server = (await hook.call(
      { warn: () => undefined },
      source,
      '/src/App.tsx',
      { ssr: true },
    )) as { code: string }
    expect(client.code).toContain('__benos_direct')
    expect(server.code).toBe(client.code)
  })
})

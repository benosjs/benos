// The server fast path in production: a binding evaluates once with no
// computation unless pending data has been read and is still pending. The
// host reads NODE_ENV at module load, so this file sets it before importing
// anything from Benos and imports every package dynamically from the same
// registry.
import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('NODE_ENV', 'production')

const core = await import('@benosjs/core')
// Count render effects the server host creates: the host captures the
// registry's function when `@benosjs/core/internal` is first imported.
const registry = (
  globalThis as typeof globalThis & {
    __benosCoreInternal: { createRenderEffect: (fn: () => void) => () => void }
  }
).__benosCoreInternal
const original = registry.createRenderEffect
let effects = 0
registry.createRenderEffect = (fn) => {
  effects++
  return original(fn)
}
const { jsx, For, Show } = await import('@benosjs/dom')
const { resource, Suspense } = await import('@benosjs/async')
const { renderToString } = await import('../src/index.js')

const stripMarkers = (html: string): string =>
  html.replace(/<!--[^>]*-->/g, '').replace(/<script[\s\S]*<\/script>/, '')

const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (user: { name: string }) => ({ name: user.name }),
  deserialize: (raw: unknown) => raw as { name: string },
}

describe('server fast path (production)', () => {
  it('creates no computation for a page without pending data', async () => {
    effects = 0
    const rows = Array.from({ length: 50 }, (_, index) => index)
    const { html } = await renderToString(() =>
      jsx('ul', {
        children: jsx(For, {
          each: rows,
          children: (item: () => number) =>
            jsx('li', {
              get class() {
                return item() % 2 ? 'odd' : 'even'
              },
              get children() {
                return item()
              },
            }),
        }),
      }),
    )
    expect(stripMarkers(html)).toContain('<li class="odd">1</li>')
    expect(stripMarkers(html).match(/<li/g)).toHaveLength(50)
    expect(effects).toBe(0)
  })

  it('keeps the first value for a late write without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { html } = await renderToString(() => {
      const count = core.signal(1)
      return [
        jsx('p', {
          get children() {
            return count()
          },
        }),
        jsx(() => {
          count.set(2)
          return null
        }, {}),
      ]
    })
    expect(stripMarkers(html)).toBe('<p>1</p>')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('re-renders every binding that depends on pending data, including plain value() reads through a computed', async () => {
    const { html } = await renderToString(() => {
      const user = resource(
        () => 1,
        () => Promise.resolve({ name: 'Ada' }),
        { ssr: codec },
      )
      const name = core.computed(() => user.value()?.name ?? '')
      return jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () => [
            jsx('b', {
              get children() {
                return user.read()?.name
              },
            }),
            jsx('i', {
              get children() {
                return name()
              },
            }),
          ],
          {},
        ),
      })
    })
    expect(stripMarkers(html)).toBe('<b>Ada</b><i>Ada</i>')
  })

  it('shows settled data for an opted-in resource read outside Suspense', async () => {
    const { html } = await renderToString(() => {
      const user = resource(
        () => 1,
        () => Promise.resolve({ name: 'Ada' }),
        { ssr: codec },
      )
      return jsx('b', {
        get children() {
          return user.value()?.name ?? ''
        },
      })
    })
    expect(stripMarkers(html)).toBe('<b>Ada</b>')
  })

  it('goes back to once-evaluation after the pending data settles', async () => {
    effects = 0
    const { html } = await renderToString(() => {
      const user = resource(
        () => 1,
        () => Promise.resolve({ name: 'Ada' }),
        { ssr: codec },
      )
      // The list mounts only after the resource settles, so its fifty
      // bindings are created while nothing is pending.
      return jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () =>
            jsx(Show, {
              get when() {
                return user.read()
              },
              children: (current: () => { name: string } | undefined) =>
                jsx(For, {
                  each: Array.from({ length: 50 }, (_, index) => index),
                  children: (item: () => number) =>
                    jsx('li', {
                      get children() {
                        return `${current()?.name ?? ''} ${item()}`
                      },
                    }),
                }),
            }),
          {},
        ),
      })
    })
    expect(stripMarkers(html)).toContain('<li>Ada 49</li>')
    // The Show binding and the resource's source watcher are effects created
    // while the resource was pending; the fifty <li> bindings are not.
    expect(effects).toBeLessThan(10)
  })
})

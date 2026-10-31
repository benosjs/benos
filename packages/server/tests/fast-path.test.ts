// The server fast path in development: every binding keeps its effect so a
// late write is detected, refused, and reported, which makes development
// HTML equal production HTML. The production path is covered by
// fast-path.production.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, signal } from '@benosjs/core'
import { resource, Suspense } from '@benosjs/async'
import { jsx } from '@benosjs/dom'
import { renderToString } from '../src/index.js'

const stripMarkers = (html: string): string =>
  html.replace(/<!--[^>]*-->/g, '').replace(/<script[\s\S]*<\/script>/, '')

const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (user: { name: string }) => ({ name: user.name }),
  deserialize: (raw: unknown) => raw as { name: string },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('server fast path (development)', () => {
  it('refuses a late write, keeps the first value, and names the binding', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { html } = await renderToString(() => {
      const count = signal(1)
      // The <p> mounts first; the component after it writes during its setup,
      // after the binding has read: a late write.
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
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('fast path')
    expect(message).toContain('at p ')
  })

  it('does not warn for a write that happens before the binding reads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { html } = await renderToString(() => {
      const count = signal(1)
      count.set(2)
      return jsx('p', {
        get children() {
          return count()
        },
      })
    })
    expect(stripMarkers(html)).toBe('<p>2</p>')
    expect(warn).not.toHaveBeenCalled()
  })

  it('still re-renders bindings inside pending content when the data settles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { html } = await renderToString(() => {
      const user = resource(
        () => 1,
        () => Promise.resolve({ name: 'Ada' }),
        { ssr: codec },
      )
      // `value()` is a plain signal read with no boundary token: a binding
      // over it still re-renders when the resource settles.
      const name = computed(() => user.value()?.name ?? '')
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
    expect(warn).not.toHaveBeenCalled()
  })
})

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { effect, onMount, signal } from '@benosjs/core'
import { jsx, render } from '../src/index.js'
import {
  For,
  Match,
  Show,
  Switch,
  jsx as stagedJsx,
  render as stagedRender,
} from '@benosjs/dom'
import { prepareInternalStage } from '../src/internal.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})

describe('detached staging', () => {
  it('prepares render bindings and releases user work after insertion', () => {
    const value = signal('first')
    const seen: string[] = []
    let stage!: ReturnType<typeof prepareInternalStage>
    function Content() {
      effect(() => seen.push(`effect ${value()}`))
      onMount(() => seen.push('mount'))
      return jsx('p', {
        get children() {
          return value()
        },
      })
    }
    roots.push(
      render(() => {
        stage = prepareInternalStage(() => jsx(Content, {}), document.body)
        return jsx('div', { children: 'shell' })
      }, document.body),
    )
    expect(stage.nodes[0]?.textContent).toBe('first')
    expect(document.body.textContent).toBe('shell')
    expect(seen).toEqual([])
    value.set('second')
    expect(stage.nodes[0]?.textContent).toBe('second')
    expect(seen).toEqual([])
    stage.commit()
    expect(document.body.textContent).toBe('shellsecond')
    expect(seen).toContain('effect second')
    stage.dispose()
    expect(document.body.textContent).toBe('shell')
  })

  describe('root control flow updated after commit', () => {
    function commitInto(child: () => unknown): HTMLElement {
      const host = document.createElement('div')
      const end = document.createComment('end')
      host.append(end)
      document.body.append(host)
      let stage!: ReturnType<typeof prepareInternalStage>
      roots.push(
        stagedRender(() => {
          stage = prepareInternalStage(
            child as () => ReturnType<typeof stagedJsx>,
            host,
          )
          return null
        }, document.body),
      )
      stage.commit(end)
      return host
    }

    it('remounts a root <Show> branch next to its committed anchor', () => {
      const ready = signal(false)
      const host = commitInto(() =>
        stagedJsx(Show, {
          get when() {
            return ready()
          },
          fallback: stagedJsx('p', { children: 'pending' }),
          children: stagedJsx('p', { children: 'ready' }),
        }),
      )
      expect(host.textContent).toBe('pending')
      ready.set(true)
      expect(host.textContent).toBe('ready')
      ready.set(false)
      expect(host.textContent).toBe('pending')
      expect(host.lastChild?.nodeValue).toBe('end')
    })

    it('remounts a root <Switch> branch next to its committed anchor', () => {
      const mode = signal<'a' | 'b'>('a')
      const host = commitInto(() =>
        stagedJsx(Switch, {
          children: [
            stagedJsx(Match, {
              get when() {
                return mode() === 'a'
              },
              children: stagedJsx('p', { children: 'A' }),
            }),
            stagedJsx(Match, {
              get when() {
                return mode() === 'b'
              },
              children: stagedJsx('p', { children: 'B' }),
            }),
          ],
        }),
      )
      expect(host.textContent).toBe('A')
      mode.set('b')
      expect(host.textContent).toBe('B')
    })

    it('grows and reorders a root <For> from a single element row', () => {
      const rows = signal<string[]>(['a'])
      const host = commitInto(() =>
        stagedJsx(For, {
          get each() {
            return rows()
          },
          by: (row: string) => row,
          children: (row: () => string) => stagedJsx('p', { children: row() }),
        }),
      )
      expect(host.textContent).toBe('a')
      rows.set(['a', 'b', 'c'])
      expect(host.textContent).toBe('abc')
      rows.set(['c', 'a', 'b'])
      expect(host.textContent).toBe('cab')
      rows.set([])
      rows.set(['z'])
      expect(host.textContent).toBe('z')
      expect(host.lastChild?.nodeValue).toBe('end')
    })
  })
})

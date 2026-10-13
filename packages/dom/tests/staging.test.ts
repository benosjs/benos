// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { effect, onMount, signal } from '@benosjs/core'
import { jsx, render } from '../src/index.js'
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
})

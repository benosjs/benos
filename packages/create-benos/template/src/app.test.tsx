/** @jsxImportSource @benosjs/dom */
import { describe, expect, it } from 'vitest'
import { signal } from '@benosjs/core'
import { For, Show } from '@benosjs/dom'

describe('Benos starter', () => {
  it('exposes signals and control-flow components', () => {
    const value = signal(1)
    expect(value()).toBe(1)
    expect(Show).toBeTypeOf('function')
    expect(For).toBeTypeOf('function')
  })
})

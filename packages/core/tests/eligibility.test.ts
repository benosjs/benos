import { describe, expect, it } from 'vitest'
import { createRoot, effect, onMount, signal } from '../src/index.js'
import {
  createInternalOwner,
  createRenderEffect,
  notifyMount,
  runWithOwner,
  setInternalOwnerGate,
} from '../src/runtime.js'

describe('internal owner eligibility', () => {
  it('runs staged render work while holding user effects and mounts', () => {
    const value = signal(1)
    const seen: string[] = []
    let release = (): void => undefined
    let dispose = (): void => undefined
    createRoot((stop) => {
      dispose = stop
      const stage = createInternalOwner('branch')
      setInternalOwnerGate(stage, 1)
      release = () => setInternalOwnerGate(stage, 0)
      runWithOwner(stage, () => {
        const component = createInternalOwner('component', () => true)
        runWithOwner(component, () => {
          createRenderEffect(() => seen.push(`render ${value()}`))
          effect(() => seen.push(`user ${value()}`))
          onMount(() => seen.push('mount'))
        })
        notifyMount(component)
      })
    })
    expect(seen).toEqual(['render 1'])
    value.set(2)
    expect(seen).toEqual(['render 1', 'render 2'])
    release()
    expect(seen).toEqual(['render 1', 'render 2', 'user 2', 'mount'])
    dispose()
  })

  it('holds both render and user work in a retained branch', () => {
    const value = signal(1)
    const seen: string[] = []
    let gate: (level: 0 | 1 | 2) => void = () => undefined
    let dispose = (): void => undefined
    createRoot((stop) => {
      dispose = stop
      const owner = createInternalOwner('branch')
      gate = (level) => setInternalOwnerGate(owner, level)
      runWithOwner(owner, () => {
        createRenderEffect(() => seen.push(`render ${value()}`))
        effect(() => seen.push(`user ${value()}`))
      })
    })
    expect(seen).toEqual(['render 1', 'user 1'])
    gate(2)
    value.set(2)
    expect(seen).toEqual(['render 1', 'user 1'])
    gate(0)
    expect(seen).toEqual(['render 1', 'user 1', 'render 2', 'user 2'])
    dispose()
  })
})

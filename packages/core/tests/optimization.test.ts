import { describe, expect, it } from 'vitest'
import {
  computed,
  createRoot,
  effect,
  onCleanup,
  signal,
} from '../src/index.js'
import {
  inspectInternalComputed,
  inspectInternalSignal,
} from '../src/runtime.js'

describe('optimized graph invariants', () => {
  it('reuses detached edges across repeated branch changes without retaining old subscribers', () => {
    const choose = signal(true)
    const left = signal(1)
    const right = signal(2)
    const seen: number[] = []
    let selected!: () => number
    const dispose = createRoot((disposeRoot) => {
      selected = computed(() => (choose() ? left() : right()))
      effect(() => {
        seen.push(selected())
      })
      return disposeRoot
    })
    for (let index = 0; index < 1_000; index++) {
      choose.set(index % 2 !== 0)
      expect(inspectInternalSignal(left).subscribers).toBe(
        index % 2 !== 0 ? 1 : 0,
      )
      expect(inspectInternalSignal(right).subscribers).toBe(
        index % 2 === 0 ? 1 : 0,
      )
      expect(inspectInternalComputed(selected).sources).toBe(2)
    }
    expect(seen).toHaveLength(1_001)
    dispose()
    expect(inspectInternalSignal(choose).subscribers).toBe(0)
    expect(inspectInternalSignal(left).subscribers).toBe(0)
    expect(inspectInternalSignal(right).subscribers).toBe(0)
  })

  it('deduplicates and reorders more than four sources after branch changes', () => {
    const order = signal(false)
    const inputs = Array.from({ length: 6 }, (_, index) => signal(index + 1))
    let read!: () => number
    const dispose = createRoot((disposeRoot) => {
      read = computed(() => {
        const current = order() ? [...inputs].reverse() : inputs
        return current.reduce((sum, input) => sum + input() + input(), 0)
      })
      return disposeRoot
    })
    expect(read()).toBe(42)
    expect(inspectInternalComputed(read).sources).toBe(7)
    order.set(true)
    expect(read()).toBe(42)
    expect(inspectInternalComputed(read).sourceIds).toEqual([
      inspectInternalSignal(order).id,
      ...[...inputs].reverse().map((input) => inspectInternalSignal(input).id),
    ])
    dispose()
  })

  it('disposes a cleanup acquired after earlier resource-free effect runs', () => {
    const value = signal(0)
    const cleaned: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        if (value() === 3) onCleanup(() => cleaned.push(3))
      })
      return disposeRoot
    })
    value.set(1)
    value.set(2)
    expect(cleaned).toEqual([])
    value.set(3)
    expect(cleaned).toEqual([])
    value.set(4)
    expect(cleaned).toEqual([3])
    dispose()
  })
})

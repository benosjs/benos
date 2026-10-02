import { describe, expect, it, vi } from 'vitest'
import {
  batch,
  computed,
  createRoot,
  effect,
  onCleanup,
  signal,
  untrack,
} from '../src/index.js'

describe('signal', () => {
  it('reads, writes, updates, and exposes a stable readonly view', () => {
    const count = signal(1)
    const view = count.readonly()
    expect(count()).toBe(1)
    expect(view()).toBe(1)
    expect(count.readonly()).toBe(view)
    expect('set' in view).toBe(false)
    count.set(2)
    count.update((value) => value + 3)
    expect(view()).toBe(5)
  })

  it('uses Object.is, custom equality, and equals false', () => {
    const numbers = signal(NaN)
    const pairs = signal({ id: 1 }, { equals: (a, b) => a.id === b.id })
    const always = signal(1, { equals: false, name: 'always' })
    const seen: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => seen.push(always()))
      return disposeRoot
    })
    numbers.set(NaN)
    expect(numbers()).toBeNaN()
    numbers.set(0)
    numbers.set(-0)
    expect(Object.is(numbers(), -0)).toBe(true)
    const first = pairs()
    pairs.set({ id: 1 })
    expect(pairs()).toBe(first)
    always.set(1)
    expect(seen).toEqual([1, 1])
    dispose()
  })

  it('leaves state unchanged when updater or comparator throws', () => {
    const failure = new Error('compare')
    const value = signal(1, {
      equals: () => {
        throw failure
      },
    })
    expect(() => value.set(2)).toThrow(failure)
    expect(value()).toBe(1)
    expect(() =>
      value.update(() => {
        throw failure
      }),
    ).toThrow(failure)
    expect(value()).toBe(1)
  })
})

describe('computed', () => {
  it('is lazy, cached, and uses the global write-version fast path', () => {
    const source = signal(2)
    const unrelated = signal(0)
    const run = vi.fn(() => source() * 2)
    const dispose = createRoot((disposeRoot) => {
      const doubled = computed(run)
      expect(run).not.toHaveBeenCalled()
      expect(doubled()).toBe(4)
      expect(doubled()).toBe(4)
      unrelated.set(1)
      expect(doubled()).toBe(4)
      expect(run).toHaveBeenCalledTimes(1)
      source.set(3)
      expect(doubled()).toBe(6)
      expect(run).toHaveBeenCalledTimes(2)
      return disposeRoot
    })
    dispose()
  })

  it('switches dependencies and suppresses equal downstream results', () => {
    const choose = signal(true)
    const left = signal(1)
    const right = signal(1)
    const runs: number[] = []
    const dispose = createRoot((disposeRoot) => {
      const selected = computed(() => (choose() ? left() : right()))
      effect(() => {
        runs.push(selected())
      })
      return disposeRoot
    })
    choose.set(false)
    left.set(2)
    right.set(3)
    expect(runs).toEqual([1, 3])
    dispose()
    right.set(4)
    expect(runs).toEqual([1, 3])
  })

  it('does not rerun or clean an effect when a computed result stays equal', () => {
    const source = signal(0)
    const events: string[] = []
    const dispose = createRoot((disposeRoot) => {
      const parity = computed(() => source() % 2)
      effect(() => {
        events.push(`run ${parity()}`)
        onCleanup(() => events.push('cleanup'))
      })
      return disposeRoot
    })
    source.set(2)
    expect(events).toEqual(['run 0'])
    source.set(3)
    expect(events).toEqual(['run 0', 'cleanup', 'run 1'])
    dispose()
  })

  it('deduplicates reads and handles diamonds without intermediate values', () => {
    const base = signal(1)
    const runs: number[] = []
    const dispose = createRoot((disposeRoot) => {
      const left = computed(() => base() + base())
      const right = computed(() => base() * 3)
      const end = computed(() => left() + right())
      effect(() => {
        runs.push(end())
      })
      return disposeRoot
    })
    base.set(2)
    expect(runs).toEqual([5, 10])
    dispose()
  })

  it('keeps failed dependencies for recovery and routes reader errors', () => {
    const fail = signal(true)
    const value = signal(1)
    const dispose = createRoot((disposeRoot) => {
      const derived = computed(() => {
        if (fail()) throw new Error(`bad ${value()}`)
        return value()
      })
      expect(() => derived()).toThrow('bad 1')
      value.set(2)
      expect(() => derived()).toThrow('bad 2')
      fail.set(false)
      expect(derived()).toBe(2)
      return disposeRoot
    })
    dispose()
  })

  it('retains old and newly read sources after a failed branch switch', () => {
    const branch = signal(false)
    const oldSource = signal(1)
    const newSource = signal(1)
    const evaluate = vi.fn(() => {
      if (branch()) {
        newSource()
        throw new Error('new branch failed')
      }
      return oldSource()
    })
    const dispose = createRoot((disposeRoot) => {
      const selected = computed(evaluate)
      expect(selected()).toBe(1)
      branch.set(true)
      expect(() => selected()).toThrow('new branch failed')
      const before = evaluate.mock.calls.length
      oldSource.set(2)
      expect(() => selected()).toThrow('new branch failed')
      expect(evaluate.mock.calls.length).toBe(before + 1)
      newSource.set(2)
      expect(() => selected()).toThrow('new branch failed')
      branch.set(false)
      expect(selected()).toBe(2)
      return disposeRoot
    })
    dispose()
  })

  it('rejects recursive reads, writes, and allocation inside a computed', () => {
    const state = signal(1)
    const dispose = createRoot((disposeRoot) => {
      const recursive: () => number = computed(() => recursive())
      expect(() => recursive()).toThrow('Recursive computed read')
      expect(() => computed(() => state.set(2))()).toThrow(
        'computed evaluation',
      )
      expect(() => computed(() => signal(0))()).toThrow('computed evaluation')
      expect(() => computed(() => effect(() => {}))()).toThrow(
        'computed evaluation',
      )
      return disposeRoot
    })
    dispose()
  })

  it('untrack excludes only the caller edge', () => {
    const a = signal(1)
    const b = signal(1)
    const values: number[] = []
    const dispose = createRoot((disposeRoot) => {
      const doubled = computed(() => a() * 2)
      effect(() => {
        values.push(untrack(doubled) + b())
      })
      return disposeRoot
    })
    a.set(2)
    expect(values).toEqual([3])
    b.set(2)
    expect(values).toEqual([3, 6])
    dispose()
  })

  it('permits explicit reads inside a batch and coalesces effects', () => {
    const state = signal(0)
    const seen: number[] = []
    let squared!: () => number
    const dispose = createRoot((disposeRoot) => {
      squared = computed(() => state() ** 2)
      effect(() => {
        seen.push(squared())
      })
      return disposeRoot
    })
    batch(() => {
      state.set(2)
      expect(squared()).toBe(4)
      state.set(3)
      expect(squared()).toBe(9)
    })
    expect(seen).toEqual([0, 9])
    dispose()
  })
})

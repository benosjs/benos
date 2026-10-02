import { describe, expect, it, vi } from 'vitest'
import { batch, computed, createRoot, effect, signal } from '../src/index.js'
import {
  createInternalOwner,
  inspectInternalComputed,
  inspectInternalQueues,
  inspectInternalSignal,
  runWithOwner,
} from '../src/runtime.js'

describe('deterministic graph lifetime', () => {
  it('removes disposed effects and computeds from subscriber sets and queues immediately', () => {
    const source = signal(0)
    let derived!: () => number
    const runs: number[] = []
    const dispose = createRoot((disposeRoot) => {
      derived = computed(() => source() + 1)
      effect(() => {
        runs.push(derived())
      })
      return disposeRoot
    })
    expect(inspectInternalSignal(source).subscribers).toBe(1)
    expect(inspectInternalComputed(derived)).toMatchObject({
      sources: 1,
      subscribers: 1,
      live: true,
      disposed: false,
    })

    batch(() => {
      source.set(1)
      expect(inspectInternalQueues().user).toBe(1)
      dispose()
      expect(inspectInternalSignal(source).subscribers).toBe(0)
      expect(inspectInternalComputed(derived)).toMatchObject({
        sources: 0,
        subscribers: 0,
        disposed: true,
      })
      expect(inspectInternalQueues()).toEqual({ render: 0, user: 0, mount: 0 })
    })
    source.set(2)
    expect(runs).toEqual([1])
  })

  it('removes a directly subscribed effect from its signal and queue', () => {
    const source = signal(0)
    const seen: number[] = []
    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        seen.push(source())
      })
      return disposeRoot
    })
    expect(inspectInternalSignal(source).subscribers).toBe(1)
    batch(() => {
      source.set(1)
      expect(inspectInternalQueues().user).toBe(1)
      dispose()
      expect(inspectInternalSignal(source).subscribers).toBe(0)
      expect(inspectInternalQueues().user).toBe(0)
    })
    expect(seen).toEqual([0])
  })

  it('deduplicates repeated source reads and preserves first-read order', () => {
    const first = signal(1)
    const second = signal(2)
    let derived!: () => number
    const dispose = createRoot((disposeRoot) => {
      derived = computed(() => second() + first() + second() + first())
      expect(derived()).toBe(6)
      return disposeRoot
    })
    expect(inspectInternalComputed(derived).sources).toBe(2)
    expect(inspectInternalComputed(derived).sourceIds).toEqual([
      inspectInternalSignal(second).id,
      inspectInternalSignal(first).id,
    ])
    expect(inspectInternalSignal(first).subscribers).toBe(0)
    expect(inspectInternalSignal(second).subscribers).toBe(0)
    dispose()
  })

  it('subscribes the new branch before dropping the old shared upstream path', () => {
    const choose = signal(true)
    const shared = signal(1)
    const deletedAt: number[] = []
    const dispose = createRoot((disposeRoot) => {
      const left = computed(() => shared() + 1)
      const right = computed(() => shared() + 2)
      const selected = computed(() => (choose() ? left() : right()))
      effect(() => {
        selected()
      })
      return disposeRoot
    })
    const edges = inspectInternalSignal(shared).edges as Set<unknown>
    const originalDelete = edges.delete.bind(edges)
    const deletion = vi.spyOn(edges, 'delete').mockImplementation((value) => {
      deletedAt.push(edges.size)
      return originalDelete(value)
    })
    choose.set(false)
    expect(deletedAt).toEqual([2])
    expect(inspectInternalSignal(shared).subscribers).toBe(1)
    deletion.mockRestore()
    dispose()
    expect(inspectInternalSignal(shared).subscribers).toBe(0)
  })

  it('allocates owner contexts and cleanups only when used', () => {
    const dispose = createRoot((disposeRoot) => {
      const unused = createInternalOwner('branch')
      expect(unused.contexts).toBeNull()
      expect(unused.cleanups).toBeNull()
      const used = createInternalOwner('branch')
      runWithOwner(used, () => {
        const marker = signal(0)
        effect(() => {
          marker()
        })
      })
      expect(used.contexts).toBeNull()
      expect(used.cleanups).toBeNull()
      return disposeRoot
    })
    dispose()
  })
})

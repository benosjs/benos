import fc from 'fast-check'
import { expect, it } from 'vitest'
import { batch, createRoot, effect, signal } from '../src/index.js'

const write = fc.record({
  index: fc.integer({ min: 0, max: 2 }),
  value: fc.integer({ min: -2, max: 2 }),
})
const operation = fc.oneof(
  write.map((item) => ({ kind: 'single' as const, writes: [item] })),
  fc.array(write, { minLength: 1, maxLength: 5 }).map((writes) => ({
    kind: 'batch' as const,
    writes,
  })),
)

it('matches a reference transaction scheduler for generated writes and batches', () => {
  fc.assert(
    fc.property(
      fc.array(operation, { minLength: 1, maxLength: 40 }),
      (operations) => {
        const sources = [signal(0), signal(0), signal(0)]
        const model = [0, 0, 0]
        const actual: string[] = []
        const expected: string[] = []
        const snapshot = (values: number[]) => values.join(',')
        const recordExpected = () => {
          for (let effectIndex = 0; effectIndex < 3; effectIndex++)
            expected.push(`${effectIndex}:${snapshot(model)}`)
        }
        const dispose = createRoot((disposeRoot) => {
          for (let effectIndex = 0; effectIndex < 3; effectIndex++) {
            const index = effectIndex
            effect(() => {
              actual.push(
                `${index}:${sources.map((source) => source()).join(',')}`,
              )
            })
          }
          return disposeRoot
        })
        recordExpected()

        for (const step of operations) {
          let changed = false
          const apply = () => {
            for (const item of step.writes) {
              const source = sources[item.index]
              if (!source) throw new Error('source index out of range')
              if (!Object.is(model[item.index], item.value)) changed = true
              model[item.index] = item.value
              source.set(item.value)
              if (step.kind === 'single' && changed) recordExpected()
            }
          }
          if (step.kind === 'batch') {
            batch(apply)
            if (changed) recordExpected()
          } else apply()
        }
        expect(actual).toEqual(expected)
        dispose()
      },
    ),
    { numRuns: 150 },
  )
})

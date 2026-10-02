import { expect, it } from 'vitest'
import { assessReports, assertWithinLimit } from './guard-kernel.mjs'

function report(benos, preact) {
  return {
    workloads: {
      case: { milliseconds: { Benos: benos, 'Preact Signals': preact } },
    },
  }
}

it('fails a workload whose median ratio exceeds two', () => {
  const rows = assessReports(
    [report(2.1, 1), report(2.2, 1), report(1.9, 1)],
    ['case'],
  )
  expect(() => assertWithinLimit(rows)).toThrow('case')
})

it('uses the median to avoid a single noisy round', () => {
  const rows = assessReports(
    [report(1.7, 1), report(1.8, 1), report(4, 1)],
    ['case'],
  )
  expect(rows[0].ratio).toBe(1.8)
  expect(() => assertWithinLimit(rows)).not.toThrow()
})

it('rejects missing or invalid benchmark measurements', () => {
  expect(() => assessReports([report(1, 0)], ['case'])).toThrow(
    'Missing or invalid benchmark result',
  )
  expect(() => assessReports([], ['case'])).toThrow('No benchmark reports')
})

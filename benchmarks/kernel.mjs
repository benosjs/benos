import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
  computed,
  createRoot,
  effect,
  signal,
} from '../packages/core/dist/js/index.production.js'

const samples = 7
let checksum = 0

function measure(label, iterations, setup) {
  const times = []
  for (let round = 0; round < samples + 1; round++) {
    const { run, dispose = () => {} } = setup()
    const start = performance.now()
    run(iterations)
    const elapsed = performance.now() - start
    dispose()
    if (round > 0) times.push(elapsed)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  process.stdout.write(
    `${label}: ${median.toFixed(2)} ms median (${(iterations / (median / 1000)).toFixed(0)} ops/s)\n`,
  )
}

measure('signal read', 1_000_000, () => {
  const value = signal(7)
  return {
    run(iterations) {
      for (let index = 0; index < iterations; index++) checksum += value()
    },
  }
})

measure('computed chain write + read', 100_000, () => {
  const input = signal(0)
  let derived
  const dispose = createRoot((disposeRoot) => {
    const first = computed(() => input() + 1)
    const second = computed(() => first() * 2)
    derived = computed(() => second() - 1)
    return disposeRoot
  })
  return {
    run(iterations) {
      for (let index = 0; index < iterations; index++) {
        input.set(index)
        checksum += derived()
      }
    },
    dispose,
  }
})

measure('1,000-effect fanout write', 100, () => {
  const input = signal(0)
  const dispose = createRoot((disposeRoot) => {
    for (let index = 0; index < 1_000; index++)
      effect(() => {
        checksum += input()
      })
    return disposeRoot
  })
  return {
    run(iterations) {
      for (let index = 1; index <= iterations; index++) input.set(index)
    },
    dispose,
  }
})

measure('dynamic dependency switch', 100_000, () => {
  const choose = signal(true)
  const left = signal(1)
  const right = signal(2)
  const dispose = createRoot((disposeRoot) => {
    const selected = computed(() => (choose() ? left() : right()))
    effect(() => {
      checksum += selected()
    })
    return disposeRoot
  })
  return {
    run(iterations) {
      for (let index = 0; index < iterations; index++) choose.set(!choose())
    },
    dispose,
  }
})

process.stdout.write(`checksum: ${checksum}\n`)

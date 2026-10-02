import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { URL } from 'node:url'
import * as benos from '../packages/core/dist/js/index.production.js'
import * as preact from '@preact/signals-core'
import * as alien from 'alien-signals'
// The default Node entry is Solid's server build, which disables client effects.
import * as solid from 'solid-js/dist/solid.js'

const productionCode = readFileSync(
  new URL('../packages/core/dist/js/index.production.js', import.meta.url),
  'utf8',
)
if (
  productionCode.includes('process.env.NODE_ENV') ||
  productionCode.includes('Ownerless computed')
)
  throw new Error(
    'Benos benchmark input still contains development runtime paths',
  )

const adapters = [
  {
    name: 'Benos',
    signal(initial) {
      const value = benos.signal(initial)
      return { get: () => value(), set: (next) => value.set(next) }
    },
    computed: (fn) => benos.computed(fn),
    effect: (fn) => benos.effect(fn),
    scope: (setup) => benos.createRoot((dispose) => (setup(), dispose)),
  },
  {
    name: 'Preact Signals',
    signal(initial) {
      const value = preact.signal(initial)
      return { get: () => value.value, set: (next) => (value.value = next) }
    },
    computed(fn) {
      const value = preact.computed(fn)
      return () => value.value
    },
    effect(fn) {
      const stop = preact.effect(fn)
      preactStops.push(stop)
      return stop
    },
    scope(setup) {
      preactStops = []
      setup()
      const stops = preactStops
      return () => stops.forEach((stop) => stop())
    },
  },
  {
    name: 'Alien Signals',
    signal(initial) {
      const value = alien.signal(initial)
      return { get: () => value(), set: (next) => value(next) }
    },
    computed: (fn) => alien.computed(fn),
    effect: (fn) => alien.effect(fn),
    scope: (setup) => alien.effectScope(setup),
  },
  {
    name: 'Solid reactive core',
    signal(initial) {
      const [get, set] = solid.createSignal(initial)
      return { get, set }
    },
    computed: (fn) => solid.createMemo(fn),
    effect: (fn) => solid.createRenderEffect(fn),
    scope: (setup) => solid.createRoot((dispose) => (setup(), dispose)),
  },
]

let preactStops = []
let volatileSink = 0

const workloads = [
  {
    name: 'signal read',
    operations: 1_000_000,
    setup(api) {
      const value = api.signal(7)
      return {
        run(n) {
          let checksum = 0
          for (let i = 0; i < n; i++) checksum += value.get()
          return [checksum, 0]
        },
      }
    },
  },
  {
    name: '20-deep computed chain write + read',
    operations: 10_000,
    setup(api) {
      const input = api.signal(0)
      let read = input.get
      const dispose = api.scope(() => {
        for (let i = 0; i < 20; i++) {
          const prior = read
          read = api.computed(() => prior() + 1)
        }
        read()
      })
      return {
        run(n) {
          let checksum = 0
          for (let i = 1; i <= n; i++) {
            input.set(i)
            checksum += read()
          }
          return [checksum, 0]
        },
        dispose,
      }
    },
  },
  {
    name: '200-effect fanout write',
    operations: 200,
    setup(api) {
      const input = api.signal(0)
      let checksum = 0
      let runs = 0
      const dispose = api.scope(() => {
        for (let i = 0; i < 200; i++)
          api.effect(() => {
            checksum += input.get()
            runs++
          })
      })
      return {
        run(n) {
          checksum = 0
          runs = 0
          for (let i = 1; i <= n; i++) input.set(i)
          return [checksum, runs]
        },
        dispose,
      }
    },
  },
  {
    name: 'dynamic dependency switch',
    operations: 20_000,
    setup(api) {
      const choose = api.signal(true)
      const left = api.signal(1)
      const right = api.signal(2)
      let checksum = 0
      let runs = 0
      const dispose = api.scope(() => {
        const selected = api.computed(() =>
          choose.get() ? left.get() : right.get(),
        )
        api.effect(() => {
          checksum += selected()
          runs++
        })
      })
      return {
        run(n) {
          checksum = 0
          runs = 0
          for (let i = 0; i < n; i++) choose.set(!choose.get())
          return [checksum, runs]
        },
        dispose,
      }
    },
  },
  {
    name: 'repeated equal write',
    operations: 100_000,
    setup(api) {
      const value = api.signal(5)
      let runs = 0
      const dispose = api.scope(() => api.effect(() => (value.get(), runs++)))
      return {
        run(n) {
          runs = 0
          for (let i = 0; i < n; i++) value.set(5)
          return [value.get(), runs]
        },
        dispose,
      }
    },
  },
]

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function version(packageName) {
  const source = readFileSync(
    `node_modules/${packageName}/package.json`,
    'utf8',
  )
  return JSON.parse(source).version
}

const jsonOutput = process.argv.includes('--json')
const report = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  versions: {
    preact: version('@preact/signals-core'),
    alien: version('alien-signals'),
    solid: version('solid-js'),
  },
  workloads: {},
}
if (!jsonOutput) {
  process.stdout.write(
    `Node ${report.node}; ${report.platform} ${report.arch}; ` +
      `@preact/signals-core ${report.versions.preact}; ` +
      `alien-signals ${report.versions.alien}; solid-js ${report.versions.solid}\n`,
  )
  process.stdout.write(
    'Six rounds per case (first warmup); median of five timed samples.\n',
  )
}

for (const workload of workloads) {
  const times = new Map(adapters.map((adapter) => [adapter.name, []]))
  let expected
  for (let round = 0; round < 6; round++) {
    const order = adapters.map(
      (_, i) => adapters[(i + round) % adapters.length],
    )
    for (const adapter of order) {
      const instance = workload.setup(adapter)
      const start = performance.now()
      const result = instance.run(workload.operations)
      const elapsed = performance.now() - start
      instance.dispose?.()
      volatileSink += result[0] + result[1]
      if (!expected) expected = result
      if (result[0] !== expected[0] || result[1] !== expected[1]) {
        throw new Error(
          `${workload.name}: ${adapter.name} returned ${result}, expected ${expected}`,
        )
      }
      if (round > 0) times.get(adapter.name).push(elapsed)
    }
  }
  const result = { operations: workload.operations, milliseconds: {} }
  if (!jsonOutput)
    process.stdout.write(
      `\n${workload.name} (${workload.operations} operations)\n`,
    )
  for (const adapter of adapters) {
    const ms = median(times.get(adapter.name))
    result.milliseconds[adapter.name] = ms
    if (!jsonOutput)
      process.stdout.write(`  ${adapter.name.padEnd(20)} ${ms.toFixed(2)} ms\n`)
  }
  report.workloads[workload.name] = result
}
if (jsonOutput) process.stdout.write(`${JSON.stringify(report)}\n`)
else process.stdout.write(`\nvalidation sink: ${volatileSink}\n`)

import { build } from 'esbuild'
import inspector from 'node:inspector'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const bundle = await build({
  entryPoints: ['packages/core/src/runtime.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define: { 'process.env.NODE_ENV': '"production"' },
})
const source = bundle.outputFiles[0].text
const kernel = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
)

const session = new inspector.Session()
session.connect()
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  )

function sampledBytes(node) {
  return (
    node.selfSize +
    node.children.reduce((sum, child) => sum + sampledBytes(child), 0)
  )
}

async function profile(name, setup) {
  globalThis.gc?.()
  await post('HeapProfiler.startSampling', { samplingInterval: 4096 })
  const { peakSubscribers, validate, dispose } = setup()
  validate()
  const { profile: allocationProfile } = await post('HeapProfiler.stopSampling')
  dispose()
  process.stdout.write(
    `${name}: sampled allocations ${sampledBytes(allocationProfile.head)} bytes; ` +
      `peak subscribers ${peakSubscribers}\n`,
  )
}

await profile('10,000-effect fanout', () => {
  const source = kernel.signal(0)
  const dispose = kernel.createRoot((stop) => {
    for (let i = 0; i < 10_000; i++) kernel.effect(() => source())
    return stop
  })
  const peakSubscribers = kernel.inspectInternalSignal(source).subscribers
  return {
    peakSubscribers,
    validate() {
      if (peakSubscribers !== 10_000)
        throw new Error('fanout subscription mismatch')
      source.set(1)
    },
    dispose,
  }
})

await profile('200-deep computed chain', () => {
  const source = kernel.signal(0)
  let last
  const dispose = kernel.createRoot((stop) => {
    last = source
    for (let i = 0; i < 200; i++) {
      const previous = last
      last = kernel.computed(() => previous() + 1)
    }
    kernel.effect(() => last())
    return stop
  })
  const peakSubscribers = kernel.inspectInternalSignal(source).subscribers
  return {
    peakSubscribers,
    validate() {
      source.set(1)
      if (last() !== 201) throw new Error('chain value mismatch')
    },
    dispose,
  }
})

session.disconnect()

/* global console, process, Request, URL */
// Time to first byte and time to the settled page for the dashboard's
// project detail (`/projects/signals`), whose activity query takes 600 ms:
// `renderToStream` sends the shell as soon as the loaders settle and the
// activity as a patch, while `renderToString` waits for everything. Build
// the dashboard first:
//
//   pnpm --filter @benosjs/dashboard build && pnpm --filter @benosjs/dashboard build:ssr
//   node benchmarks/stream.mjs

import { performance } from 'node:perf_hooks'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const dashboard = resolve(root, 'examples/dashboard')
const { handle, createApp, renderToStream, renderToString } = await import(
  pathToFileURL(resolve(dashboard, 'dist/server/entry-server.js')).href
)
const template = await readFile(
  resolve(dashboard, 'dist/benos/index.html'),
  'utf8',
)

const samples = Number(process.argv[2] ?? 7)
const path = '/projects/signals'

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function timeHandler() {
  const started = performance.now()
  const response = await handle(
    new Request(`http://dashboard.test${path}`),
    template,
  )
  let first = null
  for await (const chunk of response.body) {
    void chunk
    first ??= performance.now() - started
  }
  return { first, settled: performance.now() - started }
}

const app = () => createApp(new URL(`http://dashboard.test${path}`))

async function timeString() {
  const started = performance.now()
  await renderToString(app())
  return performance.now() - started
}

async function timeStream() {
  const started = performance.now()
  const { stream, done } = await renderToStream(app())
  const first = performance.now() - started
  const reader = stream.getReader()
  for (;;) {
    const { done: finished } = await reader.read()
    if (finished) break
  }
  await done
  return { first, settled: performance.now() - started }
}

const handler = []
for (let index = 0; index < samples; index++) handler.push(await timeHandler())
console.log(
  `Dashboard ${path} through the handler (renderToStream), medians of ${samples}`,
)
console.log(
  `  first byte (shell): ${median(handler.map((r) => r.first)).toFixed(1)} ms`,
)
console.log(
  `  settled (end notice): ${median(handler.map((r) => r.settled)).toFixed(1)} ms`,
)
{
  const strings = []
  const streams = []
  for (let index = 0; index < samples; index++) {
    strings.push(await timeString())
    streams.push(await timeStream())
  }
  console.log(`renderToString (whole page): ${median(strings).toFixed(1)} ms`)
  console.log(
    `renderToStream: shell ${median(streams.map((r) => r.first)).toFixed(1)} ms, settled ${median(streams.map((r) => r.settled)).toFixed(1)} ms`,
  )
}

/* global console, requestAnimationFrame */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, normalize, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const result = await import('./results/perf-p3-compiled-cpu-attribution.json', {
  with: { type: 'json' },
})
const buildRoot = result.default.buildRoot
const browser = await chromium.launch({ headless: true })
const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
}
function serve(root, port) {
  const server = createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0])
    const relative = normalize(requestPath).replace(/^([.][.][/\\])+/, '')
    const candidate = resolve(
      root,
      relative === '/' ? 'index.html' : `.${relative}`,
    )
    if (
      !candidate.startsWith(root) ||
      !existsSync(candidate) ||
      !statSync(candidate).isFile()
    ) {
      response.writeHead(404).end('Not found')
      return
    }
    response.writeHead(200, {
      'content-type': mime[extname(candidate)] ?? 'application/octet-stream',
    })
    createReadStream(candidate).pipe(response)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolveServer(server))
  })
}
const servers = [
  await serve(resolve(buildRoot, 'app-benos'), 4381),
  await serve(resolve(buildRoot, 'app-table-benos'), 4382),
]
const workloads = [
  { name: 'create-1k', port: 4381, click: 'run', expected: 1000 },
  {
    name: 'replace-1k',
    port: 4381,
    setup: 'run',
    click: 'run',
    expected: 1000,
  },
  { name: 'clear-1k', port: 4381, setup: 'run', click: 'clear', expected: 0 },
  { name: 'create-10k', port: 4381, click: 'runlots', expected: 10000 },
  {
    name: 'replace-10k',
    port: 4381,
    setup: 'runlots',
    click: 'runlots',
    expected: 10000,
  },
  {
    name: 'clear-10k',
    port: 4381,
    setup: 'runlots',
    click: 'clear',
    expected: 0,
  },
  { name: 'table-mount-5000', port: 4382, table: 5000 },
  { name: 'table-mount-10000', port: 4382, table: 10000 },
]
const warmups = 2
const rounds = 7
const samples = {}
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
async function traceAction(page, action) {
  const session = await page.context().newCDPSession(page)
  await session.send('Tracing.start', {
    categories: 'v8,disabled-by-default-v8.gc,disabled-by-default-v8.gc_stats',
    transferMode: 'ReturnAsStream',
  })
  await action()
  const complete = new Promise((resolveComplete) =>
    session.once('Tracing.tracingComplete', resolveComplete),
  )
  await session.send('Tracing.end')
  const { stream } = await complete
  let json = ''
  while (true) {
    const chunk = await session.send('IO.read', { handle: stream })
    json += chunk.data
    if (chunk.eof) break
  }
  await session.send('IO.close', { handle: stream })
  await session.detach()
  const events = JSON.parse(json).traceEvents ?? []
  const gcEvents = events.filter(
    (event) =>
      event.ph === 'X' &&
      /GC/i.test(event.name ?? '') &&
      Number.isFinite(event.ts) &&
      Number.isFinite(event.dur),
  )
  const threadNames = new Map(
    events
      .filter((event) => event.ph === 'M' && event.name === 'thread_name')
      .map((event) => [
        `${event.pid}:${event.tid}`,
        event.args?.name ?? 'unknown',
      ]),
  )
  const byThread = new Map()
  for (const event of gcEvents) {
    const key = `${event.pid}:${event.tid}`
    const intervals = byThread.get(key) ?? []
    intervals.push([event.ts, event.ts + event.dur])
    byThread.set(key, intervals)
  }
  const mergedDuration = (intervals) => {
    intervals.sort((a, b) => a[0] - b[0])
    let duration = 0
    let start = -Infinity
    let end = -Infinity
    for (const [nextStart, nextEnd] of intervals) {
      if (nextStart > end) {
        if (end > start) duration += end - start
        start = nextStart
        end = nextEnd
      } else end = Math.max(end, nextEnd)
    }
    if (end > start) duration += end - start
    return duration / 1000
  }
  const threadDurations = [...byThread].map(([key, intervals]) => ({
    thread: threadNames.get(key) ?? key,
    gcMs: mergedDuration(intervals),
    eventCount: intervals.length,
  }))
  return {
    gcMainThreadMs:
      threadDurations.find((thread) => /RendererMain/.test(thread.thread))
        ?.gcMs ?? 0,
    gcAllThreadsCpuMs: threadDurations.reduce(
      (total, thread) => total + thread.gcMs,
      0,
    ),
    threadDurations,
  }
}
async function waitRows(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('tbody tr').length === expected,
    count,
  )
}
try {
  for (const workload of workloads) {
    samples[workload.name] = []
    for (let round = -warmups; round < rounds; round++) {
      const page = await browser.newPage()
      const suffix = workload.table ? `?rows=${workload.table}` : ''
      let measurement
      if (workload.table) {
        measurement = await traceAction(page, async () => {
          await page.goto(`http://127.0.0.1:${workload.port}/${suffix}`)
          await page.waitForFunction(() => window.__benosTableBench?.initial)
        })
      } else {
        await page.goto(`http://127.0.0.1:${workload.port}/${suffix}`)
        await page.waitForFunction(() => window.__jfbReady === true)
        if (workload.setup) {
          await page.evaluate(
            (id) => document.getElementById(id).click(),
            workload.setup,
          )
          await waitRows(page, workload.setup === 'runlots' ? 10000 : 1000)
        }
        measurement = await traceAction(page, async () => {
          await page.evaluate(
            (id) => document.getElementById(id).click(),
            workload.click,
          )
          await waitRows(page, workload.expected)
          await page.evaluate(
            () =>
              new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done)),
              ),
          )
        })
      }
      if (round >= 0) samples[workload.name].push(measurement)
      await page.close()
    }
  }
} finally {
  await browser.close()
  for (const server of servers) await new Promise((done) => server.close(done))
}
const summary = Object.fromEntries(
  Object.entries(samples).map(([name, records]) => {
    const main = records.map((record) => record.gcMainThreadMs)
    const totalCpu = records.map((record) => record.gcAllThreadsCpuMs)
    return [
      name,
      {
        mainThreadMedianMs: median(main),
        mainThreadSpreadMs: [Math.min(...main), Math.max(...main)],
        allThreadsCpuMedianMs: median(totalCpu),
        allThreadsCpuSpreadMs: [Math.min(...totalCpu), Math.max(...totalCpu)],
        medianMainThreadEvents: median(
          records.map(
            (record) =>
              record.threadDurations.find((thread) =>
                /RendererMain/.test(thread.thread),
              )?.eventCount ?? 0,
          ),
        ),
        samples: records,
      },
    ]
  }),
)
const output = {
  protocol: {
    browser: 'Chromium tracing',
    warmups,
    rounds,
    categories: 'v8,disabled-by-default-v8.gc,disabled-by-default-v8.gc_stats',
    aggregation:
      'per-thread union of complete GC trace events; nested intervals counted once; main-thread time reported separately from total GC CPU across renderer threads',
  },
  summary,
}
const outputPath = new URL(
  './results/perf-p3-compiled-garbage-collection.json',
  import.meta.url,
)
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
console.log(`Saved ${outputPath.pathname}`)

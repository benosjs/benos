import { execFileSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { extname, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const benchmarkRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(benchmarkRoot, '../..')
const config = resolve(benchmarkRoot, 'vite.config.mjs')
const frameworks = ['benos', 'solid', 'svelte', 'vue', 'react']
const rounds = Number(process.env.JFB_ROUNDS ?? 3)
const warmups = Number(process.env.JFB_WARMUPS ?? 2)
const port = Number(process.env.JFB_PORT ?? 4310)
const measureMode = process.env.JFB_MEASURE ?? 'trace'
const outputPath = process.env.JFB_OUTPUT ?? 'results/latest.json'
const requestedOperations = process.env.JFB_OPERATIONS?.split(',')

const operations = [
  { id: '01_run1k', label: 'create rows', action: 'run', expected: 1000 },
  {
    id: '02_replace1k',
    label: 'replace all rows',
    setup: 'run',
    action: 'run',
    expected: 1000,
  },
  {
    id: '03_update1k',
    label: 'partial update',
    setup: 'run',
    action: 'update',
    expected: 1000,
  },
  {
    id: '04_select1k',
    label: 'select row',
    setup: 'run',
    action: 'select',
    expected: 1000,
  },
  {
    id: '05_swap1k',
    label: 'swap rows',
    setup: 'run',
    action: 'swaprows',
    expected: 1000,
  },
  {
    id: '06_remove1k',
    label: 'remove row',
    setup: 'run',
    action: 'remove',
    expected: 999,
  },
  {
    id: '07_create10k',
    label: 'create many rows',
    action: 'runlots',
    expected: 10000,
  },
  {
    id: '08_append1k',
    label: 'append rows to large table',
    setup: 'run',
    action: 'add',
    expected: 2000,
  },
  {
    id: '09_clear1k',
    label: 'clear rows',
    setup: 'run',
    action: 'clear',
    expected: 0,
  },
]
const selectedOperations = requestedOperations
  ? operations.filter((operation) => requestedOperations.includes(operation.id))
  : operations

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function build(framework) {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--config', config], {
    cwd: repoRoot,
    env: { ...process.env, JFB_FRAMEWORK: framework },
    stdio: 'inherit',
  })
}

function contentType(path) {
  const extension = extname(path)
  return (
    {
      '.css': 'text/css',
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
    }[extension] ?? 'application/octet-stream'
  )
}

function startServer(framework, serverPort) {
  const root = resolve(benchmarkRoot, `dist/${framework}`)
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
      response.writeHead(404)
      response.end('Not found')
      return
    }
    response.writeHead(200, { 'content-type': contentType(candidate) })
    createReadStream(candidate).pipe(response)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(serverPort, '127.0.0.1', () => resolveServer(server))
  })
}

async function waitForRender(page) {
  await page.waitForFunction(() => window.__jfbReady === true)
  await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)))
}

async function clickAndMeasure(page, operation) {
  return page.evaluate(
    async ({ operationId, expected }) => {
      const action = () => {
        if (operationId === 'select')
          document.querySelector('tbody tr:nth-child(501) a')?.click()
        else if (operationId === 'remove')
          document.querySelector('tbody [data-remove]')?.click()
        else document.getElementById(operationId)?.click()
      }
      const start = performance.now()
      action()
      await Promise.resolve()
      await Promise.resolve()
      void document.body.offsetHeight
      const rows = document.querySelectorAll('tbody tr').length
      if (rows !== expected)
        throw new Error(`Expected ${expected} rows, got ${rows}`)
      if (
        operationId === 'select' &&
        document.querySelectorAll('tbody tr.selected').length !== 1
      )
        throw new Error('Select operation did not mark one row')
      return performance.now() - start
    },
    { operationId: operation.action, expected: operation.expected },
  )
}

async function validateOperation(page, operation) {
  await page.waitForFunction(
    ({ operationId, expected }) => {
      const rows = document.querySelectorAll('tbody tr').length
      if (rows !== expected) return false
      return (
        operationId !== 'select' ||
        document.querySelectorAll('tbody tr.selected').length === 1
      )
    },
    { operationId: operation.action, expected: operation.expected },
  )
}

function durationThroughCommit(traceBuffer) {
  const events = JSON.parse(traceBuffer.toString()).traceEvents
  const click = events.find(
    (event) =>
      event.name === 'EventDispatch' && event.args?.data?.type === 'click',
  )
  if (!click)
    throw new Error('Chrome trace did not contain the benchmark click')
  const sameThread = events.filter(
    (event) => event.pid === click.pid && event.ts >= click.ts + click.dur,
  )
  const paint = sameThread
    .filter(
      (event) => ['Paint', 'PrePaint'].includes(event.name) && event.ph === 'X',
    )
    .at(0)
  const commit = sameThread.find(
    (event) => event.name === 'Commit' && event.ph === 'X',
  )
  const layout = sameThread
    .filter((event) => event.name === 'Layout' && event.ph === 'X')
    .at(0)
  const end = paint ?? commit ?? layout
  if (!end)
    throw new Error('Chrome trace did not contain a paint, commit, or layout')
  return (end.ts + (end.dur ?? 0) - click.ts) / 1000
}

async function clickThroughPaint(
  browser,
  page,
  framework,
  operation,
  iteration,
) {
  const tracePath = resolve(
    '/tmp',
    `benos-jfb-${framework}-${operation.id}-${iteration}.json`,
  )
  await browser.startTracing(page, {
    path: tracePath,
    screenshots: false,
    categories: [
      'blink.user_timing',
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
    ],
  })
  await page.evaluate((operationId) => {
    if (operationId === 'select')
      document.querySelector('tbody tr:nth-child(501) a')?.click()
    else if (operationId === 'remove')
      document.querySelector('tbody [data-remove]')?.click()
    else document.getElementById(operationId)?.click()
  }, operation.action)
  await validateOperation(page, operation)
  await page.evaluate(() => void document.body.offsetHeight)
  await page.waitForTimeout(40)
  const trace = await browser.stopTracing()
  try {
    return durationThroughCommit(trace)
  } finally {
    if (existsSync(tracePath)) unlinkSync(tracePath)
  }
}

async function preparePage(page, serverPort, operation) {
  await page.goto(`http://127.0.0.1:${serverPort}/`, { waitUntil: 'load' })
  await waitForRender(page)
  if (!operation.setup) return
  await page.evaluate(
    (id) => document.getElementById(id)?.click(),
    operation.setup,
  )
  const setupExpected = operation.setup === 'runlots' ? 10000 : 1000
  await page.waitForFunction(
    (expected) => document.querySelectorAll('tbody tr').length === expected,
    setupExpected,
  )
}

async function runOperationInterleaved(browser, servers, operation) {
  const times = Object.fromEntries(
    frameworks.map((framework) => [framework, []]),
  )
  for (let round = 0; round < warmups + rounds; round++) {
    // Rotate order so a framework does not consistently receive the browser's
    // warm caches or the runner's scheduling edge.
    const order = frameworks.map(
      (_, index) => frameworks[(index + round) % frameworks.length],
    )
    for (const framework of order) {
      const page = await browser.newPage()
      await preparePage(page, servers[framework].port, operation)
      if (round >= warmups) {
        times[framework].push(
          measureMode === 'trace'
            ? await clickThroughPaint(
                browser,
                page,
                framework,
                operation,
                round,
              )
            : await clickAndMeasure(page, operation),
        )
      } else await clickAndMeasure(page, operation)
      await page.close()
    }
  }
  return Object.fromEntries(
    frameworks.map((framework) => {
      const samplesMs = times[framework]
      return [
        framework,
        {
          medianMs: median(samplesMs),
          minMs: Math.min(...samplesMs),
          maxMs: Math.max(...samplesMs),
          samplesMs,
        },
      ]
    }),
  )
}

const browser = await chromium.launch({ headless: true })
const report = {
  protocol: 'js-framework-benchmark CPU operations 01-09',
  browser: await browser.version(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  measurement:
    measureMode === 'trace'
      ? 'Chrome trace click-to-paint duration (commit/layout fallback)'
      : 'synchronous click-to-DOM duration (legacy comparison)',
  traceCategories:
    measureMode === 'trace'
      ? [
          'blink.user_timing',
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
        ]
      : undefined,
  rounds,
  warmups,
  operations: selectedOperations.map((operation) => operation.id),
  frameworks: {},
}

try {
  for (const framework of frameworks) build(framework)
  const servers = {}
  for (const [index, framework] of frameworks.entries())
    servers[framework] = {
      port: port + index,
      server: await startServer(framework, port + index),
    }
  for (const framework of frameworks) report.frameworks[framework] = {}
  try {
    for (const operation of selectedOperations) {
      process.stdout.write(`interleaved ${operation.id} ${operation.label}\n`)
      const results = await runOperationInterleaved(browser, servers, operation)
      for (const framework of frameworks)
        report.frameworks[framework][operation.id] = {
          label: operation.label,
          ...results[framework],
        }
    }
  } finally {
    for (const framework of frameworks)
      await new Promise((resolveServer) =>
        servers[framework].server.close(resolveServer),
      )
  }
} finally {
  await browser.close()
}

writeFileSync(
  resolve(benchmarkRoot, outputPath),
  `${JSON.stringify(report, null, 2)}\n`,
)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

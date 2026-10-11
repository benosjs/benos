/* global console, fetch, setTimeout */

import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const directory = resolve(import.meta.dirname)
const frameworks = ['table-benos-baseline', 'table-solid', 'table-benos']
const sizes = [5_000, 10_000]
const columnCounts = [2, 3, 5, 8]
const warmups = 2
const rounds = 7

for (const framework of frameworks) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'vite', 'build', '--config', 'vite.config.mjs'],
    {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        JFB_FRAMEWORK: framework,
      },
    },
  )
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    process.exit(result.status ?? 1)
  }
  process.stdout.write(result.stdout ?? '')
}

const servers = frameworks.map((framework, index) => {
  const port = 4180 + index
  const server = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      'preview',
      '--config',
      'vite.config.mjs',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: directory,
      stdio: 'ignore',
      env: { ...process.env, JFB_FRAMEWORK: framework },
    },
  )
  return { framework, port, server }
})

async function waitForServers() {
  for (const { port } of servers) {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`)
        if (response.ok) {
          ready = true
          break
        }
      } catch {
        // The preview server is still starting.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
    if (!ready)
      throw new Error(`Table benchmark server on ${port} did not start.`)
  }
}

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const samples = Object.fromEntries(
  frameworks.map((framework) => [
    framework,
    Object.fromEntries(
      columnCounts.map((columns) => [
        columns,
        Object.fromEntries(
          sizes.map((size) => [size, { initial: [], sort: [] }]),
        ),
      ]),
    ),
  ]),
)

try {
  await waitForServers()
  for (let round = -warmups; round < rounds; round++) {
    const order = round % 2 === 0 ? frameworks : [...frameworks].reverse()
    for (const columns of columnCounts) {
      for (const size of sizes) {
        for (const framework of order) {
          const server = servers.find((entry) => entry.framework === framework)
          await page.goto(
            `http://127.0.0.1:${server.port}/?rows=${size}&columns=${columns}`,
          )
          const initial = await page.evaluate(async () => {
            return await window.__benosTableBench.initial
          })
          const initialRows = await page.locator('tbody tr').count()
          const headerCount = await page.locator('thead th').count()
          if (initialRows !== size || headerCount !== columns)
            throw new Error(
              `${framework} rendered ${initialRows}/${size} rows and ${headerCount}/${columns} columns.`,
            )
          const sorted = await page.evaluate(async () =>
            window.__benosTableBench.sort(),
          )
          if (sorted.count !== size || sorted.firstName !== 'Member 1')
            throw new Error(
              `${framework} sort produced ${sorted.count} rows, first value ${sorted.firstName}.`,
            )
          if (round >= 0) {
            samples[framework][columns][size].initial.push(initial)
            samples[framework][columns][size].sort.push(sorted.elapsed)
          }
          process.stdout.write(
            `round ${round + warmups + 1}/${rounds + warmups}: ${framework} ${columns} columns ${size} rows initial ${initial.toFixed(2)} ms, sort ${sorted.elapsed.toFixed(2)} ms\n`,
          )
        }
      }
    }
  }
} finally {
  await browser.close()
  for (const { server } of servers) server.kill('SIGTERM')
  await Promise.all(
    servers.map(({ server }) => once(server, 'exit').catch(() => {})),
  )
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const summary = {}
for (const framework of frameworks) {
  summary[framework] = {}
  for (const columns of columnCounts) {
    summary[framework][columns] = {}
    for (const size of sizes) {
      summary[framework][columns][size] = {}
      for (const metric of ['initial', 'sort']) {
        const values = samples[framework][columns][size][metric]
        summary[framework][columns][size][metric] = {
          medianMs: median(values),
          minMs: Math.min(...values),
          maxMs: Math.max(...values),
          samplesMs: values,
        }
      }
    }
  }
}

const output = {
  protocol: {
    browser: 'Chromium',
    warmups,
    rounds,
    boundary: 'two requestAnimationFrame callbacks after render or mutation',
    interleaving:
      'framework order reverses every round; each workload repeats in every framework per round',
    columns: columnCounts,
    rowCounts: sizes,
    variants: {
      'table-benos-baseline':
        'handwritten Benos JSX with keyed For rows and static column descriptors',
      'table-solid': 'handwritten equivalent Solid table',
      'table-benos': 'SortableTable registry component',
    },
  },
  summary,
}
const resultsDirectory = resolve(directory, 'results')
await mkdir(resultsDirectory, { recursive: true })
await writeFile(
  resolve(
    resultsDirectory,
    process.env.JFB_TABLE_OUTPUT ?? 'multicolumn-sortable-table.json',
  ),
  `${JSON.stringify(output, null, 2)}\n`,
)
console.log(JSON.stringify(output, null, 2))

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

const workloads = [
  'signal read',
  '20-deep computed chain write + read',
  '200-effect fanout write',
  'dynamic dependency switch',
  'repeated equal write',
]
const limit = 2
const repetitions = 7

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function assessReports(reports, names = workloads) {
  if (reports.length === 0) throw new Error('No benchmark reports')
  return names.map((name) => {
    const benos = []
    const preact = []
    const ratios = []
    for (const report of reports) {
      const times = report.workloads?.[name]?.milliseconds
      const own = times?.Benos
      const peer = times?.['Preact Signals']
      if (
        !Number.isFinite(own) ||
        !Number.isFinite(peer) ||
        own <= 0 ||
        peer <= 0
      )
        throw new Error(`Missing or invalid benchmark result: ${name}`)
      benos.push(own)
      preact.push(peer)
      ratios.push(own / peer)
    }
    return {
      name,
      benos: median(benos),
      preact: median(preact),
      ratio: median(ratios),
    }
  })
}

export function assertWithinLimit(rows) {
  const failures = rows.filter((row) => row.ratio > limit)
  if (failures.length)
    throw new Error(
      `Kernel benchmark exceeded ${limit}x Preact: ${failures.map((row) => row.name).join(', ')}`,
    )
}

function main() {
  const benchmark = fileURLToPath(
    new URL('./compare-kernel.mjs', import.meta.url),
  )
  const reports = []
  for (let index = 0; index < repetitions; index++) {
    const output = execFileSync(process.execPath, [benchmark, '--json'], {
      encoding: 'utf8',
    })
    reports.push(JSON.parse(output))
  }
  const rows = assessReports(reports)
  process.stdout.write(
    'Production kernel benchmark guard (median of seven runs; each run uses five timed samples):\n',
  )
  for (const row of rows)
    process.stdout.write(
      `${row.name}: Benos ${row.benos.toFixed(2)} ms, ` +
        `Preact ${row.preact.toFixed(2)} ms, ${row.ratio.toFixed(2)}x\n`,
    )
  assertWithinLimit(rows)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main()

/* global process, URL */
// Server render time for the same page in Benos and Solid: a 1,000-row
// sortable table under a header and a filter form. The Benos component is
// compiled with the real compiler (the client build's `safe` output, which
// the server renders from the direct skeleton). The Solid component is the
// hand-lowered equivalent of babel-preset-solid's `ssr` output, which is
// how Solid renders on the server. Run after `pnpm build`:
//
//   node benchmarks/ssr.mjs

import { performance } from 'node:perf_hooks'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformJsx } from '../packages/compiler/dist/js/index.production.js'
import { renderToString as benosRenderToString } from '../packages/server/dist/js/index.production.js'
import { For as SolidFor, createSignal, createMemo } from 'solid-js'
import {
  renderToString as solidRenderToString,
  ssr,
  escape,
  ssrAttribute,
} from 'solid-js/web'

const rowCount = Number(process.argv[2] ?? 1000)
const samples = 7

function makeRows(count) {
  const teams = ['Core', 'DOM', 'Compiler', 'Tooling', 'Examples']
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Record ${String(index + 1).padStart(5, '0')}`,
    team: teams[index % teams.length],
    value: ((index * 37) % 997) + 3,
  }))
}

const benosSource = `
import { computed, signal } from '@benosjs/core'
import { For, Show } from '@benosjs/dom'
export function App(props) {
  const rows = signal(props.rows)
  const filter = signal('')
  const sort = signal('id')
  const descending = signal(false)
  const visible = computed(() => {
    const query = filter().trim().toLowerCase()
    const key = sort()
    const direction = descending() ? -1 : 1
    return rows()
      .filter((row) => !query || row.name.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * direction)
  })
  return (
    <main class="records">
      <h1>Records</h1>
      <form class="filters" onSubmit={(event) => event.preventDefault()}>
        <label for="filter">Filter</label>
        <input id="filter" value={filter()} onInput={(event) => filter.set(event.currentTarget.value)} />
        <Show when={filter()} fallback={<p class="hint">Showing all {visible().length} rows</p>}>
          <p class="hint">{visible().length} rows match</p>
        </Show>
      </form>
      <table class="records-table">
        <thead>
          <tr>
            <th aria-sort={sort() === 'id' ? 'ascending' : 'none'}><button type="button" onClick={() => sort.set('id')}>ID</button></th>
            <th aria-sort={sort() === 'name' ? 'ascending' : 'none'}><button type="button" onClick={() => sort.set('name')}>Name</button></th>
            <th>Team</th>
            <th aria-sort={sort() === 'value' ? 'ascending' : 'none'}><button type="button" onClick={() => sort.set('value')}>Value</button></th>
          </tr>
        </thead>
        <tbody>
          <For each={visible()}>
            {(row) => (
              <tr class={row().value > 500 ? 'high' : 'low'}>
                <td>{row().id}</td>
                <td>{row().name}</td>
                <td>{row().team}</td>
                <td>{row().value}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </main>
  )
}
`

// What babel-preset-solid (generate: 'ssr') produces for the same JSX.
function SolidApp(props) {
  const [rows] = createSignal(props.rows)
  const [filter] = createSignal('')
  const [sort] = createSignal('id')
  const [descending] = createSignal(false)
  const visible = createMemo(() => {
    const query = filter().trim().toLowerCase()
    const key = sort()
    const direction = descending() ? -1 : 1
    return rows()
      .filter((row) => !query || row.name.toLowerCase().includes(query))
      .slice()
      .sort(
        (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * direction,
      )
  })
  return ssr(
    [
      '<main class="records"><h1>Records</h1><form class="filters"><label for="filter">Filter</label><input id="filter"',
      '>',
      '</form><table class="records-table"><thead><tr><th',
      '><button type="button">ID</button></th><th',
      '><button type="button">Name</button></th><th>Team</th><th',
      '><button type="button">Value</button></th></tr></thead><tbody>',
      '</tbody></table></main>',
    ],
    ssrAttribute('value', escape(filter(), true), false),
    filter()
      ? ssr(['<p class="hint">', ' rows match</p>'], escape(visible().length))
      : ssr(
          ['<p class="hint">Showing all ', ' rows</p>'],
          escape(visible().length),
        ),
    ssrAttribute('aria-sort', sort() === 'id' ? 'ascending' : 'none', false),
    ssrAttribute('aria-sort', sort() === 'name' ? 'ascending' : 'none', false),
    ssrAttribute('aria-sort', sort() === 'value' ? 'ascending' : 'none', false),
    SolidFor({
      get each() {
        return visible()
      },
      children: (row) =>
        ssr(
          ['<tr', '><td>', '</td><td>', '</td><td>', '</td><td>', '</td></tr>'],
          ssrAttribute('class', row.value > 500 ? 'high' : 'low', false),
          escape(row.id),
          escape(row.name),
          escape(row.team),
          escape(row.value),
        ),
    }),
  )
}

const directory = await mkdtemp(join(tmpdir(), 'benos-ssr-bench-'))
const compiled = transformJsx(benosSource, {
  filename: 'app.tsx',
  development: false,
  optimization: 'safe',
})
const file = join(directory, 'app.mjs')
const dist = (name) =>
  new URL(`../packages/${name}.production.js`, import.meta.url).href
await writeFile(
  file,
  compiled.code
    .replace(
      /["']@benosjs\/dom\/internal["']/g,
      JSON.stringify(dist('dom/dist/js/internal')),
    )
    .replace(
      /["']@benosjs\/dom["']/g,
      JSON.stringify(dist('dom/dist/js/index')),
    )
    .replace(
      /["']@benosjs\/core["']/g,
      JSON.stringify(dist('core/dist/js/index')),
    ),
)
const { App: BenosApp } = await import(pathToFileURL(file).href)
const { jsx } = await import('../packages/dom/dist/js/index.production.js')

const rows = makeRows(rowCount)
const benos = async () =>
  (await benosRenderToString(() => jsx(BenosApp, { rows }))).html
const solid = async () => solidRenderToString(() => SolidApp({ rows }))

const benosHtml = await benos()
const solidHtml = await solid()
const rowsIn = (html) => (html.match(/<tr/g) ?? []).length - 1
if (rowsIn(benosHtml) !== rowCount || rowsIn(solidHtml) !== rowCount)
  throw new Error('The two pages did not render the same rows')

async function measure(label, run) {
  const times = []
  for (let round = 0; round < samples + 1; round++) {
    const start = performance.now()
    await run()
    const elapsed = performance.now() - start
    if (round > 0) times.push(elapsed)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  process.stdout.write(
    `${label}: ${median.toFixed(2)} ms median of ${samples}\n`,
  )
  return median
}

process.stdout.write(
  `Server render, ${rowCount} rows, ${process.release?.name ?? 'node'} ${process.version}\n`,
)
const benosMedian = await measure('Benos renderToString', benos)
const solidMedian = await measure('Solid renderToString', solid)
process.stdout.write(
  `Benos / Solid: ${(benosMedian / solidMedian).toFixed(2)}×; HTML ${benosHtml.length} vs ${solidHtml.length} bytes (Benos includes hydration markers)\n`,
)
await rm(directory, { recursive: true, force: true })

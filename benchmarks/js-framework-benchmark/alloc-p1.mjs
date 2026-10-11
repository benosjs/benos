/* global console, requestAnimationFrame */

import {
  createReadStream,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import MagicString from '../../node_modules/.pnpm/magic-string@1.4.2/node_modules/magic-string/dist/index.mjs'
import solid from 'vite-plugin-solid'
import ts from 'typescript'
import { build } from 'vite'
import benos from '../../packages/vite/dist/js/index.production.js'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

const repoRoot = realpathSync(
  resolve(fileURLToPath(new URL('../..', import.meta.url))),
)
const benchRoot = fileURLToPath(new URL('.', import.meta.url))
const buildRoot = await mkdtemp(join(tmpdir(), 'benos-p1-alloc-'))
const productionDefines = {
  'process.env.NODE_ENV': JSON.stringify('production'),
  'globalThis.process': '({env:{NODE_ENV:"production"}})',
}

const allocationCounters = {
  name: 'temporary-p1-allocation-node-counters',
  enforce: 'pre',
  transform(code, id) {
    const normalized = id.replaceAll('\\', '/')
    const isBenosRuntime = normalized.endsWith('/packages/core/src/runtime.ts')
    const isBenosDom = normalized.endsWith('/packages/dom/src/index.ts')
    const isSolidRuntime = normalized.includes('/solid-js/dist/solid.js')
    if (!isBenosRuntime && !isBenosDom && !isSolidRuntime) return null
    const source = ts.createSourceFile(
      id,
      code,
      ts.ScriptTarget.Latest,
      true,
      isBenosRuntime ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    )
    const magic = new MagicString(code)
    let changed = false
    const targets = isBenosRuntime
      ? {
          createOwner: 'owners',
          signal: 'signals',
          computed: 'computeds',
          createEffect: 'effects',
        }
      : isSolidRuntime
        ? { createRoot: 'owners', createComputation: 'computation' }
        : {}
    const visit = (node) => {
      if (
        isBenosDom &&
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        ['development', 'childrenDiagnostics'].includes(node.name.text) &&
        node.initializer
      ) {
        magic.overwrite(
          node.initializer.getStart(source),
          node.initializer.end,
          'false',
        )
        changed = true
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.body &&
        targets[node.name.text]
      ) {
        const key = targets[node.name.text]
        const statement =
          key === 'computation'
            ? `globalThis.__p1AllocationCounts[pure ? 'computeds' : 'effects']++;`
            : `globalThis.__p1AllocationCounts[${JSON.stringify(key)}]++;`
        magic.appendLeft(node.body.getStart(source) + 1, statement)
        changed = true
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    if (!changed) return null
    return {
      code: magic.toString(),
      map: magic.generateMap({ source: id, includeContent: true, hires: true }),
    }
  },
}

for (const [name, entries] of [
  ['core', ['index', 'internal']],
  ['dom', ['index', 'internal']],
]) {
  const packageRoot = resolve(repoRoot, 'packages', name)
  for (const entry of entries) {
    await build({
      configFile: false,
      root: packageRoot,
      mode: 'production',
      define: productionDefines,
      plugins: [allocationCounters],
      build: {
        target: 'es2022',
        outDir: resolve(buildRoot, name),
        emptyOutDir: false,
        minify: false,
        sourcemap: true,
        lib: {
          entry: resolve(packageRoot, `src/${entry}.ts`),
          formats: ['es'],
          fileName: () => `${entry}.production.js`,
        },
        rollupOptions: {
          external: (id) =>
            id.startsWith('@benosjs/') ||
            id.startsWith('@zag-js/') ||
            id.startsWith('node:'),
        },
      },
    })
  }
}

const aliases = [
  {
    find: '@benosjs/core/internal',
    replacement: resolve(buildRoot, 'core/internal.production.js'),
  },
  {
    find: '@benosjs/core',
    replacement: resolve(buildRoot, 'core/index.production.js'),
  },
  {
    find: '@benosjs/dom/internal',
    replacement: resolve(buildRoot, 'dom/internal.production.js'),
  },
  {
    find: '@benosjs/dom',
    replacement: resolve(buildRoot, 'dom/index.production.js'),
  },
]
const entryPlugin = (framework) => ({
  name: 'p1-allocation-entry',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      return html.replace(
        '/src/main-benos.js',
        framework === 'benos-runtime'
          ? '/src/main-benos.js'
          : framework === 'benos-safe'
            ? '/src/main-benos.tsx'
            : framework === 'table-benos'
              ? '/src/table-benos.tsx'
              : framework === 'table-solid'
                ? '/src/table-solid.tsx'
                : '/src/main-solid.jsx',
      )
    },
  },
})
for (const framework of [
  'benos-runtime',
  'benos-safe',
  'solid',
  'table-benos',
  'table-solid',
]) {
  await build({
    configFile: false,
    root: benchRoot,
    mode: 'production',
    define: productionDefines,
    plugins:
      framework === 'solid' || framework === 'table-solid'
        ? [allocationCounters, entryPlugin(framework), solid()]
        : [
            allocationCounters,
            entryPlugin(framework),
            benos({ optimization: 'safe' }),
          ],
    resolve:
      framework === 'solid' || framework === 'table-solid'
        ? {}
        : { alias: aliases },
    build: {
      target: 'es2022',
      outDir: resolve(buildRoot, `app-${framework}`),
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
    },
  })
}

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.map': 'application/json',
}
function serve(root, port) {
  const server = createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0])
    const relative = normalize(urlPath).replace(/^([.][.][/\\])+/, '')
    const file = resolve(root, relative === '/' ? 'index.html' : `.${relative}`)
    if (
      !file.startsWith(root) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      response.writeHead(404).end('Not found')
      return
    }
    response.writeHead(200, {
      'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
    })
    createReadStream(file).pipe(response)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolveServer(server))
  })
}

async function snapshot(client) {
  let json = ''
  const onChunk = ({ chunk }) => {
    json += chunk
  }
  client.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
  await client.send('HeapProfiler.takeHeapSnapshot', {
    reportProgress: false,
    captureNumericValue: true,
  })
  client.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
  const parsed = JSON.parse(json)
  const fields = parsed.snapshot.meta.node_fields
  const width = fields.length
  const typeAt = fields.indexOf('type')
  const nameAt = fields.indexOf('name')
  const sizeAt = fields.indexOf('self_size')
  const types = parsed.snapshot.meta.node_types[typeAt]
  const result = Object.create(null)
  for (let index = 0; index < parsed.nodes.length; index += width) {
    const type = types[parsed.nodes[index + typeAt]]
    const name = parsed.strings[parsed.nodes[index + nameAt]]
    const size = parsed.nodes[index + sizeAt]
    const key = `${type}\u0000${name}`
    const value = (result[key] ??= { type, name, count: 0, bytes: 0 })
    value.count++
    value.bytes += size
  }
  return result
}

function diffSnapshots(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const delta = []
  for (const key of keys) {
    const prior = before[key] ?? { count: 0, bytes: 0 }
    const next = after[key] ?? { count: 0, bytes: 0 }
    const count = next.count - prior.count
    const bytes = next.bytes - prior.bytes
    if (count > 0 || bytes > 0) delta.push({ ...next, count, bytes })
  }
  return delta
}

async function takeHeapSnapshot(client) {
  let json = ''
  const onChunk = ({ chunk }) => {
    json += chunk
  }
  client.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
  await client.send('HeapProfiler.takeHeapSnapshot', {
    reportProgress: false,
    captureNumericValue: true,
  })
  client.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
  return JSON.parse(json)
}

function allocationTracePaths(snapshot) {
  const fields = snapshot.snapshot.meta.trace_function_info_fields
  const width = fields.length
  const strings = snapshot.strings
  const functions = []
  for (
    let index = 0;
    index < snapshot.trace_function_infos.length;
    index += width
  ) {
    const values = Object.fromEntries(
      fields.map((field, offset) => [
        field,
        snapshot.trace_function_infos[index + offset],
      ]),
    )
    functions.push({
      functionName: strings[values.name] || '(anonymous)',
      scriptName: strings[values.script_name] || '',
      line: values.line,
      column: values.column,
    })
  }
  const byId = new Map()
  const visit = (node, parentStack = []) => {
    const info = functions[node[1]]
    const stack = info ? [...parentStack, info] : parentStack
    byId.set(node[0], stack)
    const children = node[4] ?? []
    for (let index = 0; index < children.length; index += 5)
      visit(children.slice(index, index + 5), stack)
  }
  if (snapshot.trace_tree) visit(snapshot.trace_tree)
  return byId
}

function tracedObjectCounts(snapshot) {
  const fields = snapshot.snapshot.meta.node_fields
  const width = fields.length
  const typeAt = fields.indexOf('type')
  const nameAt = fields.indexOf('name')
  const sizeAt = fields.indexOf('self_size')
  const traceAt = fields.indexOf('trace_node_id')
  const types = snapshot.snapshot.meta.node_types[typeAt]
  const values = new Map()
  for (let index = 0; index < snapshot.nodes.length; index += width) {
    const type = types[snapshot.nodes[index + typeAt]]
    const name = snapshot.strings[snapshot.nodes[index + nameAt]]
    const array = type === 'array' || (type === 'object' && name === 'Array')
    if (type !== 'closure' && !array && type !== 'object') continue
    const traceId = snapshot.nodes[index + traceAt]
    const size = snapshot.nodes[index + sizeAt]
    const key = JSON.stringify([traceId, type, name])
    const item = values.get(key) ?? { traceId, type, name, count: 0, bytes: 0 }
    item.count++
    item.bytes += size
    values.set(key, item)
  }
  return values
}

const sourceMapCache = new Map()
function mappedAllocationFrame(frame, appRoot) {
  let generatedPath
  try {
    generatedPath = resolve(
      appRoot,
      '.' + decodeURIComponent(new URL(frame.scriptName).pathname),
    )
  } catch {
    return frame
  }
  let line = frame.line
  let column = frame.column
  let mapped = frame
  for (let depth = 0; depth < 5; depth++) {
    const mapPath = generatedPath + '.map'
    if (!existsSync(mapPath)) break
    let map = sourceMapCache.get(mapPath)
    if (!map) {
      map = new TraceMap(JSON.parse(readFileSync(mapPath, 'utf8')))
      sourceMapCache.set(mapPath, map)
    }
    const original = originalPositionFor(map, {
      line: line + 1,
      column,
    })
    if (!original.source || original.line === null || original.column === null)
      break
    generatedPath = resolve(dirname(mapPath), original.source)
    try {
      generatedPath = realpathSync(generatedPath)
    } catch {
      const macOsUserPath = generatedPath.replace(
        /^\/private\/Users\//,
        '/Users/',
      )
      if (existsSync(macOsUserPath)) generatedPath = macOsUserPath
    }
    line = original.line
    column = original.column
    mapped = {
      functionName: frame.functionName,
      scriptName: relative(repoRoot, generatedPath).replaceAll('\\', '/'),
      line,
      column,
    }
  }
  return mapped
}

function retainedAllocationAttribution(before, after, appRoot, rows) {
  const prior = tracedObjectCounts(before)
  const next = tracedObjectCounts(after)
  const traces = allocationTracePaths(after)
  const bySite = new Map()
  for (const [key, value] of next) {
    const old = prior.get(key) ?? { count: 0, bytes: 0 }
    const count = value.count - old.count
    const bytes = value.bytes - old.bytes
    if (count <= 0 && bytes <= 0) continue
    const stack = (traces.get(value.traceId) ?? []).map((frame) =>
      mappedAllocationFrame(frame, appRoot),
    )
    const leaf =
      [...stack]
        .reverse()
        .find((frame) => frame.scriptName && frame.line > 0) ?? stack.at(-1)
    const site = leaf
      ? leaf.functionName +
        ' @ ' +
        leaf.scriptName +
        ':' +
        (leaf.line + 1) +
        ':' +
        (leaf.column + 1)
      : '(allocation trace unavailable)'
    const entry = bySite.get(site) ?? {
      site,
      count: 0,
      bytes: 0,
      types: {},
      stack: stack.slice(-8).map((frame) => ({
        functionName: frame.functionName,
        source: frame.scriptName,
        line: frame.line + 1,
        column: frame.column + 1,
      })),
    }
    entry.count += count
    entry.bytes += bytes
    const type =
      value.type === 'closure'
        ? 'closures/functions'
        : value.type === 'array' || value.name === 'Array'
          ? 'arrays'
          : 'plain objects'
    const typeEntry = entry.types[type] ?? { count: 0, bytes: 0 }
    typeEntry.count += count
    typeEntry.bytes += bytes
    entry.types[type] = typeEntry
    bySite.set(site, entry)
  }
  const sites = [...bySite.values()].sort(
    (left, right) => right.bytes - left.bytes,
  )
  const totalCount = sites.reduce((sum, site) => sum + site.count, 0)
  const totalBytes = sites.reduce((sum, site) => sum + site.bytes, 0)
  let coveredCount = 0
  let coveredBytes = 0
  const selected = []
  for (const site of sites) {
    selected.push(site)
    coveredCount += site.count
    coveredBytes += site.bytes
    if (
      totalCount > 0 &&
      totalBytes > 0 &&
      coveredCount / totalCount >= 0.9 &&
      coveredBytes / totalBytes >= 0.9
    )
      break
  }
  return {
    retainedJsObjectCountPerRow: totalCount / rows,
    retainedJsBytesPerRow: totalBytes / rows,
    accountedCountPercent: totalCount ? (coveredCount / totalCount) * 100 : 0,
    accountedBytesPercent: totalBytes ? (coveredBytes / totalBytes) * 100 : 0,
    sitesPerRow: selected.map((site) => ({
      site: site.site,
      count: site.count / rows,
      bytes: site.bytes / rows,
      types: Object.fromEntries(
        Object.entries(site.types).map(([type, amount]) => [
          type,
          { count: amount.count / rows, bytes: amount.bytes / rows },
        ]),
      ),
      stack: site.stack,
    })),
  }
}

function sampleSummary(profile) {
  const sites = new Map()
  const byId = new Map()
  const visit = (node, parents = []) => {
    const frame = node.callFrame
    const path = [...parents, frame].filter(Boolean)
    byId.set(node.id, { frame, path, selfSize: node.selfSize ?? 0 })
    for (const child of node.children ?? []) visit(child, path)
  }
  visit(profile.head)
  for (const sample of profile.samples ?? []) {
    const node = byId.get(sample.nodeId)
    if (!node) continue
    const frame = node.frame
    const key = `${frame.functionName || '(anonymous)'} @ ${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
    const value = sites.get(key) ?? {
      site: key,
      bytes: 0,
      sampleCount: 0,
      stack: node.path.map((item) => item.functionName || '(anonymous)'),
    }
    value.bytes += sample.size
    value.sampleCount++
    sites.set(key, value)
  }
  if (sites.size === 0) {
    for (const node of byId.values()) {
      if (!node.selfSize) continue
      const frame = node.frame
      const key = `${frame.functionName || '(anonymous)'} @ ${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
      sites.set(key, {
        site: key,
        bytes: node.selfSize,
        sampleCount: null,
        stack: node.path.map((item) => item.functionName || '(anonymous)'),
      })
    }
  }
  return [...sites.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 30)
}

const servers = [
  await serve(resolve(buildRoot, 'app-benos-runtime'), 4381),
  await serve(resolve(buildRoot, 'app-benos-safe'), 4382),
  await serve(resolve(buildRoot, 'app-solid'), 4383),
  await serve(resolve(buildRoot, 'app-table-benos'), 4384),
  await serve(resolve(buildRoot, 'app-table-solid'), 4385),
]
const browser = await chromium.launch({ headless: true })
const report = {
  protocol:
    'production define; minification disabled; sourcemaps enabled; Chromium HeapProfiler allocation sampling plus forced-GC snapshots',
  browser: browser.version(),
  rows: 1000,
  buildRoot,
  frameworks: {},
}
const counterBootstrap = `globalThis.__p1AllocationCounts = { owners: 0, signals: 0, computeds: 0, effects: 0 };`

try {
  for (const [index, framework] of [
    'benos-runtime',
    'benos-safe',
    'solid',
  ].entries()) {
    const page = await browser.newPage()
    const client = await page.context().newCDPSession(page)
    await client.send('HeapProfiler.enable')
    await page.addInitScript(counterBootstrap)
    await page.goto(`http://127.0.0.1:${4381 + index}/`)
    await page.waitForFunction(() => window.__jfbReady === true)
    const countsBefore = await page.evaluate(() => ({
      ...window.__p1AllocationCounts,
    }))
    await client.send('HeapProfiler.collectGarbage')
    await client.send('HeapProfiler.startTrackingHeapObjects', {
      trackAllocations: true,
    })
    const beforeDetailed = await takeHeapSnapshot(client)
    await page.locator('#run').click()
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr').length === 1000,
    )
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    )
    const countsAfter = await page.evaluate(() => ({
      ...window.__p1AllocationCounts,
    }))
    await client.send('HeapProfiler.collectGarbage')
    const afterDetailed = await takeHeapSnapshot(client)
    await client.send('HeapProfiler.stopTrackingHeapObjects', {
      reportProgress: false,
    })
    const retainedAllocationSites = retainedAllocationAttribution(
      beforeDetailed,
      afterDetailed,
      resolve(buildRoot, 'app-' + framework),
      1000,
    )
    await page.locator('#clear').click()
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr').length === 0,
    )
    await client.send('HeapProfiler.collectGarbage')
    const before = await snapshot(client)
    await client.send('HeapProfiler.startSampling', {
      samplingInterval: 64,
      includeObjectsCollectedByMajorGC: true,
    })
    await page.locator('#run').click()
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr').length === 1000,
    )
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    )
    const sampling = await client.send('HeapProfiler.stopSampling')
    await client.send('HeapProfiler.collectGarbage')
    const after = await snapshot(client)
    const delta = diffSnapshots(before, after)
    const byType = new Map()
    for (const item of delta) {
      const isDomWrapper =
        item.type === 'native' &&
        (/^<[^>]+>$/.test(item.name) ||
          /^(Text|Comment|Document|DocumentFragment|HTML.*Element|SVG.*Element|.*Node)$/.test(
            item.name,
          ))
      const isArray =
        item.type === 'array' ||
        (item.type === 'object' && item.name === 'Array')
      const group =
        item.type === 'closure'
          ? 'closures/functions'
          : isArray
            ? 'arrays'
            : isDomWrapper
              ? 'DOM wrappers'
              : item.type === 'native'
                ? 'browser native/layout objects'
                : item.type === 'object'
                  ? 'plain objects'
                  : item.type
      const value = byType.get(group) ?? { retainedCount: 0, retainedBytes: 0 }
      value.retainedCount += item.count
      value.retainedBytes += item.bytes
      byType.set(group, value)
    }
    const namedDelta = delta.sort((a, b) => b.count - a.count).slice(0, 100)
    report.frameworks[framework] = {
      nodeCallsPerRow: Object.fromEntries(
        Object.keys(countsBefore).map((key) => [
          key,
          (countsAfter[key] - countsBefore[key]) / 1000,
        ]),
      ),
      retainedDeltaPerRow: Object.fromEntries(
        [...byType].map(([type, value]) => [
          type,
          {
            count: value.retainedCount / 1000,
            bytes: value.retainedBytes / 1000,
          },
        ]),
      ),
      largestNamedDeltas: namedDelta.map((item) => ({
        type: item.type,
        name: item.name,
        countPerRow: item.count / 1000,
        bytesPerRow: item.bytes / 1000,
      })),
      retainedAllocationSites,
      allocationSamplingTopSites: sampleSummary(sampling.profile),
    }
    await page.close()
  }

  for (const [index, framework] of ['table-benos', 'table-solid'].entries()) {
    const port = 4384 + index
    const page = await browser.newPage()
    const client = await page.context().newCDPSession(page)
    await client.send('HeapProfiler.enable')
    await page.addInitScript(counterBootstrap)
    await page.goto(`http://127.0.0.1:${port}/?rows=0`)
    await page.waitForFunction(() => window.__benosTableBench?.initial)
    await page.evaluate(() => window.__benosTableBench.initial)
    const emptyCounts = await page.evaluate(() => ({
      ...window.__p1AllocationCounts,
    }))
    await client.send('HeapProfiler.collectGarbage')
    await client.send('HeapProfiler.startTrackingHeapObjects', {
      trackAllocations: true,
    })
    const beforeDetailed = await takeHeapSnapshot(client)
    await page.goto(`http://127.0.0.1:${port}/?rows=1000`)
    await page.waitForFunction(() => window.__benosTableBench?.initial)
    await page.evaluate(() => window.__benosTableBench.initial)
    const fullCounts = await page.evaluate(() => ({
      ...window.__p1AllocationCounts,
    }))
    await client.send('HeapProfiler.collectGarbage')
    const afterDetailed = await takeHeapSnapshot(client)
    await client.send('HeapProfiler.stopTrackingHeapObjects', {
      reportProgress: false,
    })
    const retainedAllocationSites = retainedAllocationAttribution(
      beforeDetailed,
      afterDetailed,
      resolve(buildRoot, 'app-' + framework),
      1000,
    )

    await page.goto(`http://127.0.0.1:${port}/?rows=0`)
    await page.waitForFunction(() => window.__benosTableBench?.initial)
    await page.evaluate(() => window.__benosTableBench.initial)
    await client.send('HeapProfiler.collectGarbage')
    const before = await snapshot(client)
    await client.send('HeapProfiler.startSampling', {
      samplingInterval: 64,
      includeObjectsCollectedByMajorGC: true,
    })
    await page.goto(`http://127.0.0.1:${port}/?rows=1000`)
    await page.waitForFunction(() => window.__benosTableBench?.initial)
    await page.evaluate(() => window.__benosTableBench.initial)
    const sampling = await client.send('HeapProfiler.stopSampling')
    await client.send('HeapProfiler.collectGarbage')
    const after = await snapshot(client)
    const delta = diffSnapshots(before, after)
    const byType = new Map()
    for (const item of delta) {
      const isDomWrapper =
        item.type === 'native' &&
        (/^<[^>]+>$/.test(item.name) ||
          /^(Text|Comment|Document|DocumentFragment|HTML.*Element|SVG.*Element|.*Node)$/.test(
            item.name,
          ))
      const isArray =
        item.type === 'array' ||
        (item.type === 'object' && item.name === 'Array')
      const group =
        item.type === 'closure'
          ? 'closures/functions'
          : isArray
            ? 'arrays'
            : isDomWrapper
              ? 'DOM wrappers'
              : item.type === 'native'
                ? 'browser native/layout objects'
                : item.type === 'object'
                  ? 'plain objects'
                  : item.type
      const value = byType.get(group) ?? { retainedCount: 0, retainedBytes: 0 }
      value.retainedCount += item.count
      value.retainedBytes += item.bytes
      byType.set(group, value)
    }
    report.frameworks[framework] = {
      nodeCallsPerRow: Object.fromEntries(
        Object.keys(emptyCounts).map((key) => [
          key,
          (fullCounts[key] - emptyCounts[key]) / 1000,
        ]),
      ),
      retainedDeltaPerRow: Object.fromEntries(
        [...byType].map(([type, value]) => [
          type,
          {
            count: value.retainedCount / 1000,
            bytes: value.retainedBytes / 1000,
          },
        ]),
      ),
      retainedAllocationSites,
      allocationSamplingTopSites: sampleSummary(sampling.profile),
    }
    await page.close()
  }
} finally {
  await browser.close()
  for (const server of servers) await new Promise((done) => server.close(done))
}

const outPath = resolve(
  repoRoot,
  'benchmarks/js-framework-benchmark/results',
  process.env.P1_ALLOCATION_OUTPUT ??
    'perf-p3-compiled-allocation-sampling.json',
)
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
console.log(`Saved ${outPath}`)

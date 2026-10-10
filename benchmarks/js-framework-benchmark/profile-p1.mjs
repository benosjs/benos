/* global console, requestAnimationFrame */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import MagicString from '../../node_modules/.pnpm/magic-string@1.4.2/node_modules/magic-string/dist/index.mjs'
import ts from 'typescript'
import { build } from 'vite'
import benos from '../../packages/vite/dist/js/index.production.js'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const benchRoot = fileURLToPath(new URL('.', import.meta.url))
const buildRoot = await mkdtemp(join(tmpdir(), 'benos-p1-profile-'))
const rounds = 7
const warmups = 2
const productionDefines = {
  'process.env.NODE_ENV': JSON.stringify('production'),
  'globalThis.process': '({env:{NODE_ENV:"production"}})',
}

const instrument = {
  name: 'temporary-p1-category-marks',
  transform(code, id) {
    const normalized = id.replaceAll('\\', '/')
    const core = normalized.endsWith('/packages/core/src/runtime.ts')
    const dom = normalized.endsWith('/packages/dom/src/index.ts')
    if (!core && !dom) return null
    const functions = {
      ...(core
        ? {
            createOwner: 'owner creation',
            disposeOwner: 'disposal',
            signal: 'signal node creation',
            computed: 'computed node creation',
            createEffect: 'effect node creation',
          }
        : {
            templatePrototype: 'template instantiation',
            mountTemplate: 'template instantiation',
            mountValue: 'binding setup',
            mountElement: 'binding setup',
            mountComponent: 'binding setup',
            mountShow: 'binding setup',
            mountFor: 'binding setup',
            mountSwitch: 'binding setup',
            mountDynamic: 'binding setup',
            mountPortal: 'binding setup',
            mountBoundary: 'binding setup',
            mountControl: 'binding setup',
            applyProps: 'binding setup',
            updateSlot: 'binding setup',
            createSlot: 'binding setup',
            installEvent: 'event setup',
            installDelegated: 'event setup',
            removeRange: 'disposal',
            disposeMounted: 'disposal',
          }),
    }
    const source = ts.createSourceFile(
      id,
      code,
      ts.ScriptTarget.Latest,
      true,
      id.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    )
    const edits = []
    const visit = (node) => {
      if (
        dom &&
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        ['development', 'childrenDiagnostics'].includes(node.name.text) &&
        node.initializer
      ) {
        edits.push({
          start: node.initializer.getStart(source),
          end: node.initializer.end,
          replacement: 'false',
        })
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.body &&
        functions[node.name.text]
      ) {
        const category = functions[node.name.text]
        edits.push({
          start: node.body.getStart(source) + 1,
          end: node.body.end - 1,
          category,
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    if (!edits.length) return null
    const magic = new MagicString(code)
    for (const edit of edits) {
      if (edit.replacement) {
        magic.overwrite(edit.start, edit.end, edit.replacement)
        continue
      }
      magic.appendLeft(
        edit.start,
        `globalThis.__benosP1?.enter(${JSON.stringify(edit.category)});try{`,
      )
      magic.appendLeft(
        edit.end,
        `}finally{globalThis.__benosP1?.exit(${JSON.stringify(edit.category)})}`,
      )
    }
    return {
      code: magic.toString(),
      map: magic.generateMap({ source: id, includeContent: true, hires: true }),
    }
  },
}

const packages = [
  { name: 'core', entries: ['index', 'internal'] },
  { name: 'dom', entries: ['index', 'internal'] },
]
for (const pkg of packages) {
  const packageRoot = resolve(repoRoot, 'packages', pkg.name)
  const outDir = resolve(buildRoot, pkg.name)
  for (const entry of pkg.entries) {
    await build({
      configFile: false,
      root: packageRoot,
      mode: 'production',
      define: productionDefines,
      plugins: [instrument],
      build: {
        target: 'es2022',
        outDir,
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

const profileCore = resolve(buildRoot, 'core')
const profileDom = resolve(buildRoot, 'dom')
const aliases = [
  {
    find: '@benosjs/core/internal',
    replacement: resolve(profileCore, 'internal.production.js'),
  },
  {
    find: '@benosjs/core',
    replacement: resolve(profileCore, 'index.production.js'),
  },
  {
    find: '@benosjs/dom/internal',
    replacement: resolve(profileDom, 'internal.production.js'),
  },
  {
    find: '@benosjs/dom',
    replacement: resolve(profileDom, 'index.production.js'),
  },
]

const entryPlugin = (app) => ({
  name: 'p1-profile-entry',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      return html.replace(
        '/src/main-benos.js',
        app === 'table-benos' ? '/src/table-benos.tsx' : '/src/main-benos.tsx',
      )
    },
  },
})

for (const app of ['benos', 'table-benos']) {
  await build({
    configFile: false,
    root: benchRoot,
    mode: 'production',
    define: productionDefines,
    plugins: [entryPlugin(app), benos({ optimization: 'safe' })],
    resolve: { alias: aliases },
    build: {
      target: 'es2022',
      outDir: resolve(buildRoot, `app-${app}`),
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
    },
  })
}

const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
}
function serve(root, port) {
  const server = createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0])
    const relative = normalize(urlPath).replace(/^([.][.][/\\])+/, '')
    const path = resolve(root, relative === '/' ? 'index.html' : `.${relative}`)
    if (
      !path.startsWith(root) ||
      !existsSync(path) ||
      !statSync(path).isFile()
    ) {
      response.writeHead(404).end('Not found')
      return
    }
    response.writeHead(200, {
      'content-type': mime[extname(path)] ?? 'application/octet-stream',
    })
    createReadStream(path).pipe(response)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolveServer(server))
  })
}

const bootstrap = `(() => {
  const totals = Object.create(null), counts = Object.create(null), stack = [];
  let sequence = 0;
  const enter = (name) => {
    const callStart = performance.now();
    const id = ++sequence;
    performance.mark('benos:p1:' + name + ':' + id + ':start');
    const start = performance.now();
    stack.push({ name, id, callStart, start, child: 0 });
  };
  const exit = (name) => {
    const end = performance.now();
    const frame = stack.pop();
    if (!frame || frame.name !== name) throw new Error('Unbalanced P1 profile span: ' + name);
    const elapsed = end - frame.start;
    const exclusive = Math.max(0, elapsed - frame.child);
    totals[name] = (totals[name] || 0) + exclusive;
    counts[name] = (counts[name] || 0) + 1;
    performance.mark('benos:p1:' + name + ':' + frame.id + ':end');
    const parent = stack[stack.length - 1];
    if (parent) parent.child += performance.now() - frame.callStart;
  };
  const wrap = (method, category) => {
    const original = Node.prototype[method];
    Node.prototype[method] = function (...args) {
      enter(category);
      try { return Reflect.apply(original, this, args); }
      finally { exit(category); }
    };
  };
  wrap('insertBefore', 'DOM insertion');
  wrap('appendChild', 'DOM insertion');
  wrap('removeChild', 'disposal');
  globalThis.__benosP1 = {
    enter, exit,
    reset() {
      for (const key of Object.keys(totals)) delete totals[key];
      for (const key of Object.keys(counts)) delete counts[key];
      stack.length = 0;
      performance.clearMarks();
      performance.clearMeasures();
    },
    snapshot() { return { totals: { ...totals }, counts: { ...counts } }; },
  };
})();`

const browser = await chromium.launch({ headless: true })
const servers = [
  await serve(resolve(buildRoot, 'app-benos'), 4371),
  await serve(resolve(buildRoot, 'app-table-benos'), 4372),
]
const samples = {}
const operations = [
  { name: 'create-1k', button: 'run', expected: 1000 },
  { name: 'replace-1k', setup: 'run', button: 'run', expected: 1000 },
  { name: 'clear-1k', setup: 'run', button: 'clear', expected: 0 },
  { name: 'create-10k', button: 'runlots', expected: 10000 },
  { name: 'replace-10k', setup: 'runlots', button: 'runlots', expected: 10000 },
  { name: 'clear-10k', setup: 'runlots', button: 'clear', expected: 0 },
]
const selectedOperations = process.env.P1_WORKLOADS
  ? operations.filter((operation) =>
      process.env.P1_WORKLOADS.split(',').includes(operation.name),
    )
  : operations
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
async function newProfilePage(port, query = '') {
  const page = await browser.newPage()
  await page.addInitScript(bootstrap)
  await page.goto(`http://127.0.0.1:${port}/${query}`)
  return page
}
async function waitRows(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('tbody tr').length === expected,
    count,
  )
}

try {
  for (const operation of selectedOperations) {
    const roundsMs = []
    for (let round = -warmups; round < rounds; round++) {
      const page = await newProfilePage(4371)
      await page.waitForFunction(() => window.__jfbReady === true)
      if (operation.setup) {
        await page.evaluate(
          (id) => document.getElementById(id).click(),
          operation.setup,
        )
        await waitRows(page, operation.setup === 'runlots' ? 10000 : 1000)
      }
      await page.evaluate(() => window.__benosP1.reset())
      await page.evaluate(
        (id) => document.getElementById(id).click(),
        operation.button,
      )
      await waitRows(page, operation.expected)
      await page.evaluate(
        () =>
          new Promise((resolveFrame) =>
            requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
          ),
      )
      const profile = await page.evaluate(() => window.__benosP1.snapshot())
      if (round >= 0) roundsMs.push(profile)
      await page.close()
    }
    samples[operation.name] = roundsMs
  }

  for (const size of process.env.P1_SKIP_TABLE === '1' ? [] : [5000, 10000]) {
    const roundsMs = []
    for (let round = -warmups; round < rounds; round++) {
      const page = await newProfilePage(4372, `?rows=${size}`)
      await page.waitForFunction(() => window.__benosTableBench?.initial)
      await page.evaluate(() => window.__benosTableBench.initial)
      const profile = await page.evaluate(() => window.__benosP1.snapshot())
      if (round >= 0) roundsMs.push(profile)
      await page.close()
    }
    samples[`table-mount-${size}`] = roundsMs
  }
} finally {
  await browser.close()
  for (const server of servers) await new Promise((done) => server.close(done))
}

const categories = [
  'template instantiation',
  'binding setup',
  'owner creation',
  'signal node creation',
  'computed node creation',
  'effect node creation',
  'event setup',
  'DOM insertion',
  'disposal',
]
const summary = {}
for (const [name, runs] of Object.entries(samples)) {
  summary[name] = {}
  for (const category of categories) {
    const values = runs.map((run) => run.totals[category] ?? 0)
    summary[name][category] = {
      medianMs: median(values),
      minMs: Math.min(...values),
      maxMs: Math.max(...values),
      medianCalls: median(runs.map((run) => run.counts[category] ?? 0)),
    }
  }
}
const output = {
  protocol: {
    build: 'production define, minification disabled, source maps enabled',
    browser: 'Chromium',
    warmups,
    rounds,
    marks: 'performance.mark pairs around each instrumented category span',
    note: 'Exclusive category times; child category spans are subtracted from parent spans.',
  },
  buildRoot,
  summary,
  samples,
}
const outPath = resolve(
  repoRoot,
  'benchmarks/js-framework-benchmark/results/perf-p3-compiled-cpu-attribution.json',
)
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
console.log(`Saved ${outPath}`)

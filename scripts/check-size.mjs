import process from 'node:process'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

async function bundledSize(packages, external = []) {
  const imports = packages
    .map(
      (name, index) =>
        `export * as package${index} from './packages/${name.split(':')[0]}/dist/js/${name.split(':')[1] ?? 'index'}.production.js'`,
    )
    .join('\n')

  const result = await build({
    stdin: {
      contents: imports,
      resolveDir: process.cwd(),
      sourcefile: 'size-entry.js',
    },
    bundle: true,
    external,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
  })

  const output = result.outputFiles[0]
  if (!output) throw new Error('Size build produced no output')
  return gzipSync(output.contents).length
}

const checks = [
  ['@benosjs/core', await bundledSize(['core']), 4_608],
  ['@benosjs/core + @benosjs/dom', await bundledSize(['core', 'dom']), 11_520],
  [
    '@benosjs/async (core and DOM external)',
    await bundledSize(['async'], ['@benosjs/core', '@benosjs/dom']),
    4_096,
  ],
  [
    '@benosjs/query (core, DOM, and async external)',
    await bundledSize(
      ['query'],
      ['@benosjs/core', '@benosjs/dom', '@benosjs/async'],
    ),
    3_840,
  ],
  [
    '@benosjs/forms (core, DOM, async, router, and query external)',
    await bundledSize(
      ['forms'],
      [
        '@benosjs/core',
        '@benosjs/dom',
        '@benosjs/async',
        '@benosjs/router',
        '@benosjs/query',
      ],
    ),
    3_072,
  ],
  [
    '@benosjs/router (core, DOM, and async external)',
    await bundledSize(
      ['router'],
      ['@benosjs/core', '@benosjs/dom', '@benosjs/async'],
    ),
    7_168,
  ],
  [
    '@benosjs/dom/hydrate (core and DOM external)',
    await bundledSize(['dom:hydrate'], ['@benosjs/core', '@benosjs/dom']),
    4_096,
  ],
  [
    '@benosjs/server (core and DOM external)',
    await bundledSize(['server'], ['@benosjs/core', '@benosjs/dom']),
    8_448,
  ],
]

let failed = false
for (const [label, bytes, limit] of checks) {
  process.stdout.write(
    `${label}: ${bytes} / ${limit} bytes (minified + gzip)\n`,
  )
  failed ||= bytes > limit
}

if (failed) process.exitCode = 1
process.stdout.write(
  `@benosjs/core + @benosjs/dom + @benosjs/async: ${await bundledSize(['core', 'dom', 'async'])} bytes (minified + gzip)\n`,
)
process.stdout.write(
  `@benosjs/core + @benosjs/dom + @benosjs/async + @benosjs/router: ${await bundledSize(['core', 'dom', 'async', 'router'])} bytes (minified + gzip)\n`,
)
process.stdout.write(
  `@benosjs/core + @benosjs/dom + @benosjs/async + @benosjs/query: ${await bundledSize(['core', 'dom', 'async', 'query'])} bytes (minified + gzip)\n`,
)
process.stdout.write(
  `@benosjs/core + @benosjs/dom + @benosjs/async + @benosjs/router + @benosjs/query: ${await bundledSize(['core', 'dom', 'async', 'router', 'query'])} bytes (minified + gzip)\n`,
)
// A form without a route still imports the router's blockNavigation; this is
// what that import costs an app that does not use the router.
const formsWithoutRouter = await bundledSize(['core', 'dom', 'forms'])
const formsRouterExternal = await bundledSize(
  ['core', 'dom', 'forms'],
  ['@benosjs/router'],
)
process.stdout.write(
  `@benosjs/core + @benosjs/dom + @benosjs/forms, router not used: ${formsWithoutRouter} bytes (minified + gzip), ${formsWithoutRouter - formsRouterExternal} of them for the router import\n`,
)
process.stdout.write(
  `@benosjs/core + @benosjs/dom + @benosjs/async + @benosjs/router + @benosjs/query + @benosjs/forms: ${await bundledSize(['core', 'dom', 'async', 'router', 'query', 'forms'])} bytes (minified + gzip)\n`,
)

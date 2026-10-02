import process from 'node:process'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const kib = 1024

async function bundledSize(packages) {
  const imports = packages
    .map(
      (name, index) =>
        `export * as package${index} from './packages/${name}/dist/js/index.production.js'`,
    )
    .join('\n')

  const result = await build({
    stdin: {
      contents: imports,
      resolveDir: process.cwd(),
      sourcefile: 'size-entry.js',
    },
    bundle: true,
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
  ['@benosjs/core', await bundledSize(['core']), 4 * kib],
  [
    '@benosjs/core + @benosjs/dom',
    await bundledSize(['core', 'dom']),
    10 * kib,
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

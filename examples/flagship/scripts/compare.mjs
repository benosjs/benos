/* global URL, console */
// Sums the gzipped JavaScript of each flagship build, with the shared Zod
// schema and with a hand-written one, then writes comparison-results.json.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

async function gzipOfBuild(name) {
  const directory = join(root, 'dist', name, 'assets')
  const chunks = {}
  let total = 0
  for (const file of (await readdir(directory)).sort()) {
    if (!file.endsWith('.js')) continue
    const bytes = gzipSync(await readFile(join(directory, file))).length
    chunks[file.replace(/-[\w-]{8}\.js$/, '.js')] = bytes
    total += bytes
  }
  return { total, chunks }
}

const results = {
  withZod: {
    benos: await gzipOfBuild('benos'),
    react: await gzipOfBuild('react'),
    reactShadcn: await gzipOfBuild('react-shadcn'),
  },
  withoutZod: {
    benos: await gzipOfBuild('benos-plain'),
    react: await gzipOfBuild('react-plain'),
    reactShadcn: await gzipOfBuild('react-shadcn-plain'),
  },
}
await writeFile(
  join(root, 'comparison-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
)
for (const [variant, builds] of Object.entries(results))
  for (const [name, value] of Object.entries(builds))
    console.log(variant, name, value.total)

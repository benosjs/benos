/* global console, process */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const roots = ['examples', 'tests/fixtures']
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const forbidden =
  /from\s+['"]@benosjs\/(?:core|dom)\/internal['"]|import\s*\(\s*['"]@benosjs\/(?:core|dom)\/internal['"]/
const violations = []

async function visit(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await visit(path)
    else if (extensions.has(path.slice(path.lastIndexOf('.')))) {
      const source = await readFile(path, 'utf8')
      if (forbidden.test(source)) violations.push(path)
    }
  }
}

for (const root of roots) await visit(root)
if (violations.length) {
  console.error('Application code imports a Benos internal subpath:')
  for (const path of violations) console.error(`- ${path}`)
  process.exit(1)
}
console.log('Public import check passed.')

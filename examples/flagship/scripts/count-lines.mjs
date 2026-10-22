/* global URL, console, process */
// Counts the formatted nonblank lines of the flagship regions and checks that
// docs/architecture/flagship-integration.md shows exactly this code and these
// counts. Run with --print to see the regions.
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const doc = join(root, '../../docs/architecture/flagship-integration.md')

const blocks = {
  'Benos setup': [
    'src/benos/data.ts',
    'src/benos/routes/refs.ts',
    'src/benos/routes/manifest.tsx',
  ],
  'Benos editor': ['src/benos/pages/project-editor.tsx'],
  'React setup': ['src/react/routes.tsx'],
  'React native editor': ['src/react/native.tsx'],
  'React shadcn/ui editor': ['src/react/shadcn.tsx'],
}

async function region(file) {
  const text = await readFile(join(root, file), 'utf8')
  const match = /\/\/ #region flagship\n([\s\S]*?)\/\/ #endregion/.exec(text)
  if (!match) throw new Error(`${file} has no flagship region`)
  return match[1].trimEnd()
}
const nonblank = (text) => text.split('\n').filter((line) => line.trim()).length

const counts = {}
const code = {}
for (const [name, files] of Object.entries(blocks)) {
  code[name] = (await Promise.all(files.map(region))).join('\n')
  counts[name] = nonblank(code[name])
}
const table = {
  'Page/editor block': [
    counts['Benos editor'],
    counts['React native editor'],
    counts['React shadcn/ui editor'],
  ],
  'Full shown slice': [
    counts['Benos setup'] + counts['Benos editor'],
    counts['React setup'] + counts['React native editor'],
    counts['React setup'] + counts['React shadcn/ui editor'],
  ],
}

if (process.argv.includes('--print'))
  for (const [name, text] of Object.entries(code))
    console.log(`--- ${name} (${counts[name]})\n${text}\n`)
for (const [row, values] of Object.entries(table))
  console.log(`${row}: ${values.join(' / ')}`)

const markdown = await readFile(doc, 'utf8')
const fences = [...markdown.matchAll(/```tsx\n([\s\S]*?)```/g)].map((m) =>
  m[1].trimEnd(),
)
let failed = false
for (const [name, text] of Object.entries(code)) {
  if (!fences.includes(text)) {
    console.error(`flagship-integration.md does not show the ${name} code`)
    failed = true
  }
}
for (const [row, values] of Object.entries(table)) {
  const line = markdown
    .split('\n')
    .find((candidate) => candidate.startsWith(`| ${row} `))
  const shown = line
    ?.split('|')
    .slice(2, 5)
    .map((cell) => Number(cell.trim()))
  if (!shown || shown.join() !== values.join()) {
    console.error(
      `flagship-integration.md shows ${row} as ${shown?.join(' / ')}, measured ${values.join(' / ')}`,
    )
    failed = true
  }
}
if (failed) process.exitCode = 1

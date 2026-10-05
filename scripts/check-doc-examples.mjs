/* global URL, console */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const documents = [
  'docs/getting-started.md',
  'docs/api-reference.md',
  'docs/react-migration.md',
  'docs/event-ordering.md',
]
const { transformJsx } =
  await import('../packages/compiler/dist/js/index.development.js')
const temporary = await mkdtemp(join(tmpdir(), 'benos-doc-examples-'))

async function collectMarkdown(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...(await collectMarkdown(path)))
    else if (entry.isFile() && entry.name.endsWith('.md')) paths.push(path)
  }
  return paths
}

try {
  const files = []
  let index = 0
  const allDocuments = [
    ...documents.map((document) => join(root, document)),
    ...(await collectMarkdown(join(root, 'docs/ui'))),
  ]
  for (const document of allDocuments) {
    const source = await readFile(document, 'utf8')
    for (const match of source.matchAll(/```tsx\n([\s\S]*?)```/g)) {
      const example = match[1] ?? ''
      for (const optimization of ['none', 'safe']) {
        const compiled = transformJsx(example, {
          filename: document,
          development: true,
          optimization,
        })
        const errors = compiled.diagnostics.filter(
          (diagnostic) => diagnostic.severity === 'error',
        )
        if (errors.length > 0)
          throw new Error(
            `TSX example in ${document} failed Benos compilation (${optimization}): ${errors.map((diagnostic) => diagnostic.message).join('; ')}`,
          )
      }
      const path = join(temporary, `example-${index++}.tsx`)
      await writeFile(path, example)
      files.push(path)
    }
  }
  const config = join(temporary, 'tsconfig.json')
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'preserve',
        jsxImportSource: '@benosjs/dom',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        baseUrl: root,
        paths: {
          '@/*': ['registry/source/*'],
          '@/components/ui/*': ['registry/source/components/*'],
          '@/styles/*': ['registry/source/css/*'],
          '@benosjs/core': ['packages/core/src/index.ts'],
          '@benosjs/dom': ['packages/dom/src/index.ts'],
          '@benosjs/dom/*': ['packages/dom/src/*'],
          '@benosjs/compiler': ['packages/compiler/src/index.ts'],
          '@benosjs/vite': ['packages/vite/src/index.ts'],
          '@benosjs/eslint-plugin': ['packages/eslint-plugin/src/index.ts'],
          '@zag-js/*': ['packages/primitives/node_modules/@zag-js/*'],
        },
      },
      files,
    }),
  )
  if (files.length === 0) throw new Error('No TSX documentation examples found')
  await run('pnpm', ['exec', 'tsc', '-p', config, '--noEmit'], { cwd: root })
  console.log(
    `Documentation examples compiled in both modes and passed type-check (${files.length} files).`,
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

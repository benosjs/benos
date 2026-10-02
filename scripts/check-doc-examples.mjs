/* global URL, console */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
const temporary = await mkdtemp(join(tmpdir(), 'benos-doc-examples-'))
try {
  const files = []
  let index = 0
  for (const document of documents) {
    const source = await readFile(join(root, document), 'utf8')
    for (const match of source.matchAll(/```tsx\n([\s\S]*?)```/g)) {
      const path = join(temporary, `example-${index++}.tsx`)
      await writeFile(path, match[1] ?? '')
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
          '@benosjs/core': ['packages/core/src/index.ts'],
          '@benosjs/dom': ['packages/dom/src/index.ts'],
          '@benosjs/dom/*': ['packages/dom/src/*'],
          '@benosjs/compiler': ['packages/compiler/src/index.ts'],
          '@benosjs/vite': ['packages/vite/src/index.ts'],
          '@benosjs/eslint-plugin': ['packages/eslint-plugin/src/index.ts'],
        },
      },
      files,
    }),
  )
  if (files.length === 0) throw new Error('No TSX documentation examples found')
  await run('pnpm', ['exec', 'tsc', '-p', config, '--noEmit'], { cwd: root })
  console.log(
    `Documentation examples passed type-check (${files.length} files).`,
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

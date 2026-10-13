import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(resolve(directory, path), 'utf8')

test('route references never import presentation or the router instance', () => {
  const refs = read('refs.ts')
  assert.doesNotMatch(refs, /from ['"].*(?:manifest|pages|layouts)/)
  assert.doesNotMatch(refs, /import\s*\(/)
})

test('manifest loads every layout and page through a dynamic import', () => {
  const manifest = read('manifest.tsx')
  for (const path of [
    './layouts/app',
    './layouts/projects',
    './pages/project-editor',
    './pages/settings',
  ]) {
    assert.ok(manifest.includes(`import('${path}')`))
    assert.ok(!manifest.includes(`from '${path}'`))
  }
})

test('nested layouts and pages import refs without importing the manifest', () => {
  for (const path of [
    'layouts/app.tsx',
    'layouts/projects.tsx',
    'pages/project-editor.tsx',
    'pages/settings.tsx',
  ]) {
    const source = read(path)
    assert.match(source, /from ['"]\.\.\/refs['"]/)
    assert.doesNotMatch(source, /manifest/)
  }
})

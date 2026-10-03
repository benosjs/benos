import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const primitiveNames = [
  'accordion',
  'checkbox',
  'dialog',
  'menu',
  'popover',
  'radio-group',
  'select',
  'switch',
  'tabs',
  'toast',
  'tooltip',
] as const

describe('@benosjs/primitives DOM-free imports', () => {
  for (const name of primitiveNames) {
    it(`${name} machine subpath imports without window or document`, () => {
      const entry = `${repositoryRoot}packages/primitives/dist/js/${name}.production.js`
      expect(
        existsSync(entry),
        'build the production package before this test',
      ).toBe(true)
      const importUrl = pathToFileURL(entry).href
      const script = `
        delete globalThis.window;
        delete globalThis.document;
        await import(${JSON.stringify(importUrl)});
        if ('window' in globalThis || 'document' in globalThis) {
          throw new Error('DOM globals were created during module import');
        }
      `
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        { cwd: repositoryRoot, encoding: 'utf8' },
      )
      expect(result.status, result.stderr || result.stdout).toBe(0)
    })
  }
})

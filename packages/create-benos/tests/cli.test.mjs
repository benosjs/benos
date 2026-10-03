/* global URL, process */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../src/index.mjs', import.meta.url))

test('CLI help does not expose an unsupported template option', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Usage: create-benos/)
  assert.doesNotMatch(result.stdout, /--template/)
})

test('CLI rejects the removed template option', () => {
  const result = spawnSync(process.execPath, [cli, '--template', 'app'], {
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unknown option: --template/)
})

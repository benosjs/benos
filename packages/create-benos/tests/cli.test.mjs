/* global URL, process */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../src/index.mjs', import.meta.url))

test('CLI help shows optional UI flags and one curated template', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Usage: create-benos/)
  assert.match(result.stdout, /--ui\s+initialize Benos UI/)
  assert.match(result.stdout, /--no-ui\s+skip Benos UI setup \(default\)/)
  assert.doesNotMatch(result.stdout, /--template/)
})

test('CLI rejects the removed template option', () => {
  const result = spawnSync(process.execPath, [cli, '--template', 'app'], {
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unknown option: --template/)
})

test('CLI rejects contradictory UI flags', () => {
  const result = spawnSync(process.execPath, [cli, '--ui', '--no-ui'], {
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Use only one of --ui or --no-ui/)
})

test('CLI requires a registry value', () => {
  const result = spawnSync(process.execPath, [cli, '--ui', '--registry'], {
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Option --registry requires a URL or file path/)
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { parsePackageManager } from '../src/process.mjs'

const cli = fileURLToPath(new URL('../src/index.mjs', import.meta.url))

test('benos help documents all supported UI commands', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /init\s+Initialize/)
  assert.match(result.stdout, /add <name\.\.\./)
  assert.match(result.stdout, /list\s+List/)
  assert.match(result.stdout, /diff \[name\]/)
  assert.match(result.stdout, /update \[name\]/)
})

test('package manager user-agent parsing recognizes the supported managers', () => {
  assert.equal(parsePackageManager('npm/11.0.0 node/v22.18.0'), 'npm')
  assert.equal(parsePackageManager('pnpm/10.17.0 npm/? node/v22.18.0'), 'pnpm')
  assert.equal(parsePackageManager('yarn/4.5.0 node/v22.18.0'), 'yarn')
  assert.equal(parsePackageManager('bun/1.2.0'), 'bun')
  assert.equal(parsePackageManager('other/1.0.0'), undefined)
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parsePackageManager } from '../src/process.mjs'

const cli = fileURLToPath(new URL('../bin/benos.mjs', import.meta.url))
const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

function runCli(args, cwd, env = process.env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  })
}

test('benos help documents all supported UI commands', () => {
  const result = runCli(['--help'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /init\s+Initialize/)
  assert.match(result.stdout, /add <name\.\.\./)
  assert.match(result.stdout, /list\s+List/)
  assert.match(result.stdout, /diff \[name\]/)
  assert.match(result.stdout, /update \[name\]/)
  assert.match(result.stdout, /info\s+Show installed versions/)
  assert.match(result.stdout, /--version, -v/)
})

test('version flags report the installed CLI package version', () => {
  for (const flag of ['--version', '-v']) {
    const result = runCli([flag])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), packageManifest.version)
  }
})

test('every command has focused help available without a project', () => {
  for (const command of ['init', 'add', 'list', 'diff', 'update', 'info']) {
    const result = runCli([command, '--help'])
    assert.equal(result.status, 0, `${command}: ${result.stderr}`)
    assert.match(result.stdout, new RegExp(`Usage: benos ${command}`))
    assert.match(result.stdout, /--help, -h/)
  }
})

test('info outside a project prints runtime details without package rows', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'benos-info-outside-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const result = runCli(['info'], temporary, {
    ...process.env,
    npm_config_user_agent: 'npm/11.0.0 node/v22.18.0 test test',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    new RegExp(`Benos CLI: ${packageManifest.version}`),
  )
  assert.match(result.stdout, /Node: v\d+/)
  assert.match(result.stdout, /Package manager: npm 11\.0\.0/)
  assert.match(result.stdout, /OS: .+/)
  assert.doesNotMatch(result.stdout, /Installed @benosjs packages/)
})

test('info lists installed @benosjs versions and warns about mismatches', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'benos-info-project-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const dependencies = {
    '@benosjs/core': '^0.2.3',
    '@benosjs/dom': '^0.2.2',
  }
  writeFileSync(
    join(temporary, 'package.json'),
    JSON.stringify({ name: 'info-fixture', dependencies }),
  )
  writeFileSync(join(temporary, 'package-lock.json'), '{}')
  for (const [name, version] of [
    ['@benosjs/core', '0.2.3'],
    ['@benosjs/dom', '0.2.2'],
  ]) {
    const packageDirectory = join(temporary, 'node_modules', name)
    mkdirSync(packageDirectory, { recursive: true })
    writeFileSync(
      join(packageDirectory, 'package.json'),
      JSON.stringify({ name, version, main: 'index.js' }),
    )
    writeFileSync(join(packageDirectory, 'index.js'), 'module.exports = {}\n')
  }

  const result = runCli(['info'], temporary, {
    ...process.env,
    npm_config_user_agent: 'pnpm/10.17.0 npm/? node/v22.18.0',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /@benosjs\/core: 0\.2\.3/)
  assert.match(result.stdout, /@benosjs\/dom: 0\.2\.2/)
  assert.match(result.stdout, /Package manager: pnpm 10\.17\.0/)
  assert.match(result.stdout, /Warning: @benosjs package versions do not match/)
})

test('package manager user-agent parsing recognizes the supported managers', () => {
  assert.equal(parsePackageManager('npm/11.0.0 node/v22.18.0'), 'npm')
  assert.equal(parsePackageManager('pnpm/10.17.0 npm/? node/v22.18.0'), 'pnpm')
  assert.equal(parsePackageManager('yarn/4.5.0 node/v22.18.0'), 'yarn')
  assert.equal(parsePackageManager('bun/1.2.0'), 'bun')
  assert.equal(parsePackageManager('other/1.0.0'), undefined)
})

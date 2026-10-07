/* global URL, process */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cli = fileURLToPath(new URL('../src/index.mjs', import.meta.url))

function createLocalRegistry() {
  const registryRoot = fileURLToPath(
    new URL('../../../registry/v1/', import.meta.url),
  )
  const index = JSON.parse(
    readFileSync(join(registryRoot, 'index.json'), 'utf8'),
  )
  const items = index.items
    .filter((item) => ['button', 'input'].includes(item.name))
    .map((item) => {
      const path = join(registryRoot, 'items', `${item.name}.json`)
      const bytes = readFileSync(path)
      return {
        ...item,
        url: pathToFileURL(path).href,
        checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      }
    })
  const value = { ...index, items }
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-registry-'))
  const localIndex = join(temporary, 'index.json')
  writeFileSync(localIndex, `${JSON.stringify(value, null, 2)}\n`)
  return { url: pathToFileURL(localIndex).href, temporary }
}

function fakeNpmEnvironment(directory, failInstall = false) {
  const fakeBin = join(directory, 'bin')
  const handler = join(directory, 'fake-npm.mjs')
  const log = join(directory, 'npm-commands.jsonl')
  mkdirSync(fakeBin)
  writeFileSync(
    handler,
    `import { appendFileSync } from 'node:fs'\nconst args = process.argv.slice(2)\nappendFileSync(process.env.BENOS_TEST_LOG, JSON.stringify(args) + '\\n')\nif (args[0] === 'run') console.log('Local: http://localhost:4173/')\nif (process.env.BENOS_TEST_FAIL_INSTALL === '1' && args[0] === 'install') { console.error('deliberate install failure'); process.exit(17) }\n`,
  )
  if (process.platform === 'win32') {
    writeFileSync(
      join(fakeBin, 'npm.cmd'),
      '@echo off\r\n"%BENOS_TEST_NODE%" "%BENOS_TEST_HANDLER%" %*\r\n',
    )
  } else {
    const executable = join(fakeBin, 'npm')
    writeFileSync(
      executable,
      '#!/bin/sh\nexec "$BENOS_TEST_NODE" "$BENOS_TEST_HANDLER" "$@"\n',
    )
    chmodSync(executable, 0o755)
  }
  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ??
    'PATH'
  return {
    log,
    env: {
      ...process.env,
      [pathKey]: `${fakeBin}${delimiter}${process.env[pathKey] ?? ''}`,
      BENOS_TEST_NODE: process.execPath,
      BENOS_TEST_HANDLER: handler,
      BENOS_TEST_LOG: log,
      BENOS_TEST_FAIL_INSTALL: failInstall ? '1' : '0',
      npm_config_user_agent: 'npm/11.0.0 node/test test-os test-arch',
    },
  }
}

test('CLI help shows optional UI flags and one curated template', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Usage: create-benos/)
  assert.match(result.stdout, /--ui\s+initialize Benos UI/)
  assert.match(result.stdout, /--no-ui\s+skip Benos UI setup \(default\)/)
  assert.match(result.stdout, /--install\s+install dependencies/)
  assert.match(result.stdout, /--no-install\s+skip dependency installation/)
  assert.match(result.stdout, /--start\s+start the dev server/)
  assert.match(result.stdout, /--no-start\s+do not start the dev server/)
  assert.match(result.stdout, /--verbose\s+show detailed Benos UI setup output/)
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

test('CLI rejects contradictory install and start flags', () => {
  const installConflict = spawnSync(
    process.execPath,
    [cli, 'app', '--install', '--no-install'],
    { encoding: 'utf8' },
  )
  assert.notEqual(installConflict.status, 0)
  assert.match(
    installConflict.stderr,
    /Use only one of --install or --no-install/,
  )

  const startConflict = spawnSync(
    process.execPath,
    [cli, 'app', '--start', '--no-start'],
    { encoding: 'utf8' },
  )
  assert.notEqual(startConflict.status, 0)
  assert.match(startConflict.stderr, /Use only one of --start or --no-start/)
})

test('non-interactive no-install and no-start print exact next steps', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-no-install-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const result = spawnSync(
    process.execPath,
    [cli, 'starter', '--no-ui', '--no-install', '--no-start'],
    {
      cwd: temporary,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_user_agent: 'npm/11.0.0 node/test test-os test-arch',
      },
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    /Next steps: cd starter && npm install && npm run dev/,
  )
  assert.doesNotMatch(
    result.stdout,
    /What is your project named\?|Add Benos UI components\?|Install with npm/,
  )
  assert.equal(existsSync(join(temporary, 'starter', 'package.json')), true)
})

test('normalizes the npm package name while keeping the directory name typed', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-name-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const result = spawnSync(
    process.execPath,
    [cli, 'Benos-ui-test', '--no-ui', '--no-install', '--no-start'],
    { cwd: temporary, encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    existsSync(join(temporary, 'Benos-ui-test', 'package.json')),
    true,
  )
  const manifest = JSON.parse(
    readFileSync(join(temporary, 'Benos-ui-test', 'package.json'), 'utf8'),
  )
  assert.equal(manifest.name, 'benos-ui-test')
  assert.equal(manifest.version, '0.0.0')
})

test('requires a package name when a folder name cannot be normalized non-interactively', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-invalid-name-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const result = spawnSync(
    process.execPath,
    [cli, '💫', '--no-ui', '--no-install', '--no-start'],
    { cwd: temporary, encoding: 'utf8' },
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Could not derive a valid npm package name/)
  assert.equal(existsSync(join(temporary, '💫')), false)
})

test('prints ordered progress and hides detailed UI output unless verbose', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-progress-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const registry = createLocalRegistry()
  context.after(() =>
    rmSync(registry.temporary, { recursive: true, force: true }),
  )
  const { env } = fakeNpmEnvironment(temporary)
  const app = join(temporary, 'progress-app')
  const result = spawnSync(
    process.execPath,
    [cli, app, '--ui', '--install', '--start', '--registry', registry.url],
    { cwd: temporary, env, encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  const steps = [
    'Scaffolding project in ',
    'Created a Benos app in ',
    'Installing dependencies with npm...',
    'Setting up Benos UI...',
    'Starting dev server with npm run dev...',
  ]
  let previous = -1
  for (const step of steps) {
    const position = result.stdout.indexOf(step)
    assert.notEqual(position, -1, `missing output step: ${step}`)
    assert.ok(position > previous, `${step} was out of order`)
    previous = position
  }
  assert.doesNotMatch(
    result.stdout,
    /Changed: benos\.json|write src\/components\/ui\/button\.tsx/,
  )

  const verboseApp = join(temporary, 'verbose-app')
  const verbose = spawnSync(
    process.execPath,
    [
      cli,
      verboseApp,
      '--ui',
      '--install',
      '--no-start',
      '--verbose',
      '--registry',
      registry.url,
    ],
    { cwd: temporary, env, encoding: 'utf8' },
  )
  assert.equal(verbose.status, 0, verbose.stderr)
  assert.match(verbose.stdout, /Changed: benos\.json/)
  assert.match(verbose.stdout, /write src\/components\/ui\/button\.tsx/)
})

test('non-interactive defaults install dependencies but never start the server', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-noninteractive-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const app = join(temporary, 'default-app')
  const { env, log } = fakeNpmEnvironment(temporary)
  const result = spawnSync(process.execPath, [cli, app], {
    cwd: temporary,
    env,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Next steps: cd .*default-app && npm run dev/)
  assert.doesNotMatch(result.stdout, /Local: http:\/\/localhost/)
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [['install']],
  )
})

test('UI opt-in without installation leaves a ready starter and manual UI steps', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-ui-manual-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const result = spawnSync(
    process.execPath,
    [cli, 'ui-starter', '--ui', '--no-install', '--no-start'],
    {
      cwd: temporary,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_user_agent: 'npm/11.0.0 node/test test-os test-arch',
      },
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    /Next steps:\s+cd ui-starter\s+npm install\s+npx benos init --yes\s+npx benos add button input --yes\s+npm run dev/,
  )
  assert.match(
    readFileSync(join(temporary, 'ui-starter', 'src', 'main.tsx'), 'utf8'),
    /@\/components\/ui\/button/,
  )
})

test('failed install preserves scaffold files and prints manual commands', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-install-failure-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const app = join(temporary, 'failed-app')
  const { env } = fakeNpmEnvironment(temporary, true)
  const result = spawnSync(
    process.execPath,
    [cli, app, '--no-ui', '--install', '--no-start'],
    { cwd: temporary, env, encoding: 'utf8' },
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Dependency installation failed/)
  assert.match(result.stderr, /deliberate install failure/)
  assert.match(result.stderr, /cd .*failed-app/)
  assert.match(result.stderr, /npm install[\s\S]*npm run dev/)
  assert.equal(existsSync(join(app, 'package.json')), true)
  assert.equal(existsSync(join(app, 'src', 'main.tsx')), true)
})

test('failed UI install preserves the UI starter and prints setup commands', (context) => {
  const temporary = mkdtempSync(
    join(tmpdir(), 'create-benos-ui-install-failure-'),
  )
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const app = join(temporary, 'failed-ui-app')
  const { env } = fakeNpmEnvironment(temporary, true)
  const result = spawnSync(
    process.execPath,
    [cli, app, '--ui', '--install', '--no-start'],
    { cwd: temporary, env, encoding: 'utf8' },
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Dependency installation failed/)
  assert.match(
    result.stderr,
    /npx benos init --yes[\s\S]*npx benos add button input --yes[\s\S]*npm run dev/,
  )
  assert.equal(existsSync(join(app, 'package.json')), true)
  assert.match(
    readFileSync(join(app, 'src', 'main.tsx'), 'utf8'),
    /@\/components\/ui\/button/,
  )
})

test('explicit non-interactive start installs first and invokes the dev script', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'create-benos-start-'))
  context.after(() => rmSync(temporary, { recursive: true, force: true }))
  const app = join(temporary, 'started-app')
  const { env, log } = fakeNpmEnvironment(temporary)
  const result = spawnSync(process.execPath, [cli, app, '--no-ui', '--start'], {
    cwd: temporary,
    env,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Local: http:\/\/localhost:4173\//)
  assert.match(result.stdout, /Development server stopped\./)
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [['install'], ['run', 'dev']],
  )
})

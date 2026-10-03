/* global console */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runCommand } from '../packages/benos/src/process.mjs'
import { createFixtureRegistry } from '../tests/fixtures/ui-registry/create.mjs'

const root = resolve(import.meta.dirname, '..')
const manager = process.env.BENOS_PACKAGE_MANAGER
const supportedManagers = new Set(['npm', 'pnpm', 'yarn', 'bun'])
if (!supportedManagers.has(manager)) {
  throw new Error('Set BENOS_PACKAGE_MANAGER to npm, pnpm, yarn, or bun.')
}
if (manager === 'yarn') {
  // CI defaults Yarn 4 to immutable installs; a new scaffold must create its lock.
  process.env.YARN_ENABLE_IMMUTABLE_INSTALLS = 'false'
}

const temporary = await mkdtemp(
  join(process.env.RUNNER_TEMP ?? tmpdir(), 'benos-ui-cli-'),
)
const app = join(temporary, 'starter')
const scaffold = resolve(root, 'packages/create-benos/src/index.mjs')
const cli = resolve(root, 'packages/benos/src/index.mjs')
const registry = await createFixtureRegistry(
  join(temporary, 'fixture-registry'),
)

try {
  const scaffoldEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key.toLowerCase() !== 'npm_config_user_agent',
    ),
  )
  scaffoldEnv.npm_config_user_agent = `${manager}/0.0.0 node/${process.versions.node}`
  await runCommand(process.execPath, [scaffold, app], {
    cwd: root,
    env: scaffoldEnv,
  })
  const generated = JSON.parse(
    await readFile(join(app, 'package.json'), 'utf8'),
  )
  if (generated.createBenosPackageManager !== manager) {
    throw new Error(
      `create-benos selected ${generated.createBenosPackageManager}; expected ${manager}.`,
    )
  }
  await runCommand(manager, ['install'], { cwd: app })
  await runCommand(
    process.execPath,
    [cli, 'init', '--yes', '--registry', registry],
    {
      cwd: app,
    },
  )
  await runCommand(process.execPath, [cli, 'list'], { cwd: app })
  await runCommand(process.execPath, [cli, 'list', '--installed'], { cwd: app })
  await runCommand(
    process.execPath,
    [cli, 'add', 'sample', '--yes', '--package-manager', manager],
    { cwd: app },
  )
  const samplePath = join(app, 'src/components/ui/sample.tsx')
  const tokenPath = join(app, 'src/styles/tokens.css')
  const sampleSource = await readFile(samplePath, 'utf8')
  if (!sampleSource.includes("import { clsx } from 'clsx'")) {
    throw new Error('benos add did not copy the sample component source.')
  }
  if (!(await readFile(tokenPath, 'utf8')).includes('--sample-action-gap')) {
    throw new Error('benos add did not copy the registry dependency file.')
  }
  const projectManifest = JSON.parse(
    await readFile(join(app, 'package.json'), 'utf8'),
  )
  if (projectManifest.dependencies?.clsx !== '^2.1.1') {
    throw new Error('benos add did not record the fixture npm dependency.')
  }
  const lock = JSON.parse(await readFile(join(app, 'benos.lock.json'), 'utf8'))
  if (
    lock.items.sample?.dependencies?.[0]?.name !== 'clsx' ||
    lock.items.tokens?.files?.[0]?.target !== 'src/styles/tokens.css'
  ) {
    throw new Error('benos add did not record registry and npm dependencies.')
  }
  const dependencyProbe =
    manager === 'yarn'
      ? ['yarn', ['node', '-p', "require.resolve('clsx')"]]
      : [process.execPath, ['-p', "require.resolve('clsx')"]]
  await runCommand(dependencyProbe[0], dependencyProbe[1], { cwd: app })
  for (const script of ['typecheck', 'build', 'test', 'lint']) {
    await runCommand(manager, ['run', script], { cwd: app })
  }

  await writeFile(
    samplePath,
    `${sampleSource}\n// local edit retained by the test\n`,
  )
  const repeatedAdd = spawnSync(
    process.execPath,
    [cli, 'add', 'sample', '--yes', '--package-manager', manager],
    { cwd: app, encoding: 'utf8' },
  )
  if (
    repeatedAdd.status === 0 ||
    !repeatedAdd.stderr.includes('Refusing to overwrite edited file') ||
    !(await readFile(samplePath, 'utf8')).includes(
      '// local edit retained by the test',
    )
  ) {
    throw new Error('benos add did not refuse to overwrite a local edit.')
  }
  console.log(`Fresh create-benos project passed with ${manager}.`)
} finally {
  if (process.env.BENOS_KEEP_TMP === '1') {
    console.log(`Kept fixture project at ${temporary}.`)
  } else {
    await rm(temporary, { recursive: true, force: true })
  }
}

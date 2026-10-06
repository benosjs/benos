/* global console */

import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import process from 'node:process'
import { runCommand } from '../packages/benos/src/process.mjs'
import { createLocalPackagesRegistry } from '../tests/fixtures/ui-registry/local-primitives-registry.mjs'

const root = resolve(fileURLToPath(new globalThis.URL('../', import.meta.url)))
const manager = process.env.BENOS_PACKAGE_MANAGER
const packageNames = ['benos']
const fixtureCoreVersion = '0.2.1'
const fixturePrimitivesVersion = '0.2.1'
const fixtureDialogVersion = '1.44.0'
const pnpmExecutable = process.env.PNPM_HOME
  ? join(
      process.env.PNPM_HOME,
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    )
  : 'pnpm'
const supportedManagers = new Set(['npm', 'pnpm', 'yarn', 'bun'])
delete process.env.npm_config_user_agent
delete process.env.NPM_CONFIG_USER_AGENT
if (!supportedManagers.has(manager)) {
  throw new Error('Set BENOS_PACKAGE_MANAGER to npm, pnpm, yarn, or bun.')
}
if (manager === 'yarn') {
  process.env.YARN_ENABLE_IMMUTABLE_INSTALLS = 'false'
  process.env.YARN_UNSAFE_HTTP_WHITELIST = '127.0.0.1'
}

const temporary = await mkdtemp(
  join(process.env.RUNNER_TEMP ?? tmpdir(), 'benos-packed-cli-'),
)
const app = join(temporary, 'fresh-project')
const previousRegistryEnvironment = {
  npm: process.env.npm_config_registry,
  NPM: process.env.NPM_CONFIG_REGISTRY,
  bun: process.env.BUN_CONFIG_REGISTRY,
  yarn: process.env.YARN_NPM_REGISTRY_SERVER,
}
let localRegistry

function packageArchiveName(manifest) {
  return `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`
}

async function packFixtureDependency(name, version) {
  const fixtureName = name.replace(/^@/, '').replaceAll('/', '-')
  const fixtureRoot = join(temporary, 'fixture-packages', fixtureName)
  await mkdir(fixtureRoot, { recursive: true })
  await writeFile(
    join(fixtureRoot, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version,
        type: 'module',
        exports: './index.js',
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(join(fixtureRoot, 'index.js'), 'export {}\n')
  await runCommand(
    'npm',
    ['pack', '--pack-destination', temporary, '--silent'],
    { cwd: fixtureRoot },
  )
  return join(temporary, packageArchiveName({ name, version }))
}

try {
  const manifests = new Map()
  const archives = []
  for (const packageName of packageNames) {
    const packageRoot = join(root, 'packages', packageName)
    const manifest = JSON.parse(
      await readFile(join(packageRoot, 'package.json'), 'utf8'),
    )
    manifests.set(packageName, manifest)
    const archive = join(temporary, packageArchiveName(manifest))
    await runCommand(
      pnpmExecutable,
      ['pack', '--pack-destination', temporary, '--silent'],
      { cwd: packageRoot },
    )
    archives.push(archive)
  }
  const fixtureArchives = await Promise.all([
    packFixtureDependency('@benosjs/core', fixtureCoreVersion),
    packFixtureDependency('@benosjs/dom', '0.2.1'),
    packFixtureDependency('@benosjs/primitives', fixturePrimitivesVersion),
    packFixtureDependency('@zag-js/dialog', fixtureDialogVersion),
  ])
  localRegistry = await createLocalPackagesRegistry([
    ...archives,
    ...fixtureArchives,
  ])
  process.env.npm_config_registry = localRegistry.url
  process.env.NPM_CONFIG_REGISTRY = localRegistry.url
  process.env.BUN_CONFIG_REGISTRY = localRegistry.url
  process.env.npm_config_audit = 'false'
  process.env.NPM_CONFIG_AUDIT = 'false'
  process.env.YARN_NPM_REGISTRY_SERVER = localRegistry.url

  const indexDirectory = join(temporary, 'registry')
  const itemsDirectory = join(indexDirectory, 'items')
  await mkdir(itemsDirectory, { recursive: true })
  const index = JSON.parse(
    await readFile(join(root, 'registry/v1/index.json'), 'utf8'),
  )
  for (const item of index.items) {
    const itemPath = join(itemsDirectory, `${item.name}.json`)
    await copyFile(
      join(root, 'registry/v1/items', `${item.name}.json`),
      itemPath,
    )
    item.url = pathToFileURL(itemPath).href
  }
  const indexPath = join(indexDirectory, 'index.json')
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`)
  const registryUrl = pathToFileURL(indexPath).href

  await mkdir(app, { recursive: true })
  await writeFile(
    join(app, 'package.json'),
    `${JSON.stringify(
      {
        name: 'benos-packed-cli-smoke',
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: {
          '@benosjs/dom': '^0.2.1',
          benos: `^${manifests.get('benos').version}`,
        },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(app, 'vite.config.ts'),
    `import { fileURLToPath, URL } from 'node:url'\nexport default { resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }\n`,
  )
  await writeFile(
    join(app, 'tsconfig.json'),
    `${JSON.stringify(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      null,
      2,
    )}\n`,
  )
  if (manager === 'yarn') {
    await writeFile(
      join(app, '.yarnrc.yml'),
      'nodeLinker: node-modules\nunsafeHttpWhitelist:\n  - 127.0.0.1\n',
    )
  }

  await runCommand(manager, ['install'], { cwd: app })
  const managerLockfiles = {
    npm: ['package-lock.json'],
    pnpm: ['pnpm-lock.yaml'],
    yarn: ['yarn.lock'],
    bun: ['bun.lock', 'bun.lockb'],
  }
  const managerLockfile = (
    await Promise.all(
      managerLockfiles[manager].map(async (file) => {
        try {
          await readFile(join(app, file))
          return file
        } catch {
          return undefined
        }
      }),
    )
  ).find(Boolean)
  if (!managerLockfile) {
    throw new Error(`${manager} did not create its expected lockfile.`)
  }
  const originalManagerLock = await readFile(join(app, managerLockfile))
  const installedPackage = JSON.parse(
    await readFile(join(app, 'node_modules/benos/package.json'), 'utf8'),
  )
  if (
    installedPackage.version !== manifests.get('benos').version ||
    installedPackage.bin?.benos !== 'bin/benos.mjs'
  ) {
    throw new Error('The fresh project did not install the packed benos CLI.')
  }

  await runCommand(
    'npx',
    ['benos', 'init', '--yes', '--registry', registryUrl],
    { cwd: app },
  )
  if (
    !(await readFile(join(app, 'benos.json'), 'utf8')).includes(registryUrl)
  ) {
    throw new Error('npx benos init did not initialize the fresh project.')
  }

  await runCommand(
    'npx',
    [
      'benos',
      'add',
      'button',
      'dialog',
      '--yes',
      '--registry',
      registryUrl,
      '--package-manager',
      manager,
    ],
    { cwd: app },
  )
  for (const [name, symbol] of [
    ['button', 'Button'],
    ['dialog', 'Dialog'],
  ]) {
    const component = await readFile(
      join(app, 'src/components/ui', `${name}.tsx`),
      'utf8',
    )
    if (!component.includes(`export function ${symbol}`)) {
      throw new Error(`npx benos add did not write the ${symbol} component.`)
    }
  }
  const lock = JSON.parse(await readFile(join(app, 'benos.lock.json'), 'utf8'))
  if (
    lock.items.button?.version !== index.release ||
    lock.items.dialog?.version !== index.release
  ) {
    throw new Error(
      'npx benos add did not record Button and Dialog in the lock.',
    )
  }
  const primitive = JSON.parse(
    await readFile(
      join(app, 'node_modules/@benosjs/primitives/package.json'),
      'utf8',
    ),
  )
  if (primitive.version !== fixturePrimitivesVersion) {
    throw new Error('benos add did not install its missing primitives package.')
  }
  const appManifest = JSON.parse(
    await readFile(join(app, 'package.json'), 'utf8'),
  )
  const savedDialogRange = appManifest.dependencies?.['@zag-js/dialog']
  if (
    appManifest.dependencies?.['@benosjs/core'] !== `^${fixtureCoreVersion}` ||
    appManifest.dependencies?.['@benosjs/primitives'] !==
      `^${fixturePrimitivesVersion}` ||
    (savedDialogRange !== fixtureDialogVersion &&
      savedDialogRange !== `^${fixtureDialogVersion}`)
  ) {
    throw new Error(
      'benos add did not record its automatically installed dependencies.',
    )
  }
  const installedCore = JSON.parse(
    await readFile(
      join(app, 'node_modules/@benosjs/core/package.json'),
      'utf8',
    ),
  )
  if (installedCore.version !== fixtureCoreVersion) {
    throw new Error('benos add did not install its missing core package.')
  }
  const updatedManagerLock = await readFile(join(app, managerLockfile))
  if (originalManagerLock.equals(updatedManagerLock)) {
    throw new Error(`npx benos add did not update the ${manager} lockfile.`)
  }
  const installedDialog = JSON.parse(
    await readFile(
      join(app, 'node_modules/@zag-js/dialog/package.json'),
      'utf8',
    ),
  )
  if (installedDialog.version !== fixtureDialogVersion) {
    throw new Error('benos add did not install the declared Zag dependency.')
  }

  const installedBin = join(
    app,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'benos.cmd' : 'benos',
  )
  await access(installedBin)
  async function runInstalledBin(args) {
    if (process.platform !== 'win32')
      return runCommand(installedBin, args, { cwd: app })
    const commandLine = `""${installedBin}" ${args.join(' ')}"`
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', commandLine],
        { cwd: app, stdio: 'inherit', windowsVerbatimArguments: true },
      )
      child.once('error', reject)
      child.once('close', (code, signal) => {
        if (code === 0) resolve({ code: 0 })
        else {
          const reason = signal ? `signal ${signal}` : `exit code ${code}`
          reject(new Error(`benos.cmd failed with ${reason}.`))
        }
      })
    })
  }
  await runInstalledBin(['list', '--installed'])
  let invalidCommand
  try {
    await runInstalledBin(['not-a-benos-command'])
  } catch (error) {
    invalidCommand = error
  }
  if (!invalidCommand?.message.includes('exit code 1')) {
    throw new Error(
      'node_modules/.bin/benos did not execute the CLI entrypoint.',
    )
  }

  console.log(`Packed benos CLI passed with ${manager}.`)
} finally {
  await localRegistry?.close()
  if (previousRegistryEnvironment.npm === undefined)
    delete process.env.npm_config_registry
  else process.env.npm_config_registry = previousRegistryEnvironment.npm
  if (previousRegistryEnvironment.NPM === undefined)
    delete process.env.NPM_CONFIG_REGISTRY
  else process.env.NPM_CONFIG_REGISTRY = previousRegistryEnvironment.NPM
  if (previousRegistryEnvironment.bun === undefined)
    delete process.env.BUN_CONFIG_REGISTRY
  else process.env.BUN_CONFIG_REGISTRY = previousRegistryEnvironment.bun
  if (previousRegistryEnvironment.yarn === undefined)
    delete process.env.YARN_NPM_REGISTRY_SERVER
  else process.env.YARN_NPM_REGISTRY_SERVER = previousRegistryEnvironment.yarn
  if (process.env.BENOS_KEEP_TMP === '1') {
    console.log(`Kept packed CLI fixture at ${temporary}.`)
  } else {
    await rm(temporary, { recursive: true, force: true })
  }
}

/* global console */

import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { clearTimeout, setTimeout } from 'node:timers'
import process from 'node:process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as pty from 'node-pty'
import { runCommand } from '../packages/benos/src/process.mjs'
import { createFixtureRegistry } from '../tests/fixtures/ui-registry/create.mjs'
import { createLocalPackagesRegistry } from '../tests/fixtures/ui-registry/local-primitives-registry.mjs'

const root = resolve(import.meta.dirname, '..')
const currentBenosVersion = JSON.parse(
  await readFile(resolve(root, 'packages/core/package.json'), 'utf8'),
).version
const manager = process.env.BENOS_PACKAGE_MANAGER
const localBenosPackages = [
  'core',
  'dom',
  'compiler',
  'vite',
  'eslint-plugin',
  'primitives',
]
const previousRegistryEnvironment = {
  npm: process.env.npm_config_registry,
  NPM: process.env.NPM_CONFIG_REGISTRY,
  bun: process.env.BUN_CONFIG_REGISTRY,
  yarn: process.env.YARN_NPM_REGISTRY_SERVER,
  yarnUnsafeHttp: process.env.YARN_UNSAFE_HTTP_WHITELIST,
}
let localRegistry
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
const app = join(temporary, 'benos-app')
const scaffold = resolve(root, 'packages/create-benos/src/index.mjs')
const cli = resolve(root, 'packages/benos/bin/benos.mjs')
const nodePtyRoot = resolve(
  dirname(fileURLToPath(import.meta.resolve('node-pty'))),
  '..',
)
const registry = await createFixtureRegistry(
  join(temporary, 'fixture-registry'),
)
const batch1RegistryDirectory = join(temporary, 'batch1-registry')
const batch1Names = [
  'button',
  'input',
  'textarea',
  'label',
  'card',
  'badge',
  'separator',
]
const batch2Names = [
  'checkbox',
  'switch',
  'radio-group',
  'select',
  'tabs',
  'accordion',
]
const batch3Names = ['dialog', 'popover', 'tooltip', 'dropdown-menu', 'toast']
const batch4Names = ['sortable-table']

function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

async function runInteractiveScaffold(
  cwd,
  env,
  packageManager,
  { declineStart = false } = {},
) {
  if (process.platform === 'darwin') {
    // node-pty 1.1.0's npm tarball omits this helper's executable bit.
    await chmod(
      join(nodePtyRoot, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'),
      0o755,
    )
  }
  const terminal = pty.spawn(process.execPath, [scaffold], {
    cwd,
    cols: 100,
    rows: 32,
    env: { ...env, TERM: 'xterm-256color' },
  })
  let output = ''
  let stage = 0
  let localUrl
  return await new Promise((resolvePromise, reject) => {
    let timeout
    let exitSubscription
    const prompts = [
      { stage: 1, text: 'What is your project named?' },
      { stage: 2, text: 'Add Benos UI components?' },
      { stage: 3, text: `Install with ${packageManager} and start now?` },
    ]
    const dataSubscription = terminal.onData((data) => {
      output += data
      const cleanOutput = stripAnsi(output)
      const nextPrompt = prompts.find(
        (prompt) =>
          prompt.stage === stage + 1 && cleanOutput.includes(prompt.text),
      )
      if (nextPrompt) {
        stage = nextPrompt.stage
        const response =
          nextPrompt.stage === 3 && declineStart ? '\u001b[B\r' : '\r'
        setTimeout(() => terminal.write(response), 80)
      }
      localUrl ??= cleanOutput.match(
        /https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?/,
      )?.[0]
      if (localUrl && !output.includes('\u0003')) {
        output += '\u0003'
        setTimeout(() => terminal.write('\u0003'), 100)
      }
    })
    const cleanup = ({ kill = false } = {}) => {
      clearTimeout(timeout)
      dataSubscription.dispose()
      exitSubscription?.dispose()
      if (kill || process.platform === 'win32') {
        try {
          terminal.kill()
        } catch {
          // A terminal that has already exited may reject a second kill.
        }
      }
    }
    timeout = setTimeout(() => {
      cleanup({ kill: true })
      reject(new Error(`Interactive create-benos timed out:\n${output}`))
    }, 150_000)
    exitSubscription = terminal.onExit(({ exitCode, signal }) => {
      cleanup()
      if (!localUrl) {
        if (!declineStart) {
          reject(
            new Error(
              `Interactive starter did not show a local URL (exit ${exitCode}, signal ${signal ?? 'none'}):\n${stripAnsi(output)}`,
            ),
          )
          return
        }
      }
      if (exitCode !== 0) {
        reject(
          new Error(
            `Interactive starter did not stop cleanly (exit ${exitCode}):\n${stripAnsi(output)}`,
          ),
        )
        return
      }
      resolvePromise({ output: stripAnsi(output), localUrl })
    })
  })
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

async function createUpdatedFixtureRegistry(sourceUrl, directory) {
  const sourceIndex = JSON.parse(await readFile(new URL(sourceUrl), 'utf8'))
  const itemsDirectory = join(directory, 'items')
  await mkdir(itemsDirectory, { recursive: true })
  const entries = []
  for (const sourceEntry of sourceIndex.items) {
    const item = JSON.parse(await readFile(new URL(sourceEntry.url), 'utf8'))
    item.release = '0.2.1'
    if (item.name === 'sample') {
      item.files = item.files.map((file) => ({
        ...file,
        content: `${file.content}\nexport const registryUpdateMarker = '0.2.1'\n`,
      }))
    }
    item.files = item.files.map((file) => ({
      ...file,
      checksum: digest(Buffer.from(file.content, 'utf8')),
    }))
    const itemBytes = Buffer.from(`${JSON.stringify(item, null, 2)}\n`)
    const itemPath = join(itemsDirectory, `${item.name}.json`)
    await writeFile(itemPath, itemBytes)
    entries.push({
      ...sourceEntry,
      url: pathToFileURL(itemPath).href,
      checksum: digest(itemBytes),
    })
  }
  const indexPath = join(directory, 'index.json')
  await writeFile(
    indexPath,
    `${JSON.stringify({ schemaVersion: 1, release: '0.2.1', items: entries }, null, 2)}\n`,
  )
  return pathToFileURL(indexPath).href
}

try {
  const packedManifests = new Map()
  for (const packageName of localBenosPackages) {
    const manifest = JSON.parse(
      await readFile(
        join(root, 'packages', packageName, 'package.json'),
        'utf8',
      ),
    )
    packedManifests.set(packageName, manifest)
    await runCommand(
      'pnpm',
      ['pack', '--pack-destination', temporary, '--silent'],
      { cwd: join(root, 'packages', packageName) },
    )
  }
  localRegistry = await createLocalPackagesRegistry(
    localBenosPackages.map((packageName) => {
      const manifest = packedManifests.get(packageName)
      return join(
        temporary,
        `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`,
      )
    }),
  )
  process.env.npm_config_registry = localRegistry.url
  process.env.NPM_CONFIG_REGISTRY = localRegistry.url
  process.env.BUN_CONFIG_REGISTRY = localRegistry.url
  process.env.YARN_NPM_REGISTRY_SERVER = localRegistry.url
  if (manager === 'yarn') {
    // Yarn 4 reads array config from a comma-separated environment value.
    process.env.YARN_UNSAFE_HTTP_WHITELIST = '127.0.0.1'
  }

  await mkdir(join(batch1RegistryDirectory, 'items'), { recursive: true })
  const batch1Index = JSON.parse(
    await readFile(resolve(root, 'registry/v1/index.json'), 'utf8'),
  )
  for (const item of batch1Index.items) {
    const itemPath = join(batch1RegistryDirectory, 'items', item.name + '.json')
    await copyFile(
      resolve(root, 'registry/v1/items', item.name + '.json'),
      itemPath,
    )
    item.url = pathToFileURL(itemPath).href
  }
  const batch1IndexPath = join(batch1RegistryDirectory, 'index.json')
  await writeFile(batch1IndexPath, JSON.stringify(batch1Index, null, 2) + '\n')
  const batch1Registry = pathToFileURL(batch1IndexPath).href
  const scaffoldEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key.toLowerCase() !== 'npm_config_user_agent',
    ),
  )
  scaffoldEnv.npm_config_user_agent = `${manager}/0.0.0 node/${process.versions.node}`
  const noUiApp = join(temporary, 'starter-no-ui')
  await runCommand(
    process.execPath,
    [scaffold, noUiApp, '--no-ui', '--no-install', '--no-start', '--yes'],
    { cwd: root, env: scaffoldEnv },
  )
  if (
    (await readFile(join(noUiApp, 'src/main.tsx'), 'utf8')).includes(
      '@/components/ui/',
    ) ||
    (await readdir(noUiApp)).includes('benos.json')
  ) {
    throw new Error('--no-ui unexpectedly initialized or imported Benos UI.')
  }
  const uiApp = join(temporary, 'starter-ui')
  const uiAppArgs = [
    scaffold,
    uiApp,
    '--ui',
    '--no-install',
    '--no-start',
    '--registry',
    batch1Registry,
  ]
  uiAppArgs.push('--yes')
  await runCommand(process.execPath, uiAppArgs, { cwd: root, env: scaffoldEnv })
  if (manager === 'yarn') {
    await writeFile(
      join(uiApp, '.yarnrc.yml'),
      `nodeLinker: node-modules\nnpmRegistryServer: ${localRegistry.url}\nnpmScopes:\n  benosjs:\n    npmRegistryServer: ${localRegistry.url}\nunsafeHttpWhitelist:\n  - 127.0.0.1\n`,
    )
  } else if (manager === 'bun') {
    await writeFile(
      join(uiApp, 'bunfig.toml'),
      `[install]\nregistry = "${localRegistry.url}"\n\n[install.scopes]\nbenosjs = "${localRegistry.url}"\n\n[install.cache]\ndisable = true\ndisableManifest = true\n`,
    )
  }
  const registryArgs = ['--registry', batch1Registry]
  await runCommand(process.execPath, [cli, 'init', '--yes', ...registryArgs], {
    cwd: uiApp,
    env: scaffoldEnv,
  })
  await runCommand(
    process.execPath,
    [
      cli,
      'add',
      'button',
      'input',
      '--yes',
      '--package-manager',
      manager,
      ...registryArgs,
    ],
    { cwd: uiApp, env: scaffoldEnv },
  )
  await runCommand(manager, ['install'], { cwd: uiApp, env: scaffoldEnv })
  for (const packageName of ['@benosjs/core', '@benosjs/dom']) {
    if (!localRegistry.servedTarballs.has(packageName)) {
      throw new Error(
        `${manager} did not install the packed ${packageName} tarball from the local registry.`,
      )
    }
    const packageRoot = join(uiApp, 'node_modules', ...packageName.split('/'))
    const packageManifest = JSON.parse(
      await readFile(join(packageRoot, 'package.json'), 'utf8'),
    )
    const typeEntry = packageManifest.exports?.['.']?.types
    if (
      packageManifest.version !== currentBenosVersion ||
      !typeEntry?.startsWith('./dist/types/')
    ) {
      throw new Error(
        `${manager} installed ${packageName} ${packageManifest.version} without the packed Benos type exports.`,
      )
    }
    await readFile(join(packageRoot, typeEntry.slice(2)))
    const nestedCore = join(
      packageRoot,
      'node_modules',
      '@benosjs',
      'core',
      'package.json',
    )
    try {
      const nestedManifest = JSON.parse(await readFile(nestedCore, 'utf8'))
      if (!nestedManifest.exports?.['./internal']?.default) {
        throw new Error(
          `${manager} installed a nested @benosjs/core without the internal export: ${JSON.stringify({ version: nestedManifest.version, exports: nestedManifest.exports })}.`,
        )
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  const uiStarter = await readFile(join(uiApp, 'src/main.tsx'), 'utf8')
  if (
    !uiStarter.includes("from '@/components/ui/button'") ||
    !uiStarter.includes("from '@/components/ui/input'")
  ) {
    throw new Error('--ui did not add Button and Input to the starter app.')
  }
  if (uiStarter.trimEnd().split(/\r?\n/).length > 150) {
    throw new Error('--ui starter should remain under 150 lines of TSX.')
  }
  const uiLock = JSON.parse(
    await readFile(join(uiApp, 'benos.lock.json'), 'utf8'),
  )
  if (!uiLock.items?.button || !uiLock.items?.input) {
    throw new Error('--ui did not record Button and Input in benos.lock.json.')
  }
  for (const script of ['typecheck', 'build', 'test', 'lint']) {
    await runCommand(manager, ['run', script], { cwd: uiApp })
  }
  const interactive = await runInteractiveScaffold(
    temporary,
    scaffoldEnv,
    manager,
  )
  if (
    !interactive.output.includes(`Detected package manager: ${manager}`) ||
    !interactive.output.includes('Development server stopped.')
  ) {
    throw new Error(
      `Interactive create-benos did not use ${manager} or stop the server cleanly:\n${interactive.output}`,
    )
  }
  const declinedRoot = join(temporary, 'declined-start')
  await mkdir(declinedRoot)
  const declined = await runInteractiveScaffold(
    declinedRoot,
    scaffoldEnv,
    manager,
    { declineStart: true },
  )
  if (
    declined.localUrl ||
    !declined.output.includes(
      `Next steps: cd benos-app && ${manager} install && ${manager} run dev`,
    )
  ) {
    throw new Error(
      `Declining startup did not print the manual next steps:\n${declined.output}`,
    )
  }
  try {
    await globalThis.fetch(interactive.localUrl)
    throw new Error(
      `Development server is still responding at ${interactive.localUrl}.`,
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Development server is still')
    ) {
      throw error
    }
  }
  const defaultStarter = await readFile(join(app, 'src/main.tsx'), 'utf8')
  if (
    defaultStarter.includes('@/components/ui/') ||
    (await readdir(app)).includes('benos.json')
  ) {
    throw new Error('Non-interactive create-benos must default to no UI.')
  }
  const generated = JSON.parse(
    await readFile(join(app, 'package.json'), 'utf8'),
  )
  if (generated.createBenosPackageManager !== manager) {
    throw new Error(
      `create-benos selected ${generated.createBenosPackageManager}; expected ${manager}.`,
    )
  }
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
  const originalSample = await readFile(samplePath, 'utf8')
  await writeFile(
    samplePath,
    `// local matrix edit\r\n${originalSample.replaceAll('\n', '\r\n')}`,
  )
  const updateRegistry = await createUpdatedFixtureRegistry(
    registry,
    join(temporary, 'registry-update'),
  )
  const diff = spawnSync(
    process.execPath,
    [cli, 'diff', 'sample', '--registry', updateRegistry],
    { cwd: app, encoding: 'utf8' },
  )
  if (diff.status !== 0 || !diff.stdout?.includes('both changed')) {
    throw new Error(
      `benos diff did not report both sides changed: ${diff.stderr ?? diff.stdout}`,
    )
  }
  await runCommand(
    process.execPath,
    [cli, 'update', 'sample', '--yes', '--registry', updateRegistry],
    { cwd: app },
  )
  const mergedSample = await readFile(samplePath, 'utf8')
  if (
    !mergedSample.includes('// local matrix edit') ||
    !mergedSample.includes("registryUpdateMarker = '0.2.1'") ||
    /[^\r]\n/.test(mergedSample)
  ) {
    throw new Error('benos update did not merge safely and preserve CRLF.')
  }
  const updatedLock = JSON.parse(
    await readFile(join(app, 'benos.lock.json'), 'utf8'),
  )
  if (updatedLock.items.sample.version !== '0.2.1') {
    throw new Error('benos update did not advance the component lock entry.')
  }
  await runCommand(
    process.execPath,
    [cli, 'add', ...batch1Names, '--yes', '--registry', batch1Registry],
    { cwd: app },
  )
  for (const name of batch1Names) {
    const component = join(app, 'src/components/ui', name + '.tsx')
    const stylesheet = join(app, 'src/styles', name + '.css')
    const componentSource = await readFile(component, 'utf8')
    const exportName = name.charAt(0).toUpperCase() + name.slice(1)
    if (!componentSource.includes('export function ' + exportName)) {
      throw new Error(
        'benos add did not copy the ' + name + ' component source.',
      )
    }
    if (!(await readFile(stylesheet, 'utf8')).includes('.benos-')) {
      throw new Error('benos add did not copy the ' + name + ' stylesheet.')
    }
  }
  const batchLock = JSON.parse(
    await readFile(join(app, 'benos.lock.json'), 'utf8'),
  )
  if (
    !batch1Names.every((name) => batchLock.items[name]?.files?.length === 2)
  ) {
    throw new Error('benos add did not record all batch 1 component files.')
  }
  if (manager === 'yarn') {
    // Yarn 4 blocks plain HTTP registries by default. This fixture registry is
    // intentionally loopback-only, so trust only its local host for this test.
    const yarnrcPath = join(app, '.yarnrc.yml')
    const yarnConfig = await readFile(yarnrcPath, 'utf8')
    await writeFile(
      yarnrcPath,
      `${yarnConfig.trimEnd()}\nunsafeHttpWhitelist:\n  - 127.0.0.1\n`,
    )
  }
  // Re-resolve from the local package feed so the same-version published
  // package cache cannot mask this checkout's pending package changes.
  await rm(join(app, 'node_modules'), { recursive: true, force: true })
  for (const lockfile of [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
  ]) {
    await rm(join(app, lockfile), { force: true })
  }
  const appPackagePath = join(app, 'package.json')
  const appPackage = JSON.parse(await readFile(appPackagePath, 'utf8'))
  appPackage.dependencies['@benosjs/core'] = `^${currentBenosVersion}`
  appPackage.dependencies['@benosjs/primitives'] = `^${currentBenosVersion}`
  await writeFile(appPackagePath, JSON.stringify(appPackage, null, 2) + '\n')
  await runCommand(manager, ['install'], { cwd: app })
  await runCommand(
    process.execPath,
    [
      cli,
      'add',
      ...batch2Names,
      '--yes',
      '--registry',
      batch1Registry,
      '--package-manager',
      manager,
    ],
    { cwd: app },
  )
  await runCommand(
    process.execPath,
    [
      cli,
      'add',
      ...batch3Names,
      '--yes',
      '--registry',
      batch1Registry,
      '--package-manager',
      manager,
    ],
    { cwd: app },
  )
  await runCommand(
    process.execPath,
    [
      cli,
      'add',
      ...batch4Names,
      '--yes',
      '--registry',
      batch1Registry,
      '--package-manager',
      manager,
    ],
    { cwd: app },
  )
  for (const name of batch2Names) {
    const component = join(app, 'src/components/ui', name + '.tsx')
    const stylesheet = join(app, 'src/styles', name + '.css')
    const componentSource = await readFile(component, 'utf8')
    const exportName =
      name === 'radio-group'
        ? 'RadioGroup'
        : name.charAt(0).toUpperCase() + name.slice(1)
    if (!componentSource.includes('export function ' + exportName)) {
      throw new Error(
        'benos add did not copy the ' + name + ' component source.',
      )
    }
    if (!(await readFile(stylesheet, 'utf8')).includes('.benos-')) {
      throw new Error('benos add did not copy the ' + name + ' stylesheet.')
    }
  }
  const allComponentsLock = JSON.parse(
    await readFile(join(app, 'benos.lock.json'), 'utf8'),
  )
  if (
    !batch2Names.every(
      (name) => allComponentsLock.items[name]?.files?.length === 2,
    )
  ) {
    throw new Error('benos add did not record all batch 2 component files.')
  }
  for (const name of batch3Names) {
    const component = join(app, 'src/components/ui', name + '.tsx')
    const stylesheet = join(app, 'src/styles', name + '.css')
    const componentSource = await readFile(component, 'utf8')
    const exportName =
      {
        'dropdown-menu': 'DropdownMenu',
      }[name] ?? name.charAt(0).toUpperCase() + name.slice(1)
    if (!componentSource.includes('export function ' + exportName)) {
      throw new Error(
        'benos add did not copy the ' + name + ' component source.',
      )
    }
    if (!(await readFile(stylesheet, 'utf8')).includes('.benos-')) {
      throw new Error('benos add did not copy the ' + name + ' stylesheet.')
    }
  }
  const overlaysLock = JSON.parse(
    await readFile(join(app, 'benos.lock.json'), 'utf8'),
  )
  if (
    !batch3Names.every(
      (name) => overlaysLock.items[name]?.files?.length === 2,
    ) ||
    overlaysLock.items['overlay-host']?.files?.length !== 1 ||
    !(
      await readFile(join(app, 'src/components/ui/overlay-host.ts'), 'utf8')
    ).includes('benosOverlayHost')
  ) {
    throw new Error(
      'benos add did not install overlay components with their shared host dependency.',
    )
  }
  for (const name of batch4Names) {
    const component = join(app, 'src/components/ui', name + '.tsx')
    const stylesheet = join(app, 'src/styles', name + '.css')
    if (
      !(await readFile(component, 'utf8')).includes(
        'export function SortableTable',
      )
    ) {
      throw new Error('benos add did not copy the sortable table component.')
    }
    if (
      !(await readFile(stylesheet, 'utf8')).includes('.benos-sortable-table')
    ) {
      throw new Error('benos add did not copy the sortable table stylesheet.')
    }
  }
  const batch4Lock = JSON.parse(
    await readFile(join(app, 'benos.lock.json'), 'utf8'),
  )
  if (batch4Lock.items['sortable-table']?.files?.length !== 2) {
    throw new Error('benos add did not record sortable-table files.')
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
  if (previousRegistryEnvironment.yarnUnsafeHttp === undefined)
    delete process.env.YARN_UNSAFE_HTTP_WHITELIST
  else
    process.env.YARN_UNSAFE_HTTP_WHITELIST =
      previousRegistryEnvironment.yarnUnsafeHttp
  if (process.env.BENOS_KEEP_TMP === '1') {
    console.log(`Kept fixture project at ${temporary}.`)
  } else {
    await rm(temporary, { recursive: true, force: true })
  }
}

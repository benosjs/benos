/* global console, process, URL */

import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const currentBenosVersion = JSON.parse(
  await readFile(resolve(root, 'packages/core/package.json'), 'utf8'),
).version
const packageDirectories = [
  'core',
  'dom',
  'compiler',
  'vite',
  'eslint-plugin',
  'benos',
  'create-benos',
]
const temporary = await mkdtemp(join(tmpdir(), 'benos-template-audit-'))
const archives = join(temporary, 'archives')
const extractedCreator = join(temporary, 'creator')
const app = join(temporary, 'app')
const pnpmCli =
  process.platform === 'win32' && process.env.PNPM_HOME
    ? resolve(process.env.PNPM_HOME, '..', 'pnpm', 'bin', 'pnpm.cjs')
    : undefined

async function run(command, args, options = {}) {
  return runFile(command, args, { windowsHide: true, ...options })
}

async function runPnpm(args, options = {}) {
  if (pnpmCli) return run(process.execPath, [pnpmCli, ...args], options)
  return run('pnpm', args, options)
}

async function runNpm(args, options = {}) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return run(command, args, {
    shell: process.platform === 'win32',
    ...options,
  })
}

function localArchivePath(from, archive) {
  return `file:${relative(from, archive).replaceAll('\\', '/')}`
}

try {
  await Promise.all([mkdir(archives), mkdir(extractedCreator)])
  const archiveByPackage = new Map()
  for (const packageDirectory of packageDirectories) {
    const destination = join(archives, packageDirectory)
    await mkdir(destination)
    await runPnpm(['pack', '--pack-destination', destination, '--silent'], {
      cwd: join(root, 'packages', packageDirectory),
    })
    const files = await readdir(destination)
    const archive = files.find((file) => file.endsWith('.tgz'))
    if (!archive) throw new Error(`Failed to pack ${packageDirectory}`)
    archiveByPackage.set(packageDirectory, join(destination, archive))
  }

  const createArchive = archiveByPackage.get('create-benos')
  if (!createArchive) throw new Error('create-benos archive is missing')
  const benosArchive = archiveByPackage.get('benos')
  if (!benosArchive) throw new Error('benos CLI archive is missing')
  await run('tar', ['-xzf', createArchive, '-C', extractedCreator], {
    cwd: root,
  })
  const creatorPackage = join(extractedCreator, 'package')
  const creatorManifestPath = join(creatorPackage, 'package.json')
  const creatorManifest = JSON.parse(
    await readFile(creatorManifestPath, 'utf8'),
  )
  creatorManifest.pnpm = {
    overrides: {
      ...creatorManifest.pnpm?.overrides,
      benos: localArchivePath(creatorPackage, benosArchive),
    },
  }
  await writeFile(
    creatorManifestPath,
    `${JSON.stringify(creatorManifest, null, 2)}\n`,
  )
  await runPnpm(['install', '--ignore-scripts'], { cwd: creatorPackage })
  const cli = join(creatorPackage, 'src', 'index.mjs')
  await run(process.execPath, [cli, app, '--no-install', '--no-start'], {
    cwd: root,
  })

  const packageFile = join(app, 'package.json')
  const metadata = JSON.parse(await readFile(packageFile, 'utf8'))
  const packageNames = {
    core: '@benosjs/core',
    dom: '@benosjs/dom',
    compiler: '@benosjs/compiler',
    vite: '@benosjs/vite',
    'eslint-plugin': '@benosjs/eslint-plugin',
  }
  for (const [directory, name] of Object.entries(packageNames)) {
    const dependencySet = metadata.dependencies?.[name]
      ? metadata.dependencies
      : metadata.devDependencies
    if (dependencySet?.[name] !== `^${currentBenosVersion}`) {
      throw new Error(
        `Scaffold must declare ${name} as ^${currentBenosVersion} before the local-pack override`,
      )
    }
    const archive = archiveByPackage.get(directory)
    if (!archive) throw new Error(`Packed dependency ${directory} is missing`)
    dependencySet[name] = localArchivePath(app, archive)
  }
  await writeFile(packageFile, `${JSON.stringify(metadata, null, 2)}\n`)

  const installed = await runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: app },
  )
  const installOutput = `${installed.stdout}\n${installed.stderr}`
  if (/EBADENGINE|npm (?:WARN|warn) deprecated/i.test(installOutput)) {
    throw new Error(
      `Fresh scaffold install emitted an engine or deprecation warning:\n${installOutput}`,
    )
  }
  console.log(
    'Fresh packed scaffold install emitted no engine or deprecation warnings.',
  )

  try {
    const audit = await runNpm(['audit', '--audit-level=high'], { cwd: app })
    console.log(
      audit.stdout.trim() ||
        'Fresh scaffold npm audit passed (no high or critical advisories).',
    )
  } catch (error) {
    const failure = error
    throw new Error(
      `Fresh scaffold npm audit found high or critical advisories:\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`,
      { cause: error },
    )
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}

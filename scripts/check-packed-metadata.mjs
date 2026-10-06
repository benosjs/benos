/* global URL, console */

import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const publishable = [
  'core',
  'dom',
  'compiler',
  'vite',
  'eslint-plugin',
  'primitives',
  'benos',
  'create-benos',
]
const cliPackages = new Set(['benos', 'create-benos'])
const testOnlyDependencies = new Set([
  '@playwright/test',
  '@vitest/coverage-v8',
  'axe-core',
  'expect-type',
  'fast-check',
  'happy-dom',
  'node-pty',
  'vitest',
])
const isTestOnlyDependency = (dependency) =>
  testOnlyDependencies.has(dependency) ||
  dependency.startsWith('@playwright/') ||
  dependency.startsWith('@vitest/')

const workspaceManifest = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
)
for (const dependency of testOnlyDependencies) {
  if (
    !workspaceManifest.devDependencies?.[dependency] ||
    workspaceManifest.dependencies?.[dependency]
  ) {
    throw new Error(
      `Test-only tooling ${dependency} must be a root devDependency only`,
    )
  }
}

const temporary = await mkdtemp(join(tmpdir(), 'benos-packed-metadata-'))

try {
  for (const packageDirectory of publishable) {
    const destination = join(temporary, packageDirectory)
    await mkdir(destination)
    const packageRoot = join(root, 'packages', packageDirectory)
    await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], {
      cwd: packageRoot,
    })
    const archives = (await readdir(destination)).filter((file) =>
      file.endsWith('.tgz'),
    )
    if (archives.length !== 1)
      throw new Error(`Expected one packed archive for ${packageDirectory}`)

    const archive = join(destination, archives[0])
    const { stdout: listing } = await run('tar', ['-tf', archive], {
      cwd: root,
    })
    const entries = listing
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const packageEntries = new Set(
      entries.map((entry) => entry.replace(/^package\//, '')),
    )
    const forbidden = entries.filter((entry) => {
      const path = entry.replace(/^package\//, '')
      return (
        path.endsWith('.tsbuildinfo') ||
        /^dist\/index(?:\.[^/]+)?(?:\.map)?$/.test(path)
      )
    })
    if (forbidden.length) {
      throw new Error(
        `Packed ${packageDirectory} includes forbidden build artifacts: ${forbidden.join(', ')}`,
      )
    }
    if (cliPackages.has(packageDirectory)) {
      const nativeModules = entries.filter((entry) => {
        const path = entry.replace(/^package\//, '')
        return (
          path.endsWith('.node') || path.split('/').includes('node_modules')
        )
      })
      if (nativeModules.length) {
        throw new Error(
          `Packed ${packageDirectory} includes native or installed modules: ${nativeModules.join(', ')}`,
        )
      }
    }
    const manifests = listing
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.endsWith('package.json'))
    if (manifests.length === 0)
      throw new Error(`Packed ${packageDirectory} has no package.json`)
    for (const manifest of manifests) {
      const { stdout } = await run('tar', ['-xOf', archive, manifest], {
        cwd: root,
      })
      if (stdout.includes('workspace:')) {
        throw new Error(
          `Packed ${packageDirectory}/${manifest} contains a workspace: dependency`,
        )
      }
      const metadata = JSON.parse(stdout)
      if (manifest === 'package/package.json') {
        const completeMetadata =
          typeof metadata.description === 'string' &&
          typeof metadata.repository?.url === 'string' &&
          metadata.license === 'MIT' &&
          Array.isArray(metadata.keywords) &&
          metadata.keywords.length > 0 &&
          typeof metadata.homepage === 'string' &&
          typeof metadata.bugs?.url === 'string'
        if (!completeMetadata) {
          throw new Error(
            `Packed ${packageDirectory} is missing release metadata`,
          )
        }
        for (const requiredFile of ['README.md', 'LICENSE']) {
          if (!packageEntries.has(requiredFile)) {
            throw new Error(
              `Packed ${packageDirectory} is missing ${requiredFile}`,
            )
          }
        }
        const { stdout: readme } = await run(
          'tar',
          ['-xOf', archive, 'package/README.md'],
          { cwd: root },
        )
        if (
          !/!\[Benos logo\]\(https:\/\/raw\.githubusercontent\.com\/benosjs\/benos\/main\/assets\/brand\/[^)]+\)/.test(
            readme,
          )
        ) {
          throw new Error(
            `Packed ${packageDirectory} README is missing the absolute GitHub logo URL`,
          )
        }
      }
      if (
        cliPackages.has(packageDirectory) &&
        manifest === 'package/package.json'
      ) {
        const packageTestDependencies = Object.keys({
          ...metadata.dependencies,
          ...metadata.devDependencies,
          ...metadata.optionalDependencies,
          ...metadata.peerDependencies,
        }).filter(isTestOnlyDependency)
        if (packageTestDependencies.length) {
          throw new Error(
            `Packed ${packageDirectory} package manifest includes test-only tooling: ${packageTestDependencies.join(', ')}`,
          )
        }
      }
      for (const section of [
        'dependencies',
        'optionalDependencies',
        'peerDependencies',
      ]) {
        const invalidTestDependencies = Object.keys(
          metadata[section] ?? {},
        ).filter(isTestOnlyDependency)
        if (invalidTestDependencies.length) {
          throw new Error(
            `Packed ${packageDirectory}/${manifest} puts test-only tooling in ${section}: ${invalidTestDependencies.join(', ')}`,
          )
        }
      }
      if (metadata.devDependencies) {
        const invalidDevDependencies = Object.keys(
          metadata.devDependencies,
        ).filter((dependency) => dependency === 'node-pty')
        if (invalidDevDependencies.length) {
          throw new Error(
            `Packed ${packageDirectory}/${manifest} includes workspace-only native test tooling: ${invalidDevDependencies.join(', ')}`,
          )
        }
      }
      const exports = metadata.exports
      if (exports) {
        const targets = []
        const collectTargets = (value) => {
          if (typeof value === 'string') targets.push(value)
          else if (value && typeof value === 'object')
            for (const target of Object.values(value)) collectTargets(target)
        }
        collectTargets(exports)
        for (const target of targets) {
          if (
            !target.startsWith('./dist/js/') &&
            !target.startsWith('./dist/types/')
          )
            throw new Error(
              `Packed ${packageDirectory} exports outside dist/js or dist/types: ${target}`,
            )
          if (!packageEntries.has(target.slice(2)))
            throw new Error(
              `Packed ${packageDirectory} export target is missing: ${target}`,
            )
        }
      }
    }
  }
  console.log(
    `Packed metadata check passed for ${publishable.length} publishable packages`,
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

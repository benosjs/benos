/* global console */

import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { arch, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { detectPackageManager } from './process.mjs'
import { findProjectRoot, readJson } from './project.mjs'

const BENOS_PACKAGES = [
  '@benosjs/core',
  '@benosjs/dom',
  '@benosjs/compiler',
  '@benosjs/vite',
  '@benosjs/eslint-plugin',
  '@benosjs/primitives',
]

function operatingSystem() {
  const name =
    { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[platform()] ??
    platform()
  return `${name} ${release()} (${arch()})`
}

function managerFromEnvironment() {
  const userAgent = process.env.npm_config_user_agent ?? ''
  const match = /^(npm|pnpm|yarn|bun)\/([^\s]+)/.exec(userAgent)
  if (match) return `${match[1]} ${match[2]}`

  const executable = process.env.npm_execpath ?? process.env.NPM_CLI_JS ?? ''
  const basename = executable.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''
  return (
    ['pnpm', 'yarn', 'bun', 'npm'].find(
      (name) =>
        basename === name ||
        basename.startsWith(`${name}-`) ||
        basename.startsWith(`${name}.`),
    ) ?? 'unknown'
  )
}

function managerVersionFromEnvironment(manager) {
  const userAgent = process.env.npm_config_user_agent ?? ''
  const escapedManager = manager.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\s)${escapedManager}/([^\\s]+)`).exec(
    userAgent,
  )
  return match?.[1]
}

async function installedVersion(root, name, declared) {
  const requireFromProject = createRequire(resolve(root, 'package.json'))
  const manifestPaths = []
  let packageResolutionError
  try {
    manifestPaths.push(requireFromProject.resolve(`${name}/package.json`))
  } catch (error) {
    packageResolutionError = error
  }

  for (const modulesPath of requireFromProject.resolve.paths(name) ?? []) {
    manifestPaths.push(resolve(modulesPath, name, 'package.json'))
  }

  let packageFound = false
  let readError = packageResolutionError
  for (const manifestPath of new Set(manifestPaths)) {
    try {
      await access(dirname(manifestPath))
      packageFound = true
    } catch (error) {
      if (error.code !== 'ENOENT') readError = error
      continue
    }

    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (manifest.name !== name || typeof manifest.version !== 'string') {
        return {
          version: 'unavailable',
          warning: `${name}/package.json has no matching package name and version.`,
        }
      }
      return { version: manifest.version }
    } catch (error) {
      readError = error
    }
  }

  if (!declared && !packageFound) return undefined
  const reason = readError?.message ?? 'the package manifest was not found'
  return {
    version: 'unavailable',
    warning: `Could not read ${name}/package.json (${reason}).`,
  }
}

async function declaredBenosPackages(root) {
  try {
    const manifest = await readJson(resolve(root, 'package.json'))
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    return new Set(
      BENOS_PACKAGES.filter((name) => Object.hasOwn(dependencies, name)),
    )
  } catch {
    return new Set()
  }
}

async function hasBenosProject(root) {
  try {
    await readFile(resolve(root, 'benos.json'))
    return true
  } catch {
    // A Benos package dependency is also enough to identify the project.
  }
  return (await declaredBenosPackages(root)).size > 0
}

export async function printInfo(cliVersion, cwd = process.cwd()) {
  let root
  try {
    root = await findProjectRoot(cwd)
  } catch {
    // info is useful even when called outside a project.
  }

  const environmentManager = managerFromEnvironment()
  let manager = environmentManager
  if (root) {
    try {
      const detected = await detectPackageManager(root)
      if (detected) {
        manager = managerVersionFromEnvironment(detected)
          ? `${detected} ${managerVersionFromEnvironment(detected)}`
          : detected
      }
    } catch {
      manager = 'unknown (conflicting lockfiles)'
    }
  }

  const lines = [
    `Benos CLI: ${cliVersion}`,
    `Node: ${process.version}`,
    `Package manager: ${manager}`,
    `OS: ${operatingSystem()}`,
  ]

  if (!root || !(await hasBenosProject(root))) {
    console.log(lines.join('\n'))
    return
  }

  const versions = []
  const declared = await declaredBenosPackages(root)
  for (const name of BENOS_PACKAGES) {
    const installed = await installedVersion(root, name, declared.has(name))
    if (installed) versions.push({ name, ...installed })
  }
  const rootLabel = root === resolve(cwd) ? '.' : root
  lines.splice(0, 0, `Benos project: ${rootLabel}`)
  lines.splice(
    1,
    0,
    `Installed @benosjs packages: ${versions.length ? '' : 'none installed'}`,
  )
  if (versions.length) {
    lines.splice(
      2,
      0,
      ...versions.map(({ name, version }) => `  ${name}: ${version}`),
    )
    const readableVersions = versions.filter(
      ({ version }) => version !== 'unavailable',
    )
    const baseline =
      readableVersions.find(({ name }) => name === '@benosjs/core')?.version ??
      readableVersions[0]?.version
    const mismatched = baseline
      ? readableVersions.filter(({ version }) => version !== baseline)
      : []
    if (mismatched.length) {
      lines.push(
        `Warning: @benosjs package versions do not match ${baseline}: ${mismatched
          .map(({ name, version }) => `${name}@${version}`)
          .join(', ')}.`,
      )
    }
  }
  for (const { warning } of versions) {
    if (warning) lines.push(`Warning: ${warning}`)
  }
  console.log(lines.join('\n'))
}

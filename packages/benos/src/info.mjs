/* global console */

import { readFile } from 'node:fs/promises'
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

async function installedVersion(root, name) {
  const requireFromProject = createRequire(resolve(root, 'package.json'))
  let entry
  try {
    entry = requireFromProject.resolve(name)
  } catch {
    return undefined
  }

  let directory = dirname(entry)
  for (;;) {
    try {
      const manifest = JSON.parse(
        await readFile(resolve(directory, 'package.json'), 'utf8'),
      )
      if (manifest.name === name) return manifest.version
    } catch {
      // Keep walking from an exported entrypoint to its package root.
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

async function hasBenosProject(root) {
  try {
    await readFile(resolve(root, 'benos.json'))
    return true
  } catch {
    // A Benos package dependency is also enough to identify the project.
  }
  try {
    const manifest = await readJson(resolve(root, 'package.json'))
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    return BENOS_PACKAGES.some((name) => Object.hasOwn(dependencies, name))
  } catch {
    return false
  }
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
  for (const name of BENOS_PACKAGES) {
    const version = await installedVersion(root, name)
    if (version) versions.push({ name, version })
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
    const baseline =
      versions.find(({ name }) => name === '@benosjs/core')?.version ??
      versions[0].version
    const mismatched = versions.filter(({ version }) => version !== baseline)
    if (mismatched.length) {
      lines.push(
        `Warning: @benosjs package versions do not match ${baseline}: ${mismatched
          .map(({ name, version }) => `${name}@${version}`)
          .join(', ')}.`,
      )
    }
  }
  console.log(lines.join('\n'))
}

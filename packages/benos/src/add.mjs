/* global console */

import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
  unlink,
} from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import semver from 'semver'
import {
  confirmPlan,
  ensureTargetStaysInRoot,
  findProjectRoot,
  resolveConfigTarget,
} from './project.mjs'
import {
  detectPackageManager,
  packageManagerArgs,
  runManagerInstall,
} from './process.mjs'
import { cacheResolvedResources, loadIndex, resolveItems } from './registry.mjs'
import {
  readApplication,
  readUiConfig,
  readUiLock,
  writeJsonAtomic,
} from './cli-utils.mjs'

const PACKAGE_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/

function validateDependencies(item) {
  if (!Array.isArray(item.dependencies))
    throw new Error(`Registry item ${item.name} dependencies must be an array.`)
  const dependencies = new Map()
  for (const dependency of item.dependencies) {
    if (
      !dependency ||
      typeof dependency !== 'object' ||
      typeof dependency.name !== 'string' ||
      !PACKAGE_NAME.test(dependency.name) ||
      typeof dependency.version !== 'string' ||
      !semver.validRange(dependency.version)
    ) {
      throw new Error(
        `Registry item ${item.name} has an invalid npm dependency.`,
      )
    }
    const prior = dependencies.get(dependency.name)
    if (prior && prior !== dependency.version)
      throw new Error(
        `Registry dependency ${dependency.name} has conflicting ranges.`,
      )
    dependencies.set(dependency.name, dependency.version)
  }
  return dependencies
}

async function checkCaseCollision(root, path) {
  const segments = relative(root, path).split(sep)
  let parent = root
  for (const segment of segments) {
    let entries
    try {
      entries = await readdir(parent)
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    const existing = entries.find(
      (entry) => entry.toLowerCase() === segment.toLowerCase(),
    )
    if (existing && existing !== segment) {
      throw new Error(
        `Case-insensitive path collision with ${resolve(parent, existing)}.`,
      )
    }
    if (!existing) return
    parent = resolve(parent, existing)
  }
}

function addDependenciesToPlan(allItems) {
  const dependencies = new Map()
  for (const { item } of allItems) {
    for (const [name, version] of validateDependencies(item)) {
      const prior = dependencies.get(name)
      if (prior && prior !== version)
        throw new Error(
          `Registry items require conflicting ranges for ${name}.`,
        )
      dependencies.set(name, version)
    }
  }
  return dependencies
}

function installedDependencyCovers(installed, requested) {
  if (installed === requested) return true
  const installedRange = semver.validRange(installed)
  const requestedRange = semver.validRange(requested)
  return Boolean(
    installedRange &&
    requestedRange &&
    semver.subset(installedRange, requestedRange),
  )
}

async function planFiles(root, config, allItems) {
  const planned = new Map()
  const plannedCase = new Map()
  for (const { item } of allItems) {
    const itemPaths = new Set()
    for (const file of item.files) {
      const target = resolveConfigTarget(root, config, file.target)
      if (itemPaths.has(target.relative))
        throw new Error(
          `Registry item ${item.name} repeats target ${target.relative}.`,
        )
      itemPaths.add(target.relative)
      await ensureTargetStaysInRoot(root, target)
      await checkCaseCollision(root, target.absolute)
      const caseKey = target.relative.toLowerCase()
      const casePrevious = plannedCase.get(caseKey)
      if (casePrevious && casePrevious !== target.relative) {
        throw new Error(
          `Case-insensitive registry path collision: ${casePrevious} and ${target.relative}.`,
        )
      }
      plannedCase.set(caseKey, target.relative)
      const previous = planned.get(target.relative)
      if (previous && previous.item !== item.name) {
        throw new Error(
          `Registry items ${previous.item} and ${item.name} share destination ${target.relative}.`,
        )
      }
      if (previous && previous.content !== file.content) {
        throw new Error(
          `Registry item ${item.name} conflicts at ${target.relative}.`,
        )
      }
      if (!previous)
        planned.set(target.relative, {
          ...target,
          content: file.content,
          item: item.name,
        })
    }
  }

  const writes = []
  for (const [relative, target] of planned) {
    try {
      const stat = await lstat(target.absolute)
      if (stat.isSymbolicLink()) await ensureTargetStaysInRoot(root, target)
      const existing = await readFile(target.absolute, 'utf8')
      if (existing !== target.content)
        throw new Error(`Refusing to overwrite edited file: ${relative}`)
    } catch (error) {
      if (error.code === 'ENOENT') writes.push(target)
      else throw error
    }
  }
  return { planned, writes }
}

async function readInstalledBenosVersion(root, name) {
  const manifestPath = resolve(
    root,
    'node_modules',
    ...name.split('/'),
    'package.json',
  )
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw new Error(
      `Cannot read installed package metadata at ${manifestPath}: ${error.message}`,
      { cause: error },
    )
  }
  if (
    manifest.name !== name ||
    typeof manifest.version !== 'string' ||
    !semver.valid(manifest.version)
  )
    throw new Error(
      `Installed package metadata for ${name} is invalid at ${manifestPath}.`,
    )
  return manifest.version
}

async function assertMinimumBenosVersions(root, allItems, options) {
  const requirements = new Map()
  for (const { item } of allItems) {
    for (const requirement of item.minimumBenosVersions) {
      const previous = requirements.get(requirement.name)
      if (!previous || semver.gt(requirement.version, previous.version)) {
        requirements.set(requirement.name, {
          version: requirement.version,
          items: new Set([item.name]),
        })
      } else if (semver.eq(requirement.version, previous.version)) {
        previous.items.add(item.name)
      }
    }
  }
  if (requirements.size === 0) return

  const manager =
    (await detectPackageManager(root, options.packageManager)) ?? 'npm'
  for (const [name, requirement] of requirements) {
    const installed = await readInstalledBenosVersion(root, name)
    if (installed && semver.gte(installed, requirement.version)) continue
    const [command, args] = packageManagerArgs(manager, [
      `${name}@^${requirement.version}`,
    ])
    const itemNames = [...requirement.items].join(', ')
    const current = installed
      ? `${name}@${installed}`
      : `${name} (not installed)`
    throw new Error(
      `Cannot add ${itemNames}: it requires ${name} >=${requirement.version}, but the project has ${current}. Upgrade it before adding component files:
  ${command} ${args.join(' ')}`,
    )
  }
}

function packageManagerHelp() {
  return 'No package-manager choice is clear. Pass --package-manager npm|pnpm|yarn|bun.'
}

export async function addItems(options) {
  const root = await findProjectRoot(options.cwd ?? process.cwd())
  const config = await readUiConfig(root)
  const lock = await readUiLock(root)
  const { packageJson } = await readApplication(root)
  const requested = [...new Set(options.names)]
  if (requested.length === 0)
    throw new Error('Usage: benos add <name...> [--yes]')
  if (requested.some((name) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)))
    throw new Error('Registry item names must be lowercase kebab-case.')

  const registryUrl = options.registry ?? config.registry
  const indexResource = await loadIndex(root, registryUrl, { deferCache: true })
  const resolved = await resolveItems(root, indexResource.index, requested, {
    deferCache: true,
  })
  await assertMinimumBenosVersions(root, resolved, options)
  await cacheResolvedResources(root, indexResource, resolved)
  const { planned, writes } = await planFiles(root, config, resolved)
  const packageDependencies = addDependenciesToPlan(resolved)
  const currentDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }
  const dependencyAdds = []
  for (const [name, version] of packageDependencies) {
    const installed = currentDependencies[name]
    if (installed === undefined) dependencyAdds.push(`${name}@${version}`)
    else if (!installedDependencyCovers(installed, version)) {
      throw new Error(
        `${name} is declared as ${installed}, but the registry needs ${version}. Resolve the package range manually; Benos will not downgrade or replace it.`,
      )
    }
  }

  const lockAlreadyMatches = resolved.every(({ entry, item }) => {
    const installed = lock.items[item.name]
    return (
      installed?.version === item.release &&
      installed?.checksum === entry.checksum
    )
  })
  if (
    writes.length === 0 &&
    dependencyAdds.length === 0 &&
    lockAlreadyMatches
  ) {
    console.log(`Already up to date: ${requested.join(', ')}.`)
    return
  }

  let manager
  if (dependencyAdds.length > 0) {
    manager = await detectPackageManager(root, options.packageManager)
    if (!manager) throw new Error(packageManagerHelp())
  }

  const planLines = [
    ...[...planned.keys()].map(
      (path) =>
        `${writes.some((file) => file.relative === path) ? 'write' : 'keep'} ${path}`,
    ),
    ...dependencyAdds.map((dependency) => `install ${dependency}`),
    ...resolved.map(({ item }) => `record ${item.name}@${item.release}`),
  ]
  console.log(
    `Registry ${indexResource.index.release}:\n${planLines.join('\n')}`,
  )
  if (planLines.length === 0) return
  await confirmPlan('Apply this non-destructive plan?', options.yes)

  const created = []
  try {
    for (const target of writes) {
      await mkdir(dirname(target.absolute), { recursive: true })
      await writeFile(target.absolute, target.content, { flag: 'wx' })
      created.push(target)
    }

    const nextLock = {
      schemaVersion: 1,
      items: { ...lock.items },
    }
    for (const { entry, item } of resolved) {
      const fileRecords = item.files.map((file) => {
        const target = resolveConfigTarget(root, config, file.target)
        return {
          path: file.path,
          target: target.relative,
          checksum: file.checksum,
        }
      })
      nextLock.items[item.name] = {
        version: item.release,
        checksum: entry.checksum,
        baseUrl: entry.url,
        title: item.title,
        description: item.description,
        dependencies: item.dependencies,
        registryDependencies: item.registryDependencies,
        files: fileRecords,
      }
    }
    await writeJsonAtomic(resolve(root, 'benos.lock.json'), nextLock)
  } catch (error) {
    for (const target of created.reverse()) {
      try {
        const contents = await readFile(target.absolute, 'utf8')
        if (contents === target.content) await unlink(target.absolute)
      } catch {
        // Preserve anything changed after Benos wrote it.
      }
    }
    throw error
  }
  if (dependencyAdds.length > 0) {
    console.log(`Installing registry dependencies with ${manager}...`)
    try {
      await runManagerInstall(manager, dependencyAdds, root)
    } catch (error) {
      const [command, args] = packageManagerArgs(manager, dependencyAdds)
      console.error(
        `Component files and lock entries were written. Install dependencies manually with: ${command} ${args.join(' ')}`,
      )
      throw error
    }
  }
  console.log(`Added ${resolved.map(({ item }) => item.name).join(', ')}.`)
}

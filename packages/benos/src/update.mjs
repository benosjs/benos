/* global console */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import semver from 'semver'
import { TextDecoder } from 'node:util'
import { assertMinimumBenosVersions } from './add.mjs'
import { readApplication, readUiConfig, readUiLock } from './cli-utils.mjs'
import {
  findProjectRoot,
  resolveConfigTarget,
  ensureTargetStaysInRoot,
  confirmPlan,
} from './project.mjs'
import {
  cacheResolvedResources,
  loadIndex,
  loadPinnedItem,
  resolveItems,
} from './registry.mjs'
import { mergeText } from './merge3.mjs'
import {
  applyComponentTransaction,
  recoverIncompleteUpdates,
} from './transactions.mjs'

async function readLocal(root, relativeTarget) {
  const absolute = resolve(root, ...relativeTarget.split('/'))
  const rel = relative(resolve(root), absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(`Component target escapes project root: ${relativeTarget}`)
  const target = { absolute, relative: relativeTarget }
  await ensureTargetStaysInRoot(root, target)
  try {
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(`Refusing non-regular component file: ${relativeTarget}`)
    return await readFile(absolute)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function fileMap(files, component, version) {
  const map = new Map()
  for (const file of files) {
    if (map.has(file.path))
      throw new Error(
        `Duplicate source file ${component}/${file.path} in ${version}.`,
      )
    map.set(file.path, file)
  }
  return map
}

function lockRecord(entry, item, config, root) {
  return {
    version: item.release,
    checksum: entry.checksum,
    baseUrl: entry.url,
    title: item.title,
    description: item.description,
    dependencies: item.dependencies,
    registryDependencies: item.registryDependencies,
    files: item.files.map((file) => ({
      path: file.path,
      target: resolveConfigTarget(root, config, file.target).relative,
      checksum: file.checksum,
    })),
  }
}

function displayName(item) {
  return `${item.name}@${item.release}`
}

async function createConflictArtifacts(root, component, version, conflicts) {
  const benosDirectory = resolve(root, '.benos')
  const conflictRoot = resolve(benosDirectory, 'conflicts')
  for (const path of [benosDirectory, conflictRoot]) {
    try {
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(`Refusing unsafe conflict directory: ${path}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  await mkdir(conflictRoot, { recursive: true })
  const rootReal = await realpath(root)
  const conflictReal = await realpath(conflictRoot)
  const rel = relative(rootReal, conflictReal)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Conflict artifact path resolves outside the project root.')
  const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_')
  const directory = resolve(
    conflictRoot,
    `${component}-${safeVersion}-${randomUUID().slice(0, 8)}`,
  )
  await mkdir(directory)
  const instructions = [
    `Conflict while updating ${component} to ${version}.`,
    '',
    'Benos left the component source files and benos.lock.json unchanged.',
    'For each conflict, compare the .base, .local, and .incoming copies.',
    'Resolve the source file manually, then rerun benos update.',
    'Do not copy conflict markers into application source.',
  ].join('\n')
  await writeFile(resolve(directory, 'README.txt'), `${instructions}\n`)
  for (const conflict of conflicts) {
    const target = resolve(directory, `${conflict.path}.base`)
    const localTarget = resolve(directory, `${conflict.path}.local`)
    const incomingTarget = resolve(directory, `${conflict.path}.incoming`)
    await mkdir(resolve(target, '..'), { recursive: true })
    await mkdir(resolve(localTarget, '..'), { recursive: true })
    await mkdir(resolve(incomingTarget, '..'), { recursive: true })
    await writeFile(
      target,
      conflict.base ?? '<file did not exist at base version>\n',
    )
    await writeFile(
      localTarget,
      conflict.local ?? '<file is missing locally>\n',
    )
    await writeFile(
      incomingTarget,
      conflict.incoming ?? '<file was removed upstream>\n',
    )
  }
  return relative(root, directory).split(sep).join('/')
}

async function planComponent(root, config, lockItem, latest) {
  const base = await loadPinnedItem(root, latest.item.name, lockItem)
  const baseFiles = fileMap(base.files, latest.item.name, base.release)
  const incomingFiles = fileMap(
    latest.item.files,
    latest.item.name,
    latest.item.release,
  )
  const lockedFiles = new Map(lockItem.files.map((file) => [file.path, file]))
  const allBasePaths = new Set(baseFiles.keys())
  if (
    lockedFiles.size !== allBasePaths.size ||
    [...allBasePaths].some((path) => !lockedFiles.has(path))
  ) {
    throw new Error(
      `The installed lock entry for ${latest.item.name} does not match its pinned base payload. Refusing automatic update.`,
    )
  }

  const writes = []
  const conflicts = []
  for (const path of allBasePaths) {
    const baseFile = baseFiles.get(path)
    const incomingFile = incomingFiles.get(path)
    const lockedFile = lockedFiles.get(path)
    if (lockedFile.checksum !== baseFile.checksum)
      throw new Error(
        `The pinned base checksum for ${latest.item.name}/${path} does not match benos.lock.json. Refusing automatic update.`,
      )
    const localBytes = await readLocal(root, lockedFile.target)
    if (!localBytes) {
      conflicts.push({
        path,
        base: baseFile.content,
        local: undefined,
        incoming: incomingFile?.content,
      })
      continue
    }
    let local
    try {
      local = new TextDecoder('utf-8', { fatal: true }).decode(localBytes)
    } catch (error) {
      throw new Error(
        `Cannot merge ${latest.item.name}/${path}: the local file is not valid UTF-8. Its bytes were preserved.`,
        { cause: error },
      )
    }
    if (!incomingFile) {
      conflicts.push({
        path,
        base: baseFile.content,
        local,
        incoming: undefined,
      })
      continue
    }
    const incomingTarget = resolveConfigTarget(
      root,
      config,
      incomingFile.target,
    )
    if (incomingTarget.relative !== lockedFile.target) {
      conflicts.push({
        path,
        base: baseFile.content,
        local,
        incoming: incomingFile.content,
      })
      continue
    }
    const merged = mergeText(baseFile.content, local, incomingFile.content)
    if (merged.conflicts) {
      conflicts.push({
        path,
        base: baseFile.content,
        local,
        incoming: incomingFile.content,
      })
    } else if (merged.merged !== local) {
      writes.push({ relative: lockedFile.target, content: merged.merged })
    }
  }

  for (const [path, incomingFile] of incomingFiles) {
    if (baseFiles.has(path)) continue
    const target = resolveConfigTarget(root, config, incomingFile.target)
    const local = await readLocal(root, target.relative)
    if (local !== undefined) {
      conflicts.push({
        path,
        base: undefined,
        local: local.toString('utf8'),
        incoming: incomingFile.content,
      })
    } else {
      writes.push({ relative: target.relative, content: incomingFile.content })
    }
  }

  return {
    component: latest.item.name,
    from: base.release,
    to: latest.item.release,
    latest,
    writes,
    conflicts,
    nextRecord: lockRecord(latest.entry, latest.item, config, root),
  }
}

function mergeAppDependencies(packageJson, latestItems) {
  const declared = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  }
  for (const { item } of latestItems) {
    for (const dependency of item.dependencies) {
      const installed = declared[dependency.name]
      const installedRange = semver.validRange(installed)
      const requiredRange = semver.validRange(dependency.version)
      if (
        !installedRange ||
        !requiredRange ||
        !semver.subset(installedRange, requiredRange)
      ) {
        throw new Error(
          `Cannot update ${item.name}: it requires ${dependency.name}@${dependency.version}, but the project declares ${installed ?? 'no version'}. Install or adjust this dependency before updating the component.`,
        )
      }
    }
  }
}

function serializeLock(lock) {
  return Buffer.from(`${JSON.stringify(lock, null, 2)}\n`, 'utf8')
}

export async function updateItems(options = {}) {
  const root = await findProjectRoot(options.cwd ?? process.cwd())
  const recovered = await recoverIncompleteUpdates(root)
  for (const message of recovered)
    console.log(`Recovered interrupted update: ${message}.`)

  const config = await readUiConfig(root)
  const lock = await readUiLock(root)
  const installedNames = Object.keys(lock.items)
  const requested = options.names?.length
    ? [...new Set(options.names)]
    : installedNames
  if (requested.length === 0) {
    console.log('No UI registry components are installed.')
    return
  }
  for (const name of requested) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      throw new Error('Registry item names must be lowercase kebab-case.')
    if (!lock.items[name])
      throw new Error(`Component ${name} is not recorded in benos.lock.json.`)
  }

  const indexResource = await loadIndex(
    root,
    options.registry ?? config.registry,
    { deferCache: true },
  )
  const resolved = await resolveItems(root, indexResource.index, requested, {
    deferCache: true,
  })
  const selected = resolved
  for (const { item } of selected) {
    if (!lock.items[item.name]) {
      throw new Error(
        `Cannot update ${requested.join(', ')} because registry dependency ${item.name} is not installed. Run benos add ${item.name} first.`,
      )
    }
  }
  await assertMinimumBenosVersions(root, selected, options)
  const { packageJson } = await readApplication(root)
  mergeAppDependencies(packageJson, selected)

  const plans = []
  const failures = []
  for (const latest of selected) {
    try {
      plans.push(
        await planComponent(root, config, lock.items[latest.item.name], latest),
      )
    } catch (error) {
      failures.push({ component: latest.item.name, message: error.message })
    }
  }
  const hasChanges = plans.some(
    (plan) =>
      plan.writes.length > 0 ||
      plan.conflicts.length > 0 ||
      plan.from !== plan.to,
  )
  if (!hasChanges && failures.length === 0) {
    console.log(`Already up to date: ${requested.join(', ')}.`)
    return
  }
  const lines = plans.map(
    (plan) =>
      `${plan.conflicts.length ? 'conflict' : 'update'} ${plan.component} ${plan.from} -> ${plan.to} (${plan.writes.length} file write${plan.writes.length === 1 ? '' : 's'})`,
  )
  for (const failure of failures)
    lines.push(`skip ${failure.component}: ${failure.message}`)
  console.log(`Update plan:\n${lines.join('\n')}`)
  await confirmPlan(
    'Apply safe component updates and write conflict artifacts?',
    options.yes,
  )

  await cacheResolvedResources(root, indexResource, resolved)
  const conflictDirectories = []
  for (const plan of plans) {
    if (plan.conflicts.length === 0) continue
    const path = await createConflictArtifacts(
      root,
      plan.component,
      plan.to,
      plan.conflicts,
    )
    conflictDirectories.push(path)
    console.error(
      `${plan.component} has ${plan.conflicts.length} conflict(s); source and lock files are unchanged. Review ${path}.`,
    )
  }

  let nextLock = { schemaVersion: 1, items: { ...lock.items } }
  const updated = []
  for (const plan of plans) {
    if (plan.conflicts.length > 0) continue
    const prior = nextLock.items[plan.component]
    const alreadyCurrent =
      plan.writes.length === 0 &&
      JSON.stringify(prior) === JSON.stringify(plan.nextRecord)
    if (alreadyCurrent) continue
    const candidate = {
      schemaVersion: 1,
      items: { ...nextLock.items, [plan.component]: plan.nextRecord },
    }
    await applyComponentTransaction(
      root,
      plan.component,
      plan.writes,
      serializeLock(candidate),
      { afterFileWrite: options.afterFileWrite },
    )
    nextLock = candidate
    updated.push(plan.component)
    console.log(`Updated ${displayName(plan.latest.item)}.`)
  }

  if (failures.length > 0 || conflictDirectories.length > 0) {
    const detail = [
      ...failures.map(({ component, message }) => `${component}: ${message}`),
      ...conflictDirectories,
    ].join('\n')
    const error = new Error(`Update incomplete. Review these items:\n${detail}`)
    error.updated = updated
    throw error
  }
}

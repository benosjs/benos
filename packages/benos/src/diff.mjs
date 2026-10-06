/* global console */

import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { compareText } from './merge3.mjs'
import { readUiConfig, readUiLock } from './cli-utils.mjs'
import {
  ensureTargetStaysInRoot,
  findProjectRoot,
  resolveConfigTarget,
} from './project.mjs'
import { loadIndex, loadPinnedItem, resolveItems } from './registry.mjs'
import { findIncompleteUpdates } from './transactions.mjs'

async function readLocalFile(root, relativeTarget) {
  const target = {
    relative: relativeTarget,
    absolute: resolve(root, ...relativeTarget.split('/')),
  }
  await ensureTargetStaysInRoot(root, target)
  try {
    const stat = await lstat(target.absolute)
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(`Refusing non-regular component file: ${relativeTarget}`)
    return await readFile(target.absolute, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function indexByPath(files) {
  return new Map(files.map((file) => [file.path, file]))
}

export async function compareInstalledItem(root, config, lockRecord, latest) {
  const base = await loadPinnedItem(root, latest.item.name, lockRecord, {
    cache: false,
  })
  const baseFiles = indexByPath(base.files)
  const incomingFiles = indexByPath(latest.item.files)
  const lockedFiles = new Map(lockRecord.files.map((file) => [file.path, file]))
  const paths = new Set([
    ...baseFiles.keys(),
    ...incomingFiles.keys(),
    ...lockedFiles.keys(),
  ])
  const results = []

  for (const path of paths) {
    const baseFile = baseFiles.get(path)
    const incomingFile = incomingFiles.get(path)
    const lockedFile = lockedFiles.get(path)
    if (!baseFile) {
      const target = incomingFile
        ? resolveConfigTarget(root, config, incomingFile.target)
        : undefined
      const local = target
        ? await readLocalFile(root, target.relative)
        : undefined
      results.push({
        status: 'new upstream files',
        path,
        target: target?.relative,
        localExists: local !== undefined,
      })
      continue
    }
    if (!lockedFile)
      throw new Error(
        `benos.lock.json does not record the installed target for ${latest.item.name}/${path}.`,
      )
    const local = await readLocalFile(root, lockedFile.target)
    if (local === undefined) {
      results.push({
        status: 'missing locally',
        path,
        target: lockedFile.target,
      })
      continue
    }
    const upstream = incomingFile?.content
    const comparison = compareText(baseFile.content, local, upstream ?? '')
    const latestTarget = incomingFile
      ? resolveConfigTarget(root, config, incomingFile.target).relative
      : undefined
    const localChanged = comparison.localChanged
    const incomingChanged =
      !incomingFile ||
      latestTarget !== lockedFile.target ||
      comparison.incomingChanged
    let status
    if (localChanged && incomingChanged) status = 'both changed'
    else if (localChanged) status = 'local edits only'
    else if (incomingChanged) status = 'upstream changes only'
    else status = 'unchanged'
    results.push({
      status,
      path,
      target: lockedFile.target,
      latestTarget,
      upstreamRemoved: !incomingFile,
    })
  }
  return {
    component: latest.item.name,
    from: base.release,
    to: latest.item.release,
    files: results,
  }
}

export async function diffItems(options = {}) {
  const root = await findProjectRoot(options.cwd ?? process.cwd())
  const pending = await findIncompleteUpdates(root)
  if (pending.length) {
    throw new Error(
      `Interrupted update detected for ${pending.map(({ component }) => component).join(', ')}. Run benos update to recover it before diffing.`,
    )
  }
  const config = await readUiConfig(root)
  const lock = await readUiLock(root)
  const installedNames = Object.keys(lock.items)
  const requested = options.names?.length
    ? [...new Set(options.names)]
    : installedNames
  if (requested.length === 0) {
    console.log('No UI registry components are installed.')
    return []
  }
  for (const name of requested) {
    if (!lock.items[name])
      throw new Error(`Component ${name} is not recorded in benos.lock.json.`)
  }
  const indexResource = await loadIndex(
    root,
    options.registry ?? config.registry,
    { deferCache: true },
  )
  const latestItems = await resolveItems(root, indexResource.index, requested, {
    deferCache: true,
  })
  const byName = new Map(latestItems.map((entry) => [entry.item.name, entry]))
  const reports = []
  for (const name of requested) {
    const latest = byName.get(name)
    if (!latest)
      throw new Error(`Latest registry payload is unavailable for ${name}.`)
    reports.push(
      await compareInstalledItem(root, config, lock.items[name], latest),
    )
  }
  for (const report of reports) {
    console.log(`${report.component}: ${report.from} -> ${report.to}`)
    for (const file of report.files) {
      const detail = file.upstreamRemoved ? ' (removed upstream)' : ''
      const localDetail = file.localExists ? ' (local path exists)' : ''
      console.log(`  ${file.status}: ${file.path}${detail}${localDetail}`)
    }
  }
  return reports
}

/* global console, URL */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const rootManifestPath = join(root, 'package.json')
const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'))
const supportedRange = rootManifest.engines?.node
if (!supportedRange)
  throw new Error('The root package must declare engines.node.')
const ignoredDirectories = new Set([
  '.git',
  '.release-packs',
  'coverage',
  'dist',
  'node_modules',
])
const manifests = new Map()
const workspaceManifestPaths = new Set([rootManifestPath])

async function findWorkspaceManifests(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue
    const child = join(directory, entry.name)
    const packageManifest = join(child, 'package.json')
    try {
      const metadata = JSON.parse(await readFile(packageManifest, 'utf8'))
      if (metadata.name) {
        manifests.set(packageManifest, metadata)
        workspaceManifestPaths.add(packageManifest)
      }
    } catch {
      await findWorkspaceManifests(child)
    }
  }
}

async function findPnpmStores(directory, stores = []) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return stores
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const child = join(directory, entry.name)
    if (entry.name === 'node_modules') {
      const store = join(child, '.pnpm')
      try {
        await readdir(store)
        stores.push(store)
      } catch {
        // Workspace-linked node_modules folders do not have their own store.
      }
      continue
    }
    if (ignoredDirectories.has(entry.name)) continue
    await findPnpmStores(child, stores)
  }
  return stores
}

async function collectInstalledPackages() {
  const stores = await findPnpmStores(root)
  if (!stores.length)
    throw new Error('Run pnpm install before checking dependency engines.')
  for (const store of stores) {
    const virtualPackages = await readdir(store, { withFileTypes: true })
    for (const virtualPackage of virtualPackages) {
      if (
        !virtualPackage.isDirectory() ||
        virtualPackage.name === 'node_modules'
      )
        continue
      const packageModules = join(store, virtualPackage.name, 'node_modules')
      let entries
      try {
        entries = await readdir(packageModules, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.name === '.bin') continue
        const packagePaths = []
        if (entry.name.startsWith('@')) {
          let scoped
          try {
            scoped = await readdir(join(packageModules, entry.name))
          } catch {
            continue
          }
          for (const name of scoped)
            packagePaths.push(
              join(packageModules, entry.name, name, 'package.json'),
            )
        } else {
          packagePaths.push(join(packageModules, entry.name, 'package.json'))
        }
        for (const packageManifest of packagePaths) {
          try {
            const metadata = JSON.parse(await readFile(packageManifest, 'utf8'))
            if (metadata.name) manifests.set(packageManifest, metadata)
          } catch {
            // Some package links are optional and may be absent on this platform.
          }
        }
      }
    }
  }
}

manifests.set(rootManifestPath, rootManifest)
await findWorkspaceManifests(root)
await collectInstalledPackages()

const unsupported = new Set()
for (const [manifestPath, metadata] of manifests) {
  const dependencyRange = metadata.engines?.node
  if (workspaceManifestPaths.has(manifestPath)) {
    if (dependencyRange !== supportedRange) {
      unsupported.add(
        `${metadata.name ?? manifestPath}: declares ${dependencyRange ?? 'no Node.js range'} (project: ${supportedRange})`,
      )
    }
    continue
  }
  if (!dependencyRange) continue
  if (!semver.subset(supportedRange, dependencyRange)) {
    unsupported.add(
      `${metadata.name ?? manifestPath}: ${dependencyRange} (project: ${supportedRange})`,
    )
  }
}

if (unsupported.size) {
  throw new Error(
    `Some workspace or installed package Node.js ranges are incompatible:\n${[...unsupported].join('\n')}`,
  )
}

console.log(
  `Node.js engine check passed for ${manifests.size} workspace and installed package manifests (${supportedRange})`,
)

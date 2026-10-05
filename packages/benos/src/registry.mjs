/* global URL, fetch, AbortSignal, Buffer */

import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import semver from 'semver'
import { isSafePosixRelativePath } from './path-safety.mjs'

const MAX_BYTES = 2 * 1024 * 1024
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PACKAGE_PATTERN = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/
const CONTENT_TYPES = new Set([
  'text/css',
  'text/html',
  'text/javascript',
  'text/tsx',
  'text/typescript',
])

class RegistryUnavailable extends Error {}

export function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function isLoopback(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function parseResourceUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`Invalid registry URL ${value}: ${error.message}`, {
      cause: error,
    })
  }
  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'file:' &&
    !(url.protocol === 'http:' && isLoopback(url.hostname))
  ) {
    throw new Error(
      `Registry URL must use HTTPS or an explicit local URL: ${url}`,
    )
  }
  if (url.username || url.password) {
    throw new Error('Registry URLs cannot contain credentials.')
  }
  return url
}

async function readResource(value) {
  const initial = parseResourceUrl(value)
  if (initial.protocol === 'file:') {
    const bytes = await readFile(initial)
    if (bytes.byteLength > MAX_BYTES)
      throw new Error(`Registry document exceeds ${MAX_BYTES} bytes: ${value}`)
    return bytes
  }

  let current = initial
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    let response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      throw new RegistryUnavailable(
        `Registry request unavailable: ${error.message}`,
        {
          cause: error,
        },
      )
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location)
        throw new Error(`Registry redirect has no location: ${current}`)
      const next = parseResourceUrl(new URL(location, current).href)
      if (next.origin !== initial.origin) {
        throw new Error(
          `Registry redirect changed origin: ${current} -> ${next}`,
        )
      }
      current = next
      continue
    }
    if (response.status >= 500)
      throw new RegistryUnavailable(
        `Registry server error (${response.status}): ${current}`,
      )
    if (!response.ok)
      throw new Error(
        `Registry request failed (${response.status}): ${current}`,
      )
    const contentType = response.headers.get('content-type') ?? ''
    if (
      contentType &&
      !/^(?:application\/json|text\/plain|application\/octet-stream)(?:\s*;|$)/i.test(
        contentType,
      )
    ) {
      throw new Error(
        `Unexpected registry content type ${contentType}: ${current}`,
      )
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES)
      throw new Error(
        `Registry document exceeds ${MAX_BYTES} bytes: ${current}`,
      )
    return bytes
  }
  throw new Error(`Too many registry redirects: ${value}`)
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`, {
      cause: error,
    })
  }
}

function checkKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.has(key))
  if (extras.length)
    throw new Error(`${label} has unsupported field(s): ${extras.join(', ')}.`)
}

function validateDependencies(dependencies, label) {
  if (!Array.isArray(dependencies))
    throw new Error(`${label} dependencies must be an array.`)
  const names = new Set()
  for (const dependency of dependencies) {
    if (
      !dependency ||
      typeof dependency !== 'object' ||
      typeof dependency.name !== 'string' ||
      !PACKAGE_PATTERN.test(dependency.name) ||
      typeof dependency.version !== 'string' ||
      !semver.validRange(dependency.version)
    ) {
      throw new Error(`${label} has an invalid package dependency.`)
    }
    if (names.has(dependency.name))
      throw new Error(`${label} repeats dependency ${dependency.name}.`)
    names.add(dependency.name)
  }
}

function validateMinimumBenosVersions(versions, label) {
  if (!Array.isArray(versions))
    throw new Error(`${label} minimumBenosVersions must be an array.`)
  const names = new Set()
  for (const requirement of versions) {
    if (
      !requirement ||
      typeof requirement !== 'object' ||
      typeof requirement.name !== 'string' ||
      !/^@benosjs\/[a-z0-9._-]+$/.test(requirement.name) ||
      typeof requirement.version !== 'string' ||
      !semver.valid(requirement.version)
    ) {
      throw new Error(`${label} has an invalid minimum Benos package version.`)
    }
    if (names.has(requirement.name))
      throw new Error(`${label} repeats minimum ${requirement.name}.`)
    names.add(requirement.name)
  }
}

export function validateIndex(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Registry index must be a JSON object.')
  checkKeys(
    value,
    new Set(['schemaVersion', 'release', 'items']),
    'Registry index',
  )
  if (value.schemaVersion !== 1)
    throw new Error(
      `Unsupported registry schema version: ${value.schemaVersion}`,
    )
  if (typeof value.release !== 'string' || !semver.valid(value.release))
    throw new Error('Registry index release must be a semantic version.')
  if (!Array.isArray(value.items))
    throw new Error('Registry index items must be an array.')
  const names = new Set()
  for (const [index, item] of value.items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`Registry index item ${index} must be an object.`)
    checkKeys(
      item,
      new Set([
        'name',
        'type',
        'title',
        'description',
        'url',
        'dependencies',
        'registryDependencies',
        'checksum',
      ]),
      `Registry index item ${index}`,
    )
    if (typeof item.name !== 'string' || !NAME_PATTERN.test(item.name))
      throw new Error(`Registry index item ${index} has an invalid name.`)
    if (item.type !== 'registry:component' && item.type !== 'registry:style')
      throw new Error(
        `Registry index item ${item.name} has an unsupported type.`,
      )
    if (names.has(item.name))
      throw new Error(`Registry index contains duplicate item ${item.name}.`)
    names.add(item.name)
    if (typeof item.title !== 'string' || typeof item.description !== 'string')
      throw new Error(
        `Registry index item ${item.name} needs title and description.`,
      )
    if (typeof item.url !== 'string')
      throw new Error(`Registry index item ${item.name} needs a payload URL.`)
    parseResourceUrl(item.url)
    if (!/^sha256:[a-f0-9]{64}$/.test(item.checksum ?? ''))
      throw new Error(
        `Registry index item ${item.name} has an invalid checksum.`,
      )
    if (
      !Array.isArray(item.dependencies) ||
      !Array.isArray(item.registryDependencies)
    )
      throw new Error(
        `Registry index item ${item.name} needs dependency arrays.`,
      )
    validateDependencies(item.dependencies, `Registry index item ${item.name}`)
    if (
      item.registryDependencies.some(
        (dependency) =>
          typeof dependency !== 'string' || !NAME_PATTERN.test(dependency),
      )
    ) {
      throw new Error(
        `Registry index item ${item.name} has invalid registry dependencies.`,
      )
    }
  }
  return value
}

function validateItem(item, expectedName, indexRelease) {
  if (!item || typeof item !== 'object' || Array.isArray(item))
    throw new Error(`Registry payload for ${expectedName} must be an object.`)
  checkKeys(
    item,
    new Set([
      'schemaVersion',
      'release',
      'name',
      'type',
      'title',
      'description',
      'dependencies',
      'minimumBenosVersions',
      'registryDependencies',
      'files',
    ]),
    `Registry item ${expectedName}`,
  )
  if (item.schemaVersion !== 1)
    throw new Error(`Unsupported item schema version for ${expectedName}.`)
  if (item.name !== expectedName)
    throw new Error(
      `Registry returned ${item.name} for requested item ${expectedName}.`,
    )
  if (item.release !== indexRelease)
    throw new Error(`Registry release mismatch for ${expectedName}.`)
  if (typeof item.title !== 'string' || typeof item.description !== 'string')
    throw new Error(
      `Registry item ${expectedName} needs title and description.`,
    )
  if (item.type !== 'registry:component' && item.type !== 'registry:style')
    throw new Error(`Registry item ${expectedName} has unsupported type.`)
  if (
    !Array.isArray(item.dependencies) ||
    !Array.isArray(item.registryDependencies)
  )
    throw new Error(`Registry item ${expectedName} needs dependency arrays.`)
  validateDependencies(item.dependencies, `Registry item ${expectedName}`)
  validateMinimumBenosVersions(
    item.minimumBenosVersions,
    `Registry item ${expectedName}`,
  )
  if (
    item.registryDependencies.some(
      (dependency) =>
        typeof dependency !== 'string' || !NAME_PATTERN.test(dependency),
    )
  ) {
    throw new Error(
      `Registry item ${expectedName} has invalid registry dependencies.`,
    )
  }
  if (!Array.isArray(item.files) || item.files.length === 0)
    throw new Error(`Registry item ${expectedName} must contain files.`)
  for (const [index, file] of item.files.entries()) {
    if (!file || typeof file !== 'object' || typeof file.content !== 'string')
      throw new Error(
        `Registry file ${index} in ${expectedName} needs text content.`,
      )
    checkKeys(
      file,
      new Set(['path', 'target', 'contentType', 'content', 'checksum']),
      `Registry file ${index} in ${expectedName}`,
    )
    if (typeof file.path !== 'string' || typeof file.target !== 'string')
      throw new Error(
        `Registry file ${index} in ${expectedName} needs path and target.`,
      )
    if (typeof file.contentType !== 'string')
      throw new Error(
        `Registry file ${index} in ${expectedName} needs contentType.`,
      )
    if (!CONTENT_TYPES.has(file.contentType))
      throw new Error(
        `Registry file ${index} in ${expectedName} has unsupported contentType.`,
      )
    for (const field of [file.path, file.target]) {
      if (!isSafePosixRelativePath(field)) {
        throw new Error(`Unsafe registry path in ${expectedName}: ${field}`)
      }
    }
    if (!/^(?:components|css)\//.test(file.target))
      throw new Error(
        `Registry target must begin with components/ or css/: ${file.target}`,
      )
    if (digest(Buffer.from(file.content, 'utf8')) !== file.checksum)
      throw new Error(
        `Registry file checksum mismatch: ${expectedName}/${file.path}`,
      )
  }
  return item
}

function cachePath(root, name) {
  return resolve(root, '.benos', 'cache', name)
}

async function ensureCacheDirectory(root) {
  const rootPath = resolve(root)
  const rootReal = await realpath(rootPath)
  const benosPath = resolve(rootPath, '.benos')
  const cacheDirectory = resolve(benosPath, 'cache')
  for (const directory of [benosPath, cacheDirectory]) {
    try {
      const stat = await lstat(directory)
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(
          `Refusing unsafe registry cache directory: ${directory}`,
        )
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  await mkdir(cacheDirectory, { recursive: true })
  const cacheReal = await realpath(cacheDirectory)
  const rel = relative(rootReal, cacheReal)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Registry cache resolves outside the project root.')
  }
  return cacheDirectory
}

async function cacheBytes(root, name, bytes) {
  const path = cachePath(root, name)
  await ensureCacheDirectory(root)
  await writeFile(path, bytes)
}

async function getBytesWithCache(root, url, name) {
  try {
    return { bytes: await readResource(url), downloaded: true }
  } catch (networkError) {
    if (!(networkError instanceof RegistryUnavailable)) throw networkError
    try {
      await ensureCacheDirectory(root)
      return { bytes: await readFile(cachePath(root, name)), downloaded: false }
    } catch {
      throw networkError
    }
  }
}

export async function loadIndex(root, registryUrl, options = {}) {
  let bytes
  let downloaded
  try {
    const result = await getBytesWithCache(root, registryUrl, 'index.json')
    bytes = result.bytes
    downloaded = result.downloaded
  } catch (error) {
    throw new Error(
      `Unable to load registry index ${registryUrl}: ${error.message}`,
      {
        cause: error,
      },
    )
  }
  const index = validateIndex(parseJson(bytes, registryUrl))
  if (downloaded && !options.deferCache)
    await cacheBytes(root, 'index.json', bytes)
  return { index, bytes, downloaded }
}

async function loadItem(root, entry, release, options = {}) {
  if (!NAME_PATTERN.test(entry.name))
    throw new Error(`Invalid registry item name ${entry.name}.`)
  const cacheName = `items-${entry.name}.json`
  let bytes
  let downloaded
  try {
    const result = await getBytesWithCache(root, entry.url, cacheName)
    bytes = result.bytes
    downloaded = result.downloaded
  } catch (error) {
    throw new Error(
      `Unable to load registry item ${entry.name}: ${error.message}`,
      {
        cause: error,
      },
    )
  }
  if (digest(bytes) !== entry.checksum)
    throw new Error(`Registry item checksum mismatch: ${entry.name}`)
  const item = validateItem(parseJson(bytes, entry.url), entry.name, release)
  if (downloaded && !options.deferCache)
    await cacheBytes(root, cacheName, bytes)
  return { item, bytes, downloaded }
}

export async function resolveItems(root, index, requestedNames, options = {}) {
  const entries = new Map(index.items.map((item) => [item.name, item]))
  const visiting = new Set()
  const loaded = new Map()
  const ordered = []

  async function visit(name) {
    if (loaded.has(name)) return
    if (visiting.has(name))
      throw new Error(`Registry dependency cycle includes ${name}.`)
    const entry = entries.get(name)
    if (!entry) throw new Error(`Registry item not found: ${name}`)
    visiting.add(name)
    const loadedItem = await loadItem(root, entry, index.release, options)
    const item = loadedItem.item
    for (const dependency of item.registryDependencies) {
      if (typeof dependency !== 'string')
        throw new Error(`Invalid registry dependency in ${name}.`)
      await visit(dependency)
    }
    visiting.delete(name)
    loaded.set(name, { entry, item })
    ordered.push({
      entry,
      item,
      cacheBytes: loadedItem.downloaded ? loadedItem.bytes : undefined,
    })
  }

  for (const name of requestedNames) await visit(name)
  return ordered
}

export async function cacheResolvedResources(root, indexResource, allItems) {
  if (indexResource.downloaded)
    await cacheBytes(root, 'index.json', indexResource.bytes)
  for (const { item, cacheBytes: bytes } of allItems) {
    if (bytes) await cacheBytes(root, `items-${item.name}.json`, bytes)
  }
}

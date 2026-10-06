import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import semver from 'semver'
import { URL } from 'node:url'
import { loadProject, readJson } from './project.mjs'
import { isSafePosixRelativePath } from './path-safety.mjs'

function requireKeys(value, allowed, label) {
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  if (extra.length)
    throw new Error(`${label} has unsupported field(s): ${extra.join(', ')}.`)
}

function safeProjectPath(value, label) {
  if (!isSafePosixRelativePath(value)) {
    throw new Error(`${label} must be a safe project-relative POSIX path.`)
  }
}

export function validateLockData(lock) {
  if (
    !lock ||
    typeof lock !== 'object' ||
    Array.isArray(lock) ||
    lock.schemaVersion !== 1 ||
    !lock.items ||
    typeof lock.items !== 'object' ||
    Array.isArray(lock.items)
  ) {
    throw new Error(
      'benos.lock.json must use schemaVersion 1 and an items object.',
    )
  }
  requireKeys(lock, new Set(['schemaVersion', 'items']), 'benos.lock.json')
  for (const [name, item] of Object.entries(lock.items)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      throw new Error(`benos.lock.json has invalid component name ${name}.`)
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`benos.lock.json record ${name} must be an object.`)
    requireKeys(
      item,
      new Set([
        'version',
        'checksum',
        'baseUrl',
        'title',
        'description',
        'dependencies',
        'registryDependencies',
        'files',
      ]),
      `benos.lock.json record ${name}`,
    )
    if (!semver.valid(item.version))
      throw new Error(`benos.lock.json record ${name} has an invalid version.`)
    if (!/^sha256:[a-f0-9]{64}$/.test(item.checksum ?? ''))
      throw new Error(`benos.lock.json record ${name} has an invalid checksum.`)
    try {
      const baseUrl = new URL(item.baseUrl)
      if (baseUrl.protocol !== 'https:' && baseUrl.protocol !== 'file:')
        throw new Error('Invalid base URL protocol')
    } catch {
      throw new Error(`benos.lock.json record ${name} has an invalid baseUrl.`)
    }
    if (
      typeof item.title !== 'string' ||
      typeof item.description !== 'string' ||
      !Array.isArray(item.dependencies) ||
      !Array.isArray(item.registryDependencies) ||
      !Array.isArray(item.files)
    ) {
      throw new Error(`benos.lock.json record ${name} has invalid fields.`)
    }
    for (const dependency of item.dependencies) {
      if (
        !dependency ||
        typeof dependency !== 'object' ||
        typeof dependency.name !== 'string' ||
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(dependency.name) ||
        typeof dependency.version !== 'string' ||
        !semver.validRange(dependency.version)
      ) {
        throw new Error(
          `benos.lock.json record ${name} has an invalid dependency.`,
        )
      }
      requireKeys(
        dependency,
        new Set(['name', 'version']),
        `Dependency in ${name}`,
      )
    }
    if (
      item.registryDependencies.some(
        (dependency) =>
          typeof dependency !== 'string' ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dependency),
      )
    ) {
      throw new Error(
        `benos.lock.json record ${name} has invalid registry dependencies.`,
      )
    }
    for (const file of item.files) {
      if (
        !file ||
        typeof file !== 'object' ||
        typeof file.path !== 'string' ||
        typeof file.target !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(file.checksum ?? '')
      ) {
        throw new Error(
          `benos.lock.json record ${name} has an invalid file entry.`,
        )
      }
      requireKeys(
        file,
        new Set(['path', 'target', 'checksum']),
        `Lock file in ${name}`,
      )
      safeProjectPath(file.path, `Lock file path in ${name}`)
      safeProjectPath(file.target, `Lock target in ${name}`)
    }
  }
  return lock
}

export async function readUiConfig(root) {
  const config = await readJson(resolve(root, 'benos.json'), 'benos.json')
  if (
    !config ||
    typeof config !== 'object' ||
    typeof config.$schema !== 'string' ||
    config.schemaVersion !== 1 ||
    typeof config.registry !== 'string' ||
    typeof config.style !== 'string' ||
    !config.style ||
    typeof config.components !== 'string' ||
    typeof config.css !== 'string' ||
    config.alias !== '@/'
  ) {
    throw new Error('benos.json is invalid or uses an unsupported schema.')
  }
  requireKeys(
    config,
    new Set([
      '$schema',
      'schemaVersion',
      'registry',
      'style',
      'components',
      'css',
      'alias',
    ]),
    'benos.json',
  )
  safeProjectPath(config.components, 'benos.json components')
  safeProjectPath(config.css, 'benos.json css')
  return config
}

export async function readUiLock(root) {
  try {
    const lock = await readJson(
      resolve(root, 'benos.lock.json'),
      'benos.lock.json',
    )
    return validateLockData(lock)
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, items: {} }
    throw error
  }
}

export async function readApplication(root) {
  const { packageJson, packagePath } = await loadProject(root)
  return { packageJson, packagePath }
}

export async function writeJsonAtomic(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, `${formatJson(data)}\n`, {
    flag: 'wx',
  })
  await rename(temporary, path)
}

function formatJson(value, depth = 0) {
  const indentation = ' '.repeat(depth * 2)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const inline = `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
    if (
      value.every((item) => item === null || typeof item !== 'object') &&
      indentation.length + inline.length <= 80
    ) {
      return inline
    }
    const lines = value.map(
      (item) => `${' '.repeat((depth + 1) * 2)}${formatJson(item, depth + 1)}`,
    )
    return `[\n${lines.join(',\n')}\n${indentation}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    const lines = entries.map(
      ([key, entry]) =>
        `${' '.repeat((depth + 1) * 2)}${JSON.stringify(key)}: ${formatJson(entry, depth + 1)}`,
    )
    return `{\n${lines.join(',\n')}\n${indentation}}`
  }
  return JSON.stringify(value)
}

export async function sameContents(path, content) {
  try {
    return (await readFile(path, 'utf8')) === content
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/* global Buffer, console, process */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import semver from 'semver'

const root = resolve(import.meta.dirname, '..')
const sourceDirectory = resolve(root, 'registry/source/items')
const sourceRoot = resolve(root, 'registry/source')
const outputDirectory = resolve(root, 'registry/v1')
const outputItemsDirectory = resolve(outputDirectory, 'items')
const indexPath = resolve(outputDirectory, 'index.json')
const repository = 'https://raw.githubusercontent.com/benosjs/benos'
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const packagePattern = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/
const contentTypes = new Set([
  'text/css',
  'text/html',
  'text/javascript',
  'text/tsx',
  'text/typescript',
])

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function validateDependencies(value, label) {
  if (!Array.isArray(value))
    throw new Error(`${label}.dependencies must be an array.`)
  const names = new Set()
  for (const dependency of value) {
    if (
      !dependency ||
      typeof dependency.name !== 'string' ||
      !packagePattern.test(dependency.name) ||
      typeof dependency.version !== 'string' ||
      !semver.validRange(dependency.version)
    ) {
      throw new Error(`${label} has an invalid package dependency.`)
    }
    if (names.has(dependency.name))
      throw new Error(`${label} repeats dependency ${dependency.name}.`)
    names.add(dependency.name)
  }
  return value
}

function validateSource(source, filename) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw new Error(`${filename} must contain a JSON object.`)
  if (!slugPattern.test(source.name ?? ''))
    throw new Error(`${filename} has an invalid kebab-case name.`)
  if (
    typeof source.title !== 'string' ||
    typeof source.description !== 'string'
  )
    throw new Error(`${filename} needs title and description.`)
  if (!['registry:component', 'registry:style'].includes(source.type))
    throw new Error(`${filename} has an unsupported registry type.`)
  validateDependencies(source.dependencies, filename)
  if (
    !Array.isArray(source.registryDependencies) ||
    source.registryDependencies.some((name) => !slugPattern.test(name))
  ) {
    throw new Error(`${filename}.registryDependencies must be item names.`)
  }
  if (!Array.isArray(source.files) || source.files.length === 0)
    throw new Error(`${filename}.files must contain at least one file.`)
  const filePaths = new Set()
  for (const file of source.files) {
    const hasContent = typeof file?.content === 'string'
    const hasSourceFile = typeof file?.sourceFile === 'string'
    if (
      !file ||
      typeof file.path !== 'string' ||
      typeof file.target !== 'string' ||
      hasContent === hasSourceFile ||
      !contentTypes.has(file.contentType)
    ) {
      throw new Error(`${filename} contains an incomplete file record.`)
    }
    if (
      [file.path, file.target].some(
        (path) =>
          path.includes('\\') ||
          path.includes('\0') ||
          path.startsWith('/') ||
          /^[a-zA-Z]:/.test(path) ||
          path
            .split('/')
            .some((part) => !part || part === '.' || part === '..'),
      )
    ) {
      throw new Error(`${filename} contains an unsafe file path.`)
    }
    if (!/^(?:components|css)\//.test(file.target))
      throw new Error(
        `${filename} targets must begin with components/ or css/.`,
      )
    if (filePaths.has(file.path))
      throw new Error(`${filename} repeats ${file.path}.`)
    if (
      hasSourceFile &&
      (file.sourceFile.includes(String.fromCharCode(92)) ||
        file.sourceFile.includes(String.fromCharCode(0)) ||
        file.sourceFile.startsWith('/') ||
        /^[a-zA-Z]:/.test(file.sourceFile) ||
        file.sourceFile
          .split('/')
          .some((part) => !part || part === '.' || part === '..'))
    ) {
      throw new Error('Registry source has an unsafe sourceFile path.')
    }
    filePaths.add(file.path)
  }
  return source
}

function parseArgs(args) {
  let release
  let check = false
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--check') check = true
    else if (value === '--release') {
      release = args[index + 1]
      if (!release) throw new Error('--release requires a semver value.')
      index += 1
    } else throw new Error(`Unknown option: ${value}`)
  }
  return { release, check }
}

async function readSources() {
  let filenames = []
  try {
    filenames = (await readdir(sourceDirectory)).filter((name) =>
      name.endsWith('.json'),
    )
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const sources = []
  for (const filename of filenames.sort()) {
    const raw = await readFile(resolve(sourceDirectory, filename), 'utf8')
    const source = validateSource(JSON.parse(raw), filename)
    if (filename !== `${source.name}.json`)
      throw new Error(`Source filename must match item name ${source.name}.`)
    const files = []
    for (const file of source.files) {
      if (typeof file.sourceFile !== 'string') {
        files.push(file)
        continue
      }
      const absoluteSource = resolve(sourceRoot, file.sourceFile)
      const sourceRelative = relative(sourceRoot, absoluteSource)
      if (
        sourceRelative === '..' ||
        sourceRelative.startsWith('..' + sep) ||
        isAbsolute(sourceRelative)
      ) {
        throw new Error('Registry source file escapes registry/source.')
      }
      const content = await readFile(absoluteSource, 'utf8')
      const { sourceFile, ...metadata } = file
      void sourceFile
      files.push({ ...metadata, content })
    }
    sources.push({ ...source, files })
  }
  return sources
}

async function getRelease(requested) {
  if (requested) return requested
  try {
    const current = JSON.parse(await readFile(indexPath, 'utf8'))
    return current.release
  } catch {
    return '0.2.0'
  }
}

async function expectedOutputs(release) {
  if (!semver.valid(release))
    throw new Error(`Invalid registry release version: ${release}`)
  const sources = await readSources()
  const names = new Set()
  const items = []
  const outputs = new Map()
  for (const source of sources) {
    if (names.has(source.name))
      throw new Error(`Duplicate registry item ${source.name}.`)
    names.add(source.name)
    const item = {
      schemaVersion: 1,
      release,
      name: source.name,
      type: source.type,
      title: source.title,
      description: source.description,
      dependencies: source.dependencies,
      registryDependencies: source.registryDependencies,
      files: source.files.map((file) => ({
        ...file,
        checksum: hash(Buffer.from(file.content, 'utf8')),
      })),
    }
    const itemBytes = Buffer.from(json(item), 'utf8')
    const itemPath = `items/${source.name}.json`
    outputs.set(resolve(outputDirectory, itemPath), itemBytes)
    items.push({
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      url: `${repository}/v${release}/registry/v1/${itemPath}`,
      dependencies: item.dependencies,
      registryDependencies: item.registryDependencies,
      checksum: hash(itemBytes),
    })
  }
  for (const item of items) {
    for (const dependency of item.registryDependencies) {
      if (!names.has(dependency))
        throw new Error(
          `${item.name} depends on missing registry item ${dependency}.`,
        )
    }
  }
  const state = new Map()
  function visit(name, chain = []) {
    if (state.get(name) === 'done') return
    if (state.get(name) === 'visiting')
      throw new Error(
        `Registry dependency cycle: ${[...chain, name].join(' -> ')}`,
      )
    state.set(name, 'visiting')
    const item = items.find((candidate) => candidate.name === name)
    for (const dependency of item.registryDependencies)
      visit(dependency, [...chain, name])
    state.set(name, 'done')
  }
  for (const item of items) visit(item.name)
  const index = { schemaVersion: 1, release, items }
  outputs.set(indexPath, Buffer.from(json(index), 'utf8'))
  return outputs
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const release = await getRelease(options.release)
  const outputs = await expectedOutputs(release)
  const failures = []
  if (options.check) {
    for (const [path, expected] of outputs) {
      let actual
      try {
        actual = await readFile(path)
      } catch {
        failures.push(`missing ${path}`)
        continue
      }
      if (!actual.equals(expected)) failures.push(`out of date ${path}`)
    }
    if (failures.length)
      throw new Error(
        `Registry build check failed:\n- ${failures.join('\n- ')}`,
      )
    console.log(
      `Registry ${release} build check passed (${outputs.size} output files).`,
    )
    return
  }
  await mkdir(outputItemsDirectory, { recursive: true })
  for (const [path, contents] of outputs) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  console.log(`Built registry ${release} (${outputs.size} files).`)
}

main().catch((error) => {
  console.error(
    `registry build: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})

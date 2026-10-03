/* global console */

import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'node:path'
import {
  DEFAULT_REGISTRY,
  TOKENS_CSS,
  checkProjectSetup,
  confirmPlan,
  emptyLock,
  ensureTargetStaysInRoot,
  findProjectRoot,
  loadProject,
  readJson,
  rejectSymlink,
  resolveConfigTarget,
  writeTextSafely,
} from './project.mjs'
import { validateLockData } from './cli-utils.mjs'

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function appendGitignore(root) {
  const path = resolve(root, '.gitignore')
  let source = ''
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink())
      throw new Error('Refusing to update a symlinked .gitignore.')
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (source.split(/\r?\n/).some((line) => line.trim() === '.benos/'))
    return false
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const next = `${source}${source && !source.endsWith('\n') ? newline : ''}.benos/${newline}`
  await writeFile(path, next)
  return true
}

async function hasBenosIgnore(root) {
  try {
    const path = resolve(root, '.gitignore')
    const stat = await rejectSymlink(path, '.gitignore')
    if (!stat) return false
    const source = await readFile(path, 'utf8')
    return source.split(/\r?\n/).some((line) => line.trim() === '.benos/')
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

export async function initProject(options) {
  const root = await findProjectRoot(options.cwd ?? process.cwd())
  const { packageJson } = await loadProject(root)
  await checkProjectSetup(root, packageJson)

  const registry = options.registry ?? DEFAULT_REGISTRY
  const config = {
    $schema:
      'https://raw.githubusercontent.com/benosjs/benos/main/registry/v1/benos.schema.json',
    schemaVersion: 1,
    registry,
    style: 'benos',
    components: 'src/components/ui',
    css: 'src/styles/benos.css',
    alias: '@/',
  }
  const configPath = resolve(root, 'benos.json')
  const lockPath = resolve(root, 'benos.lock.json')
  const cssPath = resolve(root, config.css)
  await rejectSymlink(configPath, 'benos.json')
  await rejectSymlink(lockPath, 'benos.lock.json')
  const cacheDirectory = resolve(root, '.benos')
  const cacheStat = await rejectSymlink(
    cacheDirectory,
    '.benos cache directory',
  )
  if (cacheStat && !cacheStat.isDirectory())
    throw new Error(
      `Refusing to use non-directory .benos path: ${cacheDirectory}`,
    )
  const cssTarget = resolveConfigTarget(root, config, 'css/benos.css')
  await ensureTargetStaysInRoot(root, cssTarget)
  let existingConfig
  let existingLock
  try {
    existingConfig = await readJson(configPath, 'benos.json')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    existingLock = await readJson(lockPath, 'benos.lock.json')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (
    existingConfig &&
    Object.entries(config).some(([key, value]) => existingConfig[key] !== value)
  ) {
    throw new Error(
      'Refusing to replace a different benos.json. Review it and remove or update it manually before rerunning.',
    )
  }
  if (existingLock) validateLockData(existingLock)

  let existingCss
  try {
    existingCss = await readFile(cssPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (existingCss !== undefined && existingCss !== TOKENS_CSS) {
    throw new Error(
      `Refusing to replace different token stylesheet: ${config.css}`,
    )
  }

  const ignoreNeeded = !(await hasBenosIgnore(root))
  const writes = [
    existingConfig ? null : 'benos.json',
    existingLock ? null : 'benos.lock.json',
    existingCss !== undefined ? null : config.css,
    ignoreNeeded ? '.gitignore (.benos/ entry)' : null,
  ].filter(Boolean)
  if (writes.length === 0) {
    console.log(`Benos UI is already initialized in ${root}`)
    return
  }
  await confirmPlan(
    `Initialize Benos UI in ${root}; write ${writes.join(', ')}?`,
    options.yes,
  )

  if (!existingConfig)
    await writeTextSafely(configPath, formatJson(config), 'benos.json')
  if (!existingLock)
    await writeTextSafely(lockPath, formatJson(emptyLock()), 'benos.lock.json')
  if (existingCss === undefined)
    await writeTextSafely(cssPath, TOKENS_CSS, 'token stylesheet')
  if (ignoreNeeded) await appendGitignore(root)
  await mkdir(resolve(root, '.benos'), { recursive: true })
  console.log(`Initialized Benos UI in ${root}`)
  console.log(`Changed: ${writes.join(', ')}`)
  console.log(
    'Next: commit benos.lock.json; use benos add <name> to copy a component.',
  )
}

import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import process from 'node:process'
import { isSafePosixRelativePath } from './path-safety.mjs'

export const DEFAULT_REGISTRY =
  'https://raw.githubusercontent.com/benosjs/benos/main/registry/v1/index.json'

const VITE_FILES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
]
const TSCONFIG_FILES = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json']

export const TOKENS_CSS = `:root,
[data-theme='light'] {
  color-scheme: light;
  --benos-color-brand: #12306b;
  --benos-color-brand-strong: #0b204a;
  --benos-color-brand-soft: #e8eef9;
  --benos-color-canvas: #f7f9fc;
  --benos-color-surface: #ffffff;
  --benos-color-surface-raised: #ffffff;
  --benos-color-text: #172033;
  --benos-color-text-muted: #566176;
  --benos-color-border: #d8deea;
  --benos-color-focus: #2459b2;
  --benos-color-danger: #b42318;
  --benos-color-danger-strong: #8f1c14;
  --benos-color-success: #16794b;
  --benos-color-warning: #8a4b08;
  --benos-color-on-brand: #ffffff;
  --benos-color-on-danger: #ffffff;
  --benos-space-1: 0.25rem;
  --benos-space-2: 0.5rem;
  --benos-space-3: 0.75rem;
  --benos-space-4: 1rem;
  --benos-space-5: 1.5rem;
  --benos-space-6: 2rem;
  --benos-space-7: 3rem;
  --benos-space-8: 4rem;
  --benos-radius-sm: 0.25rem;
  --benos-radius-md: 0.5rem;
  --benos-radius-lg: 0.75rem;
  --benos-radius-pill: 999px;
  --benos-font-sans: system-ui, sans-serif;
  --benos-font-mono: ui-monospace, monospace;
  --benos-text-xs: 0.75rem;
  --benos-text-sm: 0.875rem;
  --benos-text-md: 1rem;
  --benos-text-lg: 1.25rem;
  --benos-text-xl: 1.5rem;
  --benos-line-height-body: 1.5;
  --benos-line-height-heading: 1.2;
  --benos-shadow-sm: 0 1px 2px rgb(23 32 51 / 8%);
  --benos-shadow-md: 0 8px 24px rgb(23 32 51 / 12%);
  --benos-shadow-overlay: 0 16px 48px rgb(23 32 51 / 18%);
  --benos-motion-fast: 120ms;
  --benos-motion-normal: 200ms;
  --benos-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --benos-z-dropdown: 10;
  --benos-z-popover: 20;
  --benos-z-dialog: 30;
  --benos-z-toast: 40;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']),
  [data-theme='dark'] {
    color-scheme: dark;
    --benos-color-brand: #a9c4ff;
    --benos-color-brand-strong: #c7d8ff;
    --benos-color-brand-soft: #263653;
    --benos-color-canvas: #101728;
    --benos-color-surface: #172238;
    --benos-color-surface-raised: #202e47;
    --benos-color-text: #f3f6fc;
    --benos-color-text-muted: #bdc8dc;
    --benos-color-border: #3a4964;
    --benos-color-focus: #b4ccff;
    --benos-color-danger: #ff6b61;
    --benos-color-danger-strong: #ff8a80;
    --benos-color-success: #8fe0b2;
    --benos-color-warning: #ffd08a;
    --benos-color-on-brand: #102044;
    --benos-color-on-danger: #172238;
  }
}

[data-theme='dark'] {
  color-scheme: dark;
  --benos-color-brand: #a9c4ff;
  --benos-color-brand-strong: #c7d8ff;
  --benos-color-brand-soft: #263653;
  --benos-color-canvas: #101728;
  --benos-color-surface: #172238;
  --benos-color-surface-raised: #202e47;
  --benos-color-text: #f3f6fc;
  --benos-color-text-muted: #bdc8dc;
  --benos-color-border: #3a4964;
  --benos-color-focus: #b4ccff;
  --benos-color-danger: #ff6b61;
  --benos-color-danger-strong: #ff8a80;
  --benos-color-success: #8fe0b2;
  --benos-color-warning: #ffd08a;
  --benos-color-on-brand: #102044;
  --benos-color-on-danger: #172238;
}
`

export async function readJson(path, label = path) {
  let contents
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    const wrapped = new Error(`Cannot read ${label}: ${error.message}`, {
      cause: error,
    })
    wrapped.code = error.code
    throw wrapped
  }
  try {
    return JSON.parse(contents)
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`, {
      cause: error,
    })
  }
}

export async function findProjectRoot(start = process.cwd()) {
  let current = resolve(start)
  for (;;) {
    try {
      await access(resolve(current, 'package.json'))
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) {
        throw new Error(
          `No package.json found from ${start}; run this command inside a Benos project.`,
        )
      }
      current = parent
    }
  }
}

export async function rejectSymlink(path, label) {
  try {
    const stat = await lstat(path)
    if (stat.isSymbolicLink())
      throw new Error(`Refusing symlinked ${label}: ${path}`)
    return stat
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function chooseConfig(root, names, label) {
  const found = []
  for (const name of names) {
    try {
      await access(resolve(root, name))
      found.push(name)
    } catch {
      // Missing candidates are expected.
    }
  }
  if (found.length === 0)
    throw new Error(`No ${label} found in ${root}; add a supported ${label}.`)
  return found
}

function viteHasAlias(source) {
  const hasAliasProperty = /\balias\s*:/m.test(source)
  const hasAliasObjectKey = /['"]@['"]\s*:/m.test(source)
  const hasAliasArrayEntry = /\bfind\s*:\s*['"]@['"]/m.test(source)
  return hasAliasProperty && (hasAliasObjectKey || hasAliasArrayEntry)
}

function tsconfigHasAlias(config) {
  const paths = config?.compilerOptions?.paths
  return (
    Array.isArray(paths?.['@/*']) &&
    paths['@/*'].some((value) => value === 'src/*' || value === './src/*')
  )
}

export async function checkProjectSetup(root, packageJson) {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  }
  if (!dependencies['@benosjs/dom']) {
    throw new Error(
      'This project does not declare @benosjs/dom. Install @benosjs/dom and its Vite compiler plugin before running benos init.',
    )
  }

  const viteFiles = await chooseConfig(root, VITE_FILES, 'Vite config')
  if (viteFiles.length > 1) {
    throw new Error(
      `Multiple Vite configs found (${viteFiles.join(', ')}); keep one active config before running benos init.`,
    )
  }
  const viteFile = viteFiles[0]
  const viteSource = await readFile(resolve(root, viteFile), 'utf8')
  const viteMissing = !viteHasAlias(viteSource)

  const tsconfigFiles = await chooseConfig(
    root,
    TSCONFIG_FILES,
    'TypeScript config',
  )
  const parsedConfigs = await Promise.all(
    tsconfigFiles.map(async (name) => [
      name,
      await readJson(resolve(root, name), name),
    ]),
  )
  const tsconfigEntry = parsedConfigs.find(([, config]) =>
    tsconfigHasAlias(config),
  )
  const tsconfigMissing = !tsconfigEntry

  if (viteMissing || tsconfigMissing) {
    const lines = ['Benos UI setup requires the @/ alias in both resolvers.']
    if (viteMissing) {
      lines.push(
        `\nAdd these lines to ${viteFile} and merge the resolve.alias entry with any existing aliases:`,
        "import { fileURLToPath, URL } from 'node:url'",
        '',
        'resolve: {',
        "  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },",
        '},',
      )
    }
    if (tsconfigMissing) {
      lines.push(
        `\nAdd these compiler options to ${tsconfigFiles[0]}:`,
        '"baseUrl": ".",',
        '"paths": { "@/*": ["src/*"] },',
      )
    }
    throw new Error(`${lines.join('\n')}\nThen rerun benos init.`)
  }
}

function normalizeRelativePath(value, label) {
  if (!isSafePosixRelativePath(value) || isAbsolute(value)) {
    throw new Error(`${label} must be a safe project-relative POSIX path.`)
  }
  const parts = value.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label} cannot contain empty, . or .. path segments.`)
  }
  return parts.join(sep)
}

export function resolveConfigTarget(root, config, target) {
  const parts = target.split('/')
  const category = parts.shift()
  const remainder = parts.join('/')
  if (!remainder || (category !== 'components' && category !== 'css')) {
    throw new Error(
      `Registry target ${target} must begin with components/ or css/.`,
    )
  }
  normalizeRelativePath(target, `Registry target ${target}`)
  const base =
    category === 'components' ? config.components : posix.dirname(config.css)
  const relativeTarget = normalizeRelativePath(
    `${base}/${remainder}`,
    `Registry target ${target}`,
  )
  const absolute = resolve(root, relativeTarget)
  const rel = relative(resolve(root), absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Registry target ${target} escapes the project root.`)
  }
  return { absolute, relative: relativeTarget.split(sep).join('/') }
}

export async function ensureTargetStaysInRoot(root, target) {
  const rootResolved = resolve(root)
  let existing = target.absolute
  for (;;) {
    try {
      existing = await realpath(existing)
      break
    } catch {
      const parent = dirname(existing)
      if (parent === existing) break
      existing = parent
    }
  }
  const rootReal = await realpath(rootResolved)
  const rel = relative(rootReal, existing)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `Target ${target.relative} resolves outside the project root.`,
    )
  }
}

export async function confirmPlan(question, yes) {
  if (yes) return
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      'This command needs confirmation in a non-interactive session. Review the plan and rerun with --yes.',
    )
  }
  const terminal = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await terminal.question(`${question} [y/N] `)
    if (!/^y(?:es)?$/i.test(answer.trim())) throw new Error('Cancelled.')
  } finally {
    terminal.close()
  }
}

export async function writeTextSafely(path, content, label = path) {
  try {
    const existing = await readFile(path, 'utf8')
    if (existing === content) return false
    throw new Error(`Refusing to replace different existing ${label}: ${path}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, { flag: 'wx' })
  return true
}

export async function loadProject(root = process.cwd()) {
  const packagePath = resolve(root, 'package.json')
  const packageJson = await readJson(packagePath, 'package.json')
  return { packagePath, packageJson }
}

export function emptyLock() {
  return { schemaVersion: 1, items: {} }
}

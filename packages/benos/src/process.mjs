import spawn from 'cross-spawn'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const SUPPORTED = new Set(['npm', 'pnpm', 'yarn', 'bun'])

export function parsePackageManager(userAgent = '') {
  const match = /^(npm|pnpm|yarn|bun)\//.exec(userAgent)
  return match?.[1]
}

export async function detectPackageManager(root, explicit, env = process.env) {
  if (explicit) {
    if (!SUPPORTED.has(explicit))
      throw new Error(
        `Unsupported package manager ${explicit}; use npm, pnpm, yarn, or bun.`,
      )
    return explicit
  }
  const fromAgent = parsePackageManager(env.npm_config_user_agent)
  if (fromAgent) return fromAgent

  const lockfiles = [
    ['package-lock.json', 'npm'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
  ]
  const found = []
  for (const [file, manager] of lockfiles) {
    try {
      await access(resolve(root, file))
      if (!found.includes(manager)) found.push(manager)
    } catch {
      // No lockfile for this manager.
    }
  }
  if (found.length > 1)
    throw new Error(
      `Conflicting package-manager lockfiles found (${found.join(', ')}). Rerun with --package-manager npm|pnpm|yarn|bun.`,
    )
  return found[0]
}

export function packageManagerArgs(manager, packageSpecs) {
  switch (manager) {
    case 'npm':
      return ['npm', ['install', ...packageSpecs]]
    case 'pnpm':
      return ['pnpm', ['add', ...packageSpecs]]
    case 'yarn':
      return ['yarn', ['add', ...packageSpecs]]
    case 'bun':
      return ['bun', ['add', ...packageSpecs]]
    default:
      throw new Error(
        `No supported package manager selected for ${packageSpecs.join(', ')}.`,
      )
  }
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      shell: false,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolve({ code: 0 })
      else {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`
        reject(new Error(`${command} ${args.join(' ')} failed with ${reason}.`))
      }
    })
  })
}

export function runManagerInstall(manager, specs, cwd) {
  if (!SUPPORTED.has(manager))
    throw new Error(`Unsupported package manager ${manager}.`)
  const [, args] = packageManagerArgs(manager, specs)
  return runCommand(manager, args, { cwd })
}

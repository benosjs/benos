#!/usr/bin/env node
/* global console, process */
import { cp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const packageRoot = dirname(fileURLToPath(import.meta.url))
const templateRoot = resolve(packageRoot, '../template')

function usage() {
  return `Usage: create-benos [directory] [options]

Options:
  --yes                  confirm writing into a non-empty directory
  --git                  run git init after scaffolding
  --help                 show this message`
}

function packageManager() {
  const userAgent = process.env.npm_config_user_agent ?? ''
  if (userAgent.startsWith('pnpm/')) return 'pnpm'
  if (userAgent.startsWith('yarn/')) return 'yarn'
  if (userAgent.startsWith('bun/')) return 'bun'
  return 'npm'
}

function parseArgs(args) {
  let directory
  let yes = false
  let git = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--yes') {
      yes = true
      continue
    }
    if (arg === '--git') {
      git = true
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    if (directory) throw new Error(`Unexpected argument: ${arg}`)
    directory = arg
  }
  return { directory: directory ?? 'benos-app', yes, git }
}

async function isNonEmpty(directory) {
  if (!existsSync(directory)) return false
  return (await readdir(directory)).length > 0
}

async function confirmOverwrite(directory, yes) {
  if (!(await isNonEmpty(directory))) return
  if (yes) return
  if (!process.stdin.isTTY)
    throw new Error(
      `Refusing to overwrite non-empty directory: ${directory}. Re-run with --yes after confirming.`,
    )
  const readline = await import('node:readline/promises')
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const answer = await input.question(
      `Directory ${directory} is not empty. Continue? [y/N] `,
    )
    if (!/^y(?:es)?$/i.test(answer.trim()))
      throw new Error('Scaffolding cancelled.')
  } finally {
    input.close()
  }
}

async function replacePlaceholders(directory, manager) {
  const packageFile = join(directory, 'package.json')
  const packageJson = JSON.parse(await readFile(packageFile, 'utf8'))
  packageJson.name =
    directory.split(/[\\/]/).filter(Boolean).at(-1) ?? 'benos-app'
  packageJson.private = true
  packageJson.createBenosPackageManager = manager
  await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`)
  const readme = join(directory, 'README.md')
  const contents = await readFile(readme, 'utf8')
  await writeFile(readme, contents.replaceAll('__PACKAGE_MANAGER__', manager))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const directory = resolve(process.cwd(), options.directory)
  await confirmOverwrite(directory, options.yes)
  await mkdir(directory, { recursive: true })
  await cp(templateRoot, directory, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })
  const manager = packageManager()
  await replacePlaceholders(directory, manager)
  if (options.git) await run('git', ['init'], { cwd: directory })
  console.log(`Created a Benos app in ${directory}`)
  console.log(`Detected package manager: ${manager}`)
  console.log(
    `Next steps: cd ${options.directory} && ${manager} install && ${manager} run dev`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

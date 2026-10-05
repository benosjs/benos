#!/usr/bin/env node
/* global console, process */
import { cp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'cross-spawn'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const templateRoot = resolve(packageRoot, '../template')

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: false,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`
        reject(new Error(`${command} ${args.join(' ')} failed with ${reason}.`))
      }
    })
  })
}

function usage() {
  return `Usage: create-benos [directory] [options]

Options:
  --yes                  confirm writing into a non-empty directory
  --ui                   initialize Benos UI and add Button and Input
  --no-ui                skip Benos UI setup (default)
  --registry <url>       use this registry when --ui is enabled
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
  let ui
  let registry
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
    if (arg === '--ui') {
      if (ui === false) throw new Error('Use only one of --ui or --no-ui.')
      ui = true
      continue
    }
    if (arg === '--no-ui') {
      if (ui === true) throw new Error('Use only one of --ui or --no-ui.')
      ui = false
      continue
    }
    if (arg === '--registry') {
      const value = args[++index]
      if (!value || value.startsWith('-'))
        throw new Error('Option --registry requires a URL or file path.')
      registry = value
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    if (directory) throw new Error(`Unexpected argument: ${arg}`)
    directory = arg
  }
  return { directory: directory ?? 'benos-app', yes, git, ui, registry }
}

async function confirmUiChoice(ui) {
  if (ui !== undefined) return ui
  if (!process.stdin.isTTY) return false
  const readline = await import('node:readline/promises')
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const answer = await input.question('Add Benos UI components? [y/N] ')
    return /^y(?:es)?$/i.test(answer.trim())
  } finally {
    input.close()
  }
}

async function setupUi(directory, manager, registry) {
  const cli = fileURLToPath(import.meta.resolve('benos/src/index.mjs'))
  const registryArgs = registry ? ['--registry', registry] : []
  const installArgs = {
    npm: ['install'],
    pnpm: ['install'],
    yarn: ['install'],
    bun: ['install'],
  }[manager]
  await runCommand(manager, installArgs, { cwd: directory })
  await runCommand(process.execPath, [cli, 'init', '--yes', ...registryArgs], {
    cwd: directory,
  })
  await runCommand(
    process.execPath,
    [
      cli,
      'add',
      'button',
      'input',
      '--yes',
      '--package-manager',
      manager,
      ...registryArgs,
    ],
    { cwd: directory },
  )
  const uiMain = await readFile(
    join(packageRoot, '../starter-ui/main.tsx'),
    'utf8',
  )
  await writeFile(join(directory, 'src/main.tsx'), uiMain)
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
  const withUi = await confirmUiChoice(options.ui)
  await mkdir(directory, { recursive: true })
  await cp(templateRoot, directory, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })
  const manager = packageManager()
  await replacePlaceholders(directory, manager)
  if (withUi) await setupUi(directory, manager, options.registry)
  if (options.git) await runCommand('git', ['init'], { cwd: directory })
  console.log(`Created a Benos app in ${directory}`)
  console.log(`Detected package manager: ${manager}`)
  if (withUi) {
    console.log(
      `Added Benos UI Button and Input. Start the app with: cd ${options.directory} && ${manager} run dev`,
    )
  } else {
    console.log(
      `Next steps: cd ${options.directory} && ${manager} install && ${manager} run dev`,
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

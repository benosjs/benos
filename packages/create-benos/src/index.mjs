#!/usr/bin/env node
/* global console, process */
import { cp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'cross-spawn'
import * as prompts from '@clack/prompts'

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
    let interrupted = false
    const handleInterrupt = () => {
      if (interrupted) return
      interrupted = true
      if (process.platform === 'win32' && child.pid) {
        const treeKiller = spawn(
          'taskkill',
          ['/PID', String(child.pid), '/T', '/F'],
          { stdio: 'ignore', shell: false },
        )
        treeKiller.once('error', () => child.kill('SIGINT'))
        treeKiller.once('close', (code) => {
          if (code !== 0) child.kill('SIGINT')
        })
      } else {
        child.kill('SIGINT')
      }
    }
    if (options.allowInterrupt) process.on('SIGINT', handleInterrupt)
    child.once('error', (error) => {
      if (options.allowInterrupt) process.off('SIGINT', handleInterrupt)
      reject(error)
    })
    child.once('close', (code, signal) => {
      if (options.allowInterrupt) process.off('SIGINT', handleInterrupt)
      if (code === 0 || (interrupted && options.allowInterrupt))
        resolvePromise({ interrupted })
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
  --yes                  accept prompt defaults without prompting
  --ui                   initialize Benos UI and add Button and Input
  --no-ui                skip Benos UI setup (default)
  --install              install dependencies
  --no-install           skip dependency installation
  --start                start the dev server after installation
  --no-start             do not start the dev server
  --registry <url>       use this registry when --ui is enabled
  --git                  run git init after scaffolding
  --help                 show this message

Without a terminal, create-benos uses prompt defaults and never starts the
dev server unless --start is passed. --yes accepts defaults; pass --no-start
to keep the command from staying open in an interactive terminal.`
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
  let install
  let start
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
    if (arg === '--install') {
      if (install === false)
        throw new Error('Use only one of --install or --no-install.')
      install = true
      continue
    }
    if (arg === '--no-install') {
      if (install === true)
        throw new Error('Use only one of --install or --no-install.')
      install = false
      continue
    }
    if (arg === '--start') {
      if (start === false)
        throw new Error('Use only one of --start or --no-start.')
      start = true
      continue
    }
    if (arg === '--no-start') {
      if (start === true)
        throw new Error('Use only one of --start or --no-start.')
      start = false
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
  return { directory, yes, git, ui, install, start, registry }
}

function hasTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function promptValue(value, label) {
  if (prompts.isCancel(value)) {
    prompts.cancel('Scaffolding cancelled.')
    throw new Error(`Cancelled while asking: ${label}`)
  }
  return value
}

function manualSteps(projectName, manager, withUi, registry) {
  const steps = [`cd ${projectName}`, `${manager} install`]
  if (withUi) {
    const registryArgs = registry ? ` --registry ${registry}` : ''
    steps.push(
      `npx benos init --yes${registryArgs}`,
      `npx benos add button input --yes${registryArgs}`,
    )
  }
  steps.push(`${manager} run dev`)
  return steps.map((step) => `  ${step}`).join('\n')
}

async function chooseProjectName(directory, interactive) {
  if (directory) return directory
  if (!interactive) return 'benos-app'
  const name = promptValue(
    await prompts.text({
      message: 'What is your project named?',
      placeholder: 'benos-app',
      initialValue: 'benos-app',
      validate(value) {
        if (!value.trim()) return 'Enter a project name.'
      },
    }),
    'project name',
  )
  return name.trim()
}

async function chooseUi(override, interactive) {
  if (override !== undefined) return override
  if (!interactive) return false
  const selected = promptValue(
    await prompts.confirm({
      message: 'Add Benos UI components?',
      initialValue: false,
    }),
    'Benos UI setup',
  )
  return selected
}

async function chooseInstallAndStart(options, manager, interactive) {
  let accepted = false
  const actionsSpecified =
    options.install !== undefined || options.start !== undefined
  if (interactive && !options.yes && !actionsSpecified) {
    accepted = promptValue(
      await prompts.confirm({
        message: `Install with ${manager} and start now?`,
        initialValue: true,
      }),
      'installation and startup',
    )
  }

  const install = actionsSpecified
    ? (options.install ?? true)
    : interactive
      ? accepted || options.yes
      : true
  const start = actionsSpecified
    ? (options.start ?? false)
    : interactive
      ? accepted || options.yes
      : false
  if (start && !install)
    throw new Error('Cannot use --start with --no-install. Add --install.')
  return { install, start }
}

async function setupUi(directory, manager, registry) {
  const cli = fileURLToPath(import.meta.resolve('benos/src/index.mjs'))
  const registryArgs = registry ? ['--registry', registry] : []
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
}

async function writeUiStarter(directory) {
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

async function confirmOverwrite(directory, yes, interactive) {
  if (!(await isNonEmpty(directory))) return
  if (yes) return
  if (!interactive)
    throw new Error(
      `Refusing to overwrite non-empty directory: ${directory}. Re-run with --yes after confirming.`,
    )
  const answer = promptValue(
    await prompts.confirm({
      message: `Directory ${directory} is not empty. Continue?`,
      initialValue: false,
    }),
    'overwrite confirmation',
  )
  if (!answer) throw new Error('Scaffolding cancelled.')
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
  const interactive = hasTerminal()
  const shouldPrompt = interactive && !options.yes
  const projectName = await chooseProjectName(options.directory, shouldPrompt)
  const manager = packageManager()
  const withUi = await chooseUi(options.ui, shouldPrompt)
  const actions = await chooseInstallAndStart(options, manager, interactive)
  const directory = resolve(process.cwd(), projectName)
  await confirmOverwrite(directory, options.yes, shouldPrompt)
  await mkdir(directory, { recursive: true })
  await cp(templateRoot, directory, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })
  await replacePlaceholders(directory, manager)
  if (withUi) await writeUiStarter(directory)
  try {
    if (actions.install)
      await runCommand(manager, ['install'], { cwd: directory })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Dependency installation failed: ${detail}\nProject files were left in place at ${directory}.\nManual steps:\n${manualSteps(projectName, manager, withUi, options.registry)}`,
      { cause: error },
    )
  }
  if (withUi && actions.install)
    await setupUi(directory, manager, options.registry)
  if (options.git) await runCommand('git', ['init'], { cwd: directory })
  console.log(`Created a Benos app in ${directory}`)
  console.log(`Detected package manager: ${manager}`)
  if (withUi) console.log('Added Benos UI Button and Input.')
  if (actions.start) {
    console.log(`Starting the development server with ${manager} run dev...`)
    await runCommand(manager, ['run', 'dev'], {
      cwd: directory,
      allowInterrupt: true,
    })
    console.log('Development server stopped.')
    return
  }
  if (!actions.install) {
    if (withUi) {
      console.log(
        `Next steps:\n${manualSteps(projectName, manager, true, options.registry)}`,
      )
    } else {
      console.log(
        `Next steps: cd ${projectName} && ${manager} install && ${manager} run dev`,
      )
    }
  } else {
    console.log(`Next steps: cd ${projectName} && ${manager} run dev`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

#!/usr/bin/env node
/* global console, process */

import { addItems } from './add.mjs'
import { diffItems } from './diff.mjs'
import { initProject } from './init.mjs'
import { printInfo } from './info.mjs'
import { listItems } from './list.mjs'
import { updateItems } from './update.mjs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageManifest = JSON.parse(
  await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
)

const COMMAND_HELP = {
  init: `Usage: benos init [options]

Initialize Benos UI in the current project. Creates benos.json, token CSS,
and the local cache ignore entry after checking the project configuration.

Options:
  --yes                    Accept the displayed plan
  --registry <url-or-file> Override the registry index
  --help, -h               Show this command help`,
  add: `Usage: benos add <name...> [options]

Copy registry components into the current project and install their declared
dependencies when needed.

Options:
  --yes                         Accept the displayed plan
  --registry <url-or-file>      Override the registry index
  --package-manager <manager>   Select npm, pnpm, yarn, or bun
  --help, -h                    Show this command help`,
  list: `Usage: benos list [--installed] [options]

List available registry components, or local components with --installed.

Options:
  --installed              List components installed in this project
  --registry <url-or-file> Override the registry index
  --help, -h               Show this command help`,
  diff: `Usage: benos diff [name] [options]

Compare local files with the installed base and current registry version.
With no name, inspect all installed components.

Options:
  --registry <url-or-file> Override the registry index
  --help, -h               Show this command help`,
  update: `Usage: benos update [name] [options]

Safely merge upstream changes into local component files. With no name,
inspect all installed components.

Options:
  --yes                    Accept the displayed update plan
  --registry <url-or-file> Override the registry index
  --help, -h               Show this command help`,
  info: `Usage: benos info

Show the installed Benos package versions and local runtime environment.
Outside a Benos project, show the CLI and environment versions only.

Options:
  --help, -h               Show this command help`,
}

const HELP = `Usage: benos <command> [options]

Commands:
  init                 Initialize Benos UI in the current project
  add <name...>        Copy component source from the configured registry
  list                 List registry components
  list --installed     List locally installed components
  diff [name]          Compare installed files with their pinned base and registry
  update [name]        Safely merge newer registry source into installed files
  info                 Show installed versions and environment details

Options:
  --version, -v                 Show the CLI version
  --help, -h                    Show this message
  --yes                         Accept the displayed update plan
  --registry <url-or-file>      Override the registry index for this command
  --package-manager <manager>   Select npm, pnpm, yarn, or bun for dependency installs

With no name, diff and update inspect all installed components. Updates preserve
local changes, and conflicting components are written to .benos/conflicts.`

function takeValue(args, index, option) {
  const value = args[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${option} requires a value.`)
  return value
}

function parseOptions(command, args) {
  const options = { names: [] }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      console.log(COMMAND_HELP[command] ?? HELP)
      process.exit(0)
    }
    if (arg === '--yes') {
      options.yes = true
      continue
    }
    if (arg === '--installed') {
      if (command !== 'list')
        throw new Error('--installed is only valid for benos list.')
      options.installed = true
      continue
    }
    if (arg === '--registry') {
      options.registry = takeValue(args, index, arg)
      index += 1
      continue
    }
    if (arg === '--package-manager') {
      options.packageManager = takeValue(args, index, arg)
      index += 1
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    if (command === 'add' || command === 'diff' || command === 'update')
      options.names.push(arg)
    else throw new Error(`Unexpected argument for benos ${command}: ${arg}`)
  }
  return options
}

export async function runCli(args) {
  const [command, ...rest] = args
  if (command === '--version' || command === '-v') {
    console.log(packageManifest.version)
    return
  }
  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (!Object.hasOwn(COMMAND_HELP, command)) {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`)
  }
  const options = parseOptions(command, rest)
  if (command === 'info') return printInfo(packageManifest.version)
  if (command === 'init') return initProject(options)
  if (command === 'add') return addItems(options)
  if (command === 'diff') return diffItems(options)
  if (command === 'update') return updateItems(options)
  return listItems(options)
}

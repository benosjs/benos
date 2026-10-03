#!/usr/bin/env node
/* global console, process */

import { addItems } from './add.mjs'
import { initProject } from './init.mjs'
import { listItems } from './list.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const HELP = `Usage: benos <command> [options]

Commands:
  init                 Initialize Benos UI in the current project
  add <name...>        Copy component source from the configured registry
  list                 List registry components
  list --installed     List locally installed components

Options:
  --yes                         Accept the displayed non-destructive plan
  --registry <url-or-file>      Override the registry index for this command
  --package-manager <manager>   Select npm, pnpm, yarn, or bun for dependency installs
  --help                        Show this message

Run inside a Benos application. 'benos init' never edits an existing Vite config.`

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
      console.log(HELP)
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
    if (command === 'add') options.names.push(arg)
    else throw new Error(`Unexpected argument for benos ${command}: ${arg}`)
  }
  return options
}

export async function runCli(args) {
  const [command, ...rest] = args
  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (!['init', 'add', 'list'].includes(command)) {
    throw new Error(`Unknown command: ${command}\n\n${HELP}`)
  }
  const options = parseOptions(command, rest)
  if (command === 'init') return initProject(options)
  if (command === 'add') return addItems(options)
  return listItems(options)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(
      `benos: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
}

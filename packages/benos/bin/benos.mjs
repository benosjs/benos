#!/usr/bin/env node
/* global console, process */

import { runCli } from '../src/index.mjs'

runCli(process.argv.slice(2)).catch((error) => {
  console.error(
    `benos: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})

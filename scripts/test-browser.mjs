/* global console */

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import process from 'node:process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const cli = resolve(root, 'node_modules/@playwright/test/cli.js')
let previousMode
let hadPreviousMode = false

if (process.platform === 'darwin') {
  const current = spawnSync('defaults', ['read', '-g', 'AppleKeyboardUIMode'], {
    encoding: 'utf8',
  })
  hadPreviousMode = current.status === 0
  if (hadPreviousMode) previousMode = current.stdout.trim()
  execFileSync('defaults', ['write', '-g', 'AppleKeyboardUIMode', '-int', '2'])
  console.log('Enabled full keyboard access for WebKit browser tests.')
}

let exitCode
try {
  exitCode = await new Promise((resolveExit) => {
    const child = spawn(process.execPath, [cli, 'test'], {
      cwd: root,
      stdio: 'inherit',
    })
    child.once('error', () => resolveExit(1))
    child.once('exit', (code, signal) => {
      resolveExit(code ?? (signal ? 1 : 0))
    })
  })
} finally {
  if (process.platform === 'darwin') {
    if (hadPreviousMode) {
      execFileSync('defaults', [
        'write',
        '-g',
        'AppleKeyboardUIMode',
        '-int',
        previousMode,
      ])
    } else {
      const removed = spawnSync(
        'defaults',
        ['delete', '-g', 'AppleKeyboardUIMode'],
        { stdio: 'ignore' },
      )
      if (removed.status !== 0 && removed.status !== 1) {
        console.error('Could not restore AppleKeyboardUIMode.')
      }
    }
    console.log('Restored the prior full keyboard access setting.')
  }
}

process.exitCode = exitCode

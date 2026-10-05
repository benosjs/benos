import { spawn } from 'node:child_process'
import process from 'node:process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const cli = resolve(root, 'node_modules/@playwright/test/cli.js')
const exitCode = await new Promise((resolveExit) => {
  const child = spawn(process.execPath, [cli, 'test', '--workers=2'], {
    cwd: root,
    stdio: 'inherit',
  })
  child.once('error', () => resolveExit(1))
  child.once('exit', (code, signal) => {
    resolveExit(code ?? (signal ? 1 : 0))
  })
})

process.exitCode = exitCode

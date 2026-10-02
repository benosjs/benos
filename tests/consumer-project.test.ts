import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exec, execFile } from 'node:child_process'
import { spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { describe, it } from 'vitest'

const run = promisify(execFile)
const runShell = promisify(exec)
const root = new URL('../', import.meta.url)

function runPnpm(args: string[], options: Parameters<typeof run>[1]) {
  if (process.platform !== 'win32') return run('pnpm', args, options)
  const command = ['pnpm.cmd', ...args]
    .map((argument) => `"${argument.replaceAll('"', '\\"')}"`)
    .join(' ')
  return runShell(command, options)
}

async function pack(packageName: string, destination: string): Promise<string> {
  const packageDirectory = new URL(`packages/${packageName}/`, root)
  await runPnpm(['pack', '--pack-destination', destination, '--silent'], {
    cwd: packageDirectory,
  })
  const files = await readdir(destination)
  const match = files.find((file) => file.startsWith(`benosjs-${packageName}-`))
  if (!match) throw new Error(`Could not find packed @benosjs/${packageName}`)
  return join(destination, match)
}

describe('packed consumer project', () => {
  it('type-checks and builds from packed packages', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'benos-consumer-'))
    const tarballs = join(temporary, 'packages')
    await mkdir(tarballs)
    try {
      const [core, dom, compiler, vite] = await Promise.all([
        pack('core', tarballs),
        pack('dom', tarballs),
        pack('compiler', tarballs),
        pack('vite', tarballs),
      ])
      const fixture = new URL('./fixtures/consumer-project/', import.meta.url)
      await cp(fixture, temporary, { recursive: true })
      const packageFile = join(temporary, 'package.json')
      const packageJson = JSON.parse(await readFile(packageFile, 'utf8')) as {
        dependencies: Record<string, string>
        pnpm?: { overrides?: Record<string, string> }
      }
      packageJson.dependencies['@benosjs/core'] = `file:${core}`
      packageJson.dependencies['@benosjs/dom'] = `file:${dom}`
      packageJson.dependencies['@benosjs/vite'] = `file:${vite}`
      packageJson.dependencies['@benosjs/compiler'] = `file:${compiler}`
      packageJson.pnpm = {
        overrides: {
          '@benosjs/core': `file:${core}`,
          '@benosjs/dom': `file:${dom}`,
          '@benosjs/compiler': `file:${compiler}`,
          '@benosjs/vite': `file:${vite}`,
        },
      }
      await writeFile(packageFile, JSON.stringify(packageJson, null, 2))
      await runPnpm(['install', '--ignore-scripts'], { cwd: temporary })
      await runPnpm(['run', 'typecheck'], { cwd: temporary })
      await runPnpm(['run', 'build'], { cwd: temporary })
      const server = spawn(
        'pnpm',
        ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '4174'],
        { cwd: temporary, stdio: 'ignore' },
      )
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            await page.goto('http://127.0.0.1:4174', {
              waitUntil: 'networkidle',
              timeout: 1_000,
            })
            break
          } catch (error) {
            if (attempt === 49) throw error
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        }
        await playwrightExpect(page.locator('#show')).toHaveCount(1)
        await playwrightExpect(page.locator('#consumer-portal')).toContainText(
          'portal',
        )
        await playwrightExpect(page.locator('h1')).toHaveText('Consumer')
        const body = page.locator('body')
        await playwrightExpect(body).toContainText('template helper')
        await playwrightExpect(body).toContainText('jsx helper')
        await playwrightExpect(body).toContainText('jsxs helper')
        await playwrightExpect(body).toContainText('jsxDEV helper')
        await playwrightExpect(body).toContainText('dynamic child helper')
      } finally {
        await browser.close()
        server.kill('SIGTERM')
      }
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }, 120_000)
})

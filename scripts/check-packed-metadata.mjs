/* global URL, console */

import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const publishable = [
  'core',
  'dom',
  'compiler',
  'vite',
  'eslint-plugin',
  'create-benos',
]

const temporary = await mkdtemp(join(tmpdir(), 'benos-packed-metadata-'))

try {
  for (const packageDirectory of publishable) {
    const destination = join(temporary, packageDirectory)
    await mkdir(destination)
    const packageRoot = join(root, 'packages', packageDirectory)
    await run('pnpm', ['pack', '--pack-destination', destination, '--silent'], {
      cwd: packageRoot,
    })
    const archives = (await readdir(destination)).filter((file) =>
      file.endsWith('.tgz'),
    )
    if (archives.length !== 1)
      throw new Error(`Expected one packed archive for ${packageDirectory}`)

    const archive = join(destination, archives[0])
    const { stdout: listing } = await run('tar', ['-tf', archive], {
      cwd: root,
    })
    const entries = listing
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const packageEntries = new Set(
      entries.map((entry) => entry.replace(/^package\//, '')),
    )
    const forbidden = entries.filter((entry) => {
      const path = entry.replace(/^package\//, '')
      return (
        path.endsWith('.tsbuildinfo') ||
        /^dist\/index(?:\.[^/]+)?(?:\.map)?$/.test(path)
      )
    })
    if (forbidden.length) {
      throw new Error(
        `Packed ${packageDirectory} includes forbidden build artifacts: ${forbidden.join(', ')}`,
      )
    }
    const manifests = listing
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.endsWith('package.json'))
    if (manifests.length === 0)
      throw new Error(`Packed ${packageDirectory} has no package.json`)
    for (const manifest of manifests) {
      const { stdout } = await run('tar', ['-xOf', archive, manifest], {
        cwd: root,
      })
      if (stdout.includes('workspace:')) {
        throw new Error(
          `Packed ${packageDirectory}/${manifest} contains a workspace: dependency`,
        )
      }
      const metadata = JSON.parse(stdout)
      const exports = metadata.exports
      if (exports) {
        const targets = []
        const collectTargets = (value) => {
          if (typeof value === 'string') targets.push(value)
          else if (value && typeof value === 'object')
            for (const target of Object.values(value)) collectTargets(target)
        }
        collectTargets(exports)
        for (const target of targets) {
          if (
            !target.startsWith('./dist/js/') &&
            !target.startsWith('./dist/types/')
          )
            throw new Error(
              `Packed ${packageDirectory} exports outside dist/js or dist/types: ${target}`,
            )
          if (!packageEntries.has(target.slice(2)))
            throw new Error(
              `Packed ${packageDirectory} export target is missing: ${target}`,
            )
        }
      }
    }
  }
  console.log(
    `Packed metadata check passed for ${publishable.length} publishable packages`,
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

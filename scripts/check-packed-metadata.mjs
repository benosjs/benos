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
      JSON.parse(stdout)
    }
  }
  console.log(
    `Packed metadata check passed for ${publishable.length} publishable packages`,
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

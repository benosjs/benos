/* global console, process */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import semver from 'semver'

const root = resolve(import.meta.dirname, '..')
const packages = [
  '@benosjs/core',
  '@benosjs/dom',
  '@benosjs/compiler',
  '@benosjs/vite',
  '@benosjs/eslint-plugin',
  '@benosjs/primitives',
  'benos',
  'create-benos',
]
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? '')

if (!match || !semver.valid(tag.slice(1))) {
  throw new Error(
    `Expected a stable vX.Y.Z release tag, received ${tag ?? '(none)'}`,
  )
}

const expectedVersion = tag.slice(1)
const mismatches = []
for (const name of packages) {
  const packagePath = resolve(root, 'packages', name.replace(/^@benosjs\//, ''))
  const manifest = JSON.parse(
    await readFile(resolve(packagePath, 'package.json'), 'utf8'),
  )
  if (manifest.version !== expectedVersion) {
    mismatches.push(
      `${name}: ${manifest.version} (expected ${expectedVersion})`,
    )
  }
}

if (mismatches.length) {
  throw new Error(
    `Release tag ${tag} does not match all package versions:\n${mismatches.join('\n')}`,
  )
}

console.log(
  `Release tag ${tag} matches all ${packages.length} package versions`,
)

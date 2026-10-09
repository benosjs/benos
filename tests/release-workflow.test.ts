import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checker = resolve(root, 'scripts/check-release-tag.mjs')
const currentVersion = JSON.parse(
  readFileSync(resolve(root, 'packages/core/package.json'), 'utf8'),
).version

function check(tag: string) {
  return spawnSync(process.execPath, [checker, tag], {
    cwd: root,
    encoding: 'utf8',
  })
}

describe('release tag validation', () => {
  it('accepts a tag matching all eight package versions', () => {
    const result = check(`v${currentVersion}`)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('matches all 8 package versions')
  })

  it('rejects a tag when the package versions do not match', () => {
    const result = check('v0.2.1')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('does not match all package versions')
    expect(result.stderr).toContain(
      `@benosjs/core: ${currentVersion} (expected 0.2.1)`,
    )
    expect(result.stderr).toContain(
      `create-benos: ${currentVersion} (expected 0.2.1)`,
    )
  })

  it('rejects a non-stable or malformed tag', () => {
    const result = check('v0.2.3-rc.1')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Expected a stable vX.Y.Z release tag')
  })
})

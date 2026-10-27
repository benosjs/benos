import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_REGISTRY,
  resolveRegistryUrl,
} from '../packages/benos/src/project.mjs'
import { loadIndex } from '../packages/benos/src/registry.mjs'

const { version } = JSON.parse(
  readFileSync(
    new URL('../packages/benos/package.json', import.meta.url),
    'utf8',
  ),
)
const tagIndex = (tag: string) =>
  `https://raw.githubusercontent.com/benosjs/benos/${tag}/registry/v1/index.json`

describe('resolveRegistryUrl', () => {
  it('pins the default registry to the CLI release tag', () => {
    expect(resolveRegistryUrl(DEFAULT_REGISTRY)).toBe(tagIndex(`v${version}`))
  })

  it('uses an explicit version when given', () => {
    expect(resolveRegistryUrl(DEFAULT_REGISTRY, '0.6.0')).toBe(
      tagIndex('v0.6.0'),
    )
  })

  it('leaves custom registries unchanged', () => {
    for (const url of [
      tagIndex('v0.4.0'),
      'https://example.com/registry/index.json',
      './registry/index.json',
    ])
      expect(resolveRegistryUrl(url)).toBe(url)
  })
})

describe('loadIndex', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the default registry from the CLI release tag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'benos-registry-url-'))
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: URL | string) => {
      requested.push(String(input))
      return new Response(
        JSON.stringify({ schemaVersion: 1, release: version, items: [] }),
        { headers: { 'content-type': 'application/json' } },
      )
    })
    try {
      await loadIndex(root, DEFAULT_REGISTRY, { deferCache: true })
      expect(requested).toEqual([tagIndex(`v${version}`)])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

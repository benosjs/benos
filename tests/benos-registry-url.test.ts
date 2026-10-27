import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REGISTRY,
  resolveRegistryUrl,
} from '../packages/benos/src/project.mjs'

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

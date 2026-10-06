import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const temporaryDirectories: string[] = []
const primitiveNames = [
  'accordion',
  'checkbox',
  'dialog',
  'menu',
  'popover',
  'radio-group',
  'select',
  'switch',
  'tabs',
  'toast',
  'tooltip',
] as const

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function productionModules(source: string): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), 'benos-primitives-consumer-'))
  temporaryDirectories.push(root)
  const entry = join(root, 'consumer.js')
  await writeFile(entry, source)
  const result = await build({
    configFile: false,
    root,
    mode: 'production',
    build: {
      write: false,
      minify: true,
      rollupOptions: {
        input: entry,
        external: (id) =>
          id.startsWith('@benosjs/core') || id.startsWith('@zag-js/'),
      },
    },
    resolve: {
      alias: [
        {
          find: /^@benosjs\/primitives\/(.+)$/,
          replacement: `${repositoryRoot}/packages/primitives/dist/js/$1.production.js`,
        },
      ],
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  return outputs.flatMap((item) => {
    if (!('output' in item)) return []
    return item.output.flatMap((output) =>
      'modules' in output ? Object.keys(output.modules) : [],
    )
  })
}

describe('@benosjs/primitives production tree shaking', () => {
  it('includes the requested machine subpath without the other machine entries', async () => {
    const modules = await productionModules(
      "import { createCheckbox } from '@benosjs/primitives/checkbox'; export { createCheckbox };",
    )
    expect(modules.some((id) => id.endsWith('/checkbox.production.js'))).toBe(
      true,
    )
    for (const name of primitiveNames) {
      if (name === 'checkbox') continue
      expect(modules.some((id) => id.endsWith(`/${name}.production.js`))).toBe(
        false,
      )
    }
  })

  it('includes no primitive modules when the consumer imports none', async () => {
    const modules = await productionModules('export const app = true;')
    expect(
      modules.filter((id) =>
        primitiveNames.some((name) => id.endsWith(`/${name}.production.js`)),
      ),
    ).toEqual([])
  })
})

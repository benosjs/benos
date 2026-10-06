import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { diffItems } from '../packages/benos/src/diff.mjs'
import { mergeText } from '../packages/benos/src/merge3.mjs'
import { updateItems } from '../packages/benos/src/update.mjs'
import {
  applyComponentTransaction,
  recoverIncompleteUpdates,
} from '../packages/benos/src/transactions.mjs'

type SourceFile = { path: string; content: string }
type SourceItem = {
  name: string
  title?: string
  files: SourceFile[]
  minimumBenosVersions?: Array<{ name: string; version: string }>
}
type RegistryPayload = {
  schemaVersion: 1
  release: string
  name: string
  type: 'registry:component'
  title: string
  description: string
  dependencies: Array<{ name: string; version: string }>
  minimumBenosVersions: Array<{ name: string; version: string }>
  registryDependencies: string[]
  files: Array<{
    path: string
    target: string
    contentType: 'text/typescript'
    content: string
    checksum: string
  }>
}
type RegistryEntry = {
  name: string
  type: 'registry:component'
  title: string
  description: string
  url: string
  dependencies: Array<{ name: string; version: string }>
  registryDependencies: string[]
  checksum: string
}
type RegistryBundle = {
  index: { schemaVersion: 1; release: string; items: RegistryEntry[] }
  indexBytes: Buffer
  indexUrl: string
  payloads: Map<string, Buffer>
  items: Map<string, RegistryPayload>
}
type LockEntry = {
  version: string
  checksum: string
  baseUrl: string
  title: string
  description: string
  dependencies: Array<{ name: string; version: string }>
  registryDependencies: string[]
  files: Array<{ path: string; target: string; checksum: string }>
}

const roots: string[] = []

function hash(bytes: string | Buffer) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

async function temporaryRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'benos-update-test-'))
  roots.push(directory)
  return directory
}

async function createRegistry(
  root: string,
  release: string,
  sourceItems: SourceItem[],
) {
  const itemsDirectory = join(root, 'items')
  await mkdir(itemsDirectory, { recursive: true })
  const entries: RegistryEntry[] = []
  const payloads = new Map<string, Buffer>()
  const items = new Map<string, RegistryPayload>()
  for (const source of sourceItems) {
    const item: RegistryPayload = {
      schemaVersion: 1,
      release,
      name: source.name,
      type: 'registry:component',
      title: source.title ?? source.name,
      description: `Fixture ${source.name}`,
      dependencies: [],
      minimumBenosVersions: source.minimumBenosVersions ?? [],
      registryDependencies: [],
      files: source.files.map((file) => ({
        path: file.path,
        target: `components/${source.name}/${file.path}`,
        contentType: 'text/typescript',
        content: file.content,
        checksum: hash(file.content),
      })),
    }
    const bytes = Buffer.from(`${JSON.stringify(item, null, 2)}\n`)
    const itemPath = join(itemsDirectory, `${source.name}.json`)
    await writeFile(itemPath, bytes)
    const entry = {
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      url: pathToFileURL(itemPath).href,
      dependencies: item.dependencies,
      registryDependencies: item.registryDependencies,
      checksum: hash(bytes),
    }
    entries.push(entry)
    payloads.set(source.name, bytes)
    items.set(source.name, item)
  }
  const indexPath = join(root, 'index.json')
  const index = { schemaVersion: 1, release, items: entries }
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`)
  return {
    index,
    indexBytes: Buffer.from(`${JSON.stringify(index, null, 2)}\n`),
    indexUrl: pathToFileURL(indexPath).href,
    payloads,
    items,
  } satisfies RegistryBundle
}

async function createProject(
  root: string,
  base: RegistryBundle,
  latest: RegistryBundle,
  local: Record<string, Record<string, string | undefined>> = {},
) {
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'fixture-app', type: 'module', dependencies: {} }, null, 2)}\n`,
  )
  await writeFile(
    join(root, 'benos.json'),
    `${JSON.stringify(
      {
        $schema: 'https://example.test/benos.schema.json',
        schemaVersion: 1,
        registry: latest.indexUrl,
        style: 'benos',
        components: 'src/components/ui',
        css: 'src/styles/benos.css',
        alias: '@/',
      },
      null,
      2,
    )}\n`,
  )
  const lockItems: Record<string, LockEntry> = {}
  for (const entry of base.index.items) {
    const item = base.items.get(entry.name)
    const files = []
    for (const file of item.files) {
      const relativeTarget = `src/components/ui/${entry.name}/${file.path}`
      const absolute = join(root, ...relativeTarget.split('/'))
      const localFiles = local[entry.name] ?? {}
      const value = Object.hasOwn(localFiles, file.path)
        ? localFiles[file.path]
        : file.content
      if (value !== undefined) {
        await mkdir(resolve(absolute, '..'), { recursive: true })
        await writeFile(absolute, value)
      }
      files.push({
        path: file.path,
        target: relativeTarget,
        checksum: file.checksum,
      })
    }
    lockItems[entry.name] = {
      version: item.release,
      checksum: entry.checksum,
      baseUrl: entry.url,
      title: item.title,
      description: item.description,
      dependencies: item.dependencies,
      registryDependencies: item.registryDependencies,
      files,
    }
  }
  await writeFile(
    join(root, 'benos.lock.json'),
    `${JSON.stringify({ schemaVersion: 1, items: lockItems }, null, 2)}\n`,
  )
  return lockItems
}

async function standardFixture(
  baseFiles: SourceFile[],
  latestFiles: SourceFile[],
  local?: Record<string, string | undefined>,
) {
  const root = await temporaryRoot()
  const base = await createRegistry(join(root, 'base'), '1.0.0', [
    { name: 'sample', files: baseFiles },
  ])
  const latest = await createRegistry(join(root, 'latest'), '1.1.0', [
    { name: 'sample', files: latestFiles },
  ])
  const lock = await createProject(root, base, latest, { sample: local ?? {} })
  return { root, base, latest, lock }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('three-way text merge', () => {
  it('merges edits to disjoint lines and preserves CRLF', () => {
    const result = mergeText(
      'one\ntwo\nthree\n',
      'ONE\r\ntwo\r\nthree\r\n',
      'one\ntwo\nTHREE\n',
    )
    expect(result).toEqual({
      conflicts: false,
      merged: 'ONE\r\ntwo\r\nTHREE\r\n',
    })
  })

  it('treats overlapping line edits as conflicts', () => {
    expect(mergeText('one\ntwo\n', 'one\nlocal\n', 'one\nincoming\n')).toEqual({
      conflicts: true,
    })
  })

  it('merges same-position insertions only when they are identical', () => {
    expect(mergeText('a\n', 'x\na\n', 'x\na\n')).toEqual({
      conflicts: false,
      merged: 'x\na\n',
    })
    expect(mergeText('a\n', 'x\na\n', 'y\na\n')).toEqual({
      conflicts: true,
    })
  })

  it('merges generated disjoint line edits', () => {
    const cases = fc
      .tuple(fc.integer({ min: 2, max: 40 }), fc.nat(), fc.nat())
      .filter(([length, left, right]) => left % length !== right % length)
    fc.assert(
      fc.property(cases, ([length, leftIndex, rightIndex]) => {
        const left = leftIndex % length
        const right = rightIndex % length
        const base = Array.from({ length }, (_, index) => `base-${index}`)
        const local = [...base]
        const incoming = [...base]
        const expected = [...base]
        local[left] = `local-${left}`
        incoming[right] = `upstream-${right}`
        expected[left] = local[left]
        expected[right] = incoming[right]
        const text = (lines: string[]) => `${lines.join('\n')}\n`
        expect(mergeText(text(base), text(local), text(incoming))).toEqual({
          conflicts: false,
          merged: text(expected),
        })
      }),
      { numRuns: 200 },
    )
  })
})

describe('benos diff and update', () => {
  it('classifies every per-file state without changing project files or cache', async () => {
    const files = ['same', 'local', 'upstream', 'both', 'missing'].map(
      (name) => ({
        path: `${name}.ts`,
        content: `export const ${name} = 'base'\n`,
      }),
    )
    const latestFiles = files.map((file) => {
      if (file.path === 'upstream.ts' || file.path === 'both.ts')
        return { ...file, content: file.content.replace('base', 'incoming') }
      return file
    })
    latestFiles.push({ path: 'new.ts', content: 'export const added = true\n' })
    const root = await temporaryRoot()
    const base = await createRegistry(join(root, 'base'), '1.0.0', [
      { name: 'sample', files },
    ])
    const latest = await createRegistry(join(root, 'latest'), '1.1.0', [
      { name: 'sample', files: latestFiles },
    ])
    await createProject(root, base, latest, {
      sample: {
        'local.ts': "export const local = 'mine'\n",
        'both.ts': "export const both = 'mine'\n",
        'missing.ts': undefined,
      },
    })
    const before = await readFile(join(root, 'benos.lock.json'))
    const reports = await diffItems({ cwd: root })
    const reportFiles = reports[0].files as Array<{
      path: string
      status: string
    }>
    const statuses = new Map(
      reportFiles.map((file) => [file.path, file.status]),
    )
    expect(statuses).toEqual(
      new Map([
        ['same.ts', 'unchanged'],
        ['local.ts', 'local edits only'],
        ['upstream.ts', 'upstream changes only'],
        ['both.ts', 'both changed'],
        ['missing.ts', 'missing locally'],
        ['new.ts', 'new upstream files'],
      ]),
    )
    expect(await readFile(join(root, 'benos.lock.json'))).toEqual(before)
    await expect(readFile(join(root, '.benos'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('updates an untouched component and advances its exact base in the lock', async () => {
    const fixture = await standardFixture(
      [{ path: 'main.ts', content: 'export const version = 1\n' }],
      [{ path: 'main.ts', content: 'export const version = 2\n' }],
    )
    await updateItems({ cwd: fixture.root, yes: true })
    expect(
      await readFile(
        join(fixture.root, 'src/components/ui/sample/main.ts'),
        'utf8',
      ),
    ).toBe('export const version = 2\n')
    const lock = JSON.parse(
      await readFile(join(fixture.root, 'benos.lock.json'), 'utf8'),
    )
    expect(lock.items.sample.version).toBe('1.1.0')
    expect(lock.items.sample.baseUrl).toBe(fixture.latest.index.items[0].url)
  })

  it('merges a local edit with disjoint incoming changes', async () => {
    const fixture = await standardFixture(
      [
        {
          path: 'main.ts',
          content:
            "export const first = 'base'\nexport const second = 'base'\n",
        },
      ],
      [
        {
          path: 'main.ts',
          content:
            "export const first = 'base'\nexport const second = 'upstream'\n",
        },
      ],
      {
        'main.ts':
          "export const first = 'local'\nexport const second = 'base'\n",
      },
    )
    await updateItems({ cwd: fixture.root, yes: true })
    expect(
      await readFile(
        join(fixture.root, 'src/components/ui/sample/main.ts'),
        'utf8',
      ),
    ).toBe("export const first = 'local'\nexport const second = 'upstream'\n")
  })

  it('keeps all component files and its lock entry unchanged on overlap', async () => {
    const fixture = await standardFixture(
      [
        { path: 'main.ts', content: "export const state = 'base'\n" },
        { path: 'helper.ts', content: 'export const helper = 1\n' },
      ],
      [
        { path: 'main.ts', content: "export const state = 'incoming'\n" },
        { path: 'helper.ts', content: 'export const helper = 2\n' },
      ],
      { 'main.ts': "export const state = 'local'\n" },
    )
    const source = join(fixture.root, 'src/components/ui/sample')
    const oldLock = await readFile(join(fixture.root, 'benos.lock.json'))
    await expect(updateItems({ cwd: fixture.root, yes: true })).rejects.toThrow(
      /conflict/,
    )
    expect(await readFile(join(source, 'main.ts'), 'utf8')).toBe(
      "export const state = 'local'\n",
    )
    expect(await readFile(join(source, 'helper.ts'), 'utf8')).toBe(
      'export const helper = 1\n',
    )
    expect(await readFile(join(fixture.root, 'benos.lock.json'))).toEqual(
      oldLock,
    )
    const conflictRoot = join(fixture.root, '.benos/conflicts')
    const [folder] = await import('node:fs/promises').then(({ readdir }) =>
      readdir(conflictRoot),
    )
    expect(
      await readFile(join(conflictRoot, folder, 'main.ts.base'), 'utf8'),
    ).toBe("export const state = 'base'\n")
    expect(
      await readFile(join(conflictRoot, folder, 'main.ts.local'), 'utf8'),
    ).toBe("export const state = 'local'\n")
    expect(
      await readFile(join(conflictRoot, folder, 'main.ts.incoming'), 'utf8'),
    ).toBe("export const state = 'incoming'\n")
    expect(
      await readFile(join(conflictRoot, folder, 'README.txt'), 'utf8'),
    ).toMatch(/source files and benos\.lock\.json unchanged/)
    expect(
      await readFile(join(conflictRoot, folder, 'README.txt'), 'utf8'),
    ).toMatch(/replace the source with the exact \.incoming copy/)
    expect(await readFile(join(source, 'main.ts'), 'utf8')).not.toMatch(
      /<<<<<<<|=======|>>>>>>>/,
    )
  })

  it('reports and preserves a deleted local file as an explicit conflict', async () => {
    const fixture = await standardFixture(
      [{ path: 'main.ts', content: 'export const base = true\n' }],
      [{ path: 'main.ts', content: 'export const base = true\n' }],
      { 'main.ts': undefined },
    )
    const report = await diffItems({ cwd: fixture.root })
    expect(report[0].files[0].status).toBe('missing locally')
    await expect(updateItems({ cwd: fixture.root, yes: true })).rejects.toThrow(
      /conflict/,
    )
    await expect(
      readFile(join(fixture.root, 'src/components/ui/sample/main.ts')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    const { readdir } = await import('node:fs/promises')
    const [folder] = await readdir(join(fixture.root, '.benos/conflicts'))
    expect(
      await readFile(
        join(fixture.root, '.benos/conflicts', folder, 'main.ts.local'),
        'utf8',
      ),
    ).toContain('missing locally')
  })

  it('refuses when the pinned base is unavailable and preserves local files', async () => {
    const fixture = await standardFixture(
      [{ path: 'main.ts', content: 'export const value = 1\n' }],
      [{ path: 'main.ts', content: 'export const value = 2\n' }],
    )
    const lockPath = join(fixture.root, 'benos.lock.json')
    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    lock.items.sample.baseUrl = 'https://127.0.0.1:1/unavailable.json'
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    const sourcePath = join(fixture.root, 'src/components/ui/sample/main.ts')
    const local = await readFile(sourcePath)
    await expect(updateItems({ cwd: fixture.root, yes: true })).rejects.toThrow(
      /base.*local files were preserved/i,
    )
    expect(await readFile(sourcePath)).toEqual(local)
    expect(
      JSON.parse(await readFile(lockPath, 'utf8')).items.sample.version,
    ).toBe('1.0.0')
  })

  it('updates offline from checksum-validated cached index, item, and pinned base', async () => {
    const fixture = await standardFixture(
      [{ path: 'main.ts', content: 'export const value = 1\n' }],
      [{ path: 'main.ts', content: 'export const value = 2\n' }],
    )
    const latestEntry = fixture.latest.index.items[0]
    latestEntry.url = 'https://127.0.0.1:1/latest-item.json'
    const indexBytes = Buffer.from(
      `${JSON.stringify(fixture.latest.index, null, 2)}\n`,
    )
    const projectConfigPath = join(fixture.root, 'benos.json')
    const config = JSON.parse(await readFile(projectConfigPath, 'utf8'))
    config.registry = 'https://127.0.0.1:1/index.json'
    await writeFile(projectConfigPath, `${JSON.stringify(config, null, 2)}\n`)
    const cache = join(fixture.root, '.benos/cache')
    await mkdir(cache, { recursive: true })
    await writeFile(join(cache, 'index.json'), indexBytes)
    await writeFile(
      join(cache, 'items-sample.json'),
      fixture.latest.payloads.get('sample'),
    )
    const record = fixture.lock.sample
    const checksumPart = record.checksum.slice(
      'sha256:'.length,
      'sha256:'.length + 16,
    )
    const baseName = `base-sample-${record.version}-${checksumPart}.json`
    await writeFile(join(cache, baseName), fixture.base.payloads.get('sample'))
    const lockPath = join(fixture.root, 'benos.lock.json')
    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    lock.items.sample.baseUrl = 'https://127.0.0.1:1/pinned-base.json'
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    await updateItems({ cwd: fixture.root, yes: true })
    expect(
      await readFile(
        join(fixture.root, 'src/components/ui/sample/main.ts'),
        'utf8',
      ),
    ).toBe('export const value = 2\n')
  })

  it('preserves CRLF in the updated file', async () => {
    const fixture = await standardFixture(
      [{ path: 'main.ts', content: 'one\ntwo\nthree\n' }],
      [{ path: 'main.ts', content: 'one\ntwo\nTHREE\n' }],
      { 'main.ts': 'ONE\r\ntwo\r\nthree\r\n' },
    )
    await updateItems({ cwd: fixture.root, yes: true })
    expect(
      await readFile(
        join(fixture.root, 'src/components/ui/sample/main.ts'),
        'utf8',
      ),
    ).toBe('ONE\r\ntwo\r\nTHREE\r\n')
  })

  it('updates independent components while preserving a component with conflicts', async () => {
    const root = await temporaryRoot()
    const base = await createRegistry(join(root, 'base'), '1.0.0', [
      {
        name: 'alpha',
        files: [{ path: 'main.ts', content: 'export const value = 1\n' }],
      },
      {
        name: 'beta',
        files: [{ path: 'main.ts', content: 'export const value = 1\n' }],
      },
    ])
    const latest = await createRegistry(join(root, 'latest'), '1.1.0', [
      {
        name: 'alpha',
        files: [{ path: 'main.ts', content: 'export const value = 3\n' }],
      },
      {
        name: 'beta',
        files: [{ path: 'main.ts', content: 'export const value = 2\n' }],
      },
    ])
    await createProject(root, base, latest, {
      alpha: { 'main.ts': 'export const value = 4\n' },
    })
    await expect(
      updateItems({ cwd: root, names: ['alpha', 'beta'], yes: true }),
    ).rejects.toThrow(/alpha/)
    expect(
      await readFile(join(root, 'src/components/ui/alpha/main.ts'), 'utf8'),
    ).toBe('export const value = 4\n')
    expect(
      await readFile(join(root, 'src/components/ui/beta/main.ts'), 'utf8'),
    ).toBe('export const value = 2\n')
    const lock = JSON.parse(
      await readFile(join(root, 'benos.lock.json'), 'utf8'),
    )
    expect(lock.items.alpha.version).toBe('1.0.0')
    expect(lock.items.beta.version).toBe('1.1.0')
  })

  it('refuses a newer Benos minimum with the detected package manager command', async () => {
    const root = await temporaryRoot()
    const base = await createRegistry(join(root, 'base'), '1.0.0', [
      {
        name: 'sample',
        files: [{ path: 'main.ts', content: 'export const value = 1\n' }],
      },
    ])
    const latest = await createRegistry(join(root, 'latest'), '1.1.0', [
      {
        name: 'sample',
        minimumBenosVersions: [{ name: '@benosjs/core', version: '0.2.0' }],
        files: [{ path: 'main.ts', content: 'export const value = 2\n' }],
      },
    ])
    await createProject(root, base, latest)
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    await mkdir(join(root, 'node_modules/@benosjs/core'), { recursive: true })
    await writeFile(
      join(root, 'node_modules/@benosjs/core/package.json'),
      JSON.stringify({
        name: '@benosjs/core',
        version: '0.1.3',
      }),
    )
    const source = join(root, 'src/components/ui/sample/main.ts')
    const original = await readFile(source)
    await expect(updateItems({ cwd: root, yes: true })).rejects.toThrow(
      /pnpm add @benosjs\/core@\^0\.2\.0/,
    )
    expect(await readFile(source)).toEqual(original)
  })
})

describe('interrupted component updates', () => {
  it('detects and rolls back a partially renamed component transaction', async () => {
    const root = await temporaryRoot()
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n')
    const lockPath = join(root, 'benos.lock.json')
    const oldLock = Buffer.from('{"schemaVersion":1,"items":{}}\n')
    await writeFile(lockPath, oldLock)
    const firstPath = join(root, 'src/first.ts')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(firstPath, 'before\r\n')
    await expect(
      applyComponentTransaction(
        root,
        'sample',
        [
          { relative: 'src/first.ts', content: 'after\r\n' },
          { relative: 'src/second.ts', content: 'new\r\n' },
        ],
        Buffer.from('{"schemaVersion":1,"items":{"sample":{}}}\n'),
        {
          afterFileWrite: () => {
            throw new Error('simulated interruption')
          },
        },
      ),
    ).rejects.toThrow(/simulated interruption/)
    expect(await readFile(firstPath, 'utf8')).toBe('after\r\n')
    await expect(diffItems({ cwd: root })).rejects.toThrow(
      /Interrupted update detected.*benos update to recover/,
    )
    expect(await recoverIncompleteUpdates(root)).toEqual([
      'sample: rolled back',
    ])
    expect(await readFile(firstPath, 'utf8')).toBe('before\r\n')
    await expect(readFile(join(root, 'src/second.ts'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(await readFile(lockPath)).toEqual(oldLock)
  })
})

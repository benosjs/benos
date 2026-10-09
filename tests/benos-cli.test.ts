import { createHash } from 'node:crypto'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  detectPackageManager,
  parsePackageManager,
} from '../packages/benos/src/process.mjs'
import { validateIndex } from '../packages/benos/src/registry.mjs'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const cli = resolve(root, 'packages/benos/bin/benos.mjs')
const hash = (value: string | Buffer) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

function runCliInEnv(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      npm_config_user_agent: '',
      ...env,
    },
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  }
}

function runCli(cwd: string, ...args: string[]) {
  return runCliInEnv(cwd, {}, ...args)
}

async function installPackageFixture(
  app: string,
  name: string,
  version: string,
) {
  const packageDirectory = join(app, 'node_modules', ...name.split('/'))
  await mkdir(packageDirectory, { recursive: true })
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify({ name, version }, null, 2)}\n`,
  )
}

async function createProject(directory: string, aliases = true) {
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fresh-benos-app',
        type: 'module',
        dependencies: { '@benosjs/dom': '^0.1.2' },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(directory, 'vite.config.ts'),
    aliases
      ? `import { fileURLToPath, URL } from 'node:url'\nexport default { resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }\n`
      : 'export default { plugins: [] }\n',
  )
  await writeFile(
    join(directory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: aliases
          ? { baseUrl: '.', paths: { '@/*': ['src/*'] } }
          : {},
      },
      null,
      2,
    )}\n`,
  )
}

async function writeRegistry(
  rootDirectory: string,
  options?: {
    target?: string
    dependency?: string
    dependencyRange?: string
    minimumBenosVersions?: Array<{ name: string; version: string }>
  },
) {
  const registryDirectory = join(rootDirectory, 'registry')
  await mkdir(registryDirectory, { recursive: true })
  const content = 'export const Button = () => <button>OK</button>\n'
  const item = {
    schemaVersion: 1,
    release: '0.2.0',
    name: 'button',
    type: 'registry:component',
    title: 'Button',
    description: 'A small action button.',
    dependencies: options?.dependency
      ? [
          {
            name: options.dependency,
            version: options.dependencyRange ?? '^1.0.0',
          },
        ]
      : [],
    minimumBenosVersions: options?.minimumBenosVersions ?? [],
    registryDependencies: [],
    files: [
      {
        path: 'button.tsx',
        target: options?.target ?? 'components/button.tsx',
        contentType: 'text/tsx',
        content,
        checksum: hash(content),
      },
    ],
  }
  const itemBytes = `${JSON.stringify(item, null, 2)}\n`
  const itemPath = join(registryDirectory, 'button.json')
  await writeFile(itemPath, itemBytes)
  const index = {
    schemaVersion: 1,
    release: '0.2.0',
    items: [
      {
        name: 'button',
        type: 'registry:component',
        title: 'Button',
        description: 'A small action button.',
        url: pathToFileURL(itemPath).href,
        dependencies: item.dependencies,
        registryDependencies: [],
        checksum: hash(Buffer.from(itemBytes)),
      },
    ],
  }
  const indexPath = join(registryDirectory, 'index.json')
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`)
  return pathToFileURL(indexPath).href
}

async function writeRegistryGraph(
  rootDirectory: string,
  graph: Record<string, string[]>,
  targets: Record<string, string> = {},
) {
  const registryDirectory = join(rootDirectory, 'registry')
  await mkdir(registryDirectory, { recursive: true })
  const entries = []
  for (const [name, registryDependencies] of Object.entries(graph)) {
    const content = `export const ${name.replaceAll('-', '_')} = '${name}'\n`
    const item = {
      schemaVersion: 1,
      release: '0.2.0',
      name,
      type: 'registry:component',
      title: name,
      description: `The ${name} fixture.`,
      dependencies: [],
      minimumBenosVersions: [],
      registryDependencies,
      files: [
        {
          path: `${name}.tsx`,
          target: targets[name] ?? `components/${name}.tsx`,
          contentType: 'text/tsx',
          content,
          checksum: hash(content),
        },
      ],
    }
    const itemBytes = `${JSON.stringify(item, null, 2)}\n`
    const itemPath = join(registryDirectory, `${name}.json`)
    await writeFile(itemPath, itemBytes)
    entries.push({
      name,
      type: item.type,
      title: item.title,
      description: item.description,
      url: pathToFileURL(itemPath).href,
      dependencies: [],
      registryDependencies,
      checksum: hash(Buffer.from(itemBytes)),
    })
  }
  const indexPath = join(registryDirectory, 'index.json')
  await writeFile(
    indexPath,
    `${JSON.stringify({ schemaVersion: 1, release: '0.2.0', items: entries }, null, 2)}\n`,
  )
  return pathToFileURL(indexPath).href
}

async function withTemp(callback: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'benos-cli-'))
  try {
    await callback(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('benos init', () => {
  it('preflights and initializes a fresh create-benos-shaped project idempotently', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      await writeFile(join(app, '.gitignore'), 'node_modules/\n')
      const registry = await writeRegistry(temporary)

      const first = runCli(app, 'init', '--yes', '--registry', registry)
      expect(first.status, first.stderr).toBe(0)
      expect(first.stdout).toContain('Initialized Benos UI')
      expect(
        JSON.parse(await readFile(join(app, 'benos.json'), 'utf8')),
      ).toMatchObject({
        schemaVersion: 1,
        registry,
        components: 'src/components/ui',
        css: 'src/styles/benos.css',
        alias: '@/',
      })
      expect(
        JSON.parse(await readFile(join(app, 'benos.lock.json'), 'utf8')),
      ).toEqual({
        schemaVersion: 1,
        items: {},
      })
      expect(await readFile(join(app, '.gitignore'), 'utf8')).toContain(
        '.benos/',
      )
      expect(
        await readFile(join(app, 'src/styles/benos.css'), 'utf8'),
      ).toContain('--benos-color-brand: #12306b')
      const second = runCli(app, 'init', '--yes', '--registry', registry)
      expect(second.status, second.stderr).toBe(0)
      expect(second.stdout).toContain('already initialized')
      expect(
        (await readFile(join(app, '.gitignore'), 'utf8')).match(/\.benos\//g),
      ).toHaveLength(1)
    })
  })

  it('prints exact missing alias guidance and writes nothing', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app, false)
      const registry = await writeRegistry(temporary)
      const result = runCli(app, 'init', '--yes', '--registry', registry)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        "import { fileURLToPath, URL } from 'node:url'",
      )
      expect(result.stderr).toContain(
        "alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },",
      )
      expect(result.stderr).toContain('"paths": { "@/*": ["src/*"] }')
      await expect(access(join(app, 'benos.json'))).rejects.toThrow()
      await expect(access(join(app, 'src/styles/benos.css'))).rejects.toThrow()
    })
  })

  it('requires confirmation before any writes in a non-interactive session', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const result = runCli(app, 'init')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('rerun with --yes')
      await expect(access(join(app, 'benos.json'))).rejects.toThrow()
    })
  })
})

describe('benos project discovery', () => {
  it('suggests a nearby folder when it contains a Benos project', async () => {
    await withTemp(async (temporary) => {
      const workspace = join(temporary, 'workspace')
      const app = join(workspace, 'benos-app')
      await mkdir(workspace, { recursive: true })
      await createProject(app)

      const result = runCli(workspace, 'list')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        'Did you mean to run this in ./benos-app?',
      )
    })
  })

  it('does not suggest a nearby folder that is not a Benos project', async () => {
    await withTemp(async (temporary) => {
      const workspace = join(temporary, 'workspace')
      const app = join(workspace, 'other-app')
      await mkdir(app, { recursive: true })
      await writeFile(
        join(app, 'package.json'),
        `${JSON.stringify(
          {
            name: 'other-app',
            devDependencies: { '@benosjs/eslint-plugin': '^0.2.3' },
          },
          null,
          2,
        )}\n`,
      )

      const result = runCli(workspace, 'list')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('No package.json found')
      expect(result.stderr).not.toContain('Did you mean to run this in')
    })
  })

  it('omits the suggestion when multiple nearby Benos projects are ambiguous', async () => {
    await withTemp(async (temporary) => {
      const workspace = join(temporary, 'workspace')
      await mkdir(workspace, { recursive: true })
      await createProject(join(workspace, 'first-app'))
      await createProject(join(workspace, 'second-app'))

      const result = runCli(workspace, 'list')
      expect(result.status).not.toBe(0)
      expect(result.stderr).not.toContain('Did you mean to run this in')
    })
  })
})

describe('benos add minimum Benos versions', () => {
  it('refuses an outdated installed package before writing component files', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const packageJsonPath = join(app, 'package.json')
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
      packageJson.dependencies['@benosjs/core'] = '^0.1.2'
      await writeFile(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
      )
      await installPackageFixture(app, '@benosjs/core', '0.1.2')
      const registry = await writeRegistry(temporary, {
        minimumBenosVersions: [{ name: '@benosjs/core', version: '0.1.3' }],
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const lockPath = join(app, 'benos.lock.json')
      const lockBefore = await readFile(lockPath, 'utf8')
      const packageBefore = await readFile(packageJsonPath, 'utf8')
      const cachePath = join(app, '.benos', 'cache')
      const cacheBefore = await readdir(cachePath).catch((error) => {
        if (error.code === 'ENOENT') return null
        throw error
      })

      const result = runCli(
        app,
        'add',
        'button',
        '--yes',
        '--registry',
        registry,
        '--package-manager',
        'pnpm',
      )

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'requires @benosjs/core >=0.1.3, but the project has @benosjs/core@0.1.2',
      )
      expect(result.stderr).toContain('pnpm add @benosjs/core@^0.1.3')
      await expect(
        readFile(join(app, 'src/components/ui/button.tsx'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(lockPath, 'utf8')).toBe(lockBefore)
      expect(await readFile(packageJsonPath, 'utf8')).toBe(packageBefore)
      const cacheAfter = await readdir(cachePath).catch((error) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      expect(cacheAfter).toEqual(cacheBefore)
    })
  })

  it('adds the component when the installed package meets its minimum', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const packageJsonPath = join(app, 'package.json')
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
      packageJson.dependencies['@benosjs/core'] = '^0.1.3'
      await writeFile(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
      )
      await installPackageFixture(app, '@benosjs/core', '0.1.3')
      const registry = await writeRegistry(temporary, {
        minimumBenosVersions: [{ name: '@benosjs/core', version: '0.1.3' }],
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )

      const result = runCli(
        app,
        'add',
        'button',
        '--yes',
        '--registry',
        registry,
        '--package-manager',
        'pnpm',
      )

      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('Added button')
      expect(
        await readFile(join(app, 'src/components/ui/button.tsx'), 'utf8'),
      ).toContain('export const Button')
      expect(await readdir(join(app, '.benos', 'cache'))).toContain(
        'items-button.json',
      )
      const lock = JSON.parse(
        await readFile(join(app, 'benos.lock.json'), 'utf8'),
      )
      expect(lock.items.button.version).toBe('0.2.0')
    })
  })
})

describe('benos add and list', () => {
  it('verifies, copies, locks, caches, and lists a registry component', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistry(temporary)
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )

      const added = runCli(app, 'add', 'button', '--yes')
      expect(added.status, added.stderr).toBe(0)
      expect(added.stdout).toContain('Added button')
      expect(
        await readFile(join(app, 'src/components/ui/button.tsx'), 'utf8'),
      ).toContain('export const Button')
      const lock = JSON.parse(
        await readFile(join(app, 'benos.lock.json'), 'utf8'),
      )
      expect(lock.items.button).toMatchObject({
        version: '0.2.0',
        title: 'Button',
        files: [{ target: 'src/components/ui/button.tsx' }],
      })
      const secondAdd = runCli(app, 'add', 'button', '--yes')
      expect(secondAdd.status, secondAdd.stderr).toBe(0)
      expect(secondAdd.stdout).toContain('Already up to date: button.')
      expect(
        await readFile(join(app, '.benos/cache/index.json'), 'utf8'),
      ).toContain('button')
      expect(runCli(app, 'list').stdout).toContain(
        'button: A small action button.',
      )
      expect(runCli(app, 'list', '--installed').stdout).toContain(
        'button@0.2.0: A small action button.',
      )
      const configPath = join(app, 'benos.json')
      const config = JSON.parse(await readFile(configPath, 'utf8'))
      config.registry = 'https://127.0.0.1:1/unavailable.json'
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
      const offline = runCli(app, 'list')
      expect(offline.status, offline.stderr).toBe(0)
      expect(offline.stdout).toContain('button: A small action button.')
      const cachedAdd = runCli(app, 'add', 'button', '--yes')
      expect(cachedAdd.status, cachedAdd.stderr).toBe(0)
      expect(cachedAdd.stdout).toContain('Already up to date: button.')
    })
  })

  it('resolves registry dependencies before their dependents and rejects cycles', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistryGraph(temporary, {
        button: ['tokens'],
        tokens: [],
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const added = runCli(app, 'add', 'button', '--yes')
      expect(added.status, added.stderr).toBe(0)
      expect(added.stdout.indexOf('tokens@0.2.0')).toBeLessThan(
        added.stdout.indexOf('button@0.2.0'),
      )
      await expect(
        access(join(app, 'src/components/ui/tokens.tsx')),
      ).resolves.toBeUndefined()
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).resolves.toBeUndefined()
    })

    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistryGraph(temporary, {
        button: ['tokens'],
        tokens: ['button'],
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Registry dependency cycle')
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).rejects.toThrow()
    })
  })

  it('rejects two registry items that claim the same destination', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistryGraph(
        temporary,
        { button: [], input: [] },
        {
          button: 'components/shared.tsx',
          input: 'components/shared.tsx',
        },
      )
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', 'input', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('share destination')
      await expect(
        access(join(app, 'src/components/ui/shared.tsx')),
      ).rejects.toThrow()
    })
  })

  it('keeps an existing compatible npm range and asks for a manager before writes when needed', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistry(temporary, {
        dependency: '@benosjs/dom',
        dependencyRange: '^0.1.0',
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const added = runCli(app, 'add', 'button', '--yes')
      expect(added.status, added.stderr).toBe(0)
      const packageJson = JSON.parse(
        await readFile(join(app, 'package.json'), 'utf8'),
      )
      expect(packageJson.dependencies['@benosjs/dom']).toBe('^0.1.2')
    })

    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistry(temporary, {
        dependency: '@benosjs/missing-package',
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        'Pass --package-manager npm|pnpm|yarn|bun',
      )
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).rejects.toThrow()
    })
  })

  it('installs a missing minimum Benos package automatically before completing add', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      const fakeBin = join(temporary, 'bin')
      const managerArgsPath = join(temporary, 'manager-args.txt')
      await createProject(app)
      await writeFile(join(app, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
      await mkdir(fakeBin)
      const fakeNpm = join(
        fakeBin,
        process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      )
      await writeFile(
        fakeNpm,
        process.platform === 'win32'
          ? `@echo off\r\necho %* > "${managerArgsPath}"\r\nexit /b 0\r\n`
          : `#!/usr/bin/env node\nconst fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(managerArgsPath)}, process.argv.slice(2).join(' '));\n`,
      )
      if (process.platform !== 'win32') await chmod(fakeNpm, 0o755)
      const registry = await writeRegistry(temporary, {
        minimumBenosVersions: [
          { name: '@benosjs/primitives', version: '0.2.1' },
        ],
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )

      const result = runCliInEnv(
        app,
        { PATH: `${fakeBin}${delimiter}${process.env.PATH}` },
        'add',
        'button',
        '--yes',
        '--registry',
        registry,
      )
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('install @benosjs/primitives@^0.2.1')
      expect(result.stdout).toContain(
        'Installing registry dependencies with pnpm',
      )
      expect(await readFile(managerArgsPath, 'utf8')).toBe(
        'add @benosjs/primitives@^0.2.1',
      )
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).resolves.toBeUndefined()
      const lock = JSON.parse(
        await readFile(join(app, 'benos.lock.json'), 'utf8'),
      )
      expect(lock.items.button.version).toBe('0.2.0')
    })
  })

  it('still refuses an installed minimum Benos package that is too old', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      const fakeBin = join(temporary, 'bin')
      const managerArgsPath = join(temporary, 'manager-args.txt')
      await createProject(app)
      await installPackageFixture(app, '@benosjs/primitives', '0.2.0')
      await mkdir(fakeBin)
      const fakeNpm = join(
        fakeBin,
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
      )
      await writeFile(
        fakeNpm,
        process.platform === 'win32'
          ? `@echo off\r\necho %* > "${managerArgsPath}"\r\nexit /b 0\r\n`
          : `#!/usr/bin/env node\nconst fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(managerArgsPath)}, process.argv.slice(2).join(' '));\n`,
      )
      if (process.platform !== 'win32') await chmod(fakeNpm, 0o755)
      const registry = await writeRegistry(temporary, {
        minimumBenosVersions: [
          { name: '@benosjs/primitives', version: '0.2.1' },
        ],
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )

      const result = runCliInEnv(
        app,
        { PATH: `${fakeBin}${delimiter}${process.env.PATH}` },
        'add',
        'button',
        '--yes',
        '--registry',
        registry,
        '--package-manager',
        'npm',
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('@benosjs/primitives@0.2.0')
      expect(result.stderr).toContain('npm install @benosjs/primitives@^0.2.1')
      await expect(readFile(managerArgsPath, 'utf8')).rejects.toThrow()
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).rejects.toThrow()
    })
  })

  it('does not overwrite an edited destination even with --yes', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistry(temporary)
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const destination = join(app, 'src/components/ui/button.tsx')
      await mkdir(join(app, 'src/components/ui'), { recursive: true })
      await writeFile(destination, '// local edit\n')
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Refusing to overwrite edited file')
      expect(await readFile(destination, 'utf8')).toBe('// local edit\n')
    })
  })

  it('rejects traversal, absolute, and drive-qualified registry paths', async () => {
    for (const target of [
      'components/../../escape.tsx',
      '/tmp/escape.tsx',
      'C:/escape.tsx',
      '//server/share/escape.tsx',
    ]) {
      await withTemp(async (temporary) => {
        const app = join(temporary, 'app')
        await createProject(app)
        const registry = await writeRegistry(temporary, { target })
        expect(
          runCli(app, 'init', '--yes', '--registry', registry).status,
        ).toBe(0)
        const result = runCli(app, 'add', 'button', '--yes')
        expect(result.status, target).not.toBe(0)
        expect(result.stderr, target).toContain('Unsafe registry path')
        await expect(access(join(temporary, 'escape.tsx'))).rejects.toThrow()
      })
    }
  })

  it('rejects a registry target that traverses a symlink outside the project', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      const outside = join(temporary, 'outside')
      await createProject(app)
      await mkdir(join(app, 'src/components/ui'), { recursive: true })
      await mkdir(outside)
      await symlink(outside, join(app, 'src/components/ui/linked'), 'junction')
      const registry = await writeRegistry(temporary, {
        target: 'components/linked/escape.tsx',
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('resolves outside the project root')
      await expect(access(join(outside, 'escape.tsx'))).rejects.toThrow()
    })
  })

  it('rejects case-folded destination collisions on case-sensitive filesystems too', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      await mkdir(join(app, 'src/components/ui'), { recursive: true })
      await writeFile(
        join(app, 'src/components/ui/Button.tsx'),
        '// existing\n',
      )
      const registry = await writeRegistry(temporary, {
        target: 'components/button.tsx',
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Case-insensitive path collision')
    })
  })

  it('rejects a payload checksum mismatch before writing files', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistry(temporary)
      await writeFile(join(temporary, 'registry/button.json'), '{ }\n')
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Registry item checksum mismatch')
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).rejects.toThrow()
    })
  })

  it('rejects unsupported index and item schema versions', async () => {
    expect(() =>
      validateIndex({ schemaVersion: 2, release: '0.2.0', items: [] }),
    ).toThrow('Unsupported registry schema version')

    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      await createProject(app)
      const registry = await writeRegistry(temporary)
      const itemPath = join(temporary, 'registry/button.json')
      const indexPath = join(temporary, 'registry/index.json')
      const item = JSON.parse(await readFile(itemPath, 'utf8'))
      item.schemaVersion = 2
      const itemBytes = `${JSON.stringify(item, null, 2)}\n`
      await writeFile(itemPath, itemBytes)
      const index = JSON.parse(await readFile(indexPath, 'utf8'))
      index.items[0].checksum = hash(Buffer.from(itemBytes))
      await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`)
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCli(app, 'add', 'button', '--yes')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Unsupported item schema version')
    })
  })

  it('reports package-manager install failure after preserving source and lock writes', async () => {
    await withTemp(async (temporary) => {
      const app = join(temporary, 'app')
      const fakeBin = join(temporary, 'bin')
      await createProject(app)
      await mkdir(fakeBin)
      const fakeNpm = join(
        fakeBin,
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
      )
      await writeFile(
        fakeNpm,
        process.platform === 'win32'
          ? '@echo off\r\nexit /b 17\r\n'
          : '#!/usr/bin/env node\nprocess.exit(17)\n',
      )
      if (process.platform !== 'win32') await chmod(fakeNpm, 0o755)
      const registry = await writeRegistry(temporary, {
        dependency: 'clsx',
        dependencyRange: '^2.1.1',
      })
      expect(runCli(app, 'init', '--yes', '--registry', registry).status).toBe(
        0,
      )
      const result = runCliInEnv(
        app,
        { PATH: `${fakeBin}${delimiter}${process.env.PATH}` },
        'add',
        'button',
        '--yes',
        '--package-manager',
        'npm',
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        'Component files and lock entries were written',
      )
      expect(result.stderr).toContain(
        'Install dependencies manually with: npm install clsx@^2.1.1',
      )
      await expect(
        access(join(app, 'src/components/ui/button.tsx')),
      ).resolves.toBeUndefined()
      const lock = JSON.parse(
        await readFile(join(app, 'benos.lock.json'), 'utf8'),
      )
      expect(lock.items.button.dependencies).toEqual([
        { name: 'clsx', version: '^2.1.1' },
      ])
    })
  })

  it('rejects registry paths that are invalid on Windows filesystems', async () => {
    for (const target of [
      'components/CON.tsx',
      'components/button?.tsx',
      'components/trailing./button.tsx',
    ]) {
      await withTemp(async (temporary) => {
        const app = join(temporary, 'app')
        await createProject(app)
        const registry = await writeRegistry(temporary, { target })
        expect(
          runCli(app, 'init', '--yes', '--registry', registry).status,
        ).toBe(0)
        const result = runCli(app, 'add', 'button', '--yes')
        expect(result.status, target).not.toBe(0)
        expect(result.stderr, target).toContain('Unsafe registry path')
      })
    }
  })

  it('refuses a package-manager lockfile conflict and respects explicit detection', async () => {
    await withTemp(async (temporary) => {
      await writeFile(join(temporary, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
      await writeFile(join(temporary, 'yarn.lock'), '# yarn\n')
      await expect(
        detectPackageManager(temporary, undefined, {}),
      ).rejects.toThrow('Conflicting package-manager lockfiles')
      await expect(detectPackageManager(temporary, 'bun', {})).resolves.toBe(
        'bun',
      )
      await expect(
        detectPackageManager(temporary, undefined, {
          npm_config_user_agent: 'yarn/4.5.0 node/v22.18.0',
        }),
      ).resolves.toBe('yarn')
      await expect(
        detectPackageManager(temporary, 'npm', {
          npm_config_user_agent: 'yarn/4.5.0 node/v22.18.0',
        }),
      ).resolves.toBe('npm')
      await rm(join(temporary, 'pnpm-lock.yaml'))
      await rm(join(temporary, 'yarn.lock'))
      await writeFile(join(temporary, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
      await expect(
        detectPackageManager(temporary, undefined, {}),
      ).resolves.toBe('pnpm')
      await rm(join(temporary, 'pnpm-lock.yaml'))
      await expect(
        detectPackageManager(temporary, undefined, {}),
      ).resolves.toBe(undefined)
    })
    expect(parsePackageManager('pnpm/10.17.0 npm/? node/v22.18.0')).toBe('pnpm')
    expect(parsePackageManager('yarn/4.5.0 node/v22.18.0')).toBe('yarn')
    expect(parsePackageManager('bun/1.2.0')).toBe('bun')
  })
})

it('rejects unknown registry item types in the discovery index', () => {
  expect(() =>
    validateIndex({
      schemaVersion: 1,
      release: '0.2.0',
      items: [
        {
          name: 'button',
          type: 'registry:unknown',
          title: 'Button',
          description: 'Fixture',
          url: 'https://example.test/button.json',
          dependencies: [],
          registryDependencies: [],
          checksum: hash('payload'),
        },
      ],
    }),
  ).toThrow('unsupported type')
})

it('keeps the checked-in registry index reproducible', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(root, 'scripts/build-ui-registry.mjs'), '--check'],
    { cwd: root, encoding: 'utf8' },
  )
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('build check passed')
})

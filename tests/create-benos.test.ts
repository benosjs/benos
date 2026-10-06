import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative as relativePath, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const pnpmCli =
  process.platform === 'win32' && process.env.PNPM_HOME
    ? resolve(process.env.PNPM_HOME, '..', 'pnpm', 'bin', 'pnpm.cjs')
    : undefined

function runPnpm(args: string[], options: Parameters<typeof run>[1]) {
  if (pnpmCli) return run(process.execPath, [pnpmCli, ...args], options)
  return run('pnpm', args, options)
}

function fileDependency(from: string, archive: string): string {
  return `file:${relativePath(from, archive).replaceAll('\\', '/')}`
}

async function pack(
  packageDirectory: string,
  destination: string,
): Promise<string> {
  await runPnpm(['pack', '--pack-destination', destination, '--silent'], {
    cwd: join(root, 'packages', packageDirectory),
  })
  const files = await readdir(destination)
  const prefix =
    packageDirectory === 'create-benos'
      ? 'create-benos-'
      : packageDirectory === 'benos'
        ? 'benos-'
        : `benosjs-${packageDirectory}-`
  const file = files.find((entry) => entry.startsWith(prefix))
  if (!file)
    throw new Error(`Packed ${packageDirectory} archive was not created`)
  return join(destination, file)
}

describe('create-benos packed scaffold', () => {
  it('scaffolds a packed app and passes typecheck, build, test, and lint', async () => {
    const temporaryRoot = process.env.RUNNER_TEMP ?? (await realpath(tmpdir()))
    const temporary = await mkdtemp(join(temporaryRoot, 'create-benos-e2e-'))
    const archives = join(temporary, 'archives')
    const extracted = join(temporary, 'create-package')
    await mkdir(archives)
    await mkdir(extracted)
    try {
      const [createArchive, benos, core, dom, compiler, vite, eslintPlugin] =
        await Promise.all([
          pack('create-benos', archives),
          pack('benos', archives),
          pack('core', archives),
          pack('dom', archives),
          pack('compiler', archives),
          pack('vite', archives),
          pack('eslint-plugin', archives),
        ])
      await run('tar', ['-xzf', createArchive, '-C', extracted])
      const createPackage = join(extracted, 'package')
      const createManifestPath = join(createPackage, 'package.json')
      const createManifest = JSON.parse(
        await readFile(createManifestPath, 'utf8'),
      ) as {
        pnpm?: { overrides?: Record<string, string> }
      }
      createManifest.pnpm = {
        overrides: {
          ...createManifest.pnpm?.overrides,
          benos: fileDependency(createPackage, benos),
        },
      }
      await writeFile(
        createManifestPath,
        `${JSON.stringify(createManifest, null, 2)}\n`,
      )
      await runPnpm(['install', '--ignore-scripts'], { cwd: createPackage })
      const cli = join(createPackage, 'src', 'index.mjs')
      const app = join(temporary, 'app')
      await run('node', [cli, app, '--no-install', '--no-start'])
      const generated = JSON.parse(
        await readFile(join(app, 'package.json'), 'utf8'),
      ) as {
        createBenosPackageManager?: string
        private?: boolean
        version?: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        pnpm?: { overrides?: Record<string, string> }
        engines?: { node?: string }
      }
      expect(generated.private).toBe(true)
      expect(generated.version).toBe('0.2.1')
      expect(generated.createBenosPackageManager).toBe('pnpm')
      const benosDependencies = Object.entries({
        ...generated.dependencies,
        ...generated.devDependencies,
      }).filter(([name]) => name.startsWith('@benosjs/'))
      expect(benosDependencies).toHaveLength(5)
      for (const [name, version] of benosDependencies) {
        expect(version, `${name} must use a published semver range`).toMatch(
          /^\^\d+\.\d+\.\d+$/,
        )
        expect(version).toBe('^0.2.1')
      }
      expect(generated.engines?.node).toBe('^22.18.0 || ^24.11.0 || >=26.0.0')
      expect(await readFile(join(app, '.yarnrc.yml'), 'utf8')).toContain(
        'nodeLinker: node-modules',
      )
      const starterSource = await readFile(join(app, 'src/main.tsx'), 'utf8')
      const starterCss = await readFile(join(app, 'src/style.css'), 'utf8')
      const viteConfig = await readFile(join(app, 'vite.config.ts'), 'utf8')
      const tsconfig = JSON.parse(
        await readFile(join(app, 'tsconfig.json'), 'utf8'),
      ) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
      }
      expect(viteConfig).toContain('alias:')
      expect(viteConfig).toContain(
        "'@': fileURLToPath(new URL('./src', import.meta.url))",
      )
      expect(tsconfig.compilerOptions?.paths?.['@/*']).toEqual(['src/*'])
      expect(starterSource.split(/\r?\n/).length).toBeLessThan(150)
      expect(starterCss.split(/\r?\n/).length).toBeLessThan(100)
      expect(await readFile(join(app, 'index.html'), 'utf8')).toContain(
        'prefers-color-scheme: dark',
      )
      expect(await readFile(join(app, 'index.html'), 'utf8')).toContain(
        'benos-mark-light.png',
      )
      await expect(run('node', [cli, '--help'])).resolves.toMatchObject({
        stdout: expect.not.stringContaining('--template'),
      })
      await expect(run('node', [cli, '--template', app])).rejects.toThrow(
        'Unknown option: --template',
      )
      for (const logo of ['benos-mark-light.png', 'benos-mark-navy.png']) {
        expect(
          (await readFile(join(app, 'public', logo))).byteLength,
        ).toBeGreaterThan(0)
      }
      expect(await readdir(join(app, '.git')).catch(() => [])).toHaveLength(0)
      for (const [manager, userAgent] of [
        ['npm', 'npm/11.0.0 node/v22.18.0 darwin arm64'],
        ['pnpm', 'pnpm/10.17.0 npm/? node/v22.18.0 darwin arm64'],
        ['yarn', 'yarn/4.5.0 npm/? node/v22.18.0 darwin arm64'],
        ['bun', 'bun/1.2.0 npm/? node/v22.18.0 darwin arm64'],
      ] as const) {
        const managerApp = join(temporary, `${manager}-app`)
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => key.toLowerCase() !== 'npm_config_user_agent',
          ),
        )
        env.npm_config_user_agent = userAgent
        await run(
          'node',
          [cli, managerApp, '--no-install', '--no-start', '--yes'],
          { env },
        )
        const managerPackage = JSON.parse(
          await readFile(join(managerApp, 'package.json'), 'utf8'),
        ) as { createBenosPackageManager?: string }
        expect(managerPackage.createBenosPackageManager).toBe(manager)
      }
      await expect(run('node', [cli, app])).rejects.toThrow(
        'Refusing to overwrite',
      )

      generated.pnpm = {
        overrides: {
          '@benosjs/core': fileDependency(app, core),
          '@benosjs/dom': fileDependency(app, dom),
          '@benosjs/compiler': fileDependency(app, compiler),
          '@benosjs/vite': fileDependency(app, vite),
          '@benosjs/eslint-plugin': fileDependency(app, eslintPlugin),
        },
      }
      await writeFile(
        join(app, 'package.json'),
        `${JSON.stringify(generated, null, 2)}\n`,
      )
      await runPnpm(['install', '--ignore-scripts'], { cwd: app })
      for (const script of ['typecheck', 'build', 'test', 'lint']) {
        try {
          await runPnpm(['run', script], { cwd: app })
        } catch (error) {
          const failure = error as { stdout?: string; stderr?: string }
          throw new Error(
            `${script} failed\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`,
            { cause: error },
          )
        }
      }
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }, 180_000)
})

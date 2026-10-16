/* global console, process, URL */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const expectedMajor = process.env.BENOS_EXPECT_NPM_MAJOR
  ? Number(process.env.BENOS_EXPECT_NPM_MAJOR)
  : undefined
const temporaryRoot = process.env.RUNNER_TEMP ?? tmpdir()

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: process.platform === 'win32' && command === 'npm',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`}).`,
          ),
        )
      }
    })
  })
}

const npmVersion = (await run('npm', ['--version'])).stdout.trim()
const actualMajor = Number(npmVersion.split('.')[0])
if (expectedMajor !== undefined && actualMajor !== expectedMajor)
  throw new Error(`Expected npm ${expectedMajor}.x, found npm ${npmVersion}.`)

const temporary = await mkdtemp(
  join(temporaryRoot, 'create-benos-npm-install-'),
)
const project = join(temporary, 'starter-app')
try {
  const createBenos = join(root, 'packages/create-benos/src/index.mjs')
  await run(
    process.execPath,
    [createBenos, project, '--no-ui', '--yes', '--no-install', '--no-start'],
    { cwd: temporary },
  )
  const manifest = JSON.parse(
    await readFile(join(project, 'package.json'), 'utf8'),
  )
  if (manifest.version !== '0.0.0')
    throw new Error(`Unexpected starter version: ${manifest.version}`)

  // Before publishing, install the latest published Benos packages while
  // exercising the candidate template's full third-party dependency graph.
  const publishedCoreVersion = (
    await run('npm', ['view', '@benosjs/core', 'version'])
  ).stdout.trim()
  if (!/^\d+\.\d+\.\d+$/.test(publishedCoreVersion))
    throw new Error(
      `Unexpected published core version: ${publishedCoreVersion}`,
    )
  for (const section of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (name.startsWith('@benosjs/'))
        manifest[section][name] = `^${publishedCoreVersion}`
    }
  }
  await writeFile(
    join(project, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  console.log(`Installing fresh create-benos app with npm ${npmVersion}...`)
  await run('npm', ['install'], { cwd: project })
  console.log(`Fresh create-benos app installed with npm ${npmVersion}.`)

  for (const script of ['typecheck', 'build', 'test', 'lint']) {
    console.log(`Running npm run ${script} with npm ${npmVersion}...`)
    await run('npm', ['run', script], { cwd: project })
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}

/* global console, process */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const temporaryRoot = process.env.RUNNER_TEMP ?? tmpdir()
const expectedMajor = Number(process.env.BENOS_EXPECT_NPM_MAJOR)

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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
      else
        reject(
          new Error(
            `${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`}).`,
          ),
        )
    })
  })
}

const npmVersion = (await run('npm', ['--version'])).stdout.trim()
if (Number(npmVersion.split('.')[0]) !== expectedMajor)
  throw new Error(`Expected npm ${expectedMajor}.x, found npm ${npmVersion}.`)

const temporary = await mkdtemp(join(temporaryRoot, 'published-create-benos-'))
const project = join(temporary, 'starter-app')
try {
  console.log(
    `Scaffolding published create-benos@latest with npm ${npmVersion}...`,
  )
  await run(
    'npm',
    [
      'create',
      'benos@latest',
      project,
      '--',
      '--yes',
      '--ui',
      '--install',
      '--no-start',
    ],
    temporary,
  )

  const manifest = JSON.parse(
    await readFile(join(project, 'package.json'), 'utf8'),
  )
  if (manifest.version !== '0.0.0')
    throw new Error(`Unexpected starter version: ${manifest.version}`)

  console.log(`Installing generated project with npm ${npmVersion}...`)
  await run('npm', ['install'], project)

  for (const script of ['typecheck', 'build', 'test', 'lint']) {
    console.log(`Running npm run ${script} with npm ${npmVersion}...`)
    await run('npm', ['run', script], project)
  }
  console.log(`Published create-benos@latest passed with npm ${npmVersion}.`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}

/* global console, process */

import { execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
export const PUBLISH_VISIBILITY_TIMEOUT_MS = 10 * 60 * 1000
export const RELEASE_PACKAGES = [
  '@benosjs/core',
  '@benosjs/dom',
  '@benosjs/compiler',
  '@benosjs/vite',
  '@benosjs/eslint-plugin',
  '@benosjs/primitives',
  'benos',
  'create-benos',
]

async function npmViewVersion(packageName, expectedVersion, timeoutMs) {
  const { stdout } = await execFileAsync(
    'npm',
    ['view', `${packageName}@${expectedVersion}`, 'version'],
    { encoding: 'utf8', timeout: timeoutMs },
  )
  return stdout.trim()
}

export function releaseVersionFromTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? '')
  if (!match) {
    throw new Error(
      `Expected a stable vX.Y.Z release tag, received ${tag ?? '(none)'}`,
    )
  }
  return tag.slice(1)
}

export async function verifyPublishedVersion({
  packageName,
  expectedVersion,
  viewVersion = npmViewVersion,
  wait = delay,
  now = Date.now,
  timeoutMs = PUBLISH_VISIBILITY_TIMEOUT_MS,
  initialDelayMs = 1_000,
  maximumDelayMs = 30_000,
  log = console,
}) {
  const deadline = now() + timeoutMs
  let delayMs = initialDelayMs
  let lastResult

  for (;;) {
    const requestTimeoutMs = deadline - now()
    if (requestTimeoutMs <= 0) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for ${packageName}@${expectedVersion} to resolve from npm. Last result: ${lastResult ?? 'no result received'}`,
      )
    }

    try {
      const actualVersion = await viewVersion(
        packageName,
        expectedVersion,
        requestTimeoutMs,
      )
      if (actualVersion === expectedVersion) {
        log.log(`Verified ${packageName}@${actualVersion}`)
        return
      }
      lastResult = `npm view returned ${actualVersion || '(empty result)'}`
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error)
    }

    const remainingMs = deadline - now()
    if (remainingMs <= 0) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for ${packageName}@${expectedVersion} to resolve from npm. Last result: ${lastResult}`,
      )
    }

    const retryDelayMs = Math.min(delayMs, remainingMs)
    log.warn(
      `${packageName}@${expectedVersion} is not visible yet (${lastResult}); retrying in ${Math.ceil(retryDelayMs / 1000)}s.`,
    )
    await wait(retryDelayMs)
    delayMs = Math.min(delayMs * 2, maximumDelayMs)
  }
}

export async function verifyPublishedPackages(expectedVersion, options = {}) {
  const outcomes = await Promise.allSettled(
    RELEASE_PACKAGES.map((packageName) =>
      verifyPublishedVersion({
        packageName,
        expectedVersion,
        ...options,
      }),
    ),
  )
  const failures = outcomes
    .map((outcome, index) => ({
      outcome,
      packageName: RELEASE_PACKAGES[index],
    }))
    .filter(({ outcome }) => outcome.status === 'rejected')
  if (failures.length) {
    throw new AggregateError(
      failures.map(({ outcome }) => outcome.reason),
      `npm version verification failed for ${failures.map(({ packageName }) => packageName).join(', ')}`,
    )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
  await verifyPublishedPackages(releaseVersionFromTag(tag))
}

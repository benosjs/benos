import { describe, expect, it, vi } from 'vitest'
import {
  PUBLISH_VISIBILITY_TIMEOUT_MS,
  RELEASE_PACKAGES,
  releaseVersionFromTag,
  verifyPublishedPackages,
  verifyPublishedVersion,
} from '../scripts/verify-published-versions.mjs'

describe('release version verification', () => {
  it('accepts only stable release tags', () => {
    expect(releaseVersionFromTag('v0.2.3')).toBe('0.2.3')
    expect(() => releaseVersionFromTag('v0.2.3-rc.1')).toThrow(
      'Expected a stable vX.Y.Z release tag',
    )
  })

  it('retries transient npm visibility failures with exponential backoff', async () => {
    let elapsedMs = 0
    let attempts = 0
    const waits: number[] = []
    const viewVersion = vi.fn(async () => {
      attempts += 1
      if (attempts < 3) throw new Error('npm returned 404')
      return '0.2.3'
    })

    await verifyPublishedVersion({
      packageName: '@benosjs/dom',
      expectedVersion: '0.2.3',
      viewVersion,
      wait: async (milliseconds) => {
        waits.push(milliseconds)
        elapsedMs += milliseconds
      },
      now: () => elapsedMs,
      timeoutMs: 60_000,
      initialDelayMs: 1_000,
      maximumDelayMs: 30_000,
      log: { log: vi.fn(), warn: vi.fn() },
    })

    expect(viewVersion).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([1_000, 2_000])
  })

  it('fails after ten minutes and reports the last registry response', async () => {
    let elapsedMs = 0
    const waits: number[] = []
    const requestTimeouts: number[] = []

    await expect(
      verifyPublishedVersion({
        packageName: '@benosjs/dom',
        expectedVersion: '0.2.3',
        viewVersion: async (_packageName, _version, requestTimeoutMs) => {
          requestTimeouts.push(requestTimeoutMs)
          throw new Error('npm returned 404')
        },
        wait: async (milliseconds) => {
          waits.push(milliseconds)
          elapsedMs += milliseconds
        },
        now: () => elapsedMs,
        timeoutMs: PUBLISH_VISIBILITY_TIMEOUT_MS,
        initialDelayMs: 1_000,
        maximumDelayMs: 30_000,
        log: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(
      'Timed out after 600 seconds waiting for @benosjs/dom@0.2.3 to resolve from npm. Last result: npm returned 404',
    )
    expect(waits.at(-1)).toBeLessThanOrEqual(30_000)
    expect(waits.reduce((sum, milliseconds) => sum + milliseconds, 0)).toBe(
      PUBLISH_VISIBILITY_TIMEOUT_MS,
    )
    expect(requestTimeouts[0]).toBe(PUBLISH_VISIBILITY_TIMEOUT_MS)
    expect(requestTimeouts.at(-1)).toBeLessThanOrEqual(30_000)
    expect(requestTimeouts.at(-1)).toBeGreaterThan(0)
  })

  it('verifies all eight package versions concurrently', async () => {
    const viewVersion = vi.fn(
      async (_packageName: string, version: string) => version,
    )

    await verifyPublishedPackages('0.2.3', {
      viewVersion,
      log: { log: vi.fn(), warn: vi.fn() },
    })

    expect(viewVersion).toHaveBeenCalledTimes(8)
    expect(viewVersion.mock.calls.map(([name]) => name)).toEqual(
      RELEASE_PACKAGES,
    )
  })
})

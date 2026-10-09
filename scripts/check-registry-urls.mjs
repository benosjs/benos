/* global AbortSignal, console, fetch, process, URL */

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '')) {
  throw new Error(
    `Expected a stable vX.Y.Z release tag, received ${tag ?? '(none)'}`,
  )
}

const indexUrl = `https://raw.githubusercontent.com/benosjs/benos/${tag}/registry/v1/index.json`
const timeout = AbortSignal.timeout(20_000)
const indexResponse = await fetch(indexUrl, { signal: timeout })
if (!indexResponse.ok) {
  throw new Error(`Registry index failed: ${indexResponse.status} ${indexUrl}`)
}

const index = await indexResponse.json()
if (
  index.schemaVersion !== 1 ||
  !Array.isArray(index.items) ||
  index.items.length === 0
) {
  throw new Error(`Registry index is invalid or empty at ${indexUrl}`)
}

const checks = await Promise.all(
  index.items.map(async (item) => {
    if (typeof item.name !== 'string' || typeof item.url !== 'string') {
      return { error: 'Registry item is missing its name or URL.' }
    }
    const url = new URL(item.url)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'raw.githubusercontent.com' ||
      !url.pathname.startsWith('/benosjs/benos/')
    ) {
      return {
        error: `Registry item ${item.name} has an unexpected URL: ${item.url}`,
      }
    }
    const response = await fetch(url, { signal: timeout })
    return response.ok
      ? { name: item.name, url: item.url }
      : {
          error: `Registry item ${item.name} failed: ${response.status} ${item.url}`,
        }
  }),
)

const failures = checks.filter((check) => check.error)
if (failures.length) {
  throw new Error(failures.map((check) => check.error).join('\n'))
}

console.log(
  `Registry index for ${tag} and all ${checks.length} item URLs resolve`,
)
for (const check of checks) console.log(`OK ${check.name}: ${check.url}`)

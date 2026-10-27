# Pin the CLI Registry to Its Release Tag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A published `benos` CLI reads the UI registry index from its own release tag, never from `main`, so merging a release before publishing it can't break CLIs that are already published.

**Architecture:** `benos.json` keeps writing the existing `main` URL (`DEFAULT_REGISTRY`), now read as "the default registry for this CLI". `loadIndex` turns that one URL into `https://raw.githubusercontent.com/benosjs/benos/v<cli version>/registry/v1/index.json` before fetching. Custom `--registry` / `benos.json` URLs and file paths stay as they are. Item URLs are already tag-pinned by `scripts/build-ui-registry.mjs`, so only the index URL changes.

**Tech Stack:** Node ESM (`packages/benos/src/*.mjs`), Vitest (`tests/*.test.ts`), pnpm 10.

---

## Why

From 2026-10-22 to 2026-10-26, every daily "Published starter health" run failed. `v0.5.0` had been merged to `main` but not yet published to npm. `benos@0.4.0` reads `registry/v1/index.json` from `main` (`packages/benos/src/project.mjs:16-17`), which now listed items needing `@benosjs/dom ^0.5.0`. Meanwhile `create-benos@0.4.0` installed `@benosjs/dom@0.4.0`. As a result, `benos add button input` refused to run, and so did every new `npm create benos@latest -- --ui`.

## Decisions for approval

1. **Rewrite the default URL when fetching, rather than writing a pinned URL into `benos.json`.** If `init` wrote `.../v0.5.1/...`, the project would stay on that release even after a CLI upgrade, and `benos update` would never see newer components. Rewriting at fetch time means "default registry = the registry that matches the installed CLI". It also fixes existing projects as soon as they upgrade the CLI, with no change to `benos.json`.
2. **`$schema` stays on `main`.** `initProject` refuses to rerun when any `benos.json` field differs (`init.mjs`, the `existingConfig` check). A version-pinned `$schema` would make `benos init` fail after every CLI upgrade, and `schemaVersion: 1` is the compatibility contract anyway.
3. **No fallback to `main` when the tag index is missing.** A fallback would bring the bug back. The release workflow already runs `scripts/check-registry-urls.mjs "$GITHUB_REF_NAME"`, which checks that the tag index and every item exist before the publish job can run, so a published CLI's tag always exists. Unreleased CLIs run from the repo use fixture registries in tests, or can pass `--registry`.
4. **Known gap: CLIs already published (≤ 0.5.0) still read `main`.** That can't be changed after the fact. When 0.6.0 is merged, a project on a 0.5.x CLI gets the existing clear "Upgrade it before adding component files" error until it upgrades. New starters are only at risk between the merge and the publish, so the checklist note in Task 4 tells you to publish right after tagging and to re-run the starter health workflow.

No core, DOM, async, router, query or forms changes. No size-budget impact (the CLI isn't measured by `pnpm size`).

## Files

- Modify: `packages/benos/src/project.mjs`: add `resolveRegistryUrl` next to `DEFAULT_REGISTRY`.
- Modify: `packages/benos/src/registry.mjs`: `loadIndex` resolves the URL before fetching.
- Create: `tests/benos-registry-url.test.ts`: unit tests for the resolver, plus a `loadIndex` test with a stubbed `fetch`.
- Modify: `docs/architecture/ui-registry.md`, `docs/architecture/ui-cli.md`, `docs/release-checklist.md`, `CHANGELOG.md`.

Branch: `registry-pin` from `main` (`5ec11d2`). Don't merge, tag or publish without explicit authorization.

---

### Task 1: `resolveRegistryUrl`

**Files:**
- Modify: `packages/benos/src/project.mjs:1-17`
- Test: `tests/benos-registry-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run tests/benos-registry-url.test.ts`
Expected: FAIL, `resolveRegistryUrl` is not exported.

- [ ] **Step 3: Implement**

In `packages/benos/src/project.mjs`, add `readFile` from `node:fs/promises` (already imported) and replace lines 16-17 with:

```js
const { version: CLI_VERSION } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

export const DEFAULT_REGISTRY =
  'https://raw.githubusercontent.com/benosjs/benos/main/registry/v1/index.json'

// benos.json stores DEFAULT_REGISTRY to mean "the registry for this CLI".
// Fetching it from main lets a merged but unpublished release break published
// CLIs, so it resolves to the index at this CLI's own release tag.
export function resolveRegistryUrl(url, version = CLI_VERSION) {
  if (url !== DEFAULT_REGISTRY) return url
  return `https://raw.githubusercontent.com/benosjs/benos/v${version}/registry/v1/index.json`
}
```

(`packages/benos/src/index.mjs:16` already reads `package.json` the same way. npm always packs `package.json`, so `../package.json` resolves in the published tarball.)

- [ ] **Step 4: Run the test again**

Run: `pnpm exec vitest run tests/benos-registry-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/benos/src/project.mjs tests/benos-registry-url.test.ts
git commit -m "feat(benos): resolve the default registry to the CLI release tag"
```

### Task 2: Use it in `loadIndex`

All four index readers (`add.mjs:283`, `diff.mjs:136`, `update.mjs:301`, `list.mjs:28`) go through `loadIndex`, so this is the only place the change is needed.

**Files:**
- Modify: `packages/benos/src/registry.mjs:14` (import) and `:474-489` (`loadIndex`)
- Test: `tests/benos-registry-url.test.ts`

- [ ] **Step 1: Write the failing test**

Add these to the test file. Change the existing `vitest` import to `import { afterEach, describe, expect, it, vi } from 'vitest'`, and add these imports:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadIndex } from '../packages/benos/src/registry.mjs'
```

```ts
describe('loadIndex', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the default registry from the CLI release tag', async () => {
    const root = await mkdtemp(join(tmpdir(), 'benos-registry-url-'))
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: URL | string) => {
      requested.push(String(input))
      return new Response(
        JSON.stringify({ schemaVersion: 1, release: version, items: [] }),
        { headers: { 'content-type': 'application/json' } },
      )
    })
    try {
      await loadIndex(root, DEFAULT_REGISTRY, { deferCache: true })
      expect(requested).toEqual([tagIndex(`v${version}`)])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run tests/benos-registry-url.test.ts`
Expected: FAIL, because `requested` contains the `main` URL.

- [ ] **Step 3: Implement**

In `packages/benos/src/registry.mjs`, add after line 14:

```js
import { resolveRegistryUrl } from './project.mjs'
```

and change the start of `loadIndex` to:

```js
export async function loadIndex(root, configuredUrl, options = {}) {
  const registryUrl = resolveRegistryUrl(configuredUrl)
  let bytes
```

The rest of the function stays as it is. Error messages now show the resolved tag URL, which is the URL that actually failed.

- [ ] **Step 4: Run the CLI suites**

Run: `pnpm exec vitest run tests/benos-registry-url.test.ts tests/benos-cli.test.ts tests/benos-update.test.ts`
Expected: PASS. Those suites use fixture/`file:` registries, so they don't change.

- [ ] **Step 5: Commit**

```bash
git add packages/benos/src/registry.mjs tests/benos-registry-url.test.ts
git commit -m "fix(benos): read the default registry index from the release tag"
```

### Task 3: Check the published shape

- [ ] **Step 1:** `pnpm build && pnpm check:packed && pnpm test:packed-benos-cli`. Expected: all pass. This confirms `../package.json` resolves from the packed tarball.
- [ ] **Step 2:** `pnpm lint && pnpm test`. Expected: all pass.

### Task 4: Docs and changelog

**Files:** `docs/architecture/ui-registry.md`, `docs/architecture/ui-cli.md`, `docs/release-checklist.md`, `CHANGELOG.md`

- [ ] **Step 1:** In `ui-registry.md`, below the `benos.json` example (around line 90), replace "registry is a discovery index, not the immutable base version." with:

  > `registry` is a discovery index, not the immutable base version. The default value (the `main` URL above) means "the registry for this CLI": the CLI fetches it from its own release tag, `https://raw.githubusercontent.com/benosjs/benos/v<cli version>/registry/v1/index.json`, so a release merged to `main` before it is published cannot break published CLIs. Any other URL or path is used as written.

- [ ] **Step 2:** Add the same rule in one sentence where `ui-cli.md` describes `--registry`.
- [ ] **Step 3:** In `release-checklist.md` → "Automated release", after step 6, add:

  > 7. From 0.5.1, the `benos` CLI reads the registry from its own tag, so new CLIs are unaffected by merges to `main`. CLIs up to 0.5.0 still read `main`. Publish promptly after tagging, then run **Actions → Published starter health → Run workflow** and confirm it passes.

- [ ] **Step 4:** In `CHANGELOG.md`, add an `## [Unreleased]` section above `0.5.0` with a "Fixed" entry: "`benos` reads its default UI registry index from its own release tag instead of `main`, so merging a release before publishing it no longer breaks published CLIs."
- [ ] **Step 5:** `pnpm lint` (Prettier covers Markdown), then commit:

```bash
git add docs/architecture/ui-registry.md docs/architecture/ui-cli.md docs/release-checklist.md CHANGELOG.md
git commit -m "docs: document release-tag registry resolution"
```

### Task 5: Checkpoint

- [ ] Write `docs/checkpoints/rp-1.md`: what changed, test output, and the open gap (decision 4). Stop for approval before opening a PR. Shipping it needs a 0.5.1 release of `benos` (and the matching version bump of all twelve packages that `check-release-tag.mjs` enforces). That's a separate, authorized step.

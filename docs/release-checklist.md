# v0.2.0 release checklist

This checklist prepares the eight unpublished 0.2.0 packages. Do not create the
tag or publish until the merged main branch has green CI and the package
dry-runs below pass. Release order is deliberate: publish the immutable Git
tag and verify the versioned registry first, then publish each package in
dependency order, checking its success output before continuing.

## 1. Preflight and package verification

Confirm the `ui-system` pull request is merged to `main`, the working tree is
clean, and CI is green for the merge commit. Confirm all eight publishable
package manifests have version `0.2.0`, complete metadata, an MIT license, and
a README. The root and package READMEs use the current logo.

From a clean checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm check:engines
pnpm build
pnpm registry:check
pnpm test
pnpm typecheck:types
pnpm check:jsx-types
pnpm check:doc-examples
pnpm check:public-imports
pnpm check:packed
pnpm audit:template
pnpm lint
pnpm size
pnpm bench:guard
pnpm gallery:build
pnpm exec tsc -p examples/ui-gallery/tsconfig.json --noEmit
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:browser
pnpm exec vitest run tests/create-benos.test.ts
```

`check:packed` packs all eight packages and validates exports, `workspace:`
metadata, root stubs, and `.tsbuildinfo`. For `benos` and `create-benos`, it
also rejects `.node` files, `node_modules` content, test-only dependencies in
the package manifest, and test tooling in runtime dependency sections.
`node-pty` and other workspace test tools must remain root devDependencies.
The generated starter's Vitest and happy-dom remain devDependencies of that
embedded application template.

The scaffold audit must show no engine or deprecation warnings and no high or
critical advisories. Confirm the core and core-plus-DOM budgets and benchmark
guard pass.

## 2. Rehearse packing and publishing

Run and inspect a dry-run for each package in this exact order. These commands
do not write to npm:

```sh
pnpm --filter @benosjs/core publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/dom publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/compiler publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/vite publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/eslint-plugin publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/primitives publish --dry-run --access public --publish-branch main
pnpm --filter benos publish --dry-run --access public --publish-branch main
pnpm --filter create-benos publish --dry-run --access public --publish-branch main
pnpm check:packed
```

Inspect each tarball for its README, LICENSE, built files, declarations, and
runtime entry points. Do not proceed if a package's manifest, files, or
version differs from the reviewed release.

## 3. Push the v0.2.0 tag, then verify registry URLs

Run these steps on the merged `main` checkout. Tagging must happen before any
package is published because the registry index points to immutable files at
the `v0.2.0` Git tag.

```sh
git switch main
git pull --ff-only origin main
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

Confirm every registry item URL resolves from the pushed tag:

```sh
node --input-type=module <<'NODE'
const base = 'https://raw.githubusercontent.com/benosjs/benos/v0.2.0'
const indexUrl = base + '/registry/v1/index.json'
const indexResponse = await fetch(indexUrl)
if (!indexResponse.ok) throw new Error('Registry index failed: ' + indexResponse.status + ' ' + indexUrl)
const index = await indexResponse.json()
for (const item of index.items) {
  const response = await fetch(item.url)
  if (!response.ok) throw new Error('Registry item failed: ' + response.status + ' ' + item.url)
  console.log('OK ' + item.name + ': ' + item.url)
}
NODE
```

Stop if the index or any item URL fails. Fix the tag contents and repeat the
URL check before publishing.

## 4. Publish packages one at a time

Log into the npm account that owns the `@benosjs` organization, then verify
the account:

```sh
npm login
npm whoami
```

Publish in this order. After each command, confirm its success line and that it
exited successfully before running the next command. Stop immediately on any
failure and inspect the npm registry state.

```sh
pnpm --filter @benosjs/core publish --access public --publish-branch main
pnpm --filter @benosjs/dom publish --access public --publish-branch main
pnpm --filter @benosjs/compiler publish --access public --publish-branch main
pnpm --filter @benosjs/vite publish --access public --publish-branch main
pnpm --filter @benosjs/eslint-plugin publish --access public --publish-branch main
pnpm --filter @benosjs/primitives publish --access public --publish-branch main
pnpm --filter benos publish --access public --publish-branch main
pnpm --filter create-benos publish --access public --publish-branch main
```

If an accidental prerelease such as `0.0.0-stage` is published, deprecate it
immediately so npm warns users. For example:

```sh
npm deprecate '@benosjs/dom@0.0.0-stage' 'Accidental prerelease; use 0.2.0.'
npm deprecate '@benosjs/vite@0.0.0-stage' 'Accidental prerelease; use 0.2.0.'
```

Replace the package name and version if another package is affected.

## 5. Verify npm and a fresh project

Wait until all eight published versions report `0.2.0`:

```sh
npm view @benosjs/core@0.2.0 version
npm view @benosjs/dom@0.2.0 version
npm view @benosjs/compiler@0.2.0 version
npm view @benosjs/vite@0.2.0 version
npm view @benosjs/eslint-plugin@0.2.0 version
npm view @benosjs/primitives@0.2.0 version
npm view benos@0.2.0 version
npm view create-benos@0.2.0 version
```

Create a fresh app, install the published `benos` CLI, and add a component:

```sh
npm create benos@latest -- benos-release-smoke --no-ui --install --no-start
cd benos-release-smoke
npx --yes benos@latest init --yes
npx --yes benos@latest add button --yes
npm run typecheck
npm run build
npm run test
npm run lint
```

Confirm `Button` was copied into the project and the lock file records its
registry version. Save the npm package and GitHub tag URLs with the release
record.

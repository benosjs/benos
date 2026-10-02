# v0.1.0 release checklist

This checklist is for the maintainer to run. All six packages are published at
`0.1.0`; the repository is pushed to `main`, and the Git tag and GitHub release
are pending final verification.

## 1. Create the npm organization and log in

1. Sign in to npm and open [Create an organization](https://www.npmjs.com/org/create).
   Create the organization named `benosjs`; this creates the `@benosjs` scope.
   Confirm that the account that will publish is an owner or publisher for that
   organization.
2. Log in from the release machine and verify the active account:

   ```sh
   npm login
   npm whoami
   npm org ls benosjs
   ```

3. Confirm the unscoped `create-benos` name and the `@benosjs` scope are available
   to the organization. Do not publish a probe package.
4. Confirm the repository and homepage URLs in every package manifest point to
   the final public repository.
5. Review [CHANGELOG.md](../CHANGELOG.md), [v0.1 readiness](checkpoints/v0.1-readiness.md),
   and the open performance items.
6. Ensure the root `LICENSE` and every package `LICENSE` contain the approved
   MIT text.

## 2. Rebuild and verify locally

From a clean checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm typecheck:types
pnpm check:jsx-types
pnpm check:doc-examples
pnpm check:public-imports
pnpm check:packed
pnpm lint
pnpm size
pnpm bench:guard
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:browser
pnpm exec vitest run tests/create-benos.test.ts
```

The `check:packed` script packs all six publishable packages and fails if any
packed `package.json` contains `workspace:`. The create-benos test also fails
if generated `@benosjs` dependencies are not published semver ranges such as
`^0.1.0`; this rejects local paths, packed archive paths, and workspace
protocols. Confirm the core and core-plus-DOM budgets, benchmark guard ratios,
and all browser engines pass.

## 3. Inspect package contents with pnpm pack

Use `pnpm pack` for each publishable package. Save the JSON output and inspect
the tarball contents for the package README, LICENSE, built files, declarations,
and runtime entry points. Confirm source tests, coverage, dashboards, and
workspace-only files are absent:

```sh
PACK_DIR="$PWD/.release-packs"
mkdir -p "$PACK_DIR"
pnpm --dir packages/core pack --json --pack-destination "$PACK_DIR"
pnpm --dir packages/dom pack --json --pack-destination "$PACK_DIR"
pnpm --dir packages/compiler pack --json --pack-destination "$PACK_DIR"
pnpm --dir packages/vite pack --json --pack-destination "$PACK_DIR"
pnpm --dir packages/eslint-plugin pack --json --pack-destination "$PACK_DIR"
pnpm --dir packages/create-benos pack --json --pack-destination "$PACK_DIR"
pnpm check:packed
```

The automated check must report no `workspace:` string in any packed
`package.json`, including nested manifests in the create-benos archive.

## 4. Prepare publishable manifests

The workspace manifests are kept private during development. Before publishing,
remove `private: true` only from these six publishable packages:

- `@benosjs/core`
- `@benosjs/dom`
- `@benosjs/compiler`
- `@benosjs/vite`
- `@benosjs/eslint-plugin`
- `create-benos`

Leave the root, dashboard, benchmark, template, and test fixtures private. Run
`pnpm install --lockfile-only` after any manifest edit and rerun the full local
verification list.

## 5. Required GitHub and CI gate before publishing

This gate is required before any package publish:

1. Commit the reviewed release changes locally.
2. Push the release branch to the GitHub repository:

   ```sh
   git push origin main
   ```

3. In GitHub Actions, confirm the complete CI workflow is green. The `verify`
   job must pass the full unit, type-level, documentation, lint, size,
   benchmark, packed-metadata, and browser suite. The `create-benos` matrix
   must pass its packed end-to-end test on **ubuntu-latest**,
   **windows-latest**, and **macos-latest**.
4. Do not publish until all four jobs (the full `verify` job and all three
   `create-benos` matrix entries) are green for the pushed commit.

## 6. Rehearse publishing with pnpm

Run a dry-run for all six packages in dependency order. This must complete
without registry writes:

```sh
pnpm --filter @benosjs/core publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/dom publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/compiler publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/vite publish --dry-run --access public --publish-branch main
pnpm --filter @benosjs/eslint-plugin publish --dry-run --access public --publish-branch main
pnpm --filter create-benos publish --dry-run --access public --publish-branch main
```

Review each rehearsal's files and manifest, then repeat `pnpm check:packed`.

## 7. Publish in dependency order

Use an npm account with two-factor authentication enabled:

```sh
npm login
pnpm --filter @benosjs/core publish --access public --publish-branch main
pnpm --filter @benosjs/dom publish --access public --publish-branch main
pnpm --filter @benosjs/compiler publish --access public --publish-branch main
pnpm --filter @benosjs/vite publish --access public --publish-branch main
pnpm --filter @benosjs/eslint-plugin publish --access public --publish-branch main
pnpm --filter create-benos publish --access public --publish-branch main
```

For a scoped package, `--access public` is required. Wait for each package to
become installable before publishing the next package that depends on it.
Check each publish command's exit status and success output before running the
next command. Stop immediately if a command fails, then verify the package on
the registry before continuing.

## 8. Verify the registry release

```sh
npm view @benosjs/core@0.1.0 version
npm view @benosjs/dom@0.1.0 version
npm view @benosjs/compiler@0.1.0 version
npm view @benosjs/vite@0.1.0 version
npm view @benosjs/eslint-plugin@0.1.0 version
npm view create-benos@0.1.0 version
npm create benos@latest -- --help
```

Finally create a fresh temporary app with `npm create benos@latest`, run its
type-check, build, test, and lint scripts, and record the release URLs.

## 9. Maintainer-only final release tag and GitHub release

After the registry verification succeeds, run these final steps yourself:

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --title v0.1.0 --notes-file CHANGELOG.md
```

Confirm the GitHub release page contains the `CHANGELOG.md` notes and links to
the published package versions.

# Release checklist

## Published release state

- Versions `0.2.0`, `0.2.1`, and `0.2.2` are published for all eight
  packages: `@benosjs/core`, `@benosjs/dom`, `@benosjs/compiler`,
  `@benosjs/vite`, `@benosjs/eslint-plugin`, `@benosjs/primitives`, `benos`,
  and `create-benos`.
- The optional UI system shipped in 0.2.0: primitives, 19 registry components,
  the `benos` component CLI, and theming.
- `benos@0.2.0` is deprecated. The 0.2.1 release notes document the launcher
  issue and point users to a fixed version.
- The accidental `@benosjs/dom@0.0.0-stage` and
  `@benosjs/vite@0.0.0-stage` versions are deprecated.
- GitHub Releases exist for `v0.2.1` and `v0.2.2`; `v0.2.0` remains
  represented by its existing tag.

## Automated release (default for future versions)

The `.github/workflows/release.yml` workflow runs when a `v*` tag is pushed.
It checks that the tag version matches all eight package manifests, runs the
full verification suite and OS/package-manager consumer matrices, and checks
the registry item URLs from that tag. Only after those jobs pass does the
`publish` job wait for approval in the GitHub `release` environment. It then
publishes in the order below with npm trusted publishing (GitHub OIDC),
without an npm token, and verifies all eight versions with `npm view`.
Trusted publishing automatically creates npm provenance for these public
packages from this public GitHub repository.

Before the first automated release, configure each of the eight package
settings on npmjs.com under **Package → Settings → Trusted publishing**:

| Field                | Value                |
| -------------------- | -------------------- |
| Provider             | GitHub Actions       |
| Organization or user | `benosjs`            |
| Repository           | `benos`              |
| Workflow filename    | `release.yml`        |
| Environment name     | `release`            |
| Allowed action       | Direct `npm publish` |

Repeat this configuration for all eight packages. On GitHub, open the
repository **Settings → Environments → New environment**, create an environment
named `release`, add `ahomsi0` as a required reviewer, and save it. The release
job uses this environment, so publishing remains blocked until that reviewer
approves the deployment.

For a release:

1. Update all eight package versions, registry minimums, and `CHANGELOG.md`.
2. Merge the reviewed release change to `main` after CI is green.
3. Create and push an annotated `vX.Y.Z` tag from the reviewed `main` commit.
   The workflow rejects the tag if its version differs from any package.
4. Confirm the verification, browser, three-OS create-benos, and
   three-OS/four-package-manager UI CLI jobs pass. The workflow verifies the
   versioned registry index and every immutable item URL before the publish
   job becomes available.
5. Review and approve the `release` environment deployment. The workflow
   publishes each package sequentially and stops on the first error.
6. Confirm all eight `npm view <package>@<version> version` checks match the
   tag. If a CLI version must be deprecated, run and verify that separately.

The workflow uses `pnpm publish --provenance`; it does not read or store an
npm token. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
for npm-side configuration details.

## Manual publish fallback

Use this only when the automated workflow cannot be used. First confirm the
reviewed `main` commit is clean and green in CI, package versions all match,
and registry URLs resolve from the release tag. Log in interactively, then
run the dry-run and `check:packed` before publishing. Stop after any failed
command and inspect registry state before retrying.

```sh
npm login
npm whoami
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

After the dry-runs pass, publish each package in this exact order, checking
the command's success line before starting the next one:

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

Then verify the exact version for every package:

```sh
npm view @benosjs/core version
npm view @benosjs/dom version
npm view @benosjs/compiler version
npm view @benosjs/vite version
npm view @benosjs/eslint-plugin version
npm view @benosjs/primitives version
npm view benos version
npm view create-benos version
```

The deprecation for `benos@0.2.0` is already in place. If an accidental
`0.0.0-stage` version is ever published, deprecate that exact package version
with a message pointing to the intended stable release.

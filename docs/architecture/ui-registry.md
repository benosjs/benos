# UI component registry

**Status:** U1 design; U3 adds schema-v1 validation, a deterministic static registry builder, and GitHub raw hosting instructions. The generated index is intentionally empty until U4 adds styled components. Schema and versioned URL structure are hard-to-reverse.

**Scope label:** registry foundations are implemented in U3; component payloads arrive in U4, and update-base retention is exercised in U5 (required for 0.2.0).

## Goals

- Deliver inspectable, source-owned components through a static registry.
- Describe component files, npm dependencies, style/token requirements, and component dependencies.
- Make releases immutable and preserve the exact previous source needed for safe updates.
- Reuse shadcn registry concepts where practical.

## Non-goals

- Executing remote code during install.
- Hosting a package registry or requiring sign-in.
- Coupling metadata to a package manager.
- Silently overwriting user-edited files.
- Guessing a website hostname before one is configured.

## Registry API: format

Use a small Benos catalog envelope layered around item documents compatible with the practical subset of the [shadcn registry item format](https://ui.shadcn.com/docs/registry/registry-item-json): item names/types, descriptions, npm dependencies, registry dependencies, file targets, and file contents. The example below is the Benos discovery envelope, not a claim that shadcn's registry index has a URL field. Keep extension fields versioned; ignore unknown optional fields only within a supported major schema. Reject an unknown major version.

Proposed index:

    {
      "schemaVersion": 1,
      "release": "0.2.0",
      "items": [
        {
          "name": "button",
          "type": "registry:component",
          "title": "Button",
          "description": "Accessible button styles and behavior",
          "url": "https://raw.githubusercontent.com/benosjs/benos/v0.2.0/registry/v1/items/button.json",
          "dependencies": [],
          "registryDependencies": ["tokens"]
        }
      ]
    }

Each item document lists relative registry paths, target templates, content types, checksums, and inline UTF-8 file content, following shadcn's source-registry approach. The index and item `dependencies` fields are arrays of `{ "name": "package", "version": "semver-range" }` records. No target may escape configured directories.

- npm dependencies are explicit package/range records, not bare package names. Batch 1 has none; Batch 2/3 install the `@benosjs/primitives` package and its source imports use only the required public subpaths.
- Every registry component's public props include `id?: string`. Components that need a machine or relationship ID forward it to the primitive; absent values come from `createUniqueId()`. Stateless components apply the optional ID to their root element for a consistent component API.
- registryDependencies name other registry items such as tokens or shared helpers. Resolve recursively, deduplicate by item/version, and apply deterministic topological ordering.
- files contain source-owned TSX/TypeScript/CSS. All TSX imports public @benosjs paths. A target starts with `components/` or `css/`; the CLI maps those prefixes to `benos.json` destinations and rejects traversal, absolute paths, and symlink escapes.
- The registry builder reads `registry/source/items/*.json`, emits deterministic schema-v1 item payloads with per-file SHA-256 checksums, and generates `registry/v1/index.json`. The index item checksum covers the exact UTF-8 bytes of its immutable item JSON; each file checksum covers its exact UTF-8 content.
- cssVars or Tailwind-oriented metadata may be optional; plain CSS remains the default.
- Checksums cover exact UTF-8 content; verify before planning writes.
- Schema forbids executable postinstall hooks and arbitrary shell commands.

## Versioning and hosting

Use a mutable stable discovery index in the GitHub repository, but require each resolved item to point at immutable release-tag content:

- Discovery index: repository path such as registry/v1/index.json on the main branch.
- Released item: https://raw.githubusercontent.com/benosjs/benos/v0.2.0/registry/v1/items/{name}.json.
- Each item records schema/release versions, checksums, and immutable file content. Retain old payloads throughout the supported update window.

U3 fixes the initial path and host: benos.lock.json pins installed component version, immutable base URL, and checksum. The discovery index on `main` is mutable, but an item URL must include the release tag and never use the branch URL. Never fetch the old base from an unpinned branch. GitHub raw is the initial host because the repository is canonical and requires no service; a configured website may mirror the same JSON later. Do not invent a public website URL. CDN headers and ETags are optimizations, not version identity.

The current generated v1 index has no items; this is expected before U4, not a
hosting failure. CI runs `pnpm registry:check` so checked-in discovery and
payload files cannot drift from registry sources. Runtime validation also
accepts `file:` URLs and loopback HTTP only for explicit local development and
tests; released registry URLs remain HTTPS and tag-pinned.

There are no styled registry components yet, so the fresh-project strict
TypeScript and Benos ESLint requirement for copied components becomes active
with U4's first registry payload; it is not vacuously counted as a U3 pass.

If the old base cannot be fetched, refuse automatic merge and preserve local files. A validated local cache is acceptable. Removing an item from the current catalog prevents new installation but does not erase old payloads needed for updates.

## Project configuration API: benos.json

benos init writes a small versioned root configuration:

    {
      "$schema": "https://raw.githubusercontent.com/benosjs/benos/v0.2.0/registry/v1/benos.schema.json",
      "schemaVersion": 1,
      "registry": "https://raw.githubusercontent.com/benosjs/benos/main/registry/v1/index.json",
      "style": "benos",
      "components": "src/components/ui",
      "css": "src/styles/benos.css",
      "alias": "@/"
    }

registry is a discovery index, not the immutable base version. style selects a registry style. components and css are project-relative destinations. alias is the import prefix. The create-benos template starts with the `@/` alias in both Vite and TypeScript. For an existing project, `benos init` preflights both configs and never programmatically edits an existing Vite config. If either alias is missing, it prints the exact lines to add and stops before writing UI files. TypeScript paths alone do not configure Vite runtime resolution.

Installed versions belong in benos.lock.json to keep intent separate from install state. Each item record contains resolved version, item checksum, immutable base URL, installed file hashes, and resolved dependency versions. It stores metadata only; prior content remains available from the versioned registry. This lockfile is project source state and must be committed.

`benos init` idempotently adds `.benos/` to `.gitignore`. That directory is reserved for local cache and conflict artifacts and is not committed.

Both files get JSON Schema, strict TypeScript validation, field-specific errors, and documented minor-version compatibility.

## Dependency resolution

For benos add button input dialog:

1. Load and validate the configured HTTPS index, or an explicitly selected local registry in development.
2. Resolve requested items and transitive registry dependencies. Detect missing names, cycles, version conflicts, and duplicate destinations before writing.
3. Resolve npm dependency ranges without downgrading installed compatible packages. Show any manifest/lockfile change.
4. Build a full plan of paths, collisions, package changes, CSS, config, and lock changes. Interactive mode displays it; CI mode requires explicit acceptance such as --yes.
5. Apply validated writes atomically per install group and record exact item versions/checksums.

Identical registry version, config, and requested names produce deterministic dependency plans and file bytes.

## Edge cases and security

- Unknown schema major or checksum mismatch: fail before changing files.
- Cyclic registry deps, duplicate destinations, or package conflicts: show the issue and write nothing.
- Existing differing target: use CLI conflict flow; never overwrite by default.
- Newer installed package: preserve it if compatible; otherwise report conflict rather than downgrade.
- Offline: allow only cached, checksummed, version-pinned data.
- Reject path traversal, absolute/drive paths, symlink escapes, Windows path prefixes, case-insensitive collisions, and NUL.
- Registry files become executable source after copying. Show source and dependency plan; never evaluate payloads during add.
- Require HTTPS, validate redirects, cap payload size, validate content type.
- Ignore unknown optional fields only when the supported major version says they are safe.

## Trade-offs versus related libraries

| Project                                                                   | Registry/source model                                | Benos comparison                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [shadcn registry](https://ui.shadcn.com/docs/registry/registry-item-json) | Static JSON with files, npm deps, and registry deps. | Reuse vocabulary; add immutable bases and integrity checks for safe edits/updates.                |
| [Radix](https://www.radix-ui.com/primitives/docs/overview/introduction)   | Versioned npm packages provide React primitives.     | Package updates are simpler; Benos copies editable TSX/CSS instead.                               |
| [Ark UI](https://ark-ui.com/docs/overview/about)                          | Framework packages built atop Zag.                   | Benos combines small runtime behavior dependencies with source-owned UI, at added CLI complexity. |
| [Kobalte](https://kobalte.dev/docs/core/overview/introduction/)           | Solid UI packages.                                   | Kobalte is package-first; Benos accepts registry/merge complexity for source ownership.           |

## Test plan for U3

- For every registry component, add it to a fresh create-benos project and verify strict TypeScript type-checking and Benos ESLint pass without modifying the copied component source. Run this against each supported package manager in the platform matrix.
- Type-level fixtures verify optional `id` on every registry component and that an explicit string is applied to the root or forwarded to the primitive ID it overrides.
- JSON schema fixtures for valid v1, missing fields, unknown major/optional fields, malformed URLs, and bad checksums.
- Deterministic graph resolution for missing deps, cycles, duplicates, semver conflicts, and Batch 1 dependency boundaries.
- Fresh create-benos fixture resolves immutable GitHub-tagged content with public imports only.
- Security fixtures for traversal, absolute/drive paths, symlinks, case collisions, oversized files, redirect policy, and non-HTTPS URLs.
- Same index+lock yields identical output; index movement does not rewrite installed base metadata.
- npm/pnpm/Yarn/Bun consumers type-check on Ubuntu, Windows, and macOS.

## Hard-to-reverse decisions

- Schema, field names, benos.json, and lock file.
- Stable index and immutable URL layout, plus old-payload retention.
- Graph identity/version policy, checksums, and conflict handling.
- Compatibility with shadcn registry readers and extensions.
- File target, alias, and project-config mutation semantics.

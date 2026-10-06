# Benos UI CLI

**Status:** U1 design approved; U3 implements `init`, `add`, and `list`; U5 implements `diff` and `update`. Package name, command grammar, config mutation, and merge semantics are hard-to-reverse.

**Scope label:** `init`, `add`, and `list` shipped in U3; `diff` and `update` are implemented in U5 (required for 0.2.0).

## Goals

- Initialize, inspect, add, and safely update source-owned UI with init, add, list, diff, and update.
- Keep dependency changes explicit and preserve application files.
- Work consistently on Windows, macOS, and Linux.
- Make copied components independent of the CLI at runtime.

## Non-goals

- Generating an app scaffold; create-benos stays separate.
- Replacing Vite, TypeScript, ESLint, or CSS configuration.
- Running downloaded code or arbitrary install scripts.
- Requiring a network for local diff/status when data is cached.
- Hiding conflicts behind force writes.

## Package and invocation

On 2026-10-02, npm view benos and npm view @benosjs/primitives both returned registry E404. The private workspace root is now named `benos-monorepo`, leaving `benos` available for the public CLI package. Recheck name availability and publish permission before U7; E404 is not a reservation.

    npx benos init
    npx benos add button input dialog
    npx benos list
    npx benos list --installed
    npx benos diff [name]
    npx benos update [name]

With no name, `diff` and `update` operate on every item in `benos.lock.json`.
A named update includes that installed item and its already-installed registry
dependencies. Non-interactive updates require `--yes`.

The CLI is a setup-time tool. Generated source imports public @benosjs packages, not the CLI.

U3 ships `init`, `add`, and `list [--installed]`. `diff` and `update` are not
accepted commands yet; they belong to U5. The public `benos` package is an
unscoped CLI and is separate from the private `benos-monorepo` workspace root.

## Command behavior

### init

- Detect the project root/package manager and a supported @benosjs/dom setup.
- Create benos.json and shared token CSS at configured destinations.
- Preflight the existing Vite config and TypeScript config before writing. Never programmatically edit an existing `vite.config.*` file. The create-benos template includes the `@/` alias in both Vite and TypeScript configuration.
- Configure component/CSS destinations and registry from [ui-registry.md](./ui-registry.md).
- If either resolver is missing the `@/` alias, print the exact Vite and/or TypeScript lines to add, then stop without writing UI files. TypeScript paths alone do not configure Vite runtime resolution.
- Add `.benos/` to `.gitignore` idempotently; it contains local cache and conflict artifacts. `benos.lock.json` records installed registry state and must be committed.
- Without interactive confirmation or explicit --yes, write nothing.

When the Vite alias is missing, print this import and object property for the user to merge manually; never write it into their existing file:

    import { fileURLToPath, URL } from 'node:url'

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },

When the TypeScript path mapping is missing, print these compiler options for the user to merge manually:

    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }

After printing any missing resolver lines, exit nonzero before writing config, token CSS, registry files, or lock state. The user reruns `benos init` after editing the config.

- Print changed files and next steps. Do not install primitives.

### add <name...>

- Resolve registry items and all dependencies before writes. Show files, CSS, npm changes, and conflicts.
- Copy source into configured component path and styles into CSS path. Install @benosjs/primitives only for items whose resolved graph needs it; Batch 1 has no primitive dependency.
- A new path is created; identical content is a no-op; different existing content enters conflict handling.
- --yes accepts a precomputed non-destructive plan, never permission to overwrite edits.
- If dependency install fails, report completed writes and exact manual package-manager command; do not claim rollback of package-manager side effects.

### list [--installed]

List names, descriptions, versions, required packages, and installed file state. Use validated cache offline. Network failure alone is not an error for cached listing; invalid local config or unsupported schema is an error.

### diff [name]

This command is read-only. It verifies and loads the exact installed payload at
the immutable `baseUrl` and checksum recorded in `benos.lock.json`, then compares
each tracked file with the local file and latest registry payload. It reports
`unchanged`, `local edits only`, `upstream changes only`, `both changed`,
`missing locally`, or `new upstream files`. An upstream file removal is shown
as an upstream change and never deletes a local file. Content classification
normalizes CRLF and LF while treating a missing final newline as a source edit.

If a transaction journal is pending, `diff` reports it without changing files
and asks the developer to run `benos update` to recover first.

### update [name]

Three-way merge with base=the exact payload pinned at original install,
local=current file bytes, and incoming=the latest registry payload. The base
must pass immutable URL, payload, and per-file checksum validation; a
version-keyed cache entry is accepted only after the same checks. If neither
the URL nor a valid cache supplies that base, skip the component and preserve
its local files and lock entry.

Independent line edits merge automatically; overlapping edits conflict, while
identical edits are kept once. Merged output uses the local file's newline
style and preserves the locally edited final-newline state. A missing local
file is a conflict rather than an instruction to restore it. Invalid UTF-8 is
refused without changing its bytes.

Every conflicted component remains unchanged, including its lock record. The
CLI writes complete `.base`, `.local`, and `.incoming` copies with resolution
instructions under `.benos/conflicts/`; it never writes conflict markers into
component source. Other component transactions may still succeed. A minimum
`@benosjs/*` version failure prints the exact upgrade command and stops before
source writes. Updates do not auto-install changed npm dependencies.

Files are staged in a per-component transaction directory with byte backups
and a journal. Target files are replaced before the lock entry; atomic lock
replacement is the commit marker. The next `benos update` removes a committed
journal or rolls back an uncommitted transaction. If files or lock state have
changed independently, recovery stops and preserves the journal and files for
manual resolution.

Plan every file before writes. If one component has conflicts, leave that component's files unchanged and write base/local/incoming artifacts under .benos/conflicts with resolution instructions. Independent components may update atomically as separate groups. No force option in v0.2.0; users may edit/remove a component themselves.

## Conflict and write safety

- init/add show conflicts; noninteractive mode returns nonzero with a machine-readable summary and never hangs.
- Never replace bytes differing from the expected generated base except with a merge that preserves both sides.
- Base is the installed lock record, not latest registry or guessed Git state. Retain immutable old registry payloads.
- Diff3 merges disjoint edits; overlapping edits are conflicts.
- Stage all files and lock changes for a component before replacing targets. Filesystem rename is not atomic across directories; on interruption, detect hash/lock mismatch and explain recovery.
- Do not insert conflict markers into TSX/CSS; preserve original and write separate artifacts.
- Reject symlink paths escaping project root. Updates do not delete files.

## Package-manager detection

Precedence:

1. Explicit --package-manager npm|pnpm|yarn|bun.
2. Unambiguous npm_config_user_agent from invoking tool.
3. One recognized lockfile: package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock or bun.lockb.
4. Multiple conflicting lockfiles: ask for explicit selection.
5. No evidence: detect installed executables only to suggest; do not silently choose when multiple exist.
6. No manager needed when operation changes no dependencies.

Support current npm, pnpm, Yarn, and Bun. Spawn with argument arrays, never shell-concatenate registry data. Preserve other lockfiles; do not regenerate another manager's lock. Test workspaces, scoped packages, prerelease ranges, and Windows executable suffixes. On failure, print exact manual command.

## Windows, macOS, and Linux

Use Node path/fs APIs. Validate registry targets as POSIX-relative before converting to native paths. Reject drive/UNC roots, `..`, NUL/control characters, Windows-forbidden filename characters, reserved device names, trailing dots/spaces, and absolute targets. Resolve symlinks and ensure the final path stays under project root. Detect case-folded path collisions on default macOS and Windows filesystems. Avoid symlink requirements; preserve existing line endings deterministically during merges and hash canonical UTF-8 bytes.

Do not assume shell syntax, slash direction, case sensitivity, or interactive terminal. Reports and exit statuses work in CI.

## CLI API and errors

The stable interface is commands, flags, output, and exit status, not an application runtime API. Output names registry version, manager selection, writes, and conflicts. A JSON mode is **later** work pending a concrete use case; it must not create a second registry protocol.

Errors identify project root, path, expected/actual version or hash, registry URL, and actionable resolution. Separate network/package-manager failures from invalid project data.

## Trade-offs versus related libraries

| Project                                                                 | Workflow                                 | Benos comparison                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [shadcn/ui](https://ui.shadcn.com/docs)                                 | Copy registry source and edit locally.   | Closest match. Benos adds immutable bases and explicit diff3 updates, increasing metadata and tooling to preserve edits. |
| [Radix](https://www.radix-ui.com/primitives/docs/overview/introduction) | Install/update React packages.           | Package upgrades are simpler; Benos prioritizes local source ownership.                                                  |
| [Ark UI](https://ark-ui.com/docs/overview/about)                        | Install framework adapters built on Zag. | Ark distributes components; Benos uses machine behavior plus local presentation source.                                  |
| [Kobalte](https://kobalte.dev/docs/core/overview/introduction/)         | Install Solid component packages.        | No copy/update protocol is needed there; Benos accepts CLI complexity to make files user-owned.                          |

## Verification status

U3 tests cover init preflight/idempotency, no-write confirmation, local registry
loading, checksum and path validation, dependency ordering/cycles, no-clobber,
cache fallback, package-manager detection, and reproducible generated registry
files. CI configures fresh create-benos consumer checks on Ubuntu, Windows, and
macOS with npm, pnpm, Yarn 4, and Bun. The matrix scaffolds and installs a fresh
project, runs `benos init`, `list`, `list --installed`, `diff`, and `update`,
then runs project typecheck, build, test, and lint. The U5 checkpoint records
the current three-platform, four-manager run.

The starter includes `.yarnrc.yml` with Yarn's `nodeLinker: node-modules`
setting so the starter's Vite client types resolve with the standard TypeScript
compiler under Yarn 4.

**U5 coverage:** `tests/benos-update.test.ts` covers all six diff statuses,
clean and disjoint updates, overlapping conflicts with untouched source and lock,
deleted files, unavailable bases, offline checksum-validated cache, CRLF,
independent component updates around a conflict, minimum-version refusal, and
interrupted transaction detection and recovery. The fresh consumer matrix
performs an actual disjoint local/upstream update with CRLF files on all three
operating systems and all four package managers.

## Hard-to-reverse decisions

- Package/binary name, command grammar, flags, and confirmation defaults.
- benos.json and lock format; alias/config mutation.
- diff3 behavior, conflict artifacts, immutable-base retention.
- Manager detection precedence, supported lockfiles, and child process behavior.
- Registry compatibility and destination path rules.

# Benos UI registry

The registry is static JSON hosted from this public GitHub repository. The
mutable discovery document is
`https://raw.githubusercontent.com/benosjs/benos/main/registry/v1/index.json`.
Every item URL in a released index points to an immutable version tag under
`registry/v1/items/`. The CLI verifies the exact item bytes and each file's
UTF-8 content checksum before it plans writes.

## Building the registry

Source metadata lives in `registry/source/items/<name>.json`. Each source file
contains the schema-v1 item fields, including file contents; the build adds
release versions and SHA-256 checksums. File targets use `components/` or
`css/` as prefixes, mapped to the paths in `benos.json`.

```sh
pnpm registry:build --release 0.2.0
pnpm registry:check
```

The builder sorts items deterministically and validates dependencies and paths.
It does not delete old payloads: immutable tagged item documents must remain
available for the lockfile update base. Review the generated index and payloads
with the release changes.

## Hosting and release sequence

For a release, build with the intended UI release version, verify the output,
commit the generated registry files, and publish that Git tag. GitHub raw then
serves the versioned item JSON from the immutable tag. The `main` branch index
is updated to point at that released payload only after the release is ready.
No separate server, credentials, or website hostname is required. Consumers
may mirror the same JSON later without changing the item checksums or lock
identity.

CI runs `pnpm registry:check` so checked-in discovery and payload files cannot
drift from registry sources.

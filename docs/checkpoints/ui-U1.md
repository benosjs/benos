# UI system checkpoint U1 amendment

**Date:** 2026-10-02

**Status:** U1 approved with amendments. U2 reached a public Zag ID contract gate.

## What changed

- Updated the CLI and registry designs: the create-benos template supplies `@/` aliases in Vite and TypeScript; `benos init` never edits existing Vite configs and stops with exact alias instructions if a resolver is missing; `.benos/` is ignored for cache/conflict artifacts; `benos.lock.json` is committed.
- Added the registry acceptance gate that every copied component passes strict TypeScript and Benos ESLint in a fresh starter without source edits.
- Renamed the private workspace root package to `benos-monorepo`.
- Added the Vite and TypeScript alias to the create-benos template and changed its test import to exercise `@/`.
- Added `.benos/` to the root `.gitignore`.
- Pinned Zag evaluation to 1.44.0 and recorded its public `VanillaMachine` contract in ui-primitives.md.
- The approved `assets/brand/` files are not present in this checkout. The old `assets/benos-logo.png` was not substituted; palette and starter/README logo updates remain pending the supplied files.

## Validation and sizes

| Check                             | Result                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --lockfile-only`    | Pass, Node 22.18.0                                                                                                                                             |
| `pnpm build`                      | Pass, Node 22.18.0                                                                                                                                             |
| `pnpm test`                       | Pass — 15 files, 136 tests, including packed starter E2E and alias resolution                                                                                  |
| `pnpm test:browser`               | Pass — 30 tests across Chromium, Firefox, and WebKit                                                                                                           |
| `pnpm typecheck:types`            | Pass                                                                                                                                                           |
| `pnpm lint`                       | Pass — ESLint and Prettier                                                                                                                                     |
| Other required repository checks  | Pass — doc examples, public imports, packed metadata, engines, template audit                                                                                  |
| `pnpm --filter create-benos test` | Extra package-local command fails because `node --test` discovers the app's Vitest test file and cannot resolve its Vite alias; this command is not used by CI |
| Core size                         | 4,001 / 4,096 gzip bytes after fresh build                                                                                                                     |
| Core + DOM size                   | 10,151 / 10,240 gzip bytes after fresh build                                                                                                                   |

## Deviations and open gates

- The Zag machine props require a stable unique `id`. Zag's Solid adapter normally gets one from `useId`; Benos has no public ID-generation API. The adapter will not substitute a module counter, random value, DOM lookup, or internal import. Decide whether copied primitives require caller-provided IDs or Benos needs a public ID API before implementation.
- New brand assets are absent, so their palette cannot yet be measured and the new assets cannot yet be copied into the starter or READMEs.
- Fresh production sizes are authoritative for this amendment; the prior `3,997` / `10,148` figures were from stale `dist` output.

**Checkpoint result:** U1 amendments are recorded. U2 is stopped at the public ID contract gate, with no primitive implementation workaround.

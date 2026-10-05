# U4 batch 4 checkpoint

**Date:** 2026-10-05

**Status:** Implementation and local verification complete; GitHub Actions is
pending the authorized push.

## Registry compatibility gate

Every registry item now carries a required `minimumBenosVersions` array. The
registry builder validates and publishes it, and `benos add` checks the
installed package manifests for the full resolved item graph before writing
component files, package metadata, lockfile entries, or cache data. An absent
or older package causes a refusal with the package manager's exact upgrade
command. Unit tests verify the refusal leaves project state unchanged and that
the add succeeds when the installed versions meet the minimum.

The fresh-project test packs workspace builds of core 0.1.3, DOM 0.1.2, and
primitives 0.2.0 into its local feed. Public core 0.1.2 predates
`createUniqueId()`, so items requiring it correctly request core 0.1.3. Do not
serve those items to projects with the older runtime; the CLI now blocks the
add with an actionable command.

## Sortable table coverage

| Requirement                                                   | Implementation and verification                                                                                | Result                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Semantic table with an accessible name                        | Real `<table>`, `<caption>`, `<thead>`, `<th scope="col">`; Playwright + axe in `tests/browser/batch4.spec.ts` | Pass in Chromium, Firefox, WebKit |
| Sort by pointer and keyboard; ascending, descending, unsorted | Native header buttons; Enter and Space; `aria-sort` plus visible arrows; browser tests exercise the full cycle | Pass in Chromium, Firefox, WebKit |
| Preserve keyed rows while sorting                             | `<For>` keyed by the caller's stable `rowKey`; test retains and compares existing row nodes after reordering   | Pass in Chromium, Firefox, WebKit |
| Empty state and long content                                  | Empty message row; long text truncates without widening the table                                              | Pass in Chromium, Firefox, WebKit |
| Numeric alignment and RTL                                     | Logical `text-align: end`; test compares rendered alignment in both directions                                 | Pass in Chromium, Firefox, WebKit |
| Gallery and large data set                                    | Gallery previews light, dark, and RTL; each panel toggles between sample data and 10,000 rows                  | Build passes; present in gallery  |
| Public types                                                  | Generic `SortableTable`/column types and optional `id` covered by `tests/ui-batch4.types.ts`                   | Passes strict type check          |

The registry item also installs unchanged into a fresh create-benos project.
That project passes strict type-check, production build, Vitest, and Benos
ESLint/Prettier with pnpm.

## Verification

- `pnpm build`: passed with Node 22.18.0.
- `pnpm test`: 206 tests passed across 19 files.
- `pnpm test:browser`: all 375 browser tests passed across Chromium, Firefox,
  and WebKit. The runner uses two workers to avoid resource contention on the
  local machine; assertions and timeouts are unchanged.
- `pnpm typecheck:types`, `pnpm lint`, `pnpm check:doc-examples`,
  `pnpm check:public-imports`, `pnpm check:packed`, `pnpm check:jsx-types`,
  `pnpm check:engines`, `pnpm audit:template`, `pnpm registry:check`,
  `pnpm gallery:build`, and `pnpm test:ui-cli:matrix` (pnpm path): passed.
- `pnpm bench:guard`: all five production kernel workloads remain under the
  2× Preact guard.
- Fresh production sizes: core 4,051 / 4,096 gzip bytes; core + DOM 10,200 /
  10,240 gzip bytes. No core or DOM runtime source changed.
- GitHub Actions: pending; this checkpoint will be updated after the
  `ui-system` workflow finishes.

## Production table benchmark

Benos and Solid use equivalent table markup, three columns, CSS, and rows.
Both are Vite production builds, compared in alternating order in Chromium.
The initial-render timer starts before mount after data preparation; the sort
timer starts at header activation. Measurements end after two animation frames
as a render/paint opportunity proxy, not as a Chrome-tracing paint timestamp.
The table begins in reverse numeric order so each sort causes keyed row moves.
Values are medians of seven rounds after one warmup; brackets show min–max.

| Workload                    |          Benos (ms) |          Solid (ms) | Benos / Solid |
| --------------------------- | ------------------: | ------------------: | ------------: |
| Initial render, 5,000 rows  | 255.0 [174.6–326.7] |    93.9 [87.7–99.3] |         2.72× |
| Sort, 5,000 rows            |  126.8 [87.5–136.3] |  115.0 [92.3–124.3] |         1.10× |
| Initial render, 10,000 rows | 491.4 [387.0–554.3] | 199.6 [173.9–265.1] |         2.46× |
| Sort, 10,000 rows           | 266.2 [234.0–447.5] | 240.2 [197.4–361.4] |         1.11× |

Benos mounts 5k and 10k rows 2.72× and 2.46× slower than Solid in this run.
Full keyed sorts are 1.10× and 1.11× slower; their spreads overlap. No table
optimization was added based on this single noisy comparison. The likely
initial-mount costs from descriptor/accessor and owner setup are not isolated
by this benchmark and remain a profiling hypothesis. Raw samples and protocol
metadata are in
[`benchmarks/js-framework-benchmark/results/u4-batch4-table.json`](../../benchmarks/js-framework-benchmark/results/u4-batch4-table.json).

## Deviations

- The test-only headless menu fixture uses non-focusable menuitem elements for
  its `aria-activedescendant` pattern. Native buttons made extra tab stops and
  caused intermittent WebKit Tab results. The runtime and the documented Zag
  behavior are unchanged; the styled Dropdown Menu Tab test still covers the
  native button implementation and references the existing upstream draft.
- Initial table mounting remains substantially slower than Solid. The measured
  values are recorded without claiming a specific cause or changing public
  semantics.

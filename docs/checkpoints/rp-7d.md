# RP-7d — Verification and release preparation

**Status:** After RP-7c-5 the user chose to stop the increments and verify. The user's words: "Stop, verify (7d)". (Their decision on candidate 5 is recorded in [RP-7c-5](./rp-7c-5.md): "Keep component skip".) Everything below is committed locally on `perf/row-creation`. **Nothing is pushed, and no pull request is open yet**; that waits for your go-ahead, and the three-OS CI runs only once it is open.

## What Phase 7 changed

Five changes in `@benosjs/core` and `@benosjs/dom` (internal only; no public API or documented guarantee changed):

| Step    | Change                                                                      | Core + DOM bytes |
| ------- | --------------------------------------------------------------------------- | ---------------: |
| RP-7c-1 | Dynamic text in compiled templates without a slot                           |              +72 |
| RP-7c-2 | Bulk removal on clear and full replace; a quadratic scan removed            |              +23 |
| RP-7c-3 | One owner per `<For>` row that returns a plain component                    |              +77 |
| RP-7c-4 | Keyed item and index state without signal closures                          |              +46 |
| RP-7c-5 | One removal for a component whose output is a compiled template (kept half) |              +18 |

Candidates 6 and 7 were not built: they need core bytes beyond its cap, and at your call the phase stopped here.

## Verification

Every command of CI's main job, run locally on the final branch, each exiting 0:

| Command                                                                    | Result                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `check:engines`, `build`, `registry:check`, `gallery:build`                | Passed                                                |
| `tsc` for the UI gallery and the dashboard; dashboard build and SSR build  | Passed                                                |
| `scripts/test-dashboard-ssr.mjs`                                           | Dashboard server entry passed 4 pages on Node 26.10.0 |
| `pnpm test`                                                                | 56 files, 587 tests                                   |
| `typecheck:types`, `check:jsx-types`, `check:doc-examples`                 | Passed (54 doc files in both modes)                   |
| `check:flagship`, `check:public-imports`, `check:packed`, `audit:template` | Passed                                                |
| `pnpm lint`, `pnpm size`                                                   | Passed; every size within its cap                     |
| `pnpm bench:guard`                                                         | Passed: every workload ≤ 1.81× Preact                 |
| `pnpm test:browser` (Chromium, Firefox, WebKit)                            | 534 passed                                            |
| `pnpm test:server-runtime`                                                 | Server runtime fixture passed on Node 26.10.0         |
| `tests/create-benos.test.ts`                                               | Passed                                                |

The unit suite includes every compiler fixture in `none` and `safe` modes and the server, streaming, and hydration suites. Over the phase, 13 tests were added and none of the existing ones changed.

**Not run locally:**

- macOS, Linux, and Windows through CI;
- the Bun runtime job (Bun is not installed here);
- the npm 10/11 starter matrix and the packed-CLI jobs, which install from the network.

All of these run in CI on the pull request.

## Final measurements

All timing runs started with the one-minute load average below 3 and no other process above half a core; the full tables are in [benchmarks/README.md](../../benchmarks/README.md#phase-7-row-creation-comparison-2026-11-05).

### Against the targets (0.7.1 and Phase 7 in the same interleaved rounds)

| Workload                                                 | 0.7.1          | Phase 7        | Target                       | Met |
| -------------------------------------------------------- | -------------- | -------------- | ---------------------------- | --- |
| Create 1,000 rows                                        | 1.37×          | 1.35×          | ≤ 1.05×                      | No  |
| Replace 1,000 rows                                       | 1.40×          | 1.28×          | ≤ 1.05×                      | No  |
| Create 10,000 rows                                       | 1.36×          | 1.28×          | ≤ 1.05×                      | No  |
| Append 1,000 rows                                        | 1.23×          | 1.19×          | ≤ 1.05×                      | No  |
| Clear rows                                               | 2.06×          | 1.48×          | ≤ 1.10×                      | No  |
| Sortable table mount (registry, 8 cells)                 | 1.53–1.94×     | 1.53–1.84×     | ≤ 1.15×                      | No  |
| Retained objects / arrays / closures, registry table row | 67.2 / 40 / 34 | 50.2 / 28 / 28 | ≤ 1.5× Solid's 24.1 / 6 / 12 | No  |
| Update, select, swap, remove, sort                       | 0.94–1.55×     | 0.93–1.30×     | no regression                | Yes |
| Kernel guard                                             | ≤ 1.84× Preact | ≤ 1.81× Preact | ≤ 2× Preact                  | Yes |

In milliseconds against 0.7.1:

- **Clearly faster:** clear −28%, select −21%, replace −9%, creating 10,000 rows −6%, and the table mount −6% (geometric mean over the eight cells).
- **Slightly faster:** creating 1,000 rows −2%, append −3%, swap −6%, remove −3%.
- **Unchanged:** the partial update, and sort (geometric mean 1.00). One sort cell, 3 columns at 10k, moved from 1.10× to 1.29× Solid with overlapping spreads.

### Per row and garbage collection

- **A benchmark row** retains 67.5 objects and 2,477 B, against 95.5 and 3,408 at 0.7.1 and Solid's 26.5 and 913. That is one owner instead of four and no signal. Binding setup on create makes 3,000 calls per 1,000 rows instead of 7,000, and clear makes 3 disposal calls per row instead of 15.
- **Collection, measured back to back twice:**
  - creating 10,000 rows: 139 → 94–101 ms;
  - the 10,000-row table mount: 321–329 → 202–203 ms;
  - the 5,000-row table mount: 108–110 → 85–92 ms;
  - clear: 0.7 → 0 ms;
  - replacing 10,000 rows: 14.5–14.9 → 18.1–18.5 ms, the one place it grew.

  GC taken in different sessions varied by more than these effects. One run earlier in this session measured create 10k at 141 ms; it is kept in `rp-7d-garbage-collection-2026-11-05.json` and not used.

- **Kernel:** back to back, the Phase 7 build's Benos times are equal to or below 0.7.1's on all five guard workloads (for example, fanout 2.20 → 2.07 ms), so the shared signal write path did not slow the kernel.

### Sizes

| Bundle                       |  0.7.1 | Phase 7 |    Cap |
| ---------------------------- | -----: | ------: | -----: |
| `@benosjs/core`              |  4,490 |   4,587 |  4,608 |
| `@benosjs/core` + DOM        | 11,515 |  11,751 | 12,032 |
| `@benosjs/dom/hydrate`       |  3,962 |   3,962 |  4,096 |
| `@benosjs/server`            |  7,688 |   7,688 |  8,448 |
| Dashboard JavaScript (gzip)  | 43,002 |  43,220 |      — |
| UI gallery JavaScript (gzip) | 85,163 |  85,443 |      — |

The core + DOM cap is the 12,032 B you approved for this phase at RP-7b. The compiler did not change, so applications grow by the runtime's increase only.

## Documents updated

- `benchmarks/README.md`: a new "Phase 7 row-creation comparison" section, superseding the 0.3.0 comparison. It covers all frameworks, 0.7.1 against Phase 7 for the nine operations and the table, allocations, GC, the kernel guard, and sizes.
- `CHANGELOG.md`: a new entry under **`[0.7.2] — Unreleased`** (the version is your call; see below).
- `docs/plan.md`: Phase 7 marked "implemented, in review", with an outcome table against the targets and what remains. `docs/roadmap.md`, `docs/row-perf-plan.md`, and `docs/architecture/performance.md` got status updates.

## Assessment

Phase 7 made Benos faster on every operation it targets without slowing anything, and cut a row's retained memory by about 29%. It did not reach Solid's level for creating rows: 1,000 rows went from 1.37× to 1.35× and 10,000 from 1.36× to 1.28×. Most of the remaining gap is per-row work that Solid does not do at all:

- a component descriptor and its props copy;
- the list entry and its accessor closures;
- a template instance's values array and binding records.

Each remaining candidate in this design trims a few of those records for about 1% each. Reaching the target would take a different design, for example compiling a row component's template and bindings together so the row needs no descriptor or props copy. That deserves its own design step, not more increments here.

## Decisions for you

1. **Push the branch and open the pull request.** CI then runs the three operating systems, Bun, and the npm matrix. I stop there, before merging.
2. **Version.** I wrote the CHANGELOG entry as `[0.7.2] — Unreleased`, since only internal code changed. 0.8.0 works too if you'd rather mark the performance phase as a minor release. Nothing is bumped or published either way.
3. **The `computed` finding (RP-7c-4).** A keyed row whose first read of its item is inside a `computed` throws. The fix is one line with no size change, plus one test. It could go into this PR before it opens, or into a separate fix.
4. **Left for later, unless you want them now:**
   - dropping the text marker from RP-7c-1;
   - the `onMount` bug with an array containing a `<Portal>` (RP-7c-2);
   - the object-keyed hydration ids (RP-7c-3).

   Each is its own small change with its own test.

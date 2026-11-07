# `onMount` lost for arrays and templates that hold a control: design note

Branch `fix/portal-array-mount`, cut from `perf/row-creation` (73c3a1d) and fast-forwarded to `main` (d63d78e, the merge of PR benosjs/benos#32, same tree).

**Decision.** The user chose option A + R: "Build A + R". The implementation and its checks are recorded at the end of this note.

## What is broken

The reported case (`[<p/>, <Portal>]` with `onMount`, rendered into a detached host that is attached later) is one instance of a wider bug. It also fails in an **attached** host, and with other controls, not only `Portal`. Four new tests in `packages/dom/tests/dom.test.ts` fail on the current code:

| Test                                                                                                     | Shape                                                                                                                                                        | Result today                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| runs onMount for an element and a Portal after the detached host is attached, alone or in a For          | the reported case                                                                                                                                            | `onMount` never runs                                                                                                |
| runs onMount when an array or template holds a control whose nodes change after it mounts                | `[p, Portal]`, `[p, Show(span)]`, `[p, For(one li)]`, `For` of one `Portal`, `dynamicChild(() => <span/>)`, `[p, dynamicChild]`; attached and detached hosts | `onMount` never runs, in any of the 12 combinations                                                                 |
| delays onMount for a component that returns a Portal into a detached target until the target is attached | portal-only output, attached host, target attached later                                                                                                     | `onMount` never runs                                                                                                |
| moves every node of a keyed row whose output holds a Show                                                | `<For>` rows `[Show(span), b]`, reversed                                                                                                                     | the rows do not move (in a real browser the move would insert before a detached node, which throws `NotFoundError`) |

`dynamicChild` is what the compiler emits for `{expr}` children, so a compiled component such as `<>{open() && <span/>}</>` hits this too. Single-element, element-array, and portal-only outputs mount correctly. All of this is in 0.7.1 (`mountValue`, `updateSlot`, and `<For>` are the same there).

## Cause

**1. Ranges are snapshots.** Some `DomRange`s copy their children's node lists when they are built: the array branch of `mountValue`, `setSlotRange` (a slot's range copies its branch's range), `<For>`'s commit (copies every row's nodes), and a template whose top-level node is a slot anchor (keeps the anchor instead of the slot's range). A control's own range changes later. Its first render runs in a deferred render effect, after the parent has already copied. A single-element branch then removes the slot's marker, and a `Portal` moves its marker into the target. The parent's copy keeps a node that is no longer in the DOM, so `rangeConnected()` never passes again. Two things follow:

- `onMount` is lost. In a detached host, the observer never sees the range connect. In an attached host, `notifyMount` queues the job while the old marker is still in place. By the time `runMount` runs, the copy holds the removed marker, so the job is dropped.
- Keyed moves use the stale list: they move the removed marker and leave the new nodes behind.

**2. A queued job whose range leaves the document is dropped.** `mountComponent` decides between `notifyMount` and `trackMount` once, before the deferred control effects run. If the range was connected then, the job is queued. If it is no longer connected when it runs (a `Portal` that has moved into a detached target), core's `runMount` returns without running it, and nothing watches for the target being attached. Live ranges do not fix this; it needs its own small change.

## Portal-only output mounting while its host is detached

This is the behaviour the docs specify. Renderer.md says a portal "keeps the declaration owner's parentage even when its range is elsewhere". Components.md's `Portal` row says "a detached target delays `onMount` until connected". Ownership.md says mount waits for "the component's representative nodes or anchor". A component whose whole output is a `Portal` has no node at its declaration site: the portal's marker moves into the target. So its representative nodes are the portal content, and the host's state does not matter. I recommend keeping this behaviour, with one added sentence in components.md's `Portal` row that states it. Option C below would change it.

## Options

Sizes are from `pnpm size` on prototypes of each option, built from this branch. Core is 4,587 / 4,608 B in every option, because all of them are DOM-only. The server and `dom/hydrate` sizes do not change.

| Option                                                       | core + DOM (cap 12,032; now 11,751) | New tests passing                                | Full suite |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------ | ---------- |
| **A + R. Live ranges + re-watch dropped jobs** (recommended) | **11,726 (−25)**                    | 4 / 4                                            | all pass   |
| A. Live ranges only                                          | 11,719 (−32)                        | 3 / 4 (portal into a detached target still lost) | all pass   |
| B. Live array ranges only                                    | 11,752 (+1)                         | 2 / 4                                            | all pass   |
| C. Portal keeps an in-place node                             | 11,774 (+23)                        | 1 / 4 (only the reported case)                   | all pass   |

**A. Live ranges.** A range that holds other ranges reads their nodes when asked, instead of copying them at build time. That covers four places: the array branch of `mountValue`, slot ranges (the branch's nodes, or the list's rows, plus the marker while it is in the DOM), `<For>`'s range (no copy per commit), and a template's top-level slot anchor (replaced by that slot's range). The three places that build a `Slot` share one constructor, which is why the bundle gets smaller. The writes that kept the copies up to date go away: `setSlotRange`, Portal's `range.nodes = [marker]`, For's commit, and the slot cleanup's `nodes = []`. A stage commit now inserts its fragment in one call instead of re-listing the fragment's children into the range.

- Risk: the `DomRange` contract changes from "a list" to "read when asked". Every reader already reads `.nodes` when it needs it; nothing stores the arrays. The one exception is the `nodes` field a stage hands the async host, which `@benosjs/async` does not read. The rule for including a marker is the same one `setSlotRange` used, now applied at read time.
- Performance: rows rendered by compiled templates (the benchmark path) keep plain ranges. `<For>` no longer builds a new array of every row's nodes on each commit, which saves an O(n) array per create, replace, or clear. Reading a slot or array range now allocates a new array. That happens on mount checks, in observer callbacks while a mount is pending, when moving rows whose output is a control, and on removal. After implementation I would run create 1k/10k, replace, and clear interleaved against 73c3a1d to confirm there is no regression.

**R. Re-watch a job whose range left the document (adds 7 B to A).** When the component's readiness check says "not yet", it also hands the owner to the existing per-document observer. `trackMount` keys its pending set by owner, so an owner is watched only once. This covers the portal-into-a-detached-target test, and also a job dropped when a gate opens. This is the observer's documented role ("while already committed jobs await external attachment"), and it needs no core change.

- Risk: it changes the observer bookkeeping (a `Set` of instances becomes a `Map` keyed by owner), and it installs the observer in one new situation: a queued job whose range left the document before the job ran.

**B. Live array ranges only.** This was the original hypothesis. It is the smallest diff, but it leaves the `dynamicChild` and top-level-template cases, `For` of one `Portal`, nested controls (`setSlotRange` copies), the keyed-move bug, and cause 2.

**C. Portal keeps a stable in-place node.** The declaration-site marker stays in the DOM, and the portal's range is only that marker. This fixes only the `Portal` variants. It changes DOM shape: every `Portal` leaves a comment at its declaration site, and hydration keeps the server's placeholder comment instead of removing it. A portal-only component would then mount with its host and stop waiting for its target, which contradicts components.md.

## Not covered by any option (possible follow-ups)

- `Suspense`'s range is only its marker; its content sits before the marker and is not in the range. Mount timing is fine, but a keyed row whose output is a `Suspense` would move only the marker.
- `dom/hydrate` builds its own root owner. Option A fixes its range automatically, because it gets ranges from `mountValue`. Option R does not reach it.

## Implementation (A + R)

All changes are in `packages/dom/src/index.ts`, plus tests, docs, and the changelog:

- `newSlot` builds every `Slot`: `createSlot`, a template's child slot, and a direct template's child slot. A slot's `range.nodes` is a getter: its branch's nodes, or a list's rows (`Slot.rows`), then its marker while the marker is in the DOM. `setSlotRange` is gone, along with the writes that kept the old copies current: Portal's `range.nodes = [marker]`, For's commit, and the slot cleanup's `nodes = []`.
- The array branch of `mountValue` keeps its items' ranges and returns a range whose `nodes` reads them.
- `<For>`'s commit sets `slot.rows` and removes the marker for a single-element row. It no longer builds an array of every row's nodes.
- A template whose top-level node is a slot anchor (the compiler's `dynamicChild`) returns a range that reads that slot's range in the anchor's place.
- A stage commit inserts its fragment in one call.
- R: the readiness check of a component's owner, and of the `render` root's owner, calls `trackMount` when it answers "not yet". `trackMount`'s pending set is a `Map` keyed by owner, so an owner is watched once.
- `DomRange.nodes` is documented as "read when needed and never kept".
- components.md's `Portal` row now states that a portal-only component's `onMount` waits for the target and not for its host. A test pins this.

### Checks

- `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck:types`, `pnpm size`: all pass. 56 files and 592 tests: the 587 existing tests unchanged, plus 5 new.
- Sizes: core 4,587 / 4,608 B (unchanged); core + DOM 11,751 → 11,726 / 12,032 B (−25); `dom/hydrate` 3,962, server 7,688, and async 2,084 are unchanged.
- `pnpm --dir examples/dashboard build` and `build:ssr`, then `pnpm test:browser`. The first full run had 533 passed and 1 failed: Chromium "dropdown-menu: keyboard behavior, dismissal, and focus". After End, `aria-activedescendant` stayed `fixture-menu/rename` instead of `fixture-menu/archive`. It failed again in the next full Chromium run. After that it passed in 5 full Chromium runs and 2 full three-browser runs (534 / 534 each), 40 / 40 times alone, and 12 / 12 times under CPU load. main's build passed 4 full Chromium runs between them. No changed code runs in that test: the menu component returns one `<div>` in an attached host, so its range and mount timing are as before. The stuck value matches a race in `@zag-js/menu` 1.44.0. Opening from the trigger runs `highlightFirstItem`, which defers to `requestAnimationFrame` when the content does not exist yet. An End press that lands before that frame is overwritten with the first item. I record it as an intermittent failure whose cause is not proven.

### Benchmark: main against the fix, interleaved

Same protocol as Phase 7. `run.mjs` was copied to a temporary script that served a saved build of main next to the fix and Solid, interleaved in the same rounds: two warmups, seven measured rounds, Chromium 153.0.8010.12, Node 26.10.0, macOS arm64. The run started once the 1-minute load average was 3.3, after macOS background jobs had held it near 8. Median [min–max] ms:

| Operation          | main                | fix                 | Solid               | fix / main |
| ------------------ | ------------------- | ------------------- | ------------------- | ---------: |
| Create 1,000 rows  | 32.5 [32.2–34.3]    | 32.8 [32.0–34.5]    | 24.7 [24.4–27.0]    |      1.009 |
| Replace 1,000 rows | 32.6 [32.3–33.3]    | 32.4 [32.1–34.8]    | 25.5 [25.2–27.4]    |      0.994 |
| Update every 10th  | 12.6 [12.5–13.3]    | 12.5 [12.3–12.6]    | 13.5 [13.4–13.7]    |      0.992 |
| Select one row     | 1.0 [1.0–1.1]       | 1.0 [1.0–1.1]       | 0.8 [0.8–0.8]       |      1.001 |
| Swap rows          | 3.6 [3.5–13.3]      | 3.5 [3.5–3.6]       | 2.8 [2.7–2.8]       |      0.981 |
| Remove one row     | 4.5 [4.5–4.6]       | 4.4 [4.3–4.7]       | 4.2 [4.1–4.6]       |      0.976 |
| Create 10,000 rows | 300.2 [299.2–306.4] | 300.7 [297.5–309.9] | 234.4 [233.8–240.3] |      1.001 |
| Append 1,000 rows  | 41.6 [41.5–46.9]    | 41.6 [41.2–41.9]    | 35.0 [34.6–36.0]    |      0.999 |
| Clear rows         | 3.7 [3.7–3.8]       | 3.7 [3.7–4.0]       | 2.5 [2.5–2.6]       |      0.990 |

No operation moved beyond its own spread. The two builds' samples for creating 1,000 rows overlap completely (main 32.2–34.3, fix 32.0–34.5), as do those for 10,000 rows and for clear. The temporary script and the saved build were deleted. The raw JSON was not committed.

## Performance follow-up: the sortable table's mount

The user asked for the table cost to be removed before merging: "Fix the cost first" (relayed by the session that started this one). That session measured 2f14adf at 1.03–1.07 × main on the registry `SortableTable`'s initial render (geomean of 8 cells), with sort and the nine-operation row benchmark unchanged.

**Where it came from.** Each table row is a `<tr>` whose child is `columns.map(...)`: an array of `<td>` templates in a direct template's child slot. In 2f14adf, every array became a range with a per-instance getter, and `updateSlot` then read the branch's nodes three times (the singleton check twice, then `rangeConnected`), each read rebuilding the list with `flatMap`. Every slot was also an object literal holding a range object with its own getter closure. The row benchmark's rows are single templates, so they never reached either path.

**Change.** This replaces the getter objects described under "Implementation":

- `Slot` is a class and is its own range, with the `nodes` getter on its prototype. A slot no longer allocates a separate range object or a getter closure. `createSlot`, a template's child slot, and a direct template's child slot construct it; `slot.range` is gone.
- `RangeList` (a class with a prototype getter) is used only for an array or template that holds a slot (`Slot` or `RangeList`). An array of plain ranges keeps one list, built by the same loop as on main. A template whose only top-level node is a slot anchor (the compiler's `dynamicChild`) uses the slot itself as its range.
- `updateSlot`, `ensureSlotMarker`, and the text fast path read a range's nodes once.

**Table mount**, interleaved (main f394480, this change, and 2f14adf in the same rounds; 2 warmups, 7 rounds, order reversed each round; harness and saved builds from the `benos-row-perf` worktree). Each run started at a 1-minute load below 3 with no process above 50% CPU, but load rose during the runs (to 4.6, 8.3, and 9.0 at the end), so single cells are noisy.

Run 1, initial render (ms):

| Cell               | main                | this change         | 2f14adf             | change / main | 2f14adf / main |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------: | -------------: |
| 2 columns × 5,000  | 112.3 [98.3–121.0]  | 111.8 [86.8–134.4]  | 111.6 [105.4–170.0] |         0.996 |          0.994 |
| 2 columns × 10,000 | 223.9 [209.9–286.7] | 219.3 [202.5–311.9] | 222.8 [206.5–254.1] |         0.979 |          0.995 |
| 3 columns × 5,000  | 133.4 [124.8–185.0] | 140.0 [121.6–183.6] | 145.3 [135.0–174.0] |         1.049 |          1.089 |
| 3 columns × 10,000 | 284.3 [267.6–302.7] | 279.8 [250.9–441.6] | 296.3 [274.5–345.1] |         0.984 |          1.042 |
| 5 columns × 5,000  | 214.1 [199.0–238.4] | 217.1 [198.3–232.6] | 229.1 [205.5–245.7] |         1.014 |          1.070 |
| 5 columns × 10,000 | 473.5 [427.7–494.7] | 451.4 [412.8–570.1] | 458.3 [412.8–548.8] |         0.953 |          0.968 |
| 8 columns × 5,000  | 389.0 [321.1–443.3] | 361.6 [318.6–442.3] | 391.7 [330.9–455.3] |         0.930 |          1.007 |
| 8 columns × 10,000 | 762.0 [631.5–848.2] | 776.9 [685.7–885.2] | 803.4 [665.6–979.0] |         1.020 |          1.054 |
| **Geomean**        |                     |                     |                     |     **0.990** |      **1.027** |

Sort geomean: this change / main 0.882, 2f14adf / main 0.909.

Run 2, initial render (ms):

| Cell               | main                | this change         | 2f14adf             | change / main | 2f14adf / main |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------: | -------------: |
| 2 columns × 5,000  | 126.5 [102.4–259.8] | 108.1 [98.4–320.3]  | 132.8 [118.1–168.2] |         0.855 |          1.050 |
| 2 columns × 10,000 | 219.6 [200.4–289.3] | 224.8 [216.6–460.8] | 237.1 [215.3–267.4] |         1.024 |          1.080 |
| 3 columns × 5,000  | 150.2 [133.0–179.9] | 148.3 [134.1–220.1] | 155.9 [141.8–184.2] |         0.987 |          1.038 |
| 3 columns × 10,000 | 286.4 [252.4–331.6] | 285.2 [261.5–328.8] | 302.0 [266.9–340.5] |         0.996 |          1.054 |
| 5 columns × 5,000  | 232.4 [211.9–479.2] | 246.9 [218.3–253.8] | 252.6 [227.2–311.3] |         1.062 |          1.087 |
| 5 columns × 10,000 | 467.7 [413.0–681.0] | 485.5 [456.2–592.0] | 501.2 [437.1–657.2] |         1.038 |          1.072 |
| 8 columns × 5,000  | 375.7 [357.7–479.0] | 402.4 [349.1–533.1] | 399.5 [364.2–423.0] |         1.071 |          1.063 |
| 8 columns × 10,000 | 796.1 [748.0–897.0] | 820.7 [730.7–889.3] | 807.3 [716.2–856.5] |         1.031 |          1.014 |
| **Geomean**        |                     |                     |                     |     **1.006** |      **1.057** |

Sort geomean: this change / main 1.071, 2f14adf / main 1.028.

Run 3, initial render (ms):

| Cell               | main                 | this change          | 2f14adf              | change / main | 2f14adf / main |
| ------------------ | -------------------- | -------------------- | -------------------- | ------------: | -------------: |
| 2 columns × 5,000  | 114.1 [101.2–190.7]  | 112.9 [105.1–171.0]  | 135.5 [113.4–292.4]  |         0.989 |          1.188 |
| 2 columns × 10,000 | 235.1 [221.4–403.4]  | 226.4 [215.1–583.8]  | 275.5 [223.4–529.9]  |         0.963 |          1.172 |
| 3 columns × 5,000  | 151.1 [143.4–216.8]  | 141.3 [132.6–162.6]  | 174.0 [142.2–220.5]  |         0.935 |          1.152 |
| 3 columns × 10,000 | 326.2 [271.5–402.2]  | 319.0 [260.9–330.7]  | 343.6 [263.8–447.3]  |         0.978 |          1.053 |
| 5 columns × 5,000  | 239.6 [206.5–264.8]  | 248.7 [201.4–319.7]  | 251.8 [211.1–350.2]  |         1.038 |          1.051 |
| 5 columns × 10,000 | 472.0 [423.2–504.5]  | 505.8 [445.4–564.4]  | 480.0 [459.7–598.4]  |         1.072 |          1.017 |
| 8 columns × 5,000  | 385.0 [338.4–527.7]  | 357.2 [333.6–392.3]  | 366.8 [358.3–426.2]  |         0.928 |          0.953 |
| 8 columns × 10,000 | 880.1 [760.8–1002.6] | 814.8 [764.2–1188.8] | 833.5 [712.4–1133.7] |         0.926 |          0.947 |
| **Geomean**        |                      |                      |                      |     **0.977** |      **1.063** |

Sort geomean: this change / main 0.998, 2f14adf / main 1.007.

Over the three runs, this change ÷ main is 0.990, 1.006, and 0.977, and 2f14adf ÷ main is 1.027, 1.057, and 1.063 in the same rounds. Sort ÷ main is 0.882, 1.071, and 0.998. The 1.071 comes from the run whose load reached 8.3, where 8 columns × 10,000 rows spread over 565–1,077 ms. Sort uses no new code on its path, and `<For>` no longer copies every row's nodes on each commit.

**Row benchmark**, interleaved against the saved Phase 7 build (73c3a1d, the same DOM as main) with Solid; 2 warmups, 7 rounds, Chromium 153:

| Operation          | Phase 7             | this change         | Solid               | change / Phase 7 |
| ------------------ | ------------------- | ------------------- | ------------------- | ---------------: |
| Create 1,000 rows  | 34.7 [33.5–35.2]    | 33.6 [33.2–35.3]    | 25.7 [25.4–28.3]    |            0.968 |
| Replace 1,000 rows | 33.7 [33.4–34.2]    | 34.0 [33.6–34.7]    | 25.6 [24.8–26.3]    |            1.007 |
| Update every 10th  | 13.3 [13.0–17.4]    | 13.2 [13.0–13.4]    | 14.1 [14.0–15.2]    |            0.991 |
| Select one row     | 1.2 [1.1–13.0]      | 1.1 [1.0–22.2]      | 0.9 [0.8–1.1]       |            0.974 |
| Swap rows          | 3.8 [3.7–4.1]       | 3.7 [3.7–23.2]      | 3.0 [2.9–3.0]       |            0.967 |
| Remove one row     | 4.8 [4.6–5.0]       | 4.6 [4.4–5.5]       | 4.4 [4.3–6.5]       |            0.956 |
| Create 10,000 rows | 311.8 [305.9–321.3] | 309.2 [306.2–326.0] | 241.5 [239.5–244.2] |            0.992 |
| Append 1,000 rows  | 43.6 [42.7–47.6]    | 42.9 [42.4–53.0]    | 36.3 [35.7–37.2]    |            0.986 |
| Clear rows         | 3.9 [3.8–4.1]       | 3.9 [1.9–4.0]       | 2.6 [2.5–2.7]       |            0.991 |
| **Geomean**        |                     |                     |                     |        **0.981** |

**Sizes:** core + DOM 11,854 / 12,032 B: 107 B more than main (11,747), and 130 B more than 2f14adf (11,724), from the two classes and the check that picks a plain list. Core is 4,583 B. `dom/hydrate` (3,962), server (7,696), and async (2,084) are unchanged.

**Checks on this change:** `pnpm build`, `pnpm test` (56 files, 595 tests), `pnpm lint`, `pnpm typecheck:types`, `pnpm size`, the dashboard `build` and `build:ssr`, and `pnpm test:browser` (534 passed). The temporary runners and saved candidate builds were removed from `benos-row-perf` afterwards, and the raw JSON was not committed.

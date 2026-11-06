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

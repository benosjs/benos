# RP-7b — Design

**Status:** RP-7a was approved on 2026-11-04. The user's words: "Approve 7a, start 7b". This step is design only; no framework code changed.

## Delivered

- **[performance.md, Phase 7 design](../architecture/performance.md#phase-7-design--row-creation-at-solids-level)**: what one benchmark row allocates, part by part; seven candidates ranked by retained objects removed, each with its mechanism, what stays the same, its effect on hydration and the server output, its estimated size, its risk, and its tests; four ideas considered and not proposed, with why; the measurement and size plan. The 0.3.0 track's record stays below it as history.

## The design in brief

A compiled benchmark row retains 95.5 JavaScript objects. Read part by part, the largest single cost is **dynamic text**: `{row.id}` and `{row.label}` take 13 objects each (a full slot, a branch owner, ranges, a cleanup) plus a comment marker in the DOM, where Solid creates a text node and one computation.

| Rank | Candidate                                                | Retained objects per row | Size estimate (core / DOM) | Risk                         |
| ---: | -------------------------------------------------------- | -----------------------: | -------------------------- | ---------------------------- |
|    1 | Text bindings in direct templates without a slot         |                about −20 | 0 / +60 to +120 B          | Low to medium                |
|    2 | Bulk DOM removal on clear and full replace               |                        0 | 0 / +20 to +50 B           | Low                          |
|    3 | A `<For>` item's owner doubles as its component's owner  |                 about −4 | +15 to +30 / +40 to +80 B  | Medium (ids must not change) |
|    4 | Keyed item and index state without signal closures       |                 about −5 | +20 to +50 / −10 to +10 B  | Low                          |
|    5 | One teardown per template instance                       |                 about −3 | 0 / −20 to +40 B           | Medium                       |
|    6 | Owned computations without a `Set`                       |                 about −2 | +30 to +60 / 0 B           | Medium                       |
|    7 | No disposer for internal render effects; lazy `readonly` |    −1 (and −4 transient) | +5 to +15 / +5 B           | Low                          |

- **1** keeps a dynamic text as a plain Text node until its value becomes something other than a string or number, then upgrades to today's slot. Hydration takes today's path, so hydrated pages and the server output are untouched.
- **2** removes the list's DOM in one operation, then disposes the rows. A row's cleanup still sees its own nodes detached, as today: a component's range removal is registered after the user's `onCleanup`, so it already runs first.
- **3** keeps every `createUniqueId` string identical by giving the shared owner the id segment the component owner had (`k<id>-0`); the server, which still creates two owners, produces the same ids.
- **4–7** are smaller records: internal state nodes instead of public signals for list items, one cleanup per template instance instead of one per event and range, a linked list instead of a `Set` per owner, and two allocations the renderer never uses.

No public API changes. No documented guarantee changes; candidate 2 records one unspecified detail (a row's cleanup no longer sees later rows of the same list still attached).

## Honest expectation

Together the candidates remove about 35 of 95.5 retained objects per row, down to roughly 60 (Solid: 26.5). That should cut the 10,000-row GC substantially and the 1,000-row binding time by a similar share. A reasonable projection is creation at about **1.15–1.25× Solid** and clear near 1.2–1.4×, not the ≤ 1.05× target. What would remain is the item entry and its accessors, the component descriptor and its props copy, and per-binding effect records Solid also has. Whether to go further is decided after candidates 1–4 are measured.

## Decisions for you

1. **The size cap.** Core + DOM is at 11,515 of 11,520 bytes, so even candidate 1 does not fit. I propose raising the core + DOM cap by **512 B to 12,032 B** for this track, with every step reporting its exact bytes beside its measured gain and keeping only changes that pay for themselves, as the 0.3.0 track did with its increase. Core (4,490 of 4,608) should absorb candidates 3, 4, 6, and 7 without a change. The likely total is +150 to +400 B.
2. **Candidate 3** adds one internal core setter (an owner's kind, mount readiness, and key). It is internal, but it is a core change, so it is raised here.

## Checks run

Prettier on the changed documents. No code changed, so no tests or sizes were rerun.

## Next

On approval (with the cap decision): RP-7c, one candidate at a time in rank order, starting with candidate 1. After each: the full RP-7a measurement set, exact bytes, allocations, and a checkpoint (`rp-7c-1.md`, `rp-7c-2.md`, …). A candidate without a repeatable gain is reverted and recorded.

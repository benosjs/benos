# Q5a — `<Show>` keeps its branch while `when` stays present

**Status:** Ready for review. Stopped at the Q5a checkpoint; Q6 (release preparation) does not start without approval.

## What changed and why

Q5 found that `<Show when={record}>{(current) => …}</Show>` recreated its child every time `when` changed, even from one present value to another. A query cache replaces records in place, so each refetch, write, optimistic update, or rollback recreated the child and lost its local state. You approved option 2: keep the branch while `when` stays present.

This turned out to be a bug against an existing contract, not a new semantic. [components.md](../architecture/components.md) has always said: "While present remains present, the branch owner and DOM remain; a function child receives a read-only accessor for the latest `when` value. A plain child is created once for that branch." The 0.4 implementation re-ran the branch on every change of `when` instead. Q5a makes the code match the contract.

**Implementation** (`mountShow` in [`packages/dom/src/index.ts`](../../packages/dom/src/index.ts)): `when` is read through a `computed`, and presence is a second `computed` boolean. The branch effect reads only presence and the child/fallback props, so a change from one present value to another stops at the presence computed's equality check. A function child receives the `when` computed as its accessor, so its bindings update in place. A plain child whose own getter reads signals still updates as before, because the branch effect still tracks those reads.

The compiler emits `<Show>` through the same `mountShow` path, so compiled and hand-written JSX behave the same.

## Tests

| Test                                                                                                                                                                                                                                     | Before the fix         | After                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| [`dom.test.ts`](../../packages/dom/tests/dom.test.ts) › keeps a Show function child while when stays present: one setup, same `<p>` node, text follows the new value, disposal and a second setup only after present → missing → present | Failed (node replaced) | Pass                                  |
| `dom.test.ts` › creates a plain Show child once while when stays present (`0` → `1` → `2` keeps one child; `null` → `3` recreates)                                                                                                       | Failed (node replaced) | Pass                                  |
| Existing `<Show>` tests, including present ↔ missing reconciliation and staged root remounts                                                                                                                                             | Pass                   | Pass                                  |
| Dashboard rename status and star rollback message, now with the plain `<Show when={project()}>{(current) => …}</Show>` form                                                                                                              | Workaround needed      | Pass in Chromium, Firefox, and WebKit |

Totals: `pnpm test` **402 / 402** (two new DOM tests). `pnpm test:browser`: locally, this machine was under heavy unrelated load (load average 20–28, versus a normal 4-minute run taking 32 minutes). The first full run passed 451 / 471, and its 20 failures were timeouts in UI-registry tests that do not use `<Show>`. All 20 then passed on re-run. A second full run passed 469 / 471, and its two failures (Firefox button tests) passed on re-run. Every dashboard, query, router, and async browser test passed in every run. CI on this commit is the clean full-suite result to check before approving. `pnpm typecheck:types`, `pnpm lint`, `pnpm check:jsx-types`, `pnpm check:public-imports`, `pnpm check:doc-examples`, and the dashboard type check and build pass.

## Size

| Bundle                              |       Q5 |          Q5a |      Cap |
| ----------------------------------- | -------: | -----------: | -------: |
| core + DOM                          | 11,010 B | **11,006 B** | 11,264 B |
| core                                |  4,303 B |      4,303 B |  4,608 B |
| query                               |  3,498 B |      3,498 B |  3,584 B |
| router                              |  6,349 B |      6,349 B |  7,168 B |
| core + DOM + async + router + query | 20,845 B |     20,829 B |        — |

The DOM change measures **−4 B** after compression, which is within gzip noise; it adds no imports, since DOM already used `computed`. Each mounted `<Show>` now allocates two computed nodes; that is a per-instance memory cost, not a byte cost.

## Compatibility

Code that depended on 0.4's recreation (a child that ran setup again whenever `when` changed to another present value) now runs setup once per present period. No code in the repository relied on it: the registry components gate `<Show>` on booleans, and all unit, type, and browser suites pass. The CHANGELOG entry in Q6 will call this out as a fix that restores the documented contract.

## Docs

[components.md](../architecture/components.md) notes that 0.5 restores its contract; the [API reference](../api-reference.md) says the branch is kept and the accessor tracks the latest value; [query-findings.md](../query-findings.md) marks the finding fixed; the dashboard uses the plain form again.

## Next

Q6: release preparation, as planned.

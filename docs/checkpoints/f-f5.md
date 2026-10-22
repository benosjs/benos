# F5 — Flagship integration and validation app

**Status:** Awaiting approval, including two decisions below. F6 has not begun.

## Delivered

- **Approval recorded.** [f-f4](f-f4.md) and [the track plan](../forms-plan.md) record the F4 approval: the registry `aria-invalid` and `aria-describedby` fixes are added to F6.
- **Router navigation blocker** (decision 6) in [`packages/router/src/index.ts`](../../packages/router/src/index.ts): owner-bound `blockNavigation({ when, confirm })`; the reserved `blocked` navigation status; `{ status: 'blocked' }` in `NavigationResult`; a refused pop undone through entry positions that `browserHistory` and `memoryHistory` now record (`index()`, and a silent `go(delta)`); and a `beforeunload` warning that exists only while `when({ reason: 'unload' })` is true. The outlet control is now registered by `RouterOutlet` instead of at module load. Documented in [router.md](../architecture/router.md).
- **Forms leave policy** in [`packages/forms/src/index.ts`](../../packages/forms/src/index.ts): `leave?: 'confirm' | 'discard' | (destination) => boolean | Promise<boolean>` on route-bound forms, default `'confirm'`, holding navigations while the form is dirty and not saving. `@benosjs/router` moves from a dev dependency to a dependency of `@benosjs/forms`.
- **Flagship editor as executable code** in [`examples/flagship`](../../examples/flagship): the Benos slice, the React slice with native inputs, and the React slice with shadcn/ui fields, pinned to React 19.3.0, TanStack Router 1.170.41, TanStack Query 5.104.1, and TanStack Form 1.33.5, and compile-tested. [flagship-integration.md](../architecture/flagship-integration.md) now shows exactly the code between the `// #region flagship` markers, and `pnpm check:flagship` (added to CI) fails if the page and the code drift apart.
- **Dashboard editor** on `formModel` ([`project-detail.tsx`](../../examples/dashboard/src/pages/project-detail.tsx)): name and owner, a Valibot schema, a server issue mapped to the name field, a "changed on the server" notice with `acceptRemote()`, and the leave policy. This closes the "Editable copies are captured once" item in [query-findings.md](../query-findings.md).
- **[forms-findings.md](../forms-findings.md)**, from the perspective of a TanStack Form or React Hook Form user: 13 findings and what the measurements do and do not show.
- **Design notes:** [F5 implementation notes](../architecture/forms.md#f5-implementation-notes) in forms.md.

## Measured comparison

| Formatted nonblank lines | Benos | React native inputs | React shadcn/ui |
| ------------------------ | ----: | ------------------: | --------------: |
| Page/editor block        |    13 |                  81 |             100 |
| Full shown slice         |    49 |                 104 |             123 |

The R1 sketch estimated 13 / 73 / 92 and 46 / 87 / 106. The Benos editor block is unchanged. The Benos setup grew by three lines: the sketch omitted the required `history` option, which the executable version passes through a router factory, and it gained a third file comment. Each React editor grew by eight lines to behave like the Benos editor: `useBlocker` for unsaved changes and a reset after saving, without which leaving after a save asks. The React setup grew from 14 to 23 lines because the sketch's `createFileRoute` does not compile without TanStack Router's generator; the executable version uses code-based routes and creates its router, as the Benos setup always did.

| Gzipped JavaScript of the slice |    Benos | React native inputs | React shadcn/ui |
| ------------------------------- | -------: | ------------------: | --------------: |
| With the Zod schema             | 47,875 B |           147,815 B |       148,268 B |
| With a hand-written schema      | 24,923 B |           124,879 B |       125,328 B |

## Tests

| Flagship acceptance test                                                                                                   | Test                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type errors: wrong route param, unrelated cache key in `affects`, invalid field name, incompatible schema output           | [`examples/flagship/tests/types.ts`](../../examples/flagship/tests/types.ts), in `pnpm check:flagship`                                                                                                                                                     |
| A → B in the same editor changes data only at commit; a background A result cannot alter B                                 | [`flagship.test.tsx`](../../examples/flagship/tests/flagship.test.tsx) › `changes data only at the commit of B, in the same editor` (same `<form>` element before and after), `ignores a background result for A after B committed`                        |
| A same-record refetch updates pristine fields and keeps dirty ones; a save finishing after navigation refreshes its record | `updates pristine fields on a same-record refetch and keeps dirty ones`, `refreshes the saved record when the save finishes after navigating away`                                                                                                         |
| Sync/async validation and issue paths produce linked field errors; root issues appear in the alert                         | `links schema errors to their fields and focuses the first one`, `awaits an async validator and shows root issues in the alert`, `validates the same editor with valibot` / `arktype`; nested and array paths in `packages/forms/tests/validation.test.ts` |
| A failed save stays in form state, does not reach the event reporter, and retry clears it                                  | `keeps a failed save in form state without reporting it, and retry clears it`                                                                                                                                                                              |
| Leaving with unsaved changes                                                                                               | `asks before leaving unsaved changes`; dashboard browser tests below                                                                                                                                                                                       |

**Router blocker** ([`blocker.test.ts`](../../packages/router/tests/blocker.test.ts), 12 tests): refused and confirmed programmatic navigations with no loader started, the `blocked` status during an async confirm, supersession while waiting, a throwing confirm as a refusal, `when` false, link reason, refused pop restoring the memory entry, confirmed pop, owner release, the initial navigation never held, and the unload listener present only while `when` is true. The existing R4 loader tests pass unchanged.

**Leave policy** ([`route.test.ts`](../../packages/forms/tests/route.test.ts) › `leave policy`, 7 tests): the default `window.confirm` message, refusal keeping the edit and loading nothing, confirm discarding the edits in the same editor, no question while pristine, an app dialog resolving later with the `blocked` status meanwhile, `'discard'`, no question while saving or after a save, and release on disposal. The identity tests now pass `leave: 'discard'`, because they navigate away from edits on purpose.

**Dashboard browser tests** ([`dashboard.spec.ts`](../../tests/browser/dashboard.spec.ts), in Chromium, Firefox, and WebKit): saving updates the detail and the cached list and leaves without asking; a short name is rejected before saving, focuses the field, and is described by its error; a server issue maps to its field; a refused link keeps the edit; a refused **Back** restores the history entry and keeps the edit, and a later confirmed Back and Forward show the record without the discarded edit; a confirmed leave discards the edit. The refused-Back test was F1's riskiest router piece; it passes in all three browsers.

Totals: `pnpm test` **485 / 485** in 45 files (12 new router tests, 7 new forms tests, 11 flagship tests). `pnpm test:browser` **498 / 498** in Chromium, Firefox, and WebKit, counting the known registry gap's 3 expected failures (one per browser) as passes. `pnpm typecheck:types`, `pnpm check:flagship`, `pnpm lint`, `pnpm check:jsx-types`, `pnpm check:doc-examples`, `pnpm check:public-imports`, `pnpm check:packed`, `pnpm check:engines`, `pnpm registry:check`, `pnpm bench:guard`, `pnpm build`, and the dashboard and gallery builds pass.

**`pnpm audit:template` fails, unrelated to F5.** `npm audit` now reports a high-severity advisory for Vite 8.3.2, which the `create-benos` template pins; the fix is Vite 8.3.5. No file under `packages/create-benos` changed on this branch, so the same step will fail on `main` and on this pull request's next CI run. See decision 2.

## Size

| Bundle                                      |       F4 |          F5 |     Cap |
| ------------------------------------------- | -------: | ----------: | ------: |
| router                                      |  6,349 B | **6,739 B** | 7,168 B |
| forms                                       |  2,774 B | **2,878 B** | 3,072 B |
| core + DOM + async + router + query + forms | 23,085 B |    23,565 B |       — |

Core, DOM, async, and query are unchanged: **0 B**.

- **Router +390 B** against the 200–300 B estimate; 429 B headroom remains. By removing each part: holding and confirming about 220 B, pop restoration about 97 B, the unload warning about 66 B, and the lazy outlet registration 11 B.
- **Forms +104 B** against the 50–80 B estimate; 194 B headroom remains.

## Decision 1: forms without the router

F1 asked F5 to measure whether a form with no route pays for the router import. It does. An app of core, DOM, and forms (`formModel` and `text`, no router use) measures **12,474 B** with the router external and **13,418 B** with it bundled: **+944 B**. Registering the outlet lazily (done) already cut the router's share from 874 B to about 400 B; the rest is `@benosjs/async`'s module-level `Suspense` registration, kept because the router imports `resource`. Removing that needs a change outside forms and router code, so I stopped to ask. Options:

1. **(Recommended) Mark `@benosjs/async` and `@benosjs/router` `"sideEffects": false`.** Package metadata only, **0 B** in every budget. Bundlers then drop an imported module whose exports end up unused, so the forms-only app measures **12,849 B: +375 B** instead of +944 B. It is safe because each package's only module-level effect (the `Suspense` and outlet registrations) matters only when that component is imported, which keeps the module. I measured it with the metadata changed temporarily and then restored it; nothing is changed on the branch.
2. **Split the route binding into `@benosjs/forms/route`.** Brings the cost near 0 B, but the flagship and every route-bound form import `formModel` from a second entry point, and the plain `formModel` loses its route overload. More public API for about 375 B more.
3. **Accept +944 B** and document it. Most apps that edit server data use the router anyway.

## Decision 2: the template's Vite advisory

The failing `audit:template` step blocks CI on every branch, including this one. Options:

1. **(Recommended)** A separate fix on `main`, like the 0.3.2 and 0.3.3 npm fixes: bump the template's `vite` pin to 8.3.5 and check the starter. Whether it ships as a 0.4.1 starter patch is your call; [q-q6](q-q6.md) asks for a decision on `@benosjs/query` before any 0.4.x release from a `main` that contains it.
2. Fold the bump into this branch and release it with 0.5.0. CI on `main` stays red until then.

## Next

On approval, F6: the forms guide and API reference, the CHANGELOG, the size report, release wiring for the twelfth package, the 0.5.0 registry build with the `field` item and the F4 registry fixes, the decision 1 change if approved, and full verification on three browsers and three operating systems. The 0.5.0 version bump is decided with you.

# Q5 — Validation app

**Status:** Ready for review. Stopped at the Q5 checkpoint; Q6 (release preparation) does not start without approval.

## Delivered

- **Dashboard on the query cache** ([`examples/dashboard`](../../examples/dashboard)):
  - An in-memory project API (`src/data/projects.ts`) with simulated latency, `AbortSignal` support, `status`-carrying HTTP errors, and a request log for tests.
  - `projectsQuery` and `projectQuery` (`src/data/queries.ts`) behind both route loaders, using `query.load`.
  - `renameProject`: `writes` the saved project and `affects` the list.
  - `toggleStar`: optimistic on the detail entry and the cached list; the API refuses paused projects, so the rollback is visible.
  - The detail page renders a rename form and a star toggle from mutation handle state, plus a "Refreshing…" note from `match.data().fetching()`. The list shows starred projects.
- **[`docs/query-findings.md`](../query-findings.md):** ten findings from a TanStack Query user's perspective, each classified.
- **Fixes from validation:** the argument-free query idiom is now `fetch: (_, { signal }) => …`, which infers `A = void` without tripping the repository's `no-invalid-void-type` lint rule. [query.md](../architecture/query.md) and a new type test cover it. The dashboard README describes the query-backed pages.

No package source changed in Q5.

## Tests

New dashboard browser tests in [`tests/browser/dashboard.spec.ts`](../../tests/browser/dashboard.spec.ts), all passing in Chromium, Firefox, and WebKit:

| Test                                                           | What it proves                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| revisits projects from the query cache without new requests    | List → detail → list → detail makes exactly `GET /projects` and `GET /projects/signals`.                                 |
| renaming a project updates the detail view and the cached list | One `PUT`, the heading updates in place, the list shows the new name, and the detail entry is not refetched.             |
| rejects a short name and keeps the saved name                  | A 422 from the API appears at once in the form status (no retries), and the heading keeps the saved name.                |
| stars optimistically and rolls back when the server refuses    | The star flips at once and persists into the list; for a paused project it flips, shows the 409 message, and rolls back. |

The two existing dashboard tests still pass unchanged.

Totals, run one after another: `pnpm test` **400 / 400**, `pnpm test:browser` **471 / 471** (Chromium, Firefox, and WebKit). `pnpm typecheck:types`, the dashboard `tsc` and build, `pnpm lint`, `pnpm check:public-imports`, and `pnpm check:doc-examples` pass. CI passed on the Q4 commit (`198dfaa`).

## Size

Unchanged from Q4: core **4,303 B**, core + DOM **11,010 B**, async **1,644 B**, query **3,498 / 3,584 B**, router **6,349 B**, core + DOM + async + router + query **20,845 B**. **0 B were added to any package in Q5.**

## Decision needed: `<Show>` and in-place data updates

This is the one finding that needs your call before the flagship form work.

`<Show when={value}>{(current) => …}</Show>` calls its function child again whenever `when` changes, even from one truthy object to another. A query cache updates records in place: each refetch, `writes` result, optimistic update, or rollback produces a new object. So an editor inside such a `<Show>` is recreated on every update, and its local state is lost: mutation status, drafts, and focus. In the dashboard, "Saved." and the star error vanished the moment they were set. The flagship's "a refetch must never overwrite dirty fields" rule cannot hold if the form is recreated.

The dashboard works around it by gating on presence (`when={project() !== null}`) and reading the record through an accessor. A framework fix would be a DOM behavior change, which the rules say I must not make without approval. The options:

1. **Leave `<Show>` as is and document the pattern** (gate on a boolean when the child holds state). 0 B. Easy to get wrong.
2. **Keep the function child while `when` stays truthy** and pass an accessor that tracks the latest value (Solid's non-keyed `<Show>` behavior). It changes documented 0.4 semantics for function children and needs a DOM measurement (probably tens of bytes; DOM headroom is 254 B).
3. **Add an opt-in non-keyed mode** to `<Show>`. Keeps 0.4 behavior by default; similar byte cost plus API surface.

My recommendation is option 2. It matches what React developers expect (state survives prop changes), it is what the flagship form needs. Code that relies on recreation would need to say so explicitly, which a migration note must cover. It is a DOM change, so it should be decided now and implemented in its own reviewed step, not inside Q6.

## Other findings

The rest of [query-findings.md](../query-findings.md) is classified as forms-track (`0.5 item`: editable copies), `later` (an `httpError` helper and devtools), or `accepted trade-off` (route data as an entry, mutations never throwing, declarative optimistic updates, cancelled abandoned navigations, explicit non-default caches).

## Next

Q6: the query guide and API reference entries, CHANGELOG, size report, publish wiring (publish list, release workflow, packed-metadata check), full verification on three browsers and three operating systems, and a pull request stopped before merge. The 0.5.0 version bump and release are decided with you, since forms and the flagship integration also target 0.5.0.

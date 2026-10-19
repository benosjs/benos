# R5 — Validation app

**Status:** Complete on `router-async`.

## Delivered

- `examples/dashboard` is a multi-page app on the public router. It has an
  overview, a loader-backed project list, a loader-backed project detail page
  with a typed `projectId` param, records and settings pages, a not-found view,
  and Benos UI components. Every page and layout is a lazy route module.
- The project list and detail routes are both children of the projects layout
  and render through its `<Outlet>`. The detail page no longer wraps itself in
  a copy of the layout frame.
- [router-findings.md](../router-findings.md) records eleven findings from a
  React developer's perspective. Each is classified as a `0.4 fix`, a
  `0.5 item`, or an `accepted trade-off`.

## Nested outlet bug

Placing the detail route under the projects layout failed in the browser with
`insertBefore: The node before which the new node is to be inserted is not a
child of this node`.

The cause was in the DOM renderer, not the router. A component whose root is
control flow (`<Show>`, `<Switch>`, or `<For>`) records the parent it was
mounted into. Inside a staged branch, that parent is the staging fragment.
When the router committed the stage, the nodes moved into the document but
the recorded parent still pointed at the now-empty fragment. The next branch
change inserted into that fragment. In happy-dom the content silently
disappeared; in browsers the insert threw. Single-element branches made it
worse, because they remove their marker and later re-inserted it using the
stale parent.

The fix has two parts:

- DOM inserts and moves now use the anchor node's current parent when one
  exists.
- A slot whose marker was removed re-anchors from its current nodes before
  disposing them.

No public API or timing changed. Regression coverage:

| Test                                                                 | Without fix | With fix |
| -------------------------------------------------------------------- | ----------: | -------: |
| DOM staging: root `<Show>`, `<Switch>`, and `<For>` after commit     |  3 failures |   3 pass |
| Router: nested index to sibling detail with a root `<Show>`, 4 modes |  4 failures |   4 pass |
| Browser dashboard: detail inside projects layout, 3 browsers         |     failure |   6 pass |

## Production sizes

| Surface                         | R4 baseline | R5 measured | Cap      |
| ------------------------------- | ----------: | ----------: | -------- |
| Core                            |     4,303 B |     4,303 B | 4,608 B  |
| Core + DOM                      |    10,977 B |    11,010 B | 11,264 B |
| Async, core/DOM external        |     1,644 B |     1,644 B | 4,096 B  |
| Router, core/DOM/async external |     6,349 B |     6,349 B | 7,168 B  |

The fix adds 33 B to core + DOM, leaving 254 B of headroom. The brief asks
that DOM changes be raised first; this one is internal, required to make
nested layouts work, and recorded here and in
[router.md](../architecture/router.md#internal-coredom-seam).

## Remaining findings

The `0.4 fix` findings that are documentation items are addressed in R6 by
the router guide, the async guide, and a route-state section in the React
migration guide. Loader caching remains a `0.5 item` for the query package.

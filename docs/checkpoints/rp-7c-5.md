# RP-7c-5 — One teardown per template instance

**Status:** RP-7c-4 was approved and kept on 2026-11-05. The user's words: "Keep, start 7c-5". This is candidate 5 of the [design](../architecture/performance.md#5-one-teardown-per-template-instance), DOM only. Committed locally on `perf/row-creation`; nothing is pushed.

## Delivered

The candidate has two halves, which this checkpoint prices separately because they turned out very different in cost.

- **Event consolidation.** A compiled template instance installs its delegated events (`onClick` and the other delegated names, bubbling only) without a removal closure each. It records the events' hub once, then each event's element and name, in one array, and its single cleanup removes those events and then its nodes. Native and capture listeners, and runtime JSX, keep today's per-event cleanup. The removal logic moved into one shared `removeDelegated`. Called with a handler, it removes that handler, as before. Called without one, it removes everything the element has for that event, which is right for a template element, since only its own instance installs delegated handlers on it.
- **Component skip.** When a plain component's output is a direct template mounted on the component's own owner, `mountComponent` no longer registers a second removal of the same range. It recognizes the case from the output descriptor it already holds. A template mounted under another owner (a context provider's, for example) keeps the component's removal.
- **Two changes from the design.**
  - **Targets are recorded at setup, not found again by path at teardown.** Since RP-7c-1, a text binding inserts a Text node before its placeholder (and an upgraded slot inserts content), so a path resolved at teardown can point at the wrong node.
  - **The template's range carries no flag.** I first marked template ranges with a property for the component skip. Every template instance then paid for it, including table cells, which aren't component outputs. The descriptor check replaced it.
- **Cleanup order.** Owner disposal runs child owners first, and then the owner's own cleanups in reverse. So all user code in slots and child components has run before either removal, and the cleanups between the template's removal and the component body's own `onCleanup`s are all internal. Skipping the component's removal therefore changes no order that user code can observe. Component cleanups still see their nodes detached.
- **A bug in my first version, caught by the new test.** I wrote `(events ??= [installDelegated(…)])`, which only evaluates its right side the first time, so only an instance's first delegated event was installed. The full existing suite passed with that bug: no test had a compiled template with two delegated events. The benchmark row has two. The allocation numbers below are from the fixed code.
- **Checked, and safe:** the question this step raised about RP-7c-1. A text binding's node is inserted when its render effect first runs. That is after all of an instance's bindings are set up, both for a page's first render and for rows a list creates later. So an event on an element after a dynamic text still finds its element.
- **Test (one new).** A compiled component in `none` and `safe` modes, in the document and inside a shadow root, must produce the identical event log. The log covers:
  - two delegated handlers on one element (`onClick` and `on:click`), in order;
  - a capture listener and a native `mouseenter` alongside them;
  - bubbling to ancestors, and `stopPropagation` stopping it;
  - a handler replaced through a signal;
  - an element removed by a `<Show>` and then re-attached, which no longer runs any handler;
  - the root's `click` listener being removed after the last handler, in the document and in the shadow root.

  It passes against the 7c-4 code too, so dispatch behavior is unchanged.

## Size

| Bundle                 | 7c-4   | 7c-5   | Cap    |
| ---------------------- | ------ | ------ | ------ |
| `@benosjs/core`        | 4,587  | 4,587  | 4,608  |
| `@benosjs/core` + DOM  | 11,733 | 11,848 | 12,032 |
| `@benosjs/dom/hydrate` | 3,962  | 3,962  | 4,096  |
| `@benosjs/server`      | 7,688  | 7,688  | 8,448  |

+115 B on core + DOM; the design estimated −20 to +40. Built separately: event consolidation alone 11,828 (+95), component skip alone 11,751 (+18).

## Measurements

Same scripts and protocol as [RP-7a](./rp-7a.md); median [min–max] ms. The machine had restarted shortly before. The full run ran at load averages of 3–4. The first interleaved A/B ran while two macOS background jobs (the Neural Engine compiler and an XProtect scan) each took about 100% CPU: Solid measured 31 ms to select a row. That run is kept as `rp-7c-5-ab-loaded-2026-11-05.json` and not used. The A/B below was re-run after the load fell below 3 with nothing else above half a core. Raw data in `benchmarks/js-framework-benchmark/results/rp-7c-5-*-2026-11-05.json`.

### Retained allocations per row

| Build                           | Closures | Arrays | Plain objects | Retained JS objects | Retained JS bytes |
| ------------------------------- | -------: | -----: | ------------: | ------------------: | ----------------: |
| Benos row, 7c-4                 |     19.0 |    8.0 |          40.0 |                68.5 |             2,499 |
| Benos row, component skip only  |     18.0 |    8.0 |          40.0 |                67.5 |             2,477 |
| Benos row, 7c-5 (both)          |     16.0 |   10.0 |          38.0 |                65.5 |             2,447 |
| Solid row                       |      8.0 |    6.0 |          11.0 |                26.5 |               913 |
| Registry table row, 7c-4 → 7c-5 |     28.0 |   28.0 |          50.2 |       109.1 → 109.4 |     3,587 → 3,613 |

The component skip removes one closure (−22 B per row). The event consolidation removes two removal closures and their two scope objects and adds the instance's event array (two array objects with its growth), for a net −2 objects and −30 B. The table rows have no delegated events and no component, so this step does not reach them. Their +0.3 objects appear identically in the component-only build, which does not touch template closures, so I read them as measurement variation.

Disposal calls per row on clear and replace: 4 → 3 (clear 1k 4,002 → 3,002), from the component skip.

### Interleaved A/B: 7c-4 against 7c-5 (quiet machine)

| Operation          | Benos 7c-4          | Benos 7c-5          | Solid               | 7c-4 / Solid | 7c-5 / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | -----------: | -----------: |
| Create 1,000 rows  | 32.0 [31.8–33.8]    | 31.7 [31.5–33.3]    | 24.3 [24.1–26.2]    |        1.32× |        1.31× |
| Replace 1,000 rows | 32.2 [31.8–33.0]    | 32.2 [31.8–32.4]    | 25.1 [24.8–26.3]    |        1.29× |        1.29× |
| Update every 10th  | 12.8 [12.4–22.9]    | 12.7 [12.5–21.1]    | 14.0 [13.5–14.6]    |        0.91× |        0.91× |
| Select one row     | 1.1 [1.0–1.2]       | 1.1 [1.0–21.9]      | 0.9 [0.8–0.9]       |        1.31× |        1.28× |
| Swap rows          | 3.7 [3.6–3.8]       | 3.7 [3.6–3.9]       | 2.9 [2.8–2.9]       |        1.29× |        1.28× |
| Remove one row     | 4.6 [4.5–21.2]      | 4.7 [4.5–21.9]      | 4.3 [4.2–4.4]       |        1.07× |        1.09× |
| Create 10,000 rows | 300.3 [297.6–304.2] | 298.3 [296.4–311.0] | 233.9 [232.0–240.4] |        1.28× |        1.28× |
| Append 1,000 rows  | 41.5 [41.1–41.9]    | 41.4 [40.9–41.6]    | 34.9 [34.6–36.7]    |        1.19× |        1.19× |
| Clear rows         | 3.8 [3.7–4.0]       | 3.8 [3.7–3.9]       | 2.5 [2.5–2.7]       |        1.51× |        1.51× |

Creating 1,000 rows shifted by about 0.3 ms, about 1%, and consistently: 9 of 7c-5's 11 samples are 31.5–31.8 ms, while most of 7c-4's are 31.8–32.0. Create 10,000 moved about 0.7%. Everything else is unchanged. Clear did not move, although disposal makes one call fewer per row.

### The nine operations (full run, 7c-5)

| Operation          | Benos 7c-5          | Solid               | Svelte              | Vue                 | React               | 7c-5 / Solid |
| ------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | -----------: |
| Create 1,000 rows  | 34.3 [33.5–39.8]    | 26.2 [25.2–28.0]    | 28.6 [27.9–30.3]    | 30.0 [29.7–30.9]    | 30.5 [30.1–30.8]    |        1.31× |
| Replace 1,000 rows | 33.4 [32.9–39.0]    | 25.7 [25.1–26.4]    | 27.9 [27.7–29.5]    | 29.5 [27.2–30.2]    | 31.9 [31.1–36.4]    |        1.30× |
| Update every 10th  | 12.9 [12.3–13.1]    | 13.8 [13.4–14.0]    | 14.7 [13.0–23.0]    | 24.2 [18.9–24.8]    | 16.4 [16.1–18.1]    |        0.93× |
| Select one row     | 1.0 [0.9–1.2]       | 0.8 [0.8–0.9]       | 1.3 [1.2–1.6]       | 19.6 [18.5–25.0]    | 7.1 [6.0–7.9]       |        1.21× |
| Swap rows          | 3.6 [3.5–3.6]       | 2.8 [2.7–2.8]       | 4.3 [4.2–22.6]      | 19.6 [18.5–24.3]    | 26.3 [26.1–29.2]    |        1.30× |
| Remove one row     | 4.5 [4.4–4.5]       | 4.2 [4.2–4.5]       | 5.8 [5.7–22.6]      | 21.2 [20.5–25.5]    | 9.9 [9.5–11.5]      |        1.07× |
| Create 10,000 rows | 300.8 [298.6–315.7] | 235.3 [232.8–238.7] | 244.7 [243.0–250.5] | 261.2 [259.9–273.8] | 488.8 [481.6–545.3] |        1.28× |
| Append 1,000 rows  | 41.4 [41.0–41.9]    | 35.1 [34.4–37.6]    | 36.5 [36.1–45.2]    | 40.5 [38.5–46.5]    | 43.1 [39.6–44.5]    |        1.18× |
| Clear rows         | 3.7 [3.7–3.8]       | 2.5 [2.5–2.6]       | 3.3 [3.2–3.4]       | 3.4 [3.4–6.4]       | 4.4 [4.4–4.5]       |        1.47× |

### Sortable table mount (interleaved A/B)

No change, as expected: the geometric mean of 7c-5 / 7c-4 over the eight cells is 1.019 for the registry table and 0.977 for the handwritten one, and 7c-5 is faster in 9 of 16. Data in `rp-7c-5-table-ab-2026-11-05.json`.

### Garbage collection and CPU attribution

The 7c-4 baselines for these were measured this morning on the loaded machine (load average about 10), and 7c-5's at about 4. So their differences (for example, collection on create 10k 100.3 → 89.3 ms) mix the change with the load, and I don't attribute them. RP-7d re-measures both on one machine state.

## Assessment and recommendation

Both halves do what the design said: fewer records per row (−3 objects) and one cleanup call fewer per row. Neither moves the measured times beyond about 1%. That puts them on a very different footing:

- **Component skip: +18 B** for −1 object and −1 disposal call per row, wherever a component returns a compiled template. **I recommend keeping it.**
- **Event consolidation: +97 B** for −2 objects (−30 B) per row in rows with two delegated events, with no measurable time effect. Its saving grows with events per template, but at the benchmark's two it does not pay for its bytes. **I recommend dropping it**, keeping the shared removal refactor only if it is byte-neutral. The new event test stays either way: it covers delegated events in compiled templates, which nothing tested before.

Both are in this commit, so whichever you choose, the other half stays in history.

## Found, not changed

Still open: the `computed` read on a keyed row (RP-7c-4), the `onMount` with an array containing a `<Portal>` (RP-7c-2), and the object-keyed hydration ids (RP-7c-3).

## Checks run

| Check                                                                       | Result                             |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `pnpm test`                                                                 | 56 files, 587 tests passed (1 new) |
| `pnpm test:browser` (Chromium, Firefox, WebKit)                             | 534 passed                         |
| `pnpm lint`, `typecheck:types`, `check:doc-examples` (54 files, both modes) | Passed                             |
| `pnpm size`                                                                 | All within caps (table above)      |

The existing tests passed unchanged; the only test edit is the addition.

## Decisions for you

1. **Candidate 5:** keep only the component skip (my recommendation), keep both halves, or revert both.
2. **Still open from RP-7c-4:** core's cap for candidates 6 and 7 (core has 21 B left), and whether to fix the `computed` finding.

## Next

On approval: apply the decision on candidate 5, then either RP-7c-6, if core's cap allows it, or a stop to re-plan. After five candidates, creating rows is about 1.28–1.32× Solid on a quiet machine, against the RP-7b projection of 1.15–1.25× for all seven.

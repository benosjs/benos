# U4 gallery review follow-up

**Date:** 2026-10-05

**Status:** Changes implemented; local verification complete. CI confirmation is
pending the requested push to `ui-system`.

## Review changes

- Dialog, Popover, and Dropdown Menu now render a Button-styled trigger by
  default, using the secondary medium variant. `triggerVariant`, `triggerSize`,
  and `triggerClass` allow small style changes. A trigger render callback
  receives the machine's ARIA properties, handlers, and ref so callers can
  render their own Button. The API reference includes that example.
- Tooltip now uses the outline small Button style and a visible information
  mark. Its trigger remains reachable by keyboard.
- Table captions, headers, text cells, empty messages, overlay triggers,
  titles, descriptions, bodies, menu items, toast copy, and close labels use
  automatic text direction. Numeric table cells inherit table direction to
  preserve logical end alignment. Browser tests cover English in an RTL table,
  Arabic in an LTR table, and direction handling on all five overlay
  components.
- The RTL gallery localizes its table note, large-data toggle, row count, and
  overlay note. Browser assertions check direction and visible Arabic labels.
- Visual coverage compares the default overlay trigger styles against the
  gallery's Button component in light, dark, and RTL panels. Separate tests
  cover the tooltip affordance and custom Button triggers.

## Table initial-render profile

All variants are Vite production builds measured in Chromium in alternating
order. Data is prepared before timing and the timer ends after two animation
frames. The values below pool three independent interleaved runs, each with a
warmup and seven measured rounds (21 samples total); brackets show min–max.
This is a render/paint opportunity proxy rather than a traced Paint timestamp.

| Variant                    |    Initial, 5,000 rows |   Initial, 10,000 rows |     Sort, 5,000 rows |      Sort, 10,000 rows |
| -------------------------- | ---------------------: | ---------------------: | -------------------: | ---------------------: |
| Direct DOM baseline        |   78.7 [69.2–183.7] ms | 146.7 [135.0–169.2] ms |                    — |                      — |
| Handwritten Benos baseline | 151.8 [135.6–174.8] ms | 292.9 [276.0–365.6] ms |                    — |                      — |
| Registry SortableTable     | 150.7 [134.9–236.1] ms | 308.3 [272.9–485.5] ms | 88.5 [78.7–140.5] ms | 178.2 [164.7–306.4] ms |
| Solid table                |   76.4 [63.6–108.6] ms | 144.6 [130.1–278.8] ms | 84.2 [73.3–152.1] ms | 212.2 [166.3–465.1] ms |

The registry table adds no measurable mount cost at 5,000 rows compared with
handwritten Benos: 150.7 vs 151.8 ms. At 10,000 rows its median is 5.3% higher:
308.3 vs 292.9 ms, with overlapping and noisy spreads. The framework baseline
is about 1.9–2.0× the direct DOM timing; the registry table is about 2× Solid
on initial mount. Sort spreads overlap.

The initial profile before optimization showed the registry component 29.4%
slower than the handwritten baseline at 5,000 rows (202.4 vs 156.4 ms) and
23.7% slower at 10,000 rows (371.7 vs 300.5 ms). Each row reconciled the same
static column list through a nested keyed `<For>`. The component now maps the
column descriptors once per row and keeps keyed `<For>` for stable row
identity. This removed the observed registry-only increment. Columns are a
static descriptor list; the old nested `<For>` implementation did not pass the
temporary test that replaced columns after mount either.

The benchmark guard does not regress. Current raw table results are in
[`js-framework-benchmark/results/u4-batch4-profile.json`](../../benchmarks/js-framework-benchmark/results/u4-batch4-profile.json);
the three captured runs are alongside it. Bundle sizes and kernel guard
medians are in [`benchmarks/README.md`](../../benchmarks/README.md).

## Verification

- `pnpm build`: passed with Node 22.18.0.
- `pnpm test`: 206 tests passed across 19 files.
- `pnpm test:browser`: 402 tests passed across Chromium, Firefox, and WebKit.
- The focused overlay and table browser suite also passed all 156 cases after
  a clean Vite start following `registry:build`.
- `pnpm typecheck:types`, `pnpm lint`, `pnpm check:doc-examples`,
  `pnpm registry:check`, `pnpm check:public-imports`, `pnpm check:packed`,
  `pnpm check:jsx-types`, `pnpm check:engines`, `pnpm audit:template`, and
  `pnpm gallery:build`: passed.
- `pnpm bench:guard`: all five production workloads remained within 2× Preact.
- Core is 4,051 / 4,096 gzip bytes; core + DOM is 10,200 / 10,240 gzip bytes.
  No core or DOM runtime source changed.

## Deviations

- The table's column descriptor array is treated as static after component
  creation. The public design requires keyed row preservation; it does not
  document reactive replacement of the column definitions. Removing the inner
  reconciler did not remove behavior supported by the previous implementation.
- An initial focused run overlapped an in-place source edit and used a cached
  Vite transform. After rebuilding the registry and restarting Vite, the
  focused suite passed all 156 cases and the complete browser suite passed all
  402 cases.
- No core or DOM production bytes changed. The fresh sizes remain below both
  existing limits.

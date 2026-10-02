# js-framework-benchmark integration

This directory adapts the official [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) CPU workload IDs `01` through `09` for Benos and four reference frameworks. The operation definitions and row counts follow the upstream benchmark: create 1,000 rows, replace 1,000, update every tenth row, select, swap, remove, create 10,000, append 1,000, and clear.

The local runner builds every app with Vite in production mode, starts one server per adapter, and interleaves the frameworks round by round for each operation. It measures the same native click-to-paint boundary in Chromium for every adapter. It records a trace and reports the first post-click `Paint`/`PrePaint`, with explicit `Commit`/`Layout` fallback when those markers are absent. Each result includes the median and its observed minimum/maximum spread. It uses two warmups and three measured samples per operation by default (`JFB_WARMUPS` and `JFB_ROUNDS` can override these). Results are local engineering measurements, not official js-framework-benchmark leaderboard results. The official driver uses more iterations, tracing cases, memory cases, and startup/Lighthouse cases; this adapter intentionally keeps the first integration reproducible in the repository. The Phase 5b checkpoint uses two warmups and seven measured samples, with deterministic labels and keys for cross-framework comparability.

Run from the repository root after building the Benos production packages:

```sh
pnpm bench:jfb
```

For an isolated install and direct run:

```sh
pnpm --dir benchmarks/js-framework-benchmark install --frozen-lockfile --ignore-workspace
pnpm --dir benchmarks/js-framework-benchmark bench
```

The benchmark uses pinned framework versions in `package.json` and writes the raw report to `results/latest.json`. It does not modify the root package dependencies.

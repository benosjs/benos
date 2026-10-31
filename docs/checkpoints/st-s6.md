# ST-S6 — Release preparation for 0.7.0

**Status:** Approved on 2026-10-31. The user's words: "Approve S6, bump to 0.7.0". All thirteen packages are bumped to 0.7.0 and the pull request is open; nothing is merged, tagged, or published. S5 was approved on 2026-10-31. The user's words: "Approve S5, start S6". No pull request has been opened and no version has been bumped.

## Delivered

- **[Server rendering guide](../ssr.md)**: a _Stream_ section with a complete `Request → Response` handler (type-checked by `check:doc-examples`), what the promise resolving at shell time means for status codes, `nonce`, `done`, errors after the shell, pages without a waiting boundary, boundaries without a codec, the byte-for-byte guarantee, and the `async` entry for progressive hydration; the rules section no longer says there is no streaming.
- **[API reference](../api-reference.md)**: `renderToStream` and `StreamOptions`, and what `hydrate` does on a streamed page.
- **[CHANGELOG.md](../../CHANGELOG.md)**: a `[0.7.0] — Unreleased` section (Added, Changed, Sizes) above `0.6.0`.
- **Roadmap, architecture index, release checklist**: "Prepared for 0.7.0", the SSR entry covers streaming, eager server serialization listed as upcoming, and the note that 0.7.0 is the first release expected to run end to end through the automated workflow now that every package has trusted publishing.
- Nothing in the release wiring changes: the thirteen packages, their order, the checks, and the workflow are those of 0.6.0.

## The version bump (your decision)

I propose **0.7.0 for all thirteen packages**: `renderToStream` is a new public API in `@benosjs/server`, `hydrate` gains behavior, and the marker grammar gains an extension, which is a minor bump under the project's convention. It is not applied: every manifest is still `0.6.0`. The registry must be rebuilt as release `0.7.0` with ranges raised to `^0.7.0`, as in 0.6.0 (the UI CLI matrix refuses to add components into a project whose `@benosjs/dom` range is above what the registry declares); no component changes. On approval the order is: bump, raise the starter template's ranges and the registry, open the pull request against `main`, merge after CI, tag `v0.7.0`, approve the `publish` job, date the section.

## Verification on this machine

| Check                                                                                                                                                                                                                             | Result                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm test`                                                                                                                                                                                                                       | 56 files, 573 tests passed (see note)                   |
| `pnpm test:browser` (Chromium, Firefox, WebKit, including the streaming, progressive hydration, and streamed dashboard specs)                                                                                                     | 534 passed, none failed                                 |
| `typecheck:types`, `check:jsx-types`, `check:public-imports`, `check:doc-examples` (54 files), `check:packed` (13 packages), `check:engines`, `check:flagship`, `registry:check`, `audit:template`, `lint`, `size`, `bench:guard` | Passed                                                  |
| `test-server-runtime.mjs` (production build, streaming fixture included) and `test-dashboard-ssr.mjs` (streamed detail page) on Node 26.10                                                                                        | Passed; Bun runs in CI (not installed here)             |
| `bench:ssr` 1,000 rows; `bench:stream` detail page                                                                                                                                                                                | 4.6–8.6 ms (17–23× Solid); shell 104 ms, settled 698 ms |

Note: in the single run where `pnpm test` ran alongside the browser suite, four `benos` CLI tests hit their 5 s timeouts; they pass when the machine is not loaded and are unrelated to this track (they exercise the packed CLI). The row records the clean run.

## Sizes shipped (minified + gzip)

| Bundle                  | 0.6.0  | 0.7.0  | Cap                |
| ----------------------- | ------ | ------ | ------------------ |
| `@benosjs/core`         | 4,490  | 4,490  | 4,608              |
| `@benosjs/core` + `dom` | 11,515 | 11,515 | 11,520             |
| `@benosjs/async`        | 1,897  | 2,084  | 4,096              |
| `@benosjs/query`        | 3,739  | 3,744  | 3,840              |
| `@benosjs/router`       | 6,897  | 6,899  | 7,168              |
| `@benosjs/forms`        | 2,888  | 2,888  | 3,072              |
| `@benosjs/dom/hydrate`  | 3,158  | 3,962  | 4,096 (from 3,328) |
| `@benosjs/server`       | 5,898  | 7,668  | 8,448 (from 6,144) |

Client-only apps pay nothing: core, core + DOM, and forms did not move. The two new caps were approved at S1; both bundles landed under them.

## Open after this track

- Eager server serialization (settled subtrees written as strings), the remaining server-speed item: 17–23× Solid today.
- A shorter dynamic-text marker, which would be protocol version 2.
- Script-less patch delivery, event replay before hydration, `<head>` streaming, a `create-benos --ssr` template, blocks, devtools.

## Next

On your decision: apply the bump, rebuild the registry, open the pull request, and stop before merging.

# Circular-prone nested router fixture

This R3 fixture exercises the approved route-reference/presentation split. It has nested layouts that link to sibling and child pages, and a detail page that reads its own route match. The component modules import `refs.ts`; the manifest dynamically imports those components. No component imports `manifest.tsx` or the router instance.

`import-graph.test.mjs` enforces the static import boundary. `packages/router/tests/circular.test.ts` typechecks the fixture, confirms manifest creation does not evaluate page/layout modules, mounts the matched project route to trigger only its lazy branch, and updates `projectRoute.match()` across a detail-to-detail navigation. `types.test.ts` covers inferred params and rejects a wrong parameter name; router tests reject an unregistered route reference at runtime.

Loader/data behavior belongs to R4. The router browser fixture also verifies layout and page mount counts across a same-route parameter change.

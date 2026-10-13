# Circular-prone nested router fixture

This fixture reserves an R3 type/runtime test for the approved route-reference/presentation split. It intentionally has nested layouts that link to sibling and child pages, and a detail page that reads its own route match. The component modules import `refs.ts`; the manifest dynamically imports those components. No component imports `manifest.tsx` or the router instance.

`import-graph.test.mjs` runs now with Node's test runner to enforce the static import boundary. At R3, include this fixture in a TypeScript build and assert: each lazy module is evaluated only after matching; both layout owners persist across detail-to-detail navigation; `projectRoute.match()` stays reactive without remounting; links and navigation infer `projectId`; a wrong param name fails type checking; and an unregistered route reference fails at runtime.

The fixture uses the proposed `@benosjs/router` API and is intentionally outside the current project references until that package is implemented.

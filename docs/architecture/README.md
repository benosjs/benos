# Architecture

Benos targets Node.js `^22.18.0 || ^24.11.0 || >=26.0.0` for development
tooling. This is the intersection of the supported dependency engine ranges;
Node 24.8 does not meet the 24.x floor. Its TypeScript output target is ES2022.

Phase 1 kernel designs (required for v0.1):

- [Reactivity](./reactivity.md): signals, computed values, tracking, and graph lifetime.
- [Scheduling](./scheduling.md): write, batch, render-effect, and user-effect order.
- [Ownership](./ownership.md): roots, disposal, context, and error routing.

Phase 2 designs (designed now, built later):

- [Async](./async.md): resources, Suspense, transitions, cancellation, and race handling.
- [SSR](./ssr.md): server rendering, streaming, serialization, and hydration.
- [Risks](./risks.md): the ten principal technical and adoption risks with mitigation gates.

The Phase 3 kernel and Phase 4 renderer/compiler are implemented and guarded by production-build comparisons in CI. Phase 4 design is documented in [components.md](./components.md), [renderer.md](./renderer.md), and [compiler.md](./compiler.md). Phase 5a development diagnostics and the `@benosjs/eslint-plugin` props rule are implemented; the Phase 2 features remain outside v0.1.

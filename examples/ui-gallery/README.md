# Benos UI gallery

The production gallery previews all 19 U4 source components in light, dark,
and right-to-left layouts. Each component links to its API and accessibility
guide. It imports the same TSX and CSS files that the registry embeds.

## Run locally

From the repository root, run:

    pnpm install --frozen-lockfile
    pnpm build
    pnpm --filter @benosjs/ui-gallery dev

Open the local URL printed by Vite, usually http://localhost:5173/. Use Tab
and Shift+Tab to inspect focus rings, and hover button variants to inspect
their interactive states.

After `benos add`, CSS files are copied to `src/styles/`. Import component
styles in the application's stylesheet. The shared token stylesheet is
installed by `benos init`.

For a production deploy preview, run `pnpm --filter @benosjs/ui-gallery build`
from the repository root. The deployment settings and Vercel steps are in
[`docs/ui-gallery-deployment.md`](../../docs/ui-gallery-deployment.md). The
gallery is not deployed by this repository's build or CI workflow.

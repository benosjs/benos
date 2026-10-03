# Benos UI gallery

The gallery previews the U4 batch 1 source components in light, dark, and
right-to-left layouts. It imports the same TSX and CSS files that the registry
embeds.

## Run locally

From the repository root, run:

    pnpm install --frozen-lockfile
    pnpm build
    pnpm --filter @benosjs/ui-gallery dev

Open the local URL printed by Vite, usually http://localhost:5173/. Use Tab
and Shift+Tab to inspect focus rings, and hover button variants to inspect
their interactive states.

After benos add, CSS files are copied to src/styles/. Import the component
styles in the application's stylesheet. The shared token stylesheet is
installed by benos init.

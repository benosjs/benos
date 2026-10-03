import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import benos from '@benosjs/vite'

export default defineConfig({
  plugins: [benos()],
  optimizeDeps: {
    noDiscovery: true,
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
      ...[
        'accordion',
        'checkbox',
        'radio-group',
        'select',
        'switch',
        'tabs',
      ].map((name) => ({
        find: `@benosjs/primitives/${name}`,
        replacement: fileURLToPath(
          new URL(
            `../../packages/primitives/dist/js/${name}.development.js`,
            import.meta.url,
          ),
        ),
      })),
      ...[
        'accordion',
        'checkbox',
        'radio-group',
        'select',
        'switch',
        'tabs',
      ].map((name) => ({
        find: `@zag-js/${name}`,
        replacement: fileURLToPath(
          new URL(
            `../../packages/primitives/node_modules/@zag-js/${name}/dist/index.mjs`,
            import.meta.url,
          ),
        ),
      })),
    ],
  },
})

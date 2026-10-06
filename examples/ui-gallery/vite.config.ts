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
      {
        find: '@benosjs/core/internal',
        replacement: fileURLToPath(
          new URL(
            '../../packages/core/dist/js/internal.development.js',
            import.meta.url,
          ),
        ),
      },
      {
        find: '@benosjs/core',
        replacement: fileURLToPath(
          new URL(
            '../../packages/core/dist/js/index.development.js',
            import.meta.url,
          ),
        ),
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
      ...['dialog', 'menu', 'popover', 'toast', 'tooltip'].map((name) => ({
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
      ...['dialog', 'menu', 'popover', 'toast', 'tooltip'].map((name) => ({
        find: `@zag-js/${name}`,
        replacement: fileURLToPath(
          new URL(
            `../../packages/primitives/node_modules/@zag-js/${name}/dist/index.mjs`,
            import.meta.url,
          ),
        ),
      })),
      {
        find: '@zag-js/vanilla',
        replacement: fileURLToPath(
          new URL(
            '../../packages/primitives/node_modules/@zag-js/vanilla/dist/index.mjs',
            import.meta.url,
          ),
        ),
      },
    ],
  },
})

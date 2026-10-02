import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import benos from '../../packages/vite/src/index.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const alias = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  root,
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  esbuild: {
    jsx: 'preserve',
  },
  optimizeDeps: {
    noDiscovery: true,
  },
  plugins: [benos({ optimization: 'none' })],
  resolve: {
    alias: [
      {
        find: '@benosjs/core/internal',
        replacement: alias(
          '../../packages/core/dist/js/internal.development.js',
        ),
      },
      {
        find: '@benosjs/core',
        replacement: alias('../../packages/core/dist/js/index.development.js'),
      },
      {
        find: '@benosjs/dom/internal',
        replacement: alias(
          '../../packages/dom/dist/js/internal.development.js',
        ),
      },
      {
        find: '@benosjs/dom',
        replacement: alias('../../packages/dom/dist/js/index.development.js'),
      },
      {
        find: '@benosjs/compiler',
        replacement: alias(
          '../../packages/compiler/dist/js/index.development.js',
        ),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})

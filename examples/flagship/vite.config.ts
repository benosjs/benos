import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import benos from '@benosjs/vite'

const root = fileURLToPath(new URL('.', import.meta.url))
// benos (default), react (native inputs), or react-shadcn (shadcn/ui fields).
const framework = process.env.FLAGSHIP_FRAMEWORK ?? 'benos'
const isReact = framework !== 'benos'
// FLAGSHIP_SCHEMA=plain swaps Zod for the hand-written schema to measure each stack alone.
const plain = process.env.FLAGSHIP_SCHEMA === 'plain'
const alias = [
  ...(framework === 'react-shadcn'
    ? [{ find: './native.js', replacement: `${root}src/react/shadcn.tsx` }]
    : []),
  ...(plain
    ? [
        {
          find: /^.*\/schema\.js$/,
          replacement: `${root}src/shared/plain-schema.ts`,
        },
      ]
    : []),
]

export default defineConfig({
  root,
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      process.env.NODE_ENV ?? 'production',
    ),
  },
  esbuild: isReact ? {} : { jsx: 'preserve' },
  plugins: isReact ? [react()] : [benos({ optimization: 'safe' })],
  resolve: {
    alias,
    dedupe: [
      '@benosjs/core',
      '@benosjs/dom',
      '@benosjs/router',
      '@benosjs/async',
      '@benosjs/query',
      '@benosjs/forms',
    ],
  },
  build: {
    rollupOptions: {
      input: `${root}${isReact ? 'react' : 'index'}.html`,
    },
    outDir: `${root}dist/${framework}${plain ? '-plain' : ''}`,
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
  },
})

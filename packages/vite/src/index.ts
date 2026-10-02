import {
  transformJsx,
  type Optimization,
  type TransformResult,
} from '@benosjs/compiler'
import type { Plugin, ResolvedConfig } from 'vite'

export interface BenosViteOptions {
  include?: RegExp | readonly RegExp[]
  exclude?: RegExp | readonly RegExp[]
  optimization?: Optimization
}

function matches(
  value: string,
  pattern: RegExp | readonly RegExp[] | undefined,
): boolean {
  if (!pattern) return false
  return pattern instanceof RegExp
    ? pattern.test(value)
    : pattern.some((item) => item.test(value))
}

function isSourceModule(id: string): boolean {
  const clean = id.split('?', 1)[0] ?? id
  return /\.(?:tsx|jsx)$/.test(clean)
}

export default function benos(options: BenosViteOptions = {}): Plugin {
  let config: ResolvedConfig | undefined
  return {
    name: '@benosjs/vite',
    enforce: 'pre',
    configResolved(next) {
      config = next
    },
    transform(code, id) {
      const clean = id.split('?', 1)[0] ?? id
      if (!isSourceModule(clean)) return null
      if (options.include && !matches(clean, options.include)) return null
      if (matches(clean, options.exclude)) return null
      let result: TransformResult
      try {
        result = transformJsx(code, {
          filename: clean,
          development: config?.command === 'serve',
          optimization:
            options.optimization ??
            (config?.command === 'build' ? 'safe' : 'none'),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Benos JSX transform failed for ${clean}: ${message}`)
      }
      for (const diagnostic of result.diagnostics)
        this.warn({
          message: diagnostic.message,
          id: clean,
          loc: {
            line: diagnostic.location.line,
            column: diagnostic.location.column,
          },
        })
      return { code: result.code, map: result.map }
    },
  }
}

export { benos }

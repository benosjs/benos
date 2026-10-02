const required = (): never => {
  throw new Error('Benos JSX transform required')
}

export { Fragment } from './index.js'
export function jsxDEV(..._args: unknown[]): never {
  void _args
  return required()
}
export type { JSX } from './index.js'

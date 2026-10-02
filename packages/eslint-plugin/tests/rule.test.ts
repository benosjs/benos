import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'
import plugin from '../src/index.js'

function lint(source: string): Array<{ message: string; line: number }> {
  const linter = new Linter({ configType: 'flat' })
  return linter.verify(source, [
    {
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
      },
      plugins: { benos: plugin },
      rules: { 'benos/no-props-destructuring': 'error' },
    },
  ])
}

describe('@benosjs/eslint-plugin', () => {
  it('reports destructured component parameters and props aliases', () => {
    const messages = lint(`
      function Card({ title }: { title: string }) { return <h1>{title}</h1> }
      const Panel = (props: { title: string }) => {
        const { title } = props
        return <h2>{title}</h2>
      }
    `)
    expect(messages).toHaveLength(2)
    expect(messages.every((item) => item.message)).toBe(true)
    expect(messages.map((item) => item.line)).toEqual([2, 4])
  })

  it('does not report ordinary helper destructuring', () => {
    expect(
      lint(`function format({ title }: { title: string }) { return title }`),
    ).toHaveLength(0)
  })
})

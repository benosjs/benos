import type { Rule } from 'eslint'

const message =
  'Do not destructure component props; read getter-backed props through the props object or use splitProps.'

function isUppercaseName(name: string | undefined): boolean {
  return Boolean(name && /^[A-Z]/.test(name))
}

const propsDestructuring: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow destructuring getter-backed props in Benos components',
    },
    schema: [],
    messages: { destructured: message },
  },
  create(context) {
    const componentPropNames: Array<string | null> = []

    return {
      FunctionDeclaration(node) {
        const name = node.id?.name
        const first = node.params[0]
        if (!isUppercaseName(name)) {
          componentPropNames.push(null)
          return
        }
        if (first?.type === 'ObjectPattern')
          context.report({ node: first, messageId: 'destructured' })
        componentPropNames.push(
          first?.type === 'Identifier' ? first.name : null,
        )
      },
      'FunctionDeclaration:exit'() {
        componentPropNames.pop()
      },
      FunctionExpression(node) {
        const parent = node.parent
        const name =
          node.id?.name ??
          (parent?.type === 'VariableDeclarator' &&
          parent.id.type === 'Identifier'
            ? parent.id.name
            : undefined)
        const first = node.params[0]
        if (!isUppercaseName(name)) {
          componentPropNames.push(null)
          return
        }
        if (first?.type === 'ObjectPattern')
          context.report({ node: first, messageId: 'destructured' })
        componentPropNames.push(
          first?.type === 'Identifier' ? first.name : null,
        )
      },
      'FunctionExpression:exit'() {
        componentPropNames.pop()
      },
      ArrowFunctionExpression(node) {
        const parent = node.parent
        const name =
          parent?.type === 'VariableDeclarator' &&
          parent.id.type === 'Identifier'
            ? parent.id.name
            : undefined
        const first = node.params[0]
        if (!isUppercaseName(name)) {
          componentPropNames.push(null)
          return
        }
        if (first?.type === 'ObjectPattern')
          context.report({ node: first, messageId: 'destructured' })
        componentPropNames.push(
          first?.type === 'Identifier' ? first.name : null,
        )
      },
      'ArrowFunctionExpression:exit'() {
        componentPropNames.pop()
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== 'ObjectPattern' ||
          node.init?.type !== 'Identifier'
        )
          return
        if (componentPropNames.includes(node.init.name))
          context.report({ node: node.id, messageId: 'destructured' })
      },
    }
  },
}

const plugin = {
  rules: {
    'no-props-destructuring': propsDestructuring,
  },
}

export default plugin

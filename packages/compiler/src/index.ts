import { transformFromAstSync } from '@babel/core'
import generate from '@babel/generator'
import { parse } from '@babel/parser'
import transformTypeScript from '@babel/plugin-transform-typescript'
import * as t from '@babel/types'

export type Optimization = 'none' | 'safe'

export interface TransformOptions {
  filename: string
  development?: boolean
  optimization?: Optimization
}

export interface SourceLocation {
  line: number
  column: number
}

export interface Diagnostic {
  code: string
  message: string
  severity: 'warning' | 'error'
  location: SourceLocation
}

export interface RawSourceMap {
  version: 3
  file?: string
  sourceRoot?: string
  sources: string[]
  sourcesContent?: string[]
  names: string[]
  mappings: string
}

export interface TransformResult {
  code: string
  map: RawSourceMap
  diagnostics: Diagnostic[]
}

type AstRecord = Record<string, unknown>

interface StaticPlan {
  id: string
  nodes: t.ObjectExpression[]
}

const runtimeModule = '@benosjs/dom/internal'
const helperExports = {
  jsx: '__benos_jsx',
  fragment: '__benos_fragment',
  dynamicChild: '__benos_dynamic_child',
  mergeProps: '__benos_merge_props',
  template: '__benos_template',
  instantiate: '__benos_instantiate',
} as const

function record(node: t.Node): AstRecord {
  return node as unknown as AstRecord
}

function sourceLocation(node: t.Node): SourceLocation {
  return {
    line: node.loc?.start.line ?? 1,
    column: node.loc?.start.column ?? 0,
  }
}

function nameOf(
  node: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (t.isJSXIdentifier(node)) return node.name
  if (t.isJSXNamespacedName(node))
    return `${node.namespace.name}:${node.name.name}`
  return `${nameOf(node.object)}.${nameOf(node.property)}`
}

function jsxNameExpression(
  node: t.JSXElement['openingElement']['name'],
): t.Expression {
  if (t.isJSXIdentifier(node)) {
    if (
      node.name === 'Fragment' ||
      /^[A-Z]/.test(node.name) ||
      node.name.includes('.')
    )
      return node.name === 'Fragment'
        ? t.identifier(helperExports.fragment)
        : t.identifier(node.name)
    return t.stringLiteral(node.name)
  }
  if (t.isJSXMemberExpression(node))
    return t.memberExpression(
      jsxNameExpression(node.object),
      jsxNameExpression(node.property),
    )
  if (t.isJSXNamespacedName(node)) return t.stringLiteral(nameOf(node))
  return t.stringLiteral(nameOf(node))
}

function attributeName(node: t.JSXAttribute['name']): string {
  if (t.isJSXIdentifier(node)) return node.name
  return `${node.namespace.name}:${node.name.name}`
}

function textValue(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length === 1) return value
  const kept: string[] = []
  for (let index = 0; index < lines.length; index++) {
    let line = (lines[index] ?? '').replace(/\t/g, ' ')
    if (index !== 0) line = line.replace(/^ +/, '')
    if (index !== lines.length - 1) line = line.replace(/ +$/, '')
    if (line) {
      if (kept.length) kept.push(' ')
      kept.push(line)
    }
  }
  return kept.join('')
}

function literalValue(
  node: t.Node,
): string | number | boolean | null | undefined {
  if (t.isStringLiteral(node)) return node.value
  if (t.isNumericLiteral(node)) return node.value
  if (t.isBooleanLiteral(node)) return node.value
  if (t.isNullLiteral(node)) return null
  return undefined
}

function isStaticAttribute(attribute: t.JSXAttribute): boolean {
  if (!attribute.value) return true
  if (t.isStringLiteral(attribute.value)) return true
  if (!t.isJSXExpressionContainer(attribute.value)) return false
  return literalValue(attribute.value.expression) !== undefined
}

function namespaceFor(
  tag: string,
  parent: 'html' | 'svg' | 'mathml',
): 'html' | 'svg' | 'mathml' {
  if (tag === 'svg') return 'svg'
  if (tag === 'math') return 'mathml'
  if (parent === 'svg') return 'svg'
  if (parent === 'mathml') return 'mathml'
  return 'html'
}

function instructionText(value: string): t.ObjectExpression {
  return t.objectExpression([
    t.objectProperty(t.identifier('op'), t.stringLiteral('text')),
    t.objectProperty(t.identifier('value'), t.stringLiteral(value)),
  ])
}

function staticInstruction(
  node: t.JSXElement,
  parentNamespace: 'html' | 'svg' | 'mathml' = 'html',
): t.ObjectExpression | null {
  const name = node.openingElement.name
  if (!t.isJSXIdentifier(name) || /^[A-Z]/.test(name.name)) return null
  const attributes = node.openingElement.attributes.filter(
    (item): item is t.JSXAttribute => t.isJSXAttribute(item),
  )
  if (attributes.length !== node.openingElement.attributes.length) return null
  if (attributes.some((item) => !isStaticAttribute(item))) return null
  const tag = name.name
  const namespace = namespaceFor(tag, parentNamespace)
  const attrs: t.ArrayExpression[] = []
  for (const attribute of attributes) {
    const value = !attribute.value
      ? t.booleanLiteral(true)
      : t.isStringLiteral(attribute.value)
        ? t.stringLiteral(attribute.value.value)
        : t.valueToNode(
            t.isJSXExpressionContainer(attribute.value)
              ? literalValue(attribute.value.expression)
              : null,
          )
    attrs.push(
      t.arrayExpression([
        t.stringLiteral(attributeName(attribute.name)),
        value,
      ]),
    )
  }
  const children: t.ObjectExpression[] = []
  for (const child of node.children) {
    if (t.isJSXText(child)) {
      const value = textValue(child.value)
      if (value) children.push(instructionText(value))
      continue
    }
    if (t.isJSXElement(child)) {
      const nested = staticInstruction(child, namespace)
      if (!nested) return null
      children.push(nested)
      continue
    }
    if (t.isJSXExpressionContainer(child)) {
      const value = literalValue(child.expression)
      if (value === undefined) return null
      if (value !== null && value !== false)
        children.push(instructionText(String(value)))
      continue
    }
    return null
  }
  return t.objectExpression([
    t.objectProperty(t.identifier('op'), t.stringLiteral('element')),
    t.objectProperty(t.identifier('tag'), t.stringLiteral(tag)),
    t.objectProperty(t.identifier('ns'), t.stringLiteral(namespace)),
    ...(attrs.length
      ? [t.objectProperty(t.identifier('attrs'), t.arrayExpression(attrs))]
      : []),
    ...(children.length
      ? [
          t.objectProperty(
            t.identifier('children'),
            t.arrayExpression(children),
          ),
        ]
      : []),
  ])
}

function staticFragment(node: t.JSXFragment): t.ObjectExpression[] | null {
  const result: t.ObjectExpression[] = []
  for (const child of node.children) {
    if (t.isJSXText(child)) {
      const value = textValue(child.value)
      if (value) result.push(instructionText(value))
    } else if (t.isJSXElement(child)) {
      const instruction = staticInstruction(child)
      if (!instruction) return null
      result.push(instruction)
    } else if (t.isJSXExpressionContainer(child)) {
      const value = literalValue(child.expression)
      if (value === undefined) return null
      if (value !== null && value !== false)
        result.push(instructionText(String(value)))
    } else return null
  }
  return result
}

function staticPlan(
  node: t.JSXElement | t.JSXFragment,
  filename: string,
): StaticPlan | null {
  const nodes = t.isJSXElement(node)
    ? (() => {
        const instruction = staticInstruction(node)
        return instruction ? [instruction] : null
      })()
    : staticFragment(node)
  if (!nodes) return null
  const position = node.start ?? 0
  const id = `${filename.replace(/[^a-zA-Z0-9_]+/g, '_')}:${position}`
  return { id, nodes }
}

function getterProperty(name: string, value: t.Expression): t.ObjectMethod {
  return t.objectMethod(
    'get',
    t.stringLiteral(name),
    [],
    t.blockStatement([t.returnStatement(value)]),
  )
}

function expressionContainer(
  value: t.JSXAttribute['value'],
): t.Expression | null {
  if (!t.isJSXExpressionContainer(value)) return null
  if (t.isJSXEmptyExpression(value.expression)) return null
  return value.expression as t.Expression
}

function dynamicChild(expression: t.Expression): t.CallExpression {
  return t.callExpression(t.identifier(helperExports.dynamicChild), [
    t.arrowFunctionExpression([], expression),
  ])
}

function childExpression(
  child: t.Node,
  helpers: Set<keyof typeof helperExports>,
): t.Expression | null {
  if (t.isJSXText(child)) {
    const value = textValue(child.value)
    return value ? t.stringLiteral(value) : null
  }
  if (t.isJSXElement(child) || t.isJSXFragment(child))
    return child as unknown as t.Expression
  if (t.isJSXExpressionContainer(child)) {
    const expression = expressionContainer(
      child as unknown as t.JSXAttribute['value'],
    )
    if (!expression) return null
    if (
      t.isArrowFunctionExpression(expression) ||
      t.isFunctionExpression(expression)
    )
      return expression
    helpers.add('dynamicChild')
    return dynamicChild(expression)
  }
  return child as unknown as t.Expression
}

function buildProps(
  node: t.JSXElement | t.JSXFragment,
  helpers: Set<keyof typeof helperExports>,
): { props: t.Expression; key: t.Expression | undefined } {
  if (t.isJSXFragment(node)) {
    const children = node.children
      .map((child) => childExpression(child, helpers))
      .filter((value): value is t.Expression => value !== null)
    helpers.add('fragment')
    return {
      props: t.objectExpression(
        children.length
          ? [
              t.objectProperty(
                t.identifier('children'),
                children.length === 1
                  ? (children[0] ?? t.stringLiteral(''))
                  : t.arrayExpression(children),
              ),
            ]
          : [],
      ),
      key: undefined,
    }
  }
  const segments: t.ObjectExpression[] = []
  let current: t.ObjectMember[] = []
  let key: t.Expression | undefined
  const flush = (): void => {
    segments.push(t.objectExpression(current))
    current = []
  }
  for (const item of node.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(item)) {
      flush()
      segments.push(item.argument as t.ObjectExpression)
      continue
    }
    const name = attributeName(item.name)
    if (name === 'key') {
      const value = item.value
      key = !value
        ? t.booleanLiteral(true)
        : t.isStringLiteral(value)
          ? t.stringLiteral(value.value)
          : (expressionContainer(value) ?? undefined)
      continue
    }
    if (!item.value)
      current.push(
        t.objectProperty(t.stringLiteral(name), t.booleanLiteral(true)),
      )
    else if (t.isStringLiteral(item.value))
      current.push(
        t.objectProperty(
          t.stringLiteral(name),
          t.stringLiteral(item.value.value),
        ),
      )
    else {
      const expression = expressionContainer(item.value)
      if (expression) current.push(getterProperty(name, expression))
    }
  }
  const children = node.children
    .map((child) => childExpression(child, helpers))
    .filter((value): value is t.Expression => value !== null)
  if (children.length)
    current.push(
      t.objectProperty(
        t.stringLiteral('children'),
        children.length === 1
          ? (children[0] ?? t.stringLiteral(''))
          : t.arrayExpression(children),
      ),
    )
  flush()
  if (segments.length === 1)
    return { props: segments[0] ?? t.objectExpression([]), key }
  helpers.add('mergeProps')
  return {
    props: t.callExpression(
      t.identifier(helperExports.mergeProps),
      segments as unknown as t.Expression[],
    ),
    key,
  }
}

function buildDynamicJsx(
  node: t.JSXElement | t.JSXFragment,
  helpers: Set<keyof typeof helperExports>,
): t.CallExpression {
  helpers.add('jsx')
  const { props, key } = buildProps(node, helpers)
  const type = t.isJSXFragment(node)
    ? t.identifier(helperExports.fragment)
    : jsxNameExpression(node.openingElement.name)
  const args: t.Expression[] = [type, props]
  if (key) args.push(key)
  return t.callExpression(t.identifier(helperExports.jsx), args)
}

function eventName(name: string): string | null {
  if (name.startsWith('on:')) return name.slice(3).toLowerCase()
  if (!/^on[A-Z]/.test(name) || name.endsWith('Capture')) return null
  return name.slice(2).toLowerCase()
}

function scopeCall(
  method: 'attr' | 'text' | 'child' | 'event',
  args: t.Expression[],
): t.ExpressionStatement {
  const statement = t.expressionStatement(
    t.callExpression(
      t.memberExpression(t.identifier('scope'), t.identifier(method)),
      args,
    ),
  )
  const callback = args[args.length - 1]
  if (t.isArrowFunctionExpression(callback) && callback.body.loc)
    statement.loc = callback.body.loc
  return statement
}

interface DynamicTemplate {
  nodes: t.ObjectExpression[]
  setup: t.Statement[]
}

function buildDynamicTemplate(node: t.JSXElement): DynamicTemplate | null {
  const name = node.openingElement.name
  if (!t.isJSXIdentifier(name) || /^[A-Z]/.test(name.name)) return null
  const attributes = node.openingElement.attributes
  if (attributes.some((attribute) => t.isJSXSpreadAttribute(attribute)))
    return null
  if (
    attributes.some(
      (attribute) =>
        t.isJSXAttribute(attribute) && attributeName(attribute.name) === 'ref',
    )
  )
    return null
  const namespace = namespaceFor(name.name, 'html')
  const staticAttrs: t.ArrayExpression[] = []
  const setup: t.Statement[] = []
  let nextSlot = 1
  let childAttribute: t.Expression | undefined
  for (const attribute of attributes) {
    if (!t.isJSXAttribute(attribute)) continue
    const key = attributeName(attribute.name)
    if (key === 'key') continue
    const value = attribute.value
    if (!value) {
      staticAttrs.push(
        t.arrayExpression([t.stringLiteral(key), t.booleanLiteral(true)]),
      )
      continue
    }
    if (t.isStringLiteral(value)) {
      staticAttrs.push(
        t.arrayExpression([t.stringLiteral(key), t.stringLiteral(value.value)]),
      )
      continue
    }
    const expression = expressionContainer(value)
    if (!expression) continue
    if (key.endsWith('Capture')) return null
    const event = eventName(key)
    if (event) {
      setup.push(
        scopeCall('event', [
          t.numericLiteral(0),
          t.stringLiteral(event),
          t.arrowFunctionExpression([], expression),
        ]),
      )
      continue
    }
    if (key === 'children') {
      childAttribute = expression
      continue
    }
    if (literalValue(expression) !== undefined) {
      staticAttrs.push(
        t.arrayExpression([
          t.stringLiteral(key),
          t.valueToNode(literalValue(expression)),
        ]),
      )
      continue
    }
    setup.push(
      scopeCall('attr', [
        t.numericLiteral(0),
        t.stringLiteral(key),
        t.arrowFunctionExpression([], expression),
      ]),
    )
  }
  const children: t.ObjectExpression[] = []
  for (const child of node.children as unknown as t.Node[]) {
    if (t.isJSXText(child)) {
      const value = textValue(child.value)
      if (value) children.push(instructionText(value))
      continue
    }
    if (t.isJSXExpressionContainer(child)) {
      const expression = expressionContainer(
        child as unknown as t.JSXAttribute['value'],
      )
      if (!expression) continue
      const value = literalValue(expression)
      if (value !== undefined) {
        if (value !== null && value !== false)
          children.push(instructionText(String(value)))
        continue
      }
      if (
        t.isArrowFunctionExpression(expression) ||
        t.isFunctionExpression(expression)
      )
        return null
      const slot = nextSlot++
      children.push(
        t.objectExpression([
          t.objectProperty(t.identifier('op'), t.stringLiteral('anchor')),
          t.objectProperty(t.identifier('slot'), t.numericLiteral(slot)),
        ]),
      )
      setup.push(
        scopeCall('child', [
          t.numericLiteral(slot),
          t.arrowFunctionExpression([], expression),
        ]),
      )
      continue
    }
    if (t.isJSXElement(child) || t.isJSXFragment(child)) return null
    if (child && typeof child === 'object' && 'type' in child) {
      const slot = nextSlot++
      children.push(
        t.objectExpression([
          t.objectProperty(t.identifier('op'), t.stringLiteral('anchor')),
          t.objectProperty(t.identifier('slot'), t.numericLiteral(slot)),
        ]),
      )
      setup.push(
        scopeCall('child', [
          t.numericLiteral(slot),
          t.arrowFunctionExpression([], child as t.Expression),
        ]),
      )
    }
  }
  if (childAttribute) {
    const slot = nextSlot
    children.push(
      t.objectExpression([
        t.objectProperty(t.identifier('op'), t.stringLiteral('anchor')),
        t.objectProperty(t.identifier('slot'), t.numericLiteral(slot)),
      ]),
    )
    setup.push(
      scopeCall('child', [
        t.numericLiteral(slot),
        t.arrowFunctionExpression([], childAttribute),
      ]),
    )
  }
  return {
    nodes: [
      t.objectExpression([
        t.objectProperty(t.identifier('op'), t.stringLiteral('element')),
        t.objectProperty(t.identifier('tag'), t.stringLiteral(name.name)),
        t.objectProperty(t.identifier('ns'), t.stringLiteral(namespace)),
        t.objectProperty(t.identifier('slot'), t.numericLiteral(0)),
        ...(staticAttrs.length
          ? [
              t.objectProperty(
                t.identifier('attrs'),
                t.arrayExpression(staticAttrs),
              ),
            ]
          : []),
        ...(children.length
          ? [
              t.objectProperty(
                t.identifier('children'),
                t.arrayExpression(children),
              ),
            ]
          : []),
      ]),
    ],
    setup,
  }
}

function templateId(filename: string, node: t.Node): string {
  return `${filename.replace(/[^a-zA-Z0-9_]+/g, '_')}:${node.start ?? 0}`
}

function addTemplatePlan(
  plan: { id: string; nodes: t.ObjectExpression[] },
  setup: t.Statement[],
  development: boolean,
  helpers: Set<keyof typeof helperExports>,
  plans: t.VariableDeclaration[],
): t.CallExpression {
  helpers.add('template')
  helpers.add('instantiate')
  const name = `__benos_template_${plans.length}`
  const planValue = development
    ? t.objectExpression([
        t.objectProperty(t.identifier('id'), t.stringLiteral(plan.id)),
        t.objectProperty(t.identifier('nodes'), t.arrayExpression(plan.nodes)),
      ])
    : t.arrayExpression([
        t.stringLiteral(plan.id),
        t.arrayExpression(plan.nodes),
      ])
  plans.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(name),
        t.callExpression(t.identifier(helperExports.template), [planValue]),
      ),
    ]),
  )
  return t.callExpression(t.identifier(helperExports.instantiate), [
    t.identifier(name),
    t.arrowFunctionExpression([t.identifier('scope')], t.blockStatement(setup)),
  ])
}

function walk(node: t.Node, visit: (node: t.Node) => void): void {
  visit(node)
  const keys = t.VISITOR_KEYS[node.type] ?? []
  const value = record(node)
  for (const key of keys) {
    const child = value[key]
    if (Array.isArray(child)) {
      for (const item of child)
        if (item && typeof item === 'object' && 'type' in item)
          walk(item as t.Node, visit)
    } else if (child && typeof child === 'object' && 'type' in child) {
      walk(child as t.Node, visit)
    }
  }
}

function rewrite(
  node: t.Node,
  filename: string,
  helpers: Set<keyof typeof helperExports>,
  plans: t.VariableDeclaration[],
  development: boolean,
): t.Node {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    const plan = staticPlan(node, filename)
    if (plan) return addTemplatePlan(plan, [], development, helpers, plans)
    const keys = t.VISITOR_KEYS[node.type] ?? []
    const value = record(node)
    for (const key of keys) {
      const child = value[key]
      if (Array.isArray(child))
        value[key] = child.map((item) =>
          item && typeof item === 'object' && 'type' in item
            ? rewrite(item as t.Node, filename, helpers, plans, development)
            : item,
        )
      else if (child && typeof child === 'object' && 'type' in child)
        value[key] = rewrite(
          child as t.Node,
          filename,
          helpers,
          plans,
          development,
        )
    }
    if (t.isJSXElement(node)) {
      const template = buildDynamicTemplate(node)
      if (template)
        return addTemplatePlan(
          { id: templateId(filename, node), nodes: template.nodes },
          template.setup,
          development,
          helpers,
          plans,
        )
    }
    return buildDynamicJsx(node, helpers)
  }
  const keys = t.VISITOR_KEYS[node.type] ?? []
  const value = record(node)
  for (const key of keys) {
    const child = value[key]
    if (Array.isArray(child))
      value[key] = child.map((item) =>
        item && typeof item === 'object' && 'type' in item
          ? rewrite(item as t.Node, filename, helpers, plans, development)
          : item,
      )
    else if (child && typeof child === 'object' && 'type' in child)
      value[key] = rewrite(
        child as t.Node,
        filename,
        helpers,
        plans,
        development,
      )
  }
  return node
}

function diagnosticsFor(ast: t.File, development: boolean): Diagnostic[] {
  if (!development) return []
  const diagnostics: Diagnostic[] = []
  walk(ast, (node) => {
    if (t.isJSXExpressionContainer(node)) {
      let asyncExpression: t.AwaitExpression | t.YieldExpression | undefined
      walk(node.expression, (nested) => {
        if (
          !asyncExpression &&
          (t.isAwaitExpression(nested) || t.isYieldExpression(nested))
        )
          asyncExpression = nested
      })
      if (asyncExpression)
        diagnostics.push({
          code: 'async-binding',
          message:
            'await and yield are not supported in JSX bindings; use explicit async state instead.',
          severity: 'error',
          location: sourceLocation(asyncExpression),
        })
    }
    if (t.isJSXAttribute(node)) {
      const name = attributeName(node.name)
      const code =
        name === 'className' || name === 'htmlFor'
          ? 'unsupported-prop-name'
          : /^(?:dangerouslySetInnerHTML|innerHTML|outerHTML|html)$/.test(name)
            ? 'raw-html-attribute'
            : ''
      if (code)
        diagnostics.push({
          code,
          message:
            code === 'raw-html-attribute'
              ? `Raw HTML attribute "${name}" is not supported; use an explicit DOM API.`
              : `Use the Benos attribute spelling instead of "${name}".`,
          severity: 'warning',
          location: sourceLocation(node),
        })
    }
    if (t.isFunction(node))
      for (const parameter of node.params)
        if (t.isObjectPattern(parameter))
          diagnostics.push({
            code: 'props-destructuring',
            message:
              'Destructuring component props is statically visible and can lose getter timing; read props through the component parameter.',
            severity: 'warning',
            location: sourceLocation(parameter),
          })
    if (
      t.isVariableDeclarator(node) &&
      t.isObjectPattern(node.id) &&
      t.isIdentifier(node.init) &&
      node.init.name === 'props'
    )
      diagnostics.push({
        code: 'props-destructuring',
        message:
          'Destructuring component props is statically visible and can lose getter timing; read props through the component parameter.',
        severity: 'warning',
        location: sourceLocation(node.id),
      })
  })
  return diagnostics
}

function addRuntimeImport(
  program: t.Program,
  helpers: Set<keyof typeof helperExports>,
): void {
  const exportsByHelper: Record<keyof typeof helperExports, string> = {
    jsx: 'jsx',
    fragment: 'Fragment',
    dynamicChild: 'dynamicChild',
    mergeProps: 'mergeProps',
    template: 'template',
    instantiate: 'instantiate',
  }
  const specifiers = [...helpers].map((helper) =>
    t.importSpecifier(
      t.identifier(helperExports[helper]),
      t.identifier(exportsByHelper[helper]),
    ),
  )
  if (specifiers.length)
    program.body.unshift(
      t.importDeclaration(specifiers, t.stringLiteral(runtimeModule)),
    )
}

function hasJsx(ast: t.File): boolean {
  let found = false
  walk(ast, (node) => {
    found ||= t.isJSXElement(node) || t.isJSXFragment(node)
  })
  return found
}

export function transformJsx(
  source: string,
  options: TransformOptions,
): TransformResult {
  const development = options.development ?? false
  const ast = parse(source, {
    sourceType: 'module',
    sourceFilename: options.filename,
    plugins: ['typescript', 'jsx'],
  })
  if (!hasJsx(ast) && /\b(?:jsx|jsxs|jsxDEV)\s*\(/.test(source))
    throw new Error(
      `Benos JSX transform received already-lowered JSX in ${options.filename}. Remove the other JSX transform so Benos runs first.`,
    )
  const diagnostics = diagnosticsFor(ast as unknown as t.File, development)
  const helpers = new Set<keyof typeof helperExports>()
  const plans: t.VariableDeclaration[] = []
  const rewritten = rewrite(
    ast.program as unknown as t.Program,
    options.filename,
    helpers,
    plans,
    development,
  ) as t.Program
  rewritten.body.unshift(...plans)
  addRuntimeImport(rewritten, helpers)
  const generated = transformFromAstSync(rewritten, source, {
    filename: options.filename,
    sourceFileName: options.filename,
    sourceMaps: true,
    configFile: false,
    babelrc: false,
    plugins: [[transformTypeScript, { isTSX: true, allExtensions: true }]],
  })
  if (!generated?.code || !generated.map)
    throw new Error(`Benos compiler could not generate ${options.filename}`)
  const map = generated.map as unknown as RawSourceMap
  map.sources = [options.filename]
  map.sourcesContent = [source]
  return { code: generated.code, map, diagnostics }
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `${diagnostic.severity}: ${diagnostic.message} (${diagnostic.location.line}:${diagnostic.location.column + 1})`,
    )
    .join('\n')
}

export { generate }

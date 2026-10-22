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
  directDefinition: '__benos_direct_definition',
  directTemplate: '__benos_direct_template',
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
  if (t.isJSXMemberExpression(node)) return jsxMemberExpression(node)
  if (t.isJSXNamespacedName(node)) return t.stringLiteral(nameOf(node))
  return t.stringLiteral(nameOf(node))
}

/**
 * A member tag such as `<form.Field>` or `<ui.forms.Input>` is always a value:
 * its object is a variable even when it starts with a lowercase letter.
 */
function jsxMemberExpression(node: t.JSXMemberExpression): t.MemberExpression {
  const object = t.isJSXMemberExpression(node.object)
    ? jsxMemberExpression(node.object)
    : node.object.name === 'this'
      ? t.thisExpression()
      : t.identifier(node.object.name)
  return t.memberExpression(object, t.identifier(node.property.name))
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
  parentTag?: string,
): 'html' | 'svg' | 'mathml' {
  if (parentTag === 'foreignObject') return 'html'
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
  parentTag?: string,
): t.ObjectExpression | null {
  const name = node.openingElement.name
  if (!t.isJSXIdentifier(name) || /^[A-Z]/.test(name.name)) return null
  const attributes = node.openingElement.attributes.filter(
    (item): item is t.JSXAttribute => t.isJSXAttribute(item),
  )
  if (attributes.length !== node.openingElement.attributes.length) return null
  if (attributes.some((item) => !isStaticAttribute(item))) return null
  const tag = name.name
  const namespace = namespaceFor(tag, parentNamespace, parentTag)
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
      const nested = staticInstruction(child, namespace, tag)
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

interface DirectStaticAttribute {
  path: number[]
  name: string
  namespace: 'html' | 'svg' | 'mathml'
  value: t.Expression
}

interface DirectBinding {
  kind: 'attribute' | 'child' | 'event' | 'ref'
  path: number[]
  namespace: 'html' | 'svg' | 'mathml'
  expression: t.Expression
  name?: string
  capture?: boolean
}

interface DirectTemplate {
  html: string
  attributes: DirectStaticAttribute[]
  bindings: DirectBinding[]
  captures: string[]
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function isReferenceIdentifier(node: t.Identifier, parent?: t.Node): boolean {
  if (!parent) return true
  if (
    (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) &&
    parent.property === node &&
    !parent.computed
  )
    return false
  if (
    (t.isObjectProperty(parent) || t.isObjectMethod(parent)) &&
    parent.key === node &&
    !parent.computed &&
    (!t.isObjectProperty(parent) || !parent.shorthand)
  )
    return false
  if (
    (t.isFunction(parent) && parent.params.includes(node)) ||
    (t.isVariableDeclarator(parent) && parent.id === node) ||
    ((t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent)) &&
      parent.id === node) ||
    ((t.isClassDeclaration(parent) || t.isClassExpression(parent)) &&
      parent.id === node)
  )
    return false
  return true
}

function addPatternNames(pattern: t.Node, names: Set<string>): void {
  if (t.isIdentifier(pattern)) names.add(pattern.name)
  else if (t.isRestElement(pattern)) addPatternNames(pattern.argument, names)
  else if (t.isAssignmentPattern(pattern)) addPatternNames(pattern.left, names)
  else if (t.isArrayPattern(pattern)) {
    for (const item of pattern.elements) if (item) addPatternNames(item, names)
  } else if (t.isObjectPattern(pattern)) {
    for (const item of pattern.properties)
      if (t.isRestElement(item)) addPatternNames(item.argument, names)
      else addPatternNames(item.value, names)
  }
}

function functionBindings(fn: t.Function): Set<string> {
  const names = new Set<string>()
  if ('id' in fn && fn.id) names.add(fn.id.name)
  for (const parameter of fn.params) addPatternNames(parameter, names)
  const visit = (node: t.Node): void => {
    if (node !== fn && t.isFunction(node)) {
      if (t.isFunctionDeclaration(node) && node.id) names.add(node.id.name)
      return
    }
    if (t.isVariableDeclarator(node)) addPatternNames(node.id, names)
    else if (
      (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) &&
      node.id
    )
      names.add(node.id.name)
    else if (t.isCatchClause(node) && node.param)
      addPatternNames(node.param, names)
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
      const child = record(node)[key]
      if (Array.isArray(child)) {
        for (const item of child)
          if (item && typeof item === 'object' && 'type' in item)
            visit(item as t.Node)
      } else if (child && typeof child === 'object' && 'type' in child) {
        visit(child as t.Node)
      }
    }
  }
  if (fn.body) visit(fn.body)
  return names
}

function hasUnsupportedLexicalReference(expression: t.Expression): boolean {
  let unsupported = false
  walk(expression, (node) => {
    unsupported ||=
      t.isThisExpression(node) ||
      t.isSuper(node) ||
      t.isAssignmentExpression(node) ||
      t.isUpdateExpression(node) ||
      (t.isMetaProperty(node) && node.meta.name === 'new') ||
      (t.isIdentifier(node) && node.name === 'arguments')
  })
  return unsupported
}

function collectLocalReferences(
  expression: t.Expression,
  locals: ReadonlySet<string>,
  result: Set<string>,
): void {
  const visit = (
    node: t.Node,
    parent: t.Node | undefined,
    shadowed: ReadonlySet<string>,
  ): void => {
    const nestedShadowed = t.isFunction(node)
      ? new Set([...shadowed, ...functionBindings(node)])
      : shadowed
    if (
      t.isIdentifier(node) &&
      locals.has(node.name) &&
      !nestedShadowed.has(node.name) &&
      isReferenceIdentifier(node, parent)
    )
      result.add(node.name)
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
      const child = record(node)[key]
      if (Array.isArray(child)) {
        for (const item of child)
          if (item && typeof item === 'object' && 'type' in item)
            visit(item as t.Node, node, nestedShadowed)
      } else if (child && typeof child === 'object' && 'type' in child) {
        visit(child as t.Node, node, nestedShadowed)
      }
    }
  }
  visit(expression, undefined, new Set())
}

function replaceLocalReferences(
  expression: t.Expression,
  captures: ReadonlyMap<string, number>,
): t.Expression {
  const rewriteExpression = (
    node: t.Node,
    parent: t.Node | undefined,
    shadowed: ReadonlySet<string>,
  ): t.Node => {
    const nestedShadowed = t.isFunction(node)
      ? new Set([...shadowed, ...functionBindings(node)])
      : shadowed
    if (
      t.isIdentifier(node) &&
      !nestedShadowed.has(node.name) &&
      isReferenceIdentifier(node, parent)
    ) {
      const index = captures.get(node.name)
      if (index !== undefined)
        return t.callExpression(
          t.memberExpression(
            t.identifier('__benos_values'),
            t.numericLiteral(index),
            true,
          ),
          [],
        )
    }
    const keys = t.VISITOR_KEYS[node.type] ?? []
    const value = record(node)
    for (const key of keys) {
      const child = value[key]
      if (Array.isArray(child))
        value[key] = child.map((item) =>
          item && typeof item === 'object' && 'type' in item
            ? rewriteExpression(item as t.Node, node, nestedShadowed)
            : item,
        )
      else if (child && typeof child === 'object' && 'type' in child)
        value[key] = rewriteExpression(child as t.Node, node, nestedShadowed)
    }
    return node
  }
  return rewriteExpression(expression, undefined, new Set()) as t.Expression
}

function directEventDetails(
  name: string,
): { name: string; capture: boolean } | null {
  if (name.startsWith('on:'))
    return { name: name.slice(3).toLowerCase(), capture: false }
  if (!/^on[A-Z]/.test(name)) return null
  const capture = name.endsWith('Capture')
  const event = capture ? name.slice(2, -7) : name.slice(2)
  return event ? { name: event.toLowerCase(), capture } : null
}

function jsxChildBinding(child: t.Node): t.Expression | null {
  if (t.isJSXElement(child) || t.isJSXFragment(child))
    return child as unknown as t.Expression
  if (!t.isJSXExpressionContainer(child)) return null
  return expressionContainer(child as unknown as t.JSXAttribute['value'])
}

function buildDirectTemplate(
  node: t.JSXElement,
  locals: ReadonlySet<string>,
): DirectTemplate | null {
  if (!t.isJSXIdentifier(node.openingElement.name)) return null
  const rootTag = node.openingElement.name.name
  if (/^[A-Z]/.test(rootTag)) return null
  const bindings: DirectBinding[] = []
  const attributes: DirectStaticAttribute[] = []
  const referenced = new Set<string>()

  const renderElement = (
    element: t.JSXElement,
    path: number[],
    parentNamespace: 'html' | 'svg' | 'mathml',
    parentTag?: string,
  ): string | null => {
    if (
      !t.isJSXIdentifier(element.openingElement.name) ||
      /^[A-Z]/.test(element.openingElement.name.name)
    )
      return null
    const tag = element.openingElement.name.name
    const namespace = namespaceFor(tag, parentNamespace, parentTag)
    if (
      tag.includes('-') ||
      tag === 'template' ||
      element.openingElement.attributes.some(
        (attribute) =>
          t.isJSXAttribute(attribute) && attributeName(attribute.name) === 'is',
      )
    )
      return null
    const hasOwnChildren = element.children.some((child) => {
      if (t.isJSXText(child)) return textValue(child.value).length > 0
      if (t.isJSXExpressionContainer(child))
        return (
          expressionContainer(child as unknown as t.JSXAttribute['value']) !==
          null
        )
      return t.isJSXElement(child) || t.isJSXFragment(child)
    })
    const hasDynamicChild = element.children.some((child) => {
      if (t.isJSXText(child)) return false
      if (t.isJSXExpressionContainer(child)) {
        const expression = jsxChildBinding(child)
        return expression !== null && literalValue(expression) === undefined
      }
      return t.isJSXElement(child) || t.isJSXFragment(child)
    })
    if (
      (['script', 'style'].includes(tag) && hasOwnChildren) ||
      (['textarea', 'title'].includes(tag) && hasDynamicChild) ||
      ([
        'area',
        'base',
        'br',
        'col',
        'embed',
        'hr',
        'img',
        'input',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
      ].includes(tag) &&
        hasOwnChildren)
    )
      return null
    let childrenProp: t.Expression | undefined
    for (const attribute of element.openingElement.attributes) {
      if (!t.isJSXAttribute(attribute)) return null
      const name = attributeName(attribute.name)
      if (name === 'key') continue
      const value = attribute.value
      const expression = !value
        ? t.booleanLiteral(true)
        : t.isStringLiteral(value)
          ? t.stringLiteral(value.value)
          : expressionContainer(value)
      if (name === 'children') {
        if (!expression) return null
        childrenProp = expression
        continue
      }
      if (name === 'ref') {
        return null
      }
      if (!expression) continue
      const event = directEventDetails(name)
      if (event) {
        if (hasUnsupportedLexicalReference(expression)) return null
        collectLocalReferences(expression, locals, referenced)
        bindings.push({
          kind: 'event',
          path,
          namespace,
          expression,
          name: event.name,
          capture: event.capture,
        })
        continue
      }
      const literal = literalValue(expression)
      if (literal !== undefined) {
        attributes.push({
          path,
          name,
          namespace,
          value: t.valueToNode(literal) as t.Expression,
        })
        continue
      }
      if (hasUnsupportedLexicalReference(expression)) return null
      collectLocalReferences(expression, locals, referenced)
      bindings.push({ kind: 'attribute', path, namespace, expression, name })
    }

    let html = `<${tag}>`
    let childIndex = 0
    let pendingText = ''
    const flushText = (): void => {
      if (!pendingText) return
      html += pendingText
      pendingText = ''
      childIndex++
    }
    for (const child of element.children) {
      if (t.isJSXText(child)) {
        const text = textValue(child.value)
        if (text) pendingText += escapeHtmlText(text)
      } else if (t.isJSXExpressionContainer(child)) {
        const expression = jsxChildBinding(child)
        if (!expression) continue
        const literal = literalValue(expression)
        if (
          literal !== undefined &&
          typeof literal !== 'boolean' &&
          literal !== null
        ) {
          pendingText += escapeHtmlText(String(literal))
          continue
        }
        if (hasUnsupportedLexicalReference(expression)) return null
        flushText()
        collectLocalReferences(expression, locals, referenced)
        bindings.push({
          kind: 'child',
          path: [...path, childIndex],
          namespace,
          expression,
        })
        html += '<!---->'
        childIndex++
      } else if (t.isJSXElement(child)) {
        flushText()
        if (
          t.isJSXIdentifier(child.openingElement.name) &&
          !/^[A-Z]/.test(child.openingElement.name.name)
        ) {
          const nested = renderElement(
            child,
            [...path, childIndex],
            namespace,
            tag,
          )
          if (nested === null) return null
          html += nested
          childIndex++
        } else {
          const expression = jsxChildBinding(child)
          if (!expression || hasUnsupportedLexicalReference(expression))
            return null
          collectLocalReferences(expression, locals, referenced)
          bindings.push({
            kind: 'child',
            path: [...path, childIndex],
            namespace,
            expression,
          })
          html += '<!---->'
          childIndex++
        }
      } else if (t.isJSXFragment(child)) {
        const expression = jsxChildBinding(child)
        if (!expression || hasUnsupportedLexicalReference(expression))
          return null
        flushText()
        collectLocalReferences(expression, locals, referenced)
        bindings.push({
          kind: 'child',
          path: [...path, childIndex],
          namespace,
          expression,
        })
        html += '<!---->'
        childIndex++
      } else return null
    }
    flushText()
    if (childrenProp && !hasOwnChildren) {
      if (hasUnsupportedLexicalReference(childrenProp)) return null
      if (
        ['textarea', 'title'].includes(tag) ||
        [
          'area',
          'base',
          'br',
          'col',
          'embed',
          'hr',
          'img',
          'input',
          'link',
          'meta',
          'param',
          'source',
          'track',
          'wbr',
        ].includes(tag)
      )
        return null
      collectLocalReferences(childrenProp, locals, referenced)
      bindings.push({
        kind: 'child',
        path: [...path, childIndex],
        namespace,
        expression: childrenProp,
      })
      html += '<!---->'
    }
    return html + `</${tag}>`
  }

  const html = renderElement(node, [], 'html')
  if (html === null || (bindings.length === 0 && attributes.length === 0))
    return null
  return { html, attributes, bindings, captures: [...referenced] }
}

function addDirectTemplate(
  id: string,
  direct: DirectTemplate,
  helpers: Set<keyof typeof helperExports>,
  declarations: t.Statement[],
  filename: string,
  development: boolean,
  locals: ReadonlySet<string>,
  optimization: Optimization,
): t.CallExpression {
  helpers.add('directDefinition')
  helpers.add('directTemplate')
  const rewrittenExpressions = direct.bindings.map(
    (binding) =>
      rewrite(
        binding.expression,
        filename,
        helpers,
        declarations,
        development,
        locals,
        optimization,
      ) as t.Expression,
  )
  const captureNames = new Set(direct.captures)
  for (const expression of rewrittenExpressions)
    collectLocalReferences(expression, locals, captureNames)
  const captureList = [...captureNames]
  const captures = new Map(
    captureList.map((capture, position) => [capture, position]),
  )
  const attributes = t.arrayExpression(
    direct.attributes.map((attribute) =>
      t.objectExpression([
        t.objectProperty(
          t.identifier('path'),
          t.arrayExpression(
            attribute.path.map((item) => t.numericLiteral(item)),
          ),
        ),
        t.objectProperty(t.identifier('name'), t.stringLiteral(attribute.name)),
        t.objectProperty(
          t.identifier('namespace'),
          t.stringLiteral(attribute.namespace),
        ),
        t.objectProperty(t.identifier('value'), attribute.value),
      ]),
    ),
  )
  const bindings = t.arrayExpression(
    direct.bindings.map((binding, bindingIndex) => {
      const expression = rewrittenExpressions[bindingIndex] as t.Expression
      const captured = replaceLocalReferences(expression, captures)
      return t.objectExpression([
        t.objectProperty(t.identifier('kind'), t.stringLiteral(binding.kind)),
        t.objectProperty(
          t.identifier('path'),
          t.arrayExpression(binding.path.map((item) => t.numericLiteral(item))),
        ),
        t.objectProperty(
          t.identifier('namespace'),
          t.stringLiteral(binding.namespace),
        ),
        ...(binding.name
          ? [
              t.objectProperty(
                t.identifier('name'),
                t.stringLiteral(binding.name),
              ),
            ]
          : []),
        ...(binding.capture
          ? [t.objectProperty(t.identifier('capture'), t.booleanLiteral(true))]
          : []),
        t.objectProperty(
          t.identifier('get'),
          t.arrowFunctionExpression([t.identifier('__benos_values')], captured),
        ),
      ])
    }),
  )
  const index = declarations.filter(
    (item) =>
      t.isVariableDeclaration(item) &&
      item.declarations.some(
        (declaration) =>
          t.isIdentifier(declaration.id) &&
          declaration.id.name.startsWith('__benos_direct_definition_'),
      ),
  ).length
  const name = `__benos_direct_definition_${index}`
  const definitionValue = development
    ? t.objectExpression([
        t.objectProperty(t.identifier('id'), t.stringLiteral(id)),
        t.objectProperty(t.identifier('html'), t.stringLiteral(direct.html)),
        t.objectProperty(t.identifier('attributes'), attributes),
        t.objectProperty(t.identifier('bindings'), bindings),
      ])
    : t.arrayExpression([
        t.stringLiteral(id),
        t.stringLiteral(direct.html),
        t.arrayExpression(
          direct.attributes.map((attribute) =>
            t.arrayExpression([
              t.arrayExpression(
                attribute.path.map((item) => t.numericLiteral(item)),
              ),
              t.stringLiteral(attribute.name),
              t.stringLiteral(attribute.namespace),
              attribute.value,
            ]),
          ),
        ),
        t.arrayExpression(
          direct.bindings.map((binding, bindingIndex) => {
            const entry = bindings.elements[bindingIndex] as t.ObjectExpression
            return t.arrayExpression([
              t.stringLiteral(binding.kind),
              t.arrayExpression(
                binding.path.map((item) => t.numericLiteral(item)),
              ),
              t.stringLiteral(binding.namespace),
              binding.name ? t.stringLiteral(binding.name) : t.nullLiteral(),
              t.booleanLiteral(binding.capture ?? false),
              entry.properties.find(
                (property): property is t.ObjectProperty =>
                  t.isObjectProperty(property) &&
                  t.isIdentifier(property.key, { name: 'get' }),
              )?.value as t.Expression,
            ])
          }),
        ),
      ])
  declarations.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(name),
        t.callExpression(t.identifier(helperExports.directDefinition), [
          definitionValue,
        ]),
      ),
    ]),
  )
  return t.callExpression(t.identifier(helperExports.directTemplate), [
    t.identifier(name),
    t.arrayExpression(
      captureList.map((capture) =>
        t.arrowFunctionExpression([], t.identifier(capture)),
      ),
    ),
  ])
}

function addTemplatePlan(
  plan: { id: string; nodes: t.ObjectExpression[] },
  setup: t.Statement[],
  development: boolean,
  helpers: Set<keyof typeof helperExports>,
  plans: t.Statement[],
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
  plans: t.Statement[],
  development: boolean,
  locals: ReadonlySet<string>,
  optimization: Optimization,
): t.Node {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    if (optimization === 'safe' && t.isJSXElement(node)) {
      const direct = buildDirectTemplate(node, locals)
      if (direct)
        return addDirectTemplate(
          templateId(filename, node),
          direct,
          helpers,
          plans,
          filename,
          development,
          locals,
          optimization,
        )
    }
    const plan = staticPlan(node, filename)
    if (plan) return addTemplatePlan(plan, [], development, helpers, plans)
    const keys = t.VISITOR_KEYS[node.type] ?? []
    const value = record(node)
    for (const key of keys) {
      const child = value[key]
      if (Array.isArray(child))
        value[key] = child.map((item) =>
          item && typeof item === 'object' && 'type' in item
            ? rewrite(
                item as t.Node,
                filename,
                helpers,
                plans,
                development,
                locals,
                optimization,
              )
            : item,
        )
      else if (child && typeof child === 'object' && 'type' in child)
        value[key] = rewrite(
          child as t.Node,
          filename,
          helpers,
          plans,
          development,
          locals,
          optimization,
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
  let scopedLocals = locals
  if (t.isFunction(node)) {
    const next = new Set(locals)
    for (const name of functionBindings(node)) next.add(name)
    scopedLocals = next
  }
  const keys = t.VISITOR_KEYS[node.type] ?? []
  const value = record(node)
  for (const key of keys) {
    const child = value[key]
    if (Array.isArray(child))
      value[key] = child.map((item) =>
        item && typeof item === 'object' && 'type' in item
          ? rewrite(
              item as t.Node,
              filename,
              helpers,
              plans,
              development,
              scopedLocals,
              optimization,
            )
          : item,
      )
    else if (child && typeof child === 'object' && 'type' in child)
      value[key] = rewrite(
        child as t.Node,
        filename,
        helpers,
        plans,
        development,
        scopedLocals,
        optimization,
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
    directDefinition: 'directTemplateDefinition',
    directTemplate: 'directTemplate',
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
  const plans: t.Statement[] = []
  const rewritten = rewrite(
    ast.program as unknown as t.Program,
    options.filename,
    helpers,
    plans,
    development,
    new Set(),
    options.optimization ?? 'none',
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

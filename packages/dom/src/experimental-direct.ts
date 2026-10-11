export type DirectNamespace = 'html' | 'svg' | 'mathml'

export interface DirectAttributeDefinition {
  readonly path: readonly number[]
  readonly name: string
  readonly namespace: DirectNamespace
  readonly value: unknown
}

export interface DirectBindingDefinition {
  readonly kind: 'attribute' | 'child' | 'event'
  readonly path: readonly number[]
  readonly namespace: DirectNamespace
  readonly name?: string
  readonly capture?: boolean
  readonly get: (values: readonly unknown[]) => unknown
}

export interface DirectTemplateDefinition {
  readonly id: string
  readonly html: string
  readonly attributes: readonly DirectAttributeDefinition[]
  readonly bindings: readonly DirectBindingDefinition[]
}

export interface DirectTemplateDescriptor {
  readonly kind: 'direct-template'
  readonly definition: DirectTemplateDefinition
  readonly values: readonly unknown[]
}

type CompactDirectTemplateDefinition = readonly [
  string,
  string,
  readonly (readonly [readonly number[], string, DirectNamespace, unknown])[],
  readonly (readonly [
    DirectBindingDefinition['kind'],
    readonly number[],
    DirectNamespace,
    string | null,
    boolean,
    DirectBindingDefinition['get'],
  ])[],
]

export function directTemplateDefinition(
  value: DirectTemplateDefinition | CompactDirectTemplateDefinition,
): DirectTemplateDefinition {
  if (!Array.isArray(value)) return value as DirectTemplateDefinition
  const [id, html, attributes, bindings] =
    value as CompactDirectTemplateDefinition
  return {
    id,
    html,
    attributes: attributes.map(([path, name, namespace, attributeValue]) => ({
      path,
      name,
      namespace,
      value: attributeValue,
    })),
    bindings: bindings.map(([kind, path, namespace, name, capture, get]) => ({
      kind,
      path,
      namespace,
      ...(name === null ? {} : { name }),
      ...(capture ? { capture } : {}),
      get,
    })),
  }
}

export function directTemplate(
  definition: DirectTemplateDefinition,
  values: readonly unknown[],
): DirectTemplateDescriptor {
  return { kind: 'direct-template', definition, values }
}

export {
  Fragment,
  component,
  dynamicChild,
  instantiate,
  jsx,
  jsxs,
  mergeProps,
  template,
} from '@benosjs/dom'
export {
  directTemplate,
  directTemplateDefinition,
} from './experimental-direct.js'
export type {
  DirectAttributeDefinition,
  DirectBindingDefinition,
  DirectNamespace,
  DirectTemplateDefinition,
  DirectTemplateDescriptor,
} from './experimental-direct.js'
export type { InternalHost, TemplatePlan, TemplateScope } from '@benosjs/dom'

import '@benosjs/dom'
import type { Child, InternalHost } from '@benosjs/dom'

const stage = (
  globalThis as typeof globalThis & {
    __benosDomStage?: (
      renderChild: () => Child,
      target: Node,
    ) => {
      owner: object
      nodes: Node[]
      commit: (before?: Node | null) => void
      dispose: () => void
    }
  }
).__benosDomStage
if (!stage) throw new Error('Benos DOM staging is unavailable')
export const prepareInternalStage = stage

const control = (
  globalThis as typeof globalThis & {
    __benosDomControl?: (
      component: object,
      mount: (
        props: Record<PropertyKey, unknown>,
        parent: Node,
        before: Node | null,
        owner: object,
        host: InternalHost,
      ) => Node[],
    ) => void
  }
).__benosDomControl
if (!control) throw new Error('Benos DOM controls are unavailable')
export const registerInternalControl = control

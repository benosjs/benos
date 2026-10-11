import { batch, onCleanup } from '@benosjs/core'
import { createRenderEffect } from '@benosjs/core/internal'

export interface DirectTemplateDefinition {
  readonly id: string
  readonly html: string
  readonly setup: (root: Element, values: readonly unknown[]) => void
}

export interface DirectTemplateDescriptor {
  readonly kind: 'direct-template'
  readonly definition: DirectTemplateDefinition
  readonly values: readonly unknown[]
}

export function directTemplateDefinition(
  id: string,
  html: string,
  setup: DirectTemplateDefinition['setup'],
): DirectTemplateDefinition {
  return { id, html, setup }
}

export function directTemplate(
  definition: DirectTemplateDefinition,
  values: readonly unknown[],
): DirectTemplateDescriptor {
  return { kind: 'direct-template', definition, values }
}

export function directAttr(
  element: Element,
  name: string,
  get: () => unknown,
): void {
  createRenderEffect(() => {
    const value = get()
    if (value === null || value === undefined || value === false)
      element.removeAttribute(name)
    else if (value === true) element.setAttribute(name, '')
    else element.setAttribute(name, String(value))
  })
}

export function directText(node: Node, get: () => unknown): void {
  if (!(node instanceof Text))
    throw new Error('Direct text binding did not point to a text node')
  createRenderEffect(() => {
    node.data = String(get())
  })
}

export function directEvent(
  element: Element,
  name: string,
  get: () => unknown,
): void {
  const listener: EventListener = (event) =>
    batch(() => {
      const handler = get()
      if (typeof handler === 'function') handler.call(element, event)
      else if (
        handler &&
        typeof handler === 'object' &&
        'handleEvent' in handler &&
        typeof handler.handleEvent === 'function'
      )
        handler.handleEvent(event)
    })
  element.addEventListener(name, listener)
  onCleanup(() => element.removeEventListener(name, listener))
}

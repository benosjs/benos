import type { SContainer, SElement, SNode } from './nodes.js'

const voidElements = new Set([
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
  'source',
  'track',
  'wbr',
])
/** Entities are decoded but no markup is parsed: text only, no markers. */
export const rcdataElements = new Set(['title', 'textarea'])
/** Nothing is decoded: dynamic content cannot round-trip through the parser. */
export const rawTextElements = new Set([
  'script',
  'style',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'plaintext',
])
/** Raw text when scripting is on, markup otherwise: static markup only. */
export const noscriptElements = new Set(['noscript'])

const tableSections = new Set(['thead', 'tbody', 'tfoot'])
const blockInParagraph = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
])

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
  )
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&quot;',
  )
}

function elementPath(element: SElement): string {
  const names: string[] = []
  for (
    let current: SContainer | null = element;
    current && current.kind === 1;
    current = current.parent
  )
    names.unshift(current.tag)
  return names.join(' > ')
}

/**
 * Rejects structures the HTML parser would repair, because repaired DOM
 * cannot be claimed positionally. Development only; production relies on
 * mismatch recovery.
 */
export function validateStructure(root: SContainer): void {
  const check = (parent: SContainer, open: Set<string>): void => {
    for (let node = parent.first; node; node = node.next) {
      if (node.kind !== 1) continue
      const tag = node.tag
      const parentTag = parent.kind === 1 ? parent.tag : null
      let problem: string | null = null
      if (tag === 'tr' && !(parentTag && tableSections.has(parentTag)))
        problem = '<tr> must be inside <thead>, <tbody>, or <tfoot>'
      else if ((tag === 'td' || tag === 'th') && parentTag !== 'tr')
        problem = `<${tag}> must be inside <tr>`
      else if (tag === 'col' && parentTag !== 'colgroup')
        problem = '<col> must be inside <colgroup>'
      else if ((tag === 'a' || tag === 'form' || tag === 'p') && open.has(tag))
        problem = `<${tag}> cannot be nested inside <${tag}>`
      else if (open.has('p') && blockInParagraph.has(tag))
        problem = `<${tag}> cannot be inside <p>`
      if (problem)
        throw new Error(
          `Server HTML would be repaired by the parser at ${elementPath(node)}: ${problem}`,
        )
      const next = new Set(open)
      next.add(tag)
      check(node, next)
    }
  }
  check(root, new Set())
}

export function serializeChildren(parent: SContainer): string {
  let out = ''
  for (let node = parent.first; node; node = node.next) out += serialize(node)
  return out
}

function serialize(node: SNode): string {
  if (node.kind === 3) return escapeText(node.data)
  if (node.kind === 8) return `<!--${node.data}-->`
  const tag = node.tag
  let out = `<${tag}`
  // A textarea's value is its text content; the DOM renderer sets the
  // property, which the parser reads back from the content.
  const textareaValue = tag === 'textarea' ? node.attrs.value : undefined
  for (const name in node.attrs) {
    const value = node.attrs[name]
    if (
      value === undefined ||
      (textareaValue !== undefined && name === 'value')
    )
      continue
    out += ` ${name}="${escapeAttribute(value)}"`
  }
  out += '>'
  if (textareaValue !== undefined)
    return `${out}${escapeText(textareaValue)}</${tag}>`
  if (voidElements.has(tag)) {
    if (node.first) throw new Error(`<${tag}> cannot have children`)
    return out
  }
  if (rawTextElements.has(tag)) {
    let data = ''
    for (let child = node.first; child; child = child.next) {
      if (child.kind !== 3)
        throw new Error(`<${tag}> can only contain static text on the server`)
      data += child.data
    }
    if (new RegExp(`</${tag}`, 'i').test(data))
      throw new Error(`<${tag}> text cannot contain its own end tag`)
    return `${out}${data}</${tag}>`
  }
  return `${out}${serializeChildren(node)}</${tag}>`
}

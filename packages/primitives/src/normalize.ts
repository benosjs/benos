import { createNormalizer } from '@zag-js/types'
import type { PropTypes } from '@zag-js/types'

const propMap: Readonly<Record<string, string>> = {
  className: 'class',
  defaultChecked: 'checked',
  defaultValue: 'value',
  htmlFor: 'for',
  onBlur: 'onFocusout',
  onChange: 'onInput',
  onContextMenu: 'onContextmenu',
  onDragStart: 'onDragstart',
  onDoubleClick: 'onDblClick',
  onFocus: 'onFocusin',
  onKeyDown: 'onKeydown',
  onKeyPress: 'onKeypress',
  onKeyUp: 'onKeyup',
  onPointerCancel: 'onPointercancel',
  onPointerDown: 'onPointerdown',
  onPointerEnter: 'onPointerenter',
  onPointerLeave: 'onPointerleave',
  onPointerMove: 'onPointermove',
  onPointerOver: 'onPointerover',
  onPointerUp: 'onPointerup',
  onTransitionEnd: 'onTransitionend',
}

export const normalizeProps = createNormalizer<PropTypes>((props) => {
  const normalized: Record<string, unknown> = Object.create(null)
  for (const [name, value] of Object.entries(props))
    normalized[propMap[name] ?? name] = value
  return normalized
})

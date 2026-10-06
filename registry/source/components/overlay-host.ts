import { onCleanup, onMount, signal } from '@benosjs/core'

/**
 * Portals overlay content beside the application while copying its inherited
 * theme variables and writing direction onto the portal host.
 */
export function createOverlayHost(
  getAnchor: () => HTMLElement | undefined,
  getRequestedDirection: () => 'ltr' | 'rtl' | undefined,
) {
  const target = signal<HTMLElement | null>(null)
  let host: HTMLElement | undefined

  onMount(() => {
    const anchor = getAnchor()
    if (!anchor) return

    const anchorStyle = getComputedStyle(anchor)
    const themeSource = anchor.closest<HTMLElement>('[data-theme]') ?? document.documentElement
    const themeStyle = getComputedStyle(themeSource)
    host = document.createElement('div')
    host.dataset.benosOverlayHost = ''
    host.dataset.theme =
      themeSource.getAttribute('data-theme') === 'dark' || themeStyle.colorScheme.includes('dark')
        ? 'dark'
        : 'light'
    host.style.colorScheme = themeStyle.colorScheme
    host.setAttribute('role', 'region')
    host.setAttribute('aria-label', 'Floating content')

    const requestedDirection = getRequestedDirection()
    const inheritedDirection = anchorStyle.direction
    const directionOwner = anchor.closest<HTMLElement>('[dir]')
    const explicitAncestorDirection = directionOwner?.getAttribute('dir')
    const direction =
      requestedDirection ??
      (inheritedDirection === 'rtl' ||
      (explicitAncestorDirection === 'ltr' && directionOwner !== document.documentElement)
        ? inheritedDirection
        : undefined)
    if (direction) host.setAttribute('dir', direction)

    for (let index = 0; index < anchorStyle.length; index += 1) {
      const name = anchorStyle.item(index)
      if (name.startsWith('--benos-'))
        host.style.setProperty(name, anchorStyle.getPropertyValue(name))
    }

    document.body.append(host)
    target.set(host)
  })

  onCleanup(() => {
    target.set(null)
    host?.remove()
  })

  return target
}

const WINDOWS_FORBIDDEN = /[<>:"|?*]/
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function isSafePosixRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[a-zA-Z]:/.test(value)
  ) {
    return false
  }

  const segments = value.split('/')
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      !WINDOWS_FORBIDDEN.test(segment) &&
      !hasControlCharacter(segment) &&
      !WINDOWS_DEVICE_NAME.test(segment) &&
      !segment.endsWith('.') &&
      !segment.endsWith(' '),
  )
}

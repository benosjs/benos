function splitText(text) {
  if (text.length === 0)
    return { lines: [], newline: '\n', hasNewline: false, terminated: false }
  const matches = [...text.matchAll(/\r\n|\n|\r/g)]
  const counts = new Map()
  for (const match of matches)
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1)
  const newline =
    [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '\n'
  const terminated =
    matches.length > 0 &&
    matches.at(-1).index + matches.at(-1)[0].length === text.length
  return {
    lines: text.split(/\r\n|\n|\r/).slice(0, terminated ? -1 : undefined),
    newline,
    hasNewline: matches.length > 0,
    terminated,
  }
}

function get(map, key) {
  return map.get(key) ?? 0
}

function myersOperations(before, after) {
  const max = before.length + after.length
  const frontier = new Map([[1, 0]])
  const trace = []

  for (let distance = 0; distance <= max; distance += 1) {
    const next = new Map()
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x
      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          get(frontier, diagonal - 1) < get(frontier, diagonal + 1))
      ) {
        x = get(frontier, diagonal + 1)
      } else {
        x = get(frontier, diagonal - 1) + 1
      }
      let y = x - diagonal
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x += 1
        y += 1
      }
      next.set(diagonal, x)
      if (x >= before.length && y >= after.length) {
        trace.push(next)
        return backtrack(trace, before, after)
      }
    }
    trace.push(next)
    frontier.clear()
    for (const [diagonal, x] of next) frontier.set(diagonal, x)
  }
  return []
}

function backtrack(trace, before, after) {
  let x = before.length
  let y = after.length
  const operations = []

  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    const frontier = trace[distance - 1]
    const diagonal = x - y
    const previousDiagonal =
      diagonal === -distance ||
      (diagonal !== distance &&
        get(frontier, diagonal - 1) < get(frontier, diagonal + 1))
        ? diagonal + 1
        : diagonal - 1
    const previousX = get(frontier, previousDiagonal)
    const previousY = previousX - previousDiagonal

    while (x > previousX && y > previousY) {
      operations.push({ type: 'equal', value: before[x - 1] })
      x -= 1
      y -= 1
    }
    if (x === previousX) {
      operations.push({ type: 'insert', value: after[y - 1] })
      y -= 1
    } else {
      operations.push({ type: 'delete', value: before[x - 1] })
      x -= 1
    }
  }
  while (x > 0 && y > 0) {
    operations.push({ type: 'equal', value: before[x - 1] })
    x -= 1
    y -= 1
  }
  while (x > 0) {
    operations.push({ type: 'delete', value: before[x - 1] })
    x -= 1
  }
  while (y > 0) {
    operations.push({ type: 'insert', value: after[y - 1] })
    y -= 1
  }
  return operations.reverse()
}

function changesFrom(before, after) {
  const operations = myersOperations(before, after)
  const changes = []
  let baseIndex = 0
  let active
  const finish = () => {
    if (active) changes.push(active)
    active = undefined
  }

  for (const operation of operations) {
    if (operation.type === 'equal') {
      finish()
      baseIndex += 1
    } else {
      active ??= { start: baseIndex, end: baseIndex, lines: [] }
      if (operation.type === 'delete') {
        active.end += 1
        baseIndex += 1
      } else {
        active.lines.push(operation.value)
      }
    }
  }
  finish()
  return changes
}

function sameChange(left, right) {
  return (
    left.start === right.start &&
    left.end === right.end &&
    left.lines.length === right.lines.length &&
    left.lines.every((line, index) => line === right.lines[index])
  )
}

function changesOverlap(left, right) {
  if (sameChange(left, right)) return false
  const leftInsertion = left.start === left.end
  const rightInsertion = right.start === right.end
  if (leftInsertion && rightInsertion) return left.start === right.start
  if (leftInsertion) return left.start > right.start && left.start < right.end
  if (rightInsertion) return right.start > left.start && right.start < left.end
  return Math.max(left.start, right.start) < Math.min(left.end, right.end)
}

export function compareText(baseText, localText, incomingText) {
  const base = splitText(baseText).lines
  const local = splitText(localText).lines
  const incoming = splitText(incomingText).lines
  return {
    localChanged:
      local.length !== base.length ||
      local.some((line, index) => line !== base[index]) ||
      splitText(localText).terminated !== splitText(baseText).terminated,
    incomingChanged:
      incoming.length !== base.length ||
      incoming.some((line, index) => line !== base[index]) ||
      splitText(incomingText).terminated !== splitText(baseText).terminated,
  }
}

export function mergeText(baseText, localText, incomingText) {
  if (localText === incomingText) return { merged: localText, conflicts: false }
  const baseParts = splitText(baseText)
  const localParts = splitText(localText)
  const incomingParts = splitText(incomingText)
  const localChanges = changesFrom(baseParts.lines, localParts.lines)
  const incomingChanges = changesFrom(baseParts.lines, incomingParts.lines)

  for (const local of localChanges) {
    for (const incoming of incomingChanges) {
      if (changesOverlap(local, incoming)) return { conflicts: true }
    }
  }

  const changes = []
  for (const change of [...localChanges, ...incomingChanges]) {
    if (!changes.some((prior) => sameChange(prior, change)))
      changes.push(change)
  }
  changes.sort(
    (left, right) => left.start - right.start || left.end - right.end,
  )

  const lines = []
  let baseIndex = 0
  for (const change of changes) {
    if (change.start < baseIndex) return { conflicts: true }
    lines.push(...baseParts.lines.slice(baseIndex, change.start))
    lines.push(...change.lines)
    baseIndex = change.end
  }
  lines.push(...baseParts.lines.slice(baseIndex))
  const newline = localParts.hasNewline
    ? localParts.newline
    : incomingParts.newline
  const { localChanged } = compareText(baseText, localText, incomingText)
  const terminated = localChanged
    ? localParts.terminated
    : incomingParts.terminated
  return {
    conflicts: false,
    merged: lines.join(newline) + (terminated ? newline : ''),
  }
}

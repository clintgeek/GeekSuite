export function detectMode(input) {
  const trimmed = input.trimStart()

  if (trimmed.startsWith('>')) {
    return { mode: 'task', query: trimmed.slice(1).trimStart() }
  }

  if (trimmed.startsWith('<')) {
    return { mode: 'note', query: trimmed.slice(1).trimStart() }
  }

  if (trimmed.startsWith('?')) {
    return { mode: 'suite', query: trimmed.slice(1).trimStart() }
  }

  return { mode: 'web', query: input }
}

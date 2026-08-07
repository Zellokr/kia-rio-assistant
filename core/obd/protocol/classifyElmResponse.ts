export type ElmResponseKind
  = | 'obd-data'
    | 'ok'
    | 'adapter-id'
    | 'text'
    | 'no-data'
    | 'stopped'
    | 'unable-to-connect'
    | 'bus-init-error'
    | 'unknown-command'
    | 'empty'

export function classifyElmResponse(
  response: string
): ElmResponseKind {
  const text = response.trim()

  if (!text) {
    return 'empty'
  }

  const upper = text.toUpperCase()

  if (upper.includes('UNABLE TO CONNECT')) {
    return 'unable-to-connect'
  }

  if (
    upper.includes('BUS INIT')
    && upper.includes('ERROR')
  ) {
    return 'bus-init-error'
  }

  if (upper.includes('NO DATA')) {
    return 'no-data'
  }

  if (upper.includes('STOPPED')) {
    return 'stopped'
  }

  if (upper === '?') {
    return 'unknown-command'
  }

  if (upper === 'OK') {
    return 'ok'
  }

  if (upper.startsWith('ELM327')) {
    return 'adapter-id'
  }

  const withoutSearching = upper
    .replace(/SEARCHING\.{0,3}/g, '')
    .trim()

  if (
    /^(?:[0-9A-F]{2}\s+)*[0-9A-F]{2}$/
      .test(withoutSearching)
  ) {
    return 'obd-data'
  }

  return 'text'
}

export function isElmErrorResponse(
  kind: ElmResponseKind
): boolean {
  return [
    'no-data',
    'stopped',
    'unable-to-connect',
    'bus-init-error',
    'unknown-command',
    'empty'
  ].includes(kind)
}

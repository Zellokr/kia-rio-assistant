export function normalizeElmResponse(
  input: string,
  options?: { echoCommand?: string }
): string {
  const lines = input
    // Marginal adapters and flaky BLE links emit stray NUL padding and other
    // C0 control bytes (notably around the ATZ reset banner). Strip them so
    // they never leak into normalizedText and corrupt classification/decoding.
    // TAB/LF/CR are preserved: TAB collapses as whitespace below and CR/LF
    // drive the line split.
    // eslint-disable-next-line no-control-regex -- intentional C0/DEL strip
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const echoCommand = options?.echoCommand?.trim().toLowerCase()

  if (
    echoCommand
    && lines[0]?.toLowerCase() === echoCommand
  ) {
    lines.shift()
  }

  return lines
    .filter(line => !/^SEARCHING\.{0,3}$/i.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

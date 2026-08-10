export function normalizeElmResponse(
  input: string,
  options?: { echoCommand?: string }
): string {
  const lines = input
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

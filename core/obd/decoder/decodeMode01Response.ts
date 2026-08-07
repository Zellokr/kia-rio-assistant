export interface DecodedPidValue {
  pid: string
  key: string
  label: string
  value: number
  unit: string
}

function parseHexBytes(
  response: string
): number[] {
  const tokens = response
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return tokens.map((token) => {
    if (!/^[0-9A-Fa-f]{2}$/.test(token)) {
      throw new Error(
        `Invalid OBD hex byte: ${token}`
      )
    }

    return Number.parseInt(token, 16)
  })
}

export function decodeMode01Response(
  response: string
): DecodedPidValue | null {
  const bytes = parseHexBytes(response)

  if (bytes.length < 2) {
    return null
  }

  // 0x41 = respuesta al modo 01
  if (bytes[0] !== 0x41) {
    return null
  }

  const pid = bytes[1]

  switch (pid) {
    // PID 0C - Engine RPM
    case 0x0C: {
      if (bytes.length < 4) {
        throw new Error(
          'Incomplete response for PID 010C'
        )
      }

      const a = bytes[2]!
      const b = bytes[3]!

      return {
        pid: '010C',
        key: 'engineRpm',
        label: 'RPM del motor',
        value: ((a * 256) + b) / 4,
        unit: 'rpm'
      }
    }

    // PID 05 - Engine coolant temperature
    case 0x05: {
      if (bytes.length < 3) {
        throw new Error(
          'Incomplete response for PID 0105'
        )
      }

      const a = bytes[2]!

      return {
        pid: '0105',
        key: 'coolantTemperature',
        label: 'Temperatura del refrigerante',
        value: a - 40,
        unit: '°C'
      }
    }

    default:
      return null
  }
}

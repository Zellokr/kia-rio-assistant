import { parseHexBytes } from './parseHexBytes'

export interface DecodedPidValue {
  pid: string
  key: string
  label: string
  value: number
  unit: string
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

    // PID 04 - Calculated engine load
    case 0x04: {
      if (bytes.length < 3) {
        throw new Error(
          'Incomplete response for PID 0104'
        )
      }

      const a = bytes[2]!

      return {
        pid: '0104',
        key: 'engineLoad',
        label: 'Carga del motor',
        value: (a * 100) / 255,
        unit: '%'
      }
    }

    // PID 0D - Vehicle speed
    case 0x0D: {
      if (bytes.length < 3) {
        throw new Error(
          'Incomplete response for PID 010D'
        )
      }

      const a = bytes[2]!

      return {
        pid: '010D',
        key: 'vehicleSpeed',
        label: 'Velocidad',
        value: a,
        unit: 'km/h'
      }
    }

    // PID 11 - Throttle position
    case 0x11: {
      if (bytes.length < 3) {
        throw new Error(
          'Incomplete response for PID 0111'
        )
      }

      const a = bytes[2]!

      return {
        pid: '0111',
        key: 'throttlePosition',
        label: 'Posición del acelerador',
        value: (a * 100) / 255,
        unit: '%'
      }
    }

    default:
      return null
  }
}

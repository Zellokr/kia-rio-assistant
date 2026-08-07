import type {
  ElmCommandResult,
  ElmCommandExecutor

} from './ElmCommandExecutor'

export interface ElmInitializationResult {
  commands: ElmCommandResult[]
  initialized: boolean
}

export async function initializeElm327(
  executor: ElmCommandExecutor
): Promise<ElmInitializationResult> {
  const results: ElmCommandResult[] = []

  // Reset: dejamos más tiempo porque un adaptador real
  // puede tardar algo más en reiniciarse.
  results.push(
    await executor.execute('ATZ', 5000)
  )

  const setupCommands = [
    'ATE0', // desactivar eco
    'ATL0', // desactivar saltos de línea
    'ATS0', // desactivar espacios
    'ATH0', // ocultar cabeceras
    'ATSP0' // selección automática del protocolo
  ]

  for (const command of setupCommands) {
    const result = await executor.execute(
      command,
      3000
    )

    results.push(result)
  }

  return {
    commands: results,
    initialized: true
  }
}

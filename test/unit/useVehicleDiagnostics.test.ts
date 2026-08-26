import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  useVehicleDiagnostics
} from '../../app/composables/useVehicleDiagnostics'
import type {
  DtcCatalog
} from '../../core/obd/diagnostics/ports'
import { ElmResponseError } from '../../core/obd/protocol/ElmResponseError'
import type {
  DtcCommandExecutor
} from '../../core/obd/usecases/readDiagnosticCodes'

/** `43 04 20 …` decodes to P0420, which the generic catalogue curates. */
const CATALOGUED_STORED = '43 04 20 00 00 00 00'
/** `43 01 43 …` decodes to P0143, which it deliberately does not. */
const UNCATALOGUED_STORED = '43 01 43 00 00 00 00'
const EMPTY_PENDING = '47 00 00 00 00 00 00'

function executorAnswering(
  byCommand: Record<string, string | Error>
): DtcCommandExecutor {
  return {
    execute: vi.fn(async (command: string) => {
      const answer = byCommand[command]

      if (answer === undefined) {
        throw new Error(`unexpected command ${command}`)
      }

      if (answer instanceof Error) {
        throw answer
      }

      return { normalizedText: answer }
    })
  }
}

function harness(
  executor: DtcCommandExecutor,
  options: {
    adapterConnected?: boolean
    catalog?: DtcCatalog
  } = {}
) {
  return useVehicleDiagnostics({
    executor: () => executor,
    adapterConnected: () => options.adapterConnected ?? true,
    ...(options.catalog ? { catalog: options.catalog } : {})
  })
}

describe('useVehicleDiagnostics', () => {
  it('has nothing to assess before anything is read', () => {
    const diagnostics = harness(executorAnswering({}))

    expect(diagnostics.reads.value).toEqual([])
    expect(diagnostics.assessment.value).toBeUndefined()
    expect(diagnostics.busy.value).toBe(false)
  })

  it('sends the command for the mode it was asked for', async () => {
    const executor = executorAnswering({ '07': EMPTY_PENDING })
    const diagnostics = harness(executor)

    await diagnostics.read('pending')

    expect(executor.execute).toHaveBeenCalledWith('07')
  })

  it('assesses a catalogued stored code', async () => {
    const diagnostics = harness(
      executorAnswering({ '03': CATALOGUED_STORED })
    )

    await diagnostics.read('stored')

    expect(diagnostics.assessment.value).toMatchObject({
      severity: 'warning'
    })
    expect(
      diagnostics.assessment.value?.possibleCauses.length
    ).toBeGreaterThan(0)
  })

  it('falls back honestly for a code the catalogue does not curate', async () => {
    const diagnostics = harness(
      executorAnswering({ '03': UNCATALOGUED_STORED })
    )

    await diagnostics.read('stored')

    expect(diagnostics.assessment.value?.severity).toBe('warning')
    expect(diagnostics.assessment.value?.possibleCauses).toEqual([])
    expect(
      diagnostics.assessment.value?.limitations.some(limitation =>
        limitation.includes('P0143')
      )
    ).toBe(true)
  })

  /**
   * The behaviour this whole slice exists to fix. Reading Mode 03 through
   * the executor alone turns a `NO DATA` into a thrown error, and the lab
   * shows the driver a failure. It is not a failure: the vehicle said
   * nothing, which is a reportable state of its own.
   */
  it('reports a NO DATA response as unconfirmed rather than throwing', async () => {
    const diagnostics = harness(
      executorAnswering({
        '03': new ElmResponseError('ELM327 no-data: NO DATA', 'no-data')
      })
    )

    await expect(diagnostics.read('stored')).resolves.toBeUndefined()

    expect(diagnostics.reads.value).toEqual([
      { kind: 'unconfirmed', state: 'stored', reason: 'no-data' }
    ])
    expect(diagnostics.errorMessage.value).toBe('')
  })

  it('never reports an unconfirmed read as an absence of codes', async () => {
    const diagnostics = harness(
      executorAnswering({
        '07': new ElmResponseError('ELM327 no-data: NO DATA', 'no-data')
      })
    )

    await diagnostics.read('pending')

    const joined
      = diagnostics.assessment.value?.limitations.join(' ') ?? ''

    expect(joined).toContain('sin confirmar')
    expect(joined).not.toContain('sin pendientes')
  })

  it('reports an unsupported mode as unconfirmed, not as a fault', async () => {
    const diagnostics = harness(
      executorAnswering({
        '0A': new ElmResponseError('ELM327 unknown-command: ?', 'unknown-command')
      })
    )

    await diagnostics.read('permanent')

    expect(diagnostics.reads.value[0]).toEqual({
      kind: 'unconfirmed',
      state: 'permanent',
      reason: 'unsupported-mode'
    })
  })

  it('accumulates one read per mode and replaces a repeated one', async () => {
    const diagnostics = harness(
      executorAnswering({
        '03': CATALOGUED_STORED,
        '07': EMPTY_PENDING
      })
    )

    await diagnostics.read('stored')
    await diagnostics.read('pending')
    await diagnostics.read('stored')

    expect(diagnostics.reads.value).toHaveLength(2)
    expect(
      diagnostics.reads.value.map(read => read.state)
    ).toEqual(['stored', 'pending'])
  })

  it('reads all three modes in order', async () => {
    const executor = executorAnswering({
      '03': CATALOGUED_STORED,
      '07': EMPTY_PENDING,
      '0A': '4A 00 00 00 00 00 00'
    })
    const diagnostics = harness(executor)

    await diagnostics.readAll()

    expect(
      vi.mocked(executor.execute).mock.calls.map(call => call[0])
    ).toEqual(['03', '07', '0A'])
    expect(diagnostics.reads.value).toHaveLength(3)
  })

  it('marks itself busy while a read is in flight', async () => {
    const diagnostics = harness(
      executorAnswering({ '03': CATALOGUED_STORED })
    )

    const pending = diagnostics.read('stored')

    expect(diagnostics.busy.value).toBe(true)

    await pending

    expect(diagnostics.busy.value).toBe(false)
  })

  it('ignores a second read while one is already running', async () => {
    const executor = executorAnswering({ '03': CATALOGUED_STORED })
    const diagnostics = harness(executor)

    const first = diagnostics.read('stored')
    await diagnostics.read('stored')
    await first

    expect(executor.execute).toHaveBeenCalledTimes(1)
  })

  it('caps confidence when no adapter is connected', async () => {
    const diagnostics = harness(
      executorAnswering({ '03': CATALOGUED_STORED }),
      { adapterConnected: false }
    )

    await diagnostics.read('stored')

    expect(diagnostics.assessment.value?.confidence).toBe('low')
  })

  it('clears everything on reset', async () => {
    const diagnostics = harness(
      executorAnswering({ '03': CATALOGUED_STORED })
    )

    await diagnostics.read('stored')
    diagnostics.reset()

    expect(diagnostics.reads.value).toEqual([])
    expect(diagnostics.assessment.value).toBeUndefined()
  })

  it('uses an injected catalogue over the default one', async () => {
    const catalog: DtcCatalog = {
      lookup: () => ({
        kind: 'catalog-entry',
        entry: {
          code: 'P0420',
          title: 'Entrada inyectada',
          severity: 'critical',
          possibleCauses: ['Causa inyectada'],
          recommendedChecks: ['Comprobación inyectada'],
          immediateAction: 'Detén el vehículo.',
          subsystems: ['engine']
        }
      })
    }
    const diagnostics = harness(
      executorAnswering({ '03': CATALOGUED_STORED }),
      { catalog }
    )

    await diagnostics.read('stored')

    expect(diagnostics.assessment.value?.severity).toBe('critical')
    expect(diagnostics.assessment.value?.possibleCauses).toEqual([
      'Causa inyectada'
    ])
  })

  /**
   * A transport that is gone is a real failure and must not be dressed up
   * as a diagnostic outcome — the driver needs to know the read did not
   * happen, not that the car reported nothing.
   */
  it('surfaces a transport failure as an error message', async () => {
    const diagnostics = harness(
      executorAnswering({
        '03': new Error('OBD transport is not connected')
      })
    )

    await diagnostics.read('stored')

    expect(diagnostics.reads.value[0]).toMatchObject({
      kind: 'failed',
      reason: 'transport'
    })
    expect(diagnostics.errorMessage.value.length).toBeGreaterThan(0)
  })
})

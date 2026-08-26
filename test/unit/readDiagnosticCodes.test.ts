import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  DTC_MODES
} from '../../core/obd/decoder/decodeDtcResponse'
import {
  ElmResponseError
} from '../../core/obd/protocol/ElmResponseError'
import {
  ElmTimeoutError
} from '../../core/obd/protocol/ElmTimeoutError'
import {
  readDiagnosticCodes
} from '../../core/obd/usecases/readDiagnosticCodes'
import type {
  DtcCommandExecutor
} from '../../core/obd/usecases/readDiagnosticCodes'

function resolvingExecutor(
  normalizedText: string
): DtcCommandExecutor {
  return {
    execute: vi.fn(
      async () => ({ normalizedText })
    )
  }
}

function rejectingExecutor(
  error: Error
): DtcCommandExecutor {
  return {
    execute: vi.fn(
      async () => {
        throw error
      }
    )
  }
}

const PADDED_EMPTY_FRAMES = {
  stored: '43 00 00 00 00 00 00',
  pending: '47 00 00 00 00 00 00',
  permanent: '4A 00 00 00 00 00 00'
} as const

const SINGLE_CODE_FRAMES = {
  stored: '43 01 43 00 00 00 00',
  pending: '47 01 43 00 00 00 00',
  permanent: '4A 01 43 00 00 00 00'
} as const

describe('readDiagnosticCodes', () => {
  it.each([
    ['stored', '03'],
    ['pending', '07'],
    ['permanent', '0A']
  ] as const)(
    'sends the %s mode command %s exactly once',
    async (modeKey, command) => {
      const executor = resolvingExecutor(
        PADDED_EMPTY_FRAMES[modeKey]
      )

      await readDiagnosticCodes(executor, DTC_MODES[modeKey])

      expect(executor.execute).toHaveBeenCalledTimes(1)
      expect(executor.execute).toHaveBeenCalledWith(command)
    }
  )

  it.each([
    'stored',
    'pending',
    'permanent'
  ] as const)(
    'reports a padded empty %s frame as a vehicle-confirmed zero',
    async (modeKey) => {
      const outcome = await readDiagnosticCodes(
        resolvingExecutor(PADDED_EMPTY_FRAMES[modeKey]),
        DTC_MODES[modeKey]
      )

      expect(outcome).toEqual({
        kind: 'no-codes-reported',
        state: DTC_MODES[modeKey].state
      })
    }
  )

  it.each([
    'stored',
    'pending',
    'permanent'
  ] as const)(
    'returns decoded %s codes with the state taken from the mode',
    async (modeKey) => {
      const outcome = await readDiagnosticCodes(
        resolvingExecutor(SINGLE_CODE_FRAMES[modeKey]),
        DTC_MODES[modeKey]
      )

      expect(outcome).toEqual({
        kind: 'codes',
        state: DTC_MODES[modeKey].state,
        complete: true,
        codes: [
          {
            code: 'P0143',
            system: 'P',
            type: 'generic'
          }
        ]
      })
    }
  )

  /**
   * Constraint 6: a `NO DATA` rejection is NOT a verified zero. The ECU may
   * simply not answer this mode, so the only honest report is "unconfirmed".
   * See docs/DTC_PHYSICAL_VALIDATION.md check 2 — this is unverified against
   * the real vehicle in either direction.
   */
  it.each([
    'stored',
    'pending',
    'permanent'
  ] as const)(
    'never turns a %s NO DATA rejection into a verified zero',
    async (modeKey) => {
      const outcome = await readDiagnosticCodes(
        rejectingExecutor(
          new ElmResponseError('ELM327 no-data: NO DATA', 'no-data')
        ),
        DTC_MODES[modeKey]
      )

      expect(outcome).toEqual({
        kind: 'unconfirmed',
        state: DTC_MODES[modeKey].state,
        reason: 'no-data'
      })
      expect(outcome.kind).not.toBe('no-codes-reported')
    }
  )

  it.each([
    'pending',
    'permanent'
  ] as const)(
    'reports an unsupported %s mode as unconfirmed, not as a failure',
    async (modeKey) => {
      const outcome = await readDiagnosticCodes(
        rejectingExecutor(
          new ElmResponseError('ELM327 unknown-command: ?', 'unknown-command')
        ),
        DTC_MODES[modeKey]
      )

      expect(outcome).toEqual({
        kind: 'unconfirmed',
        state: DTC_MODES[modeKey].state,
        reason: 'unsupported-mode'
      })
    }
  )

  it('reports a timeout as a failed read', async () => {
    const outcome = await readDiagnosticCodes(
      rejectingExecutor(
        new ElmTimeoutError(
          'Timeout waiting for ELM327 response to 03'
        )
      ),
      DTC_MODES.stored
    )

    expect(outcome).toEqual({
      kind: 'failed',
      state: 'stored',
      reason: 'timeout'
    })
  })

  it('reports a lost link as a transport failure', async () => {
    const outcome = await readDiagnosticCodes(
      rejectingExecutor(
        new ElmResponseError(
          'ELM327 unable-to-connect: UNABLE TO CONNECT',
          'unable-to-connect'
        )
      ),
      DTC_MODES.stored
    )

    expect(outcome).toEqual({
      kind: 'failed',
      state: 'stored',
      reason: 'transport'
    })
  })

  it.each([
    'stopped',
    'bus-init-error',
    'empty'
  ] as const)(
    'reports a %s rejection as a protocol failure',
    async (responseKind) => {
      const outcome = await readDiagnosticCodes(
        rejectingExecutor(
          new ElmResponseError(`ELM327 ${responseKind}:`, responseKind)
        ),
        DTC_MODES.stored
      )

      expect(outcome).toEqual({
        kind: 'failed',
        state: 'stored',
        reason: 'protocol'
      })
    }
  )

  it('reports a non-ELM rejection as a transport failure', async () => {
    const outcome = await readDiagnosticCodes(
      rejectingExecutor(
        new Error('OBD transport is not connected')
      ),
      DTC_MODES.stored
    )

    expect(outcome).toEqual({
      kind: 'failed',
      state: 'stored',
      reason: 'transport'
    })
  })

  /**
   * The decoder refuses to guess about multi-frame framing (check 1). That
   * refusal must survive the use case: the codes it did decode are reported,
   * flagged as not complete, so downstream confidence can be capped.
   */
  it('propagates an incomplete multi-frame decode instead of trusting it', async () => {
    const outcome = await readDiagnosticCodes(
      resolvingExecutor('43 01 43 01 44 01 45 01 46'),
      DTC_MODES.stored
    )

    expect(outcome).toMatchObject({
      kind: 'codes',
      state: 'stored',
      complete: false,
      incompleteReason: 'unvalidated-multi-frame'
    })
    expect(
      outcome.kind === 'codes' && outcome.codes.map(code => code.code)
    ).toEqual(['P0143', 'P0144', 'P0145', 'P0146'])
  })

  it('flags a trailing odd byte as an incomplete read', async () => {
    const outcome = await readDiagnosticCodes(
      resolvingExecutor('43 01 43 00'),
      DTC_MODES.stored
    )

    expect(outcome).toMatchObject({
      kind: 'codes',
      state: 'stored',
      complete: false,
      incompleteReason: 'trailing-odd-byte'
    })
  })

  it('reports an undecodable frame as a protocol failure', async () => {
    const outcome = await readDiagnosticCodes(
      resolvingExecutor('41 00 00 00 00 00'),
      DTC_MODES.stored
    )

    expect(outcome).toEqual({
      kind: 'failed',
      state: 'stored',
      reason: 'protocol'
    })
  })
})

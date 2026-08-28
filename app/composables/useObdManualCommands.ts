import { computed, ref } from 'vue'

import {
  DTC_MODES,
  decodeDtcResponse
} from '~~/core/obd/decoder/decodeDtcResponse'
import {
  decodeMode01Response
} from '~~/core/obd/decoder/decodeMode01Response'
import {
  decodeSupportedPids
} from '~~/core/obd/decoder/decodeSupportedPids'
import type { DtcObservation } from '~~/core/obd/dtc/DtcCode'
import type {
  ObdErrorPhase,
  ObdSessionLog
} from '~~/core/obd/logging/ObdSessionLog'
import {
  PHYSICAL_ALLOWED_COMMANDS
} from '~~/core/obd/policy/PhysicalObdCommandPolicy'
import type {
  ElmCommandExecutor,
  ElmCommandResult
} from '~~/core/obd/protocol/ElmCommandExecutor'
import {
  isPhysicalTransportKind
} from '~~/core/obd/transport/ObdTransport'
import type {
  ObdTransportMetadata
} from '~~/core/obd/transport/ObdTransport'
import type { ObdTransportChoice } from '~/utils/obdTransportChoice'

/**
 * `0198` is the adapter's own status word rather than a vehicle read, so it
 * answers immediately or not at all; the rest are vehicle round trips.
 */
const ADAPTER_STATUS_COMMAND = '0198'
const ADAPTER_STATUS_TIMEOUT_MS = 1000
const DEFAULT_COMMAND_TIMEOUT_MS = 3000

const SIMULATED_COMMANDS = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATS0',
  'ATH0',
  'ATSP0',
  '0100',
  '010C',
  '0105',
  '0120',
  '0199',
  '0198',
  '03TEST',
  '03',
  '0104',
  '010D',
  '0111'
]

const PHYSICAL_COMMANDS: string[] = [...PHYSICAL_ALLOWED_COMMANDS]

/** The Mode 01 commands that answer with a supported-PID bitmask. */
const SUPPORTED_PID_COMMANDS = [
  '0100',
  '0120',
  '0140',
  '0160',
  '0180',
  '01A0',
  '01C0'
]

/** The manual commands whose answer carries stored trouble codes. */
const STORED_DTC_COMMANDS = ['03', '03TEST']

const QUEUE_TEST_COMMANDS = ['010C', '0105', '03']

export interface ObdManualCommandsOptions {
  readonly sessionLog: ObdSessionLog
  readonly transportChoice: { value: ObdTransportChoice }
  /** Read late: the lab swaps its executor whenever the adapter changes. */
  readonly getExecutor: () => ElmCommandExecutor
  readonly getTransportKind: () => ObdTransportMetadata['kind']
  readonly recordError: (
    error: unknown,
    phase: ObdErrorPhase,
    command?: string
  ) => void
  readonly persistObservations: (
    observations: readonly DtcObservation[]
  ) => void
  /**
   * Shared with telemetry polling, because a Mode 01 answer updates the same
   * store whether a driver typed it or the scheduler asked for it.
   */
  readonly decodePid: (
    result: ElmCommandResult,
    source: 'manual' | 'telemetry'
  ) => void
}

/**
 * The raw protocol box: it sends what is typed and shows what came back.
 *
 * Deliberately not the driver-facing diagnostic read. That path goes through
 * `readDiagnosticCodes` and distinguishes a vehicle with nothing to report
 * from a vehicle that said nothing at all; this one does not interpret, it
 * reports. Keeping them apart is what stops a raw tool from being read as a
 * verdict about a car.
 *
 * The physical allowlist is enforced here as well as in the transport. This
 * is the check that keeps a command the policy forbids from ever being
 * written, and it fails loudly into the log rather than silently dropping.
 */
export function useObdManualCommands(options: ObdManualCommandsOptions) {
  const {
    sessionLog,
    transportChoice,
    getExecutor,
    getTransportKind,
    recordError,
    persistObservations,
    decodePid
  } = options

  const selectedCommand = ref('ATZ')

  const commands = computed(() => (
    isPhysicalTransportKind(transportChoice.value)
      ? PHYSICAL_COMMANDS
      : SIMULATED_COMMANDS
  ))

  function recordManualDtcResponse(result: ElmCommandResult): void {
    try {
      const dtcResult = decodeDtcResponse(
        result.normalizedText,
        DTC_MODES.stored
      )
      const observedAt = new Date().toISOString()
      const observations = dtcResult.codes.map(code => ({
        ...code,
        state: dtcResult.state,
        observedAt
      }))

      sessionLog.record({
        type: 'decoded-value',
        source: 'manual',
        command: result.command,
        latencyMs: result.latencyMs,
        decoded: {
          kind: 'dtc',
          observations
        }
      })

      persistObservations(observations)
    } catch (error) {
      recordError(error, 'decode', result.command)
    }
  }

  function recordManualSupportedPids(result: ElmCommandResult): void {
    try {
      const supported = decodeSupportedPids(result.normalizedText)

      sessionLog.record({
        type: 'capability-discovery',
        command: result.command,
        pids: supported.pids,
        rangeStart: supported.rangeStart,
        rangeEnd: supported.rangeEnd,
        hasNextRange: supported.hasNextRange
      })
    } catch (error) {
      recordError(error, 'decode', result.command)
    }
  }

  async function sendCommand(): Promise<void> {
    const command = selectedCommand.value

    if (
      isPhysicalTransportKind(getTransportKind())
      && !PHYSICAL_COMMANDS.includes(command)
    ) {
      recordError(
        new Error('Command is not allowed on the physical transport'),
        'transport-write',
        command
      )

      return
    }

    try {
      const timeoutMs = command === ADAPTER_STATUS_COMMAND
        ? ADAPTER_STATUS_TIMEOUT_MS
        : DEFAULT_COMMAND_TIMEOUT_MS

      const result = await getExecutor().execute(command, timeoutMs)

      decodePid(result, 'manual')

      if (STORED_DTC_COMMANDS.includes(result.command)) {
        recordManualDtcResponse(result)
      }

      if (SUPPORTED_PID_COMMANDS.includes(result.command)) {
        recordManualSupportedPids(result)
      }
    } catch {
      // Protocol errors are already recorded by the executor.
    }
  }

  /**
   * Queues three commands at once to prove the executor serialises them.
   *
   * It decodes and logs, but deliberately does NOT go through `decodePid`:
   * that updates the live telemetry store, and a gauge is a claim about
   * what the vehicle is doing now, not about what a protocol exercise
   * happened to read on its way past.
   */
  async function runQueueTest(): Promise<void> {
    sessionLog.record({
      type: 'activity',
      activity: 'queue-test-started'
    })

    const promises = QUEUE_TEST_COMMANDS.map(
      command => getExecutor().execute(command)
    )

    try {
      const results = await Promise.all(promises)

      for (const result of results) {
        try {
          const decoded = decodeMode01Response(result.normalizedText)

          if (decoded) {
            sessionLog.record({
              type: 'decoded-value',
              source: 'manual',
              command: result.command,
              latencyMs: result.latencyMs,
              decoded: {
                kind: 'pid',
                ...decoded
              }
            })
          }
        } catch (error) {
          recordError(error, 'decode', result.command)
        }
      }

      sessionLog.record({
        type: 'activity',
        activity: 'queue-test-completed'
      })
    } catch {
      // Protocol errors are already recorded by the executor.
    }
  }

  return {
    selectedCommand,
    commands,
    sendCommand,
    runQueueTest
  }
}

import { computed, ref } from 'vue'

import {
  saeGenericDtcCatalog
} from '../../catalog/dtc-sae-generic'
import {
  assessDiagnostics
} from '../../core/obd/diagnostics/assessDiagnostics'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import type { DtcCatalog } from '../../core/obd/diagnostics/ports'
import {
  DTC_MODES,
  type DtcModeDescriptor
} from '../../core/obd/decoder/decodeDtcResponse'
import {
  readDiagnosticCodes
} from '../../core/obd/usecases/readDiagnosticCodes'
import type {
  DtcCommandExecutor,
  DtcReadOutcome
} from '../../core/obd/usecases/readDiagnosticCodes'

export type DtcModeKey = keyof typeof DTC_MODES

/** Fixed order: stored, then pending, then permanent. */
const MODE_ORDER: readonly DtcModeKey[] = [
  'stored',
  'pending',
  'permanent'
]

export interface VehicleDiagnosticsOptions {
  readonly executor: () => DtcCommandExecutor
  readonly adapterConnected: () => boolean
  readonly catalog?: DtcCatalog
}

/**
 * Holds the diagnostic reads taken this session and the assessment they
 * add up to.
 *
 * The executor is supplied through a getter rather than captured, because
 * the lab replaces its executor whenever the transport changes; capturing
 * one would quietly keep reading through a disposed object.
 *
 * The distinction this composable protects is the one the previous wiring
 * lost. Reading through the executor alone made a `NO DATA` rejection an
 * error, and the lab showed the driver a failure. `readDiagnosticCodes`
 * separates the three cases — the vehicle reported nothing to report, the
 * vehicle said nothing at all, and the read did not happen — and only the
 * third is an error. A failure to read is still reported as a failure:
 * the driver has to know the question was never answered, rather than
 * being left to read silence as good news.
 */
export function useVehicleDiagnostics(
  options: VehicleDiagnosticsOptions
) {
  const catalog = options.catalog ?? saeGenericDtcCatalog

  const busy = ref(false)
  const errorMessage = ref('')
  const readsByMode = ref(
    new Map<DtcModeKey, DtcReadOutcome>()
  )

  const reads = computed<readonly DtcReadOutcome[]>(() =>
    MODE_ORDER
      .map(mode => readsByMode.value.get(mode))
      .filter(
        (outcome): outcome is DtcReadOutcome =>
          outcome !== undefined
      )
  )

  const assessment = computed<DiagnosticAssessment | undefined>(() =>
    reads.value.length === 0
      ? undefined
      : assessDiagnostics(
          {
            reads: reads.value,
            adapterConnected: options.adapterConnected()
          },
          catalog
        )
  )

  async function read(mode: DtcModeKey): Promise<void> {
    // A second read while one is in flight would race the first onto the
    // same executor queue for no benefit.
    if (busy.value) {
      return
    }

    busy.value = true
    errorMessage.value = ''

    try {
      await runRead(DTC_MODES[mode], mode)
    } finally {
      busy.value = false
    }
  }

  async function readAll(): Promise<void> {
    if (busy.value) {
      return
    }

    busy.value = true
    errorMessage.value = ''

    try {
      for (const mode of MODE_ORDER) {
        await runRead(DTC_MODES[mode], mode)
      }
    } finally {
      busy.value = false
    }
  }

  async function runRead(
    descriptor: DtcModeDescriptor,
    mode: DtcModeKey
  ): Promise<void> {
    const outcome = await readDiagnosticCodes(
      options.executor(),
      descriptor
    )

    const next = new Map(readsByMode.value)

    next.set(mode, outcome)
    readsByMode.value = next

    if (outcome.kind === 'failed') {
      errorMessage.value = describeFailure(outcome)
    }
  }

  function reset(): void {
    readsByMode.value = new Map()
    errorMessage.value = ''
  }

  return {
    busy,
    errorMessage,
    reads,
    assessment,
    read,
    readAll,
    reset
  }
}

function describeFailure(
  outcome: Extract<DtcReadOutcome, { kind: 'failed' }>
): string {
  const reason = {
    timeout: 'el adaptador no respondió a tiempo',
    transport: 'se perdió la conexión con el adaptador',
    protocol: 'la respuesta del vehículo no se pudo interpretar'
  }[outcome.reason]

  return `No se pudieron leer los códigos: ${reason}.`
}

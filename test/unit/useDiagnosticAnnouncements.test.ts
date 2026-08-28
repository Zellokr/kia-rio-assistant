// @vitest-environment happy-dom
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  watchDiagnosticAnnouncements
} from '../../app/composables/useDiagnosticAnnouncements'
import type {
  DiagnosticAssessment
} from '../../core/obd/diagnostics/assessDiagnostics'
import type {
  DiagnosticConfidence,
  DiagnosticSeverity
} from '../../core/obd/diagnostics/ports'

function assessment(
  severity: DiagnosticSeverity,
  confidence: DiagnosticConfidence = 'high',
  immediateAction = 'Acude a un taller.'
): DiagnosticAssessment {
  return {
    severity,
    confidence,
    evidence: [],
    possibleCauses: [],
    immediateAction,
    limitations: []
  }
}

/** Lets the watcher's flush run. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('watchDiagnosticAnnouncements', () => {
  it('says nothing until there is an assessment', async () => {
    const announce = vi.fn(async () => {})

    watchDiagnosticAnnouncements(
      ref<DiagnosticAssessment | undefined>(undefined),
      announce
    )

    await flush()

    expect(announce).not.toHaveBeenCalled()
  })

  it('announces a warning when one arrives', async () => {
    const announce = vi.fn(async () => {})
    const source = ref<DiagnosticAssessment | undefined>(undefined)

    watchDiagnosticAnnouncements(source, announce)

    source.value = assessment('warning')

    await flush()

    expect(announce).toHaveBeenCalledWith('Aviso. Acude a un taller.')
  })

  it('stays silent for an informational assessment', async () => {
    const announce = vi.fn(async () => {})
    const source = ref<DiagnosticAssessment | undefined>(undefined)

    watchDiagnosticAnnouncements(source, announce)

    source.value = assessment('info')

    await flush()

    expect(announce).not.toHaveBeenCalled()
  })

  it('does not repeat an unchanged assessment', async () => {
    const announce = vi.fn(async () => {})
    const source = ref<DiagnosticAssessment | undefined>(undefined)

    watchDiagnosticAnnouncements(source, announce)

    source.value = assessment('warning')
    await flush()

    source.value = assessment('warning')
    await flush()

    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('speaks again when the assessment escalates', async () => {
    const announce = vi.fn(async () => {})
    const source = ref<DiagnosticAssessment | undefined>(undefined)

    watchDiagnosticAnnouncements(source, announce)

    source.value = assessment('warning')
    await flush()

    source.value = assessment('critical')
    await flush()

    expect(announce).toHaveBeenLastCalledWith('Atención. Acude a un taller.')
  })

  /**
   * Clearing the reads must reset the guard. Otherwise the same fault read a
   * second time in a session would be silently swallowed as a repeat.
   */
  it('forgets the last announcement when the assessment goes away', async () => {
    const announce = vi.fn(async () => {})
    const source = ref<DiagnosticAssessment | undefined>(undefined)

    watchDiagnosticAnnouncements(source, announce)

    source.value = assessment('warning')
    await flush()

    source.value = undefined
    await flush()

    source.value = assessment('warning')
    await flush()

    expect(announce).toHaveBeenCalledTimes(2)
  })

  it('never lets a speech failure escape into the diagnostics flow', async () => {
    const announce = vi.fn(async () => {
      throw new Error('engine died')
    })

    const source = ref<DiagnosticAssessment | undefined>(undefined)

    watchDiagnosticAnnouncements(source, announce)

    source.value = assessment('critical')

    await expect(flush()).resolves.toBeUndefined()
  })
})

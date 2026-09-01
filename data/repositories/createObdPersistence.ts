import type {
  DiagnosticAssessmentRepository,
  DtcRepository,
  MaintenanceRepository,
  ObdSessionRepository,
  SupportedPidCacheRepository
} from '~~/core/obd/persistence/ports'

export type ObdPersistence = ObdSessionRepository
  & DtcRepository
  & DiagnosticAssessmentRepository
  & MaintenanceRepository
  & SupportedPidCacheRepository

export function createObdPersistence(adapter: ObdPersistence): ObdPersistence {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment')
  }

  return adapter
}

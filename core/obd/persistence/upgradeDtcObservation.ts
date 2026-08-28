import { parseDtcCode } from '../dtc/DtcCode'
import type {
  PersistedDtcObservation,
  PersistedDtcObservationRecord
} from './ports'

/**
 * Whether a row read back from storage is one this build knows how to read.
 *
 * IndexedDB hands back whatever was written, by whatever version of this
 * application wrote it. `listObservations` used to assert the shape with a
 * cast, which meant a row from a future schema fell into the v1 branch of
 * `upgradeDtcObservation` below and was stamped `state: 'stored'` — a
 * fabricated claim about a fault code, on the one field no byte in a DTC
 * response carries. A row with no `code` at all crashed `parseDtcCode` and
 * took the whole history with it.
 *
 * So the boundary checks instead of asserting. An unrecognised row is not
 * shown; it is never guessed at.
 */
export function isPersistedDtcObservationRecord(
  value: unknown
): value is PersistedDtcObservationRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  // Read as an open record, not as a Partial of either version: narrowing to
  // one of them here would decide the schema question this function exists
  // to ask, and the compiler would then reject the other branch as dead.
  const record = value as Record<string, unknown>

  if (
    typeof record.id !== 'string'
    || typeof record.sessionId !== 'string'
    || typeof record.code !== 'string'
    || typeof record.observedAt !== 'string'
  ) {
    return false
  }

  if (record.schemaVersion === 1) {
    return true
  }

  return record.schemaVersion === 2
    && typeof record.type === 'string'
    && typeof record.state === 'string'
}

export function upgradeDtcObservation(
  observation: PersistedDtcObservationRecord
): PersistedDtcObservation {
  if (observation.schemaVersion === 2) {
    return observation
  }

  return {
    ...observation,
    schemaVersion: 2,
    type: parseDtcCode(observation.code).type,
    state: 'stored'
  }
}

import { parseDtcCode } from '../dtc/DtcCode'
import type {
  PersistedDtcObservation,
  PersistedDtcObservationRecord
} from './ports'

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

import { decodeSupportedPids } from '../decoder/decodeSupportedPids'
import type { PersistedSupportedPidCache, SupportedPidCacheRepository } from '../persistence/ports'
import type { ElmCommandExecutor } from '../protocol/ElmCommandExecutor'
import { discoverSupportedPids } from '../protocol/SupportedPidDiscovery'
import type { SupportedPidDiscoveryResult, SupportedPidRange } from '../protocol/SupportedPidDiscovery'
import type { ObdTransportMetadata } from '../transport/ObdTransport'
import { buildVehicleFingerprint } from './buildVehicleFingerprint'

export interface ResolveSupportedPidsOptions {
  cache?: SupportedPidCacheRepository
  reconnect?: boolean
  supportedPids?: readonly string[]
  onCacheError?: (error: unknown) => void
}

export interface ResolvedSupportedPids extends SupportedPidDiscoveryResult {
  reusedCache: boolean
}

export async function resolveSupportedPids(
  executor: ElmCommandExecutor,
  transport: ObdTransportMetadata,
  options: ResolveSupportedPidsOptions = {}
): Promise<ResolvedSupportedPids> {
  if (options.reconnect) {
    return { pids: [...options.supportedPids ?? []], ranges: [], reusedCache: true }
  }

  const response = await executor.execute('0100', 7000)
  const decoded = decodeSupportedPids(response.normalizedText)
  const seed: SupportedPidRange = {
    command: '0100', response, pids: decoded.pids,
    rangeStart: decoded.rangeStart, rangeEnd: decoded.rangeEnd,
    hasNextRange: decoded.hasNextRange
  }
  const fingerprint = buildVehicleFingerprint(transport, response.normalizedText)
  let cached: PersistedSupportedPidCache | undefined

  try {
    cached = await options.cache?.read(fingerprint)
  } catch (error) {
    options.onCacheError?.(error)
  }

  if (cached) return { pids: cached.pids, ranges: [seed], reusedCache: true }

  const discovery = await discoverSupportedPids(executor, { seed })
  try {
    void options.cache?.write({ schemaVersion: 1, fingerprint, pids: discovery.pids })
      .catch(options.onCacheError)
  } catch (error) {
    options.onCacheError?.(error)
  }

  return { ...discovery, reusedCache: false }
}

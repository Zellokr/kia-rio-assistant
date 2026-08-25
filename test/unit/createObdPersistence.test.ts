import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createObdPersistence } from '../../data/repositories/createObdPersistence'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

describe('OBD persistence composition', () => {
  it('fails loudly when IndexedDB is unavailable', () => {
    vi.stubGlobal('indexedDB', undefined)

    expect(() => createObdPersistence({} as never)).toThrow(
      'IndexedDB is not available in this environment'
    )

    vi.unstubAllGlobals()
  })

  it('instantiates the IndexedDB adapter only from the client plugin', () => {
    const plugin = source('app/plugins/obdPersistence.client.ts')
    const factory = source('data/repositories/createObdPersistence.ts')

    expect(factory).toContain('typeof indexedDB === \'undefined\'')
    expect(plugin).toContain('new IndexedDbAdapter()')
    expect(factory).not.toContain('new IndexedDbAdapter(')
  })
})

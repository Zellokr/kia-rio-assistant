import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { IndexedDbAdapter } from '../../data/indexeddb/IndexedDbAdapter'
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

  it('throws the intended message, not a bare ReferenceError, when constructing the adapter without a global indexedDB', () => {
    // This is the exact call-site shape used by app/plugins/obdPersistence.client.ts:
    // `createObdPersistence(new IndexedDbAdapter())`. JS evaluates the `new
    // IndexedDbAdapter()` argument BEFORE createObdPersistence's own guard ever
    // runs, so the guard that actually has to fire lives in the adapter's own
    // constructor. This test file runs in the default Node environment with no
    // global `indexedDB`, so it reproduces the real unguarded-SSR shape without
    // any stubbing.
    expect(() => new IndexedDbAdapter()).toThrow(
      'IndexedDB is not available in this environment'
    )
  })

  it('instantiates the IndexedDB adapter only from the client plugin', () => {
    const plugin = source('app/plugins/obdPersistence.client.ts')
    const factory = source('data/repositories/createObdPersistence.ts')

    expect(factory).toContain('typeof indexedDB === \'undefined\'')
    expect(plugin).toContain('new IndexedDbAdapter()')
    expect(factory).not.toContain('new IndexedDbAdapter(')
  })
})

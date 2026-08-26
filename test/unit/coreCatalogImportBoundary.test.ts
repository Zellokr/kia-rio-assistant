import { readFileSync, readdirSync, statSync } from 'node:fs'
import {
  join,
  relative,
  resolve,
  sep
} from 'node:path'

import {
  describe,
  expect,
  it
} from 'vitest'

const REPO_ROOT = resolve(__dirname, '../..')
const CORE_ROOT = join(REPO_ROOT, 'core')
const CATALOG_ROOT = join(REPO_ROOT, 'catalog')

const IMPORT_SPECIFIER
  = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g

/** Nuxt's own aliases, plus the bare-directory form. */
const ALIAS_PREFIXES = ['~~/', '~/', '@@/', '@/']

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map(match => match[1]!)
}

/**
 * Decides whether one import specifier, written inside `fromFile`, reaches
 * into `catalog/`. Relative specifiers are resolved against the importing
 * file rather than pattern-matched, so `../../catalog/x` is caught and a
 * legitimate `../catalogue-ish-name` is not.
 */
function reachesCatalog(specifier: string, fromFile: string): boolean {
  if (specifier.startsWith('.')) {
    const resolved = resolve(fromFile, '..', specifier)

    return resolved === CATALOG_ROOT
      || resolved.startsWith(CATALOG_ROOT + sep)
  }

  const bare = ALIAS_PREFIXES.reduce(
    (value, prefix) =>
      value.startsWith(prefix)
        ? value.slice(prefix.length)
        : value,
    specifier
  )

  return bare === 'catalog' || bare.startsWith('catalog/')
}

function findCatalogImports(
  source: string,
  fromFile: string
): string[] {
  return importSpecifiers(source).filter(specifier =>
    reachesCatalog(specifier, fromFile)
  )
}

function typescriptFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)

    if (statSync(path).isDirectory()) {
      return typescriptFilesUnder(path)
    }

    return name.endsWith('.ts') ? [path] : []
  })
}

describe('core → catalog import boundary', () => {
  /**
   * A guard that cannot fail is worth nothing. Before trusting this scanner
   * over the real tree — where it is expected to find nothing — prove it
   * detects the violation it exists to catch, and does not fire on imports
   * that merely look similar.
   */
  describe('the scanner itself', () => {
    const someCoreFile = join(CORE_ROOT, 'obd', 'diagnostics', 'ports.ts')

    it.each([
      "import { x } from '../../../catalog/dtc-sae-generic'",
      "import { x } from '~~/catalog/kia-rio/warning-lights'",
      "import { x } from 'catalog/dtc-sae-generic'",
      "const x = await import('~/catalog/dtc-sae-generic')",
      "const x = require('../../../catalog')"
    ])('detects the violating import %s', (source) => {
      expect(
        findCatalogImports(source, someCoreFile)
      ).toHaveLength(1)
    })

    it.each([
      "import { x } from './ports'",
      "import { x } from '../dtc/DtcCode'",
      "import { x } from '~~/core/obd/diagnostics/ports'",
      "import { x } from 'node:fs'",
      "const catalog = buildCatalog('catalog')"
    ])('does not fire on the legitimate line %s', (source) => {
      expect(
        findCatalogImports(source, someCoreFile)
      ).toHaveLength(0)
    })
  })

  /**
   * `AGENTS.MD`: "El código OBD genérico no debe contener lógica específica
   * de Kia." Catalogue data is injected through ports, so this rule is a
   * one-directional import boundary — and a rule nothing checks is a
   * comment. This mechanises it.
   */
  it('has no file under core/ importing from catalog/', () => {
    const offenders = typescriptFilesUnder(CORE_ROOT).flatMap((file) => {
      const found = findCatalogImports(
        readFileSync(file, 'utf8'),
        file
      )

      return found.map(specifier => ({
        file: relative(REPO_ROOT, file),
        specifier
      }))
    })

    expect(offenders).toEqual([])
  })

  it('scans a non-trivial number of core files', () => {
    // Guards against the walk silently returning nothing and passing.
    expect(
      typescriptFilesUnder(CORE_ROOT).length
    ).toBeGreaterThan(20)
  })
})

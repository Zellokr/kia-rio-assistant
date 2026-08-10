import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const indexPagePath = fileURLToPath(
  new URL('../../app/pages/index.vue', import.meta.url)
)
const labPagePath = fileURLToPath(
  new URL('../../app/pages/lab/index.vue', import.meta.url)
)

describe('Android entry route', () => {
  it('renders the OBD laboratory at root without a static redirect', () => {
    const source = readFileSync(labPagePath, 'utf8')

    expect(existsSync(indexPagePath)).toBe(false)
    expect(source).toContain('alias: [\'/\']')
    expect(source).not.toContain('navigateTo(')
    expect(source).not.toContain('Nuxt Starter Template')
  })
})

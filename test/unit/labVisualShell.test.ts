import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

function readProjectFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    'utf8'
  )
}

describe('OBD laboratory visual shell', () => {
  it('uses Kia Rio Assistant branding instead of starter-template chrome', () => {
    const source = readProjectFile('app/app.vue')

    expect(source).toContain('const title = \'Kia Rio Assistant\'')
    expect(source).toContain('Área de diagnóstico local')
    expect(source).not.toContain('Nuxt Starter Template')
    expect(source).not.toContain('TemplateMenu')
  })

  it('prioritizes safety, connection state and manual inspection on mobile', () => {
    const shellSource = readProjectFile('app/pages/lab/index.vue')
    const connectionSource = readProjectFile('app/components/ConnectionView.vue')
    const dataSource = readProjectFile('app/components/DataView.vue')

    expect(shellSource).toContain('Solo lectura')
    expect(shellSource).toContain('pb-[calc(7rem+env(safe-area-inset-bottom))]')
    expect(shellSource).toContain('<ConnectionView')
    expect(shellSource).toContain('<DataView')
    expect(connectionSource).toContain('Preparar conexión')
    expect(dataSource).toContain('Datos del vehículo')
    expect(dataSource).toContain('Consultas manuales')
  })

  it('presents GATT discovery as a numbered, read-only workflow', () => {
    const source = readProjectFile('app/components/GattInspectorPanel.vue')

    expect(source).toContain('Inventario Bluetooth')
    expect(source).toContain('1. Buscar adaptador')
    expect(source).toContain('2. Elegir dispositivo')
    expect(source).toContain('3. Descubrir servicios')
    expect(source).toContain('No lee ni escribe datos del vehículo')
    expect(source).toContain('v-if="devices.length === 0"')
    expect(source).toContain('v-else-if="!selectedDeviceId"')
    expect(source).toContain('v-else-if="!inventory"')
  })

  it('bundles interface icons for the offline Android shell', () => {
    const source = readProjectFile('nuxt.config.ts')

    expect(source).toContain('provider: \'none\'')
    expect(source).toContain('clientBundle:')
    expect(source).toContain('scan: true')
  })

  it('keeps diagnostic output on a high-contrast terminal surface in every theme', () => {
    const logSource = readProjectFile('app/components/SessionLogPanel.vue')
    const gattSource = readProjectFile('app/components/GattInspectorPanel.vue')
    const cssSource = readProjectFile('app/assets/css/main.css')

    expect(logSource).toContain('bg-terminal')
    expect(logSource).toContain('text-terminal-foreground')
    expect(gattSource).toContain('bg-terminal')
    expect(cssSource).toContain('--color-terminal:')
    expect(cssSource).toContain('--color-terminal-foreground:')
  })

  it('persists Mode 03 observations using the v2 state and type boundary', () => {
    const shellSource = readProjectFile('app/pages/lab/index.vue')

    expect(shellSource).toMatch(/decoded: \{\s+kind: 'dtc',\s+observations/)
    expect(shellSource).toContain('schemaVersion: 2 as const')
    expect(shellSource).toContain('type: code.type')
    expect(shellSource).toContain('state: dtcResult.state')
  })

  it('reacts to an unexpected transport drop instead of showing a stale ready badge', () => {
    const shellSource = readProjectFile('app/pages/lab/index.vue')

    // The page must observe raw transport state, not only its own operations.
    expect(shellSource).toContain('transport.subscribeState(')
    expect(shellSource).toContain('isObdTransportUnavailable')
    // An unexpected loss while connected must fail the session and stop polling.
    expect(shellSource).toContain('sessionState.value !== \'ready\'')
    expect(shellSource).toContain('failSession()')
    // The subscription must be released when the transport is swapped/unmounted.
    expect(shellSource).toContain('unsubscribeTransportState()')
  })

  it('exposes a visible keyboard focus ring and current-page state on both navs', () => {
    const navRailSource = readProjectFile('app/components/NavRail.vue')
    const bottomTabSource = readProjectFile('app/components/BottomTabBar.vue')

    for (const source of [navRailSource, bottomTabSource]) {
      // Keyboard focus must stay obvious for a glance-and-go, engine-on read.
      expect(source).toContain('focus-visible:ring-2')
      expect(source).toContain('focus-visible:ring-primary')
      // Screen readers must know which destination is active.
      expect(source).toContain('aria-current')
      expect(source).toContain('aria-label')
    }
  })

  it('uses three focused mobile destinations without losing the active session', () => {
    const shellSource = readProjectFile('app/pages/lab/index.vue')
    const navConfigSource = readProjectFile('app/utils/labNav.ts')
    const logViewSource = readProjectFile('app/components/LogView.vue')
    const connectionSource = readProjectFile('app/components/ConnectionView.vue')

    expect(shellSource).toContain('const activeView = ref<\'connection\' | \'data\' | \'log\'>(\'connection\')')
    expect(shellSource).toContain('~/utils/labNav')
    expect(shellSource).toContain('<NavRail')
    expect(shellSource).toContain('<BottomTabBar')
    expect(shellSource).toContain('<ConnectionView')
    expect(shellSource).toContain('<DataView')
    expect(shellSource).toContain('<LogView')
    expect(shellSource).not.toContain('<SessionLogPanel')
    expect(navConfigSource).toContain('Conexión')
    expect(navConfigSource).toContain('Datos')
    expect(navConfigSource).toContain('Registro')
    expect(logViewSource).toContain('<SessionLogPanel')
    expect(connectionSource).toContain('Herramientas OBD avanzadas')
  })
})

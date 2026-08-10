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
    const source = readProjectFile('app/pages/lab/index.vue')

    expect(source).toContain('Preparar conexión')
    expect(source).toContain('Solo lectura')
    expect(source).toContain('Datos del vehículo')
    expect(source).toContain('Consultas manuales')
    expect(source).toContain('pb-[calc(7rem+env(safe-area-inset-bottom))]')
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

  it('uses three focused mobile destinations without losing the active session', () => {
    const source = readProjectFile('app/pages/lab/index.vue')

    expect(source).toContain('const activeView = ref<\'connection\' | \'data\' | \'log\'>(\'connection\')')
    expect(source).toContain('Conexión')
    expect(source).toContain('Datos')
    expect(source).toContain('Registro')
    expect(source).toContain('<SessionLogPanel')
    expect(source).toContain('Herramientas OBD avanzadas')
  })
})

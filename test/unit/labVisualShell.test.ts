// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mount } from '@vue/test-utils'
import {
  describe,
  expect,
  it
} from 'vitest'

import BottomTabBar from '../../app/components/BottomTabBar.vue'
import ConnectionView from '../../app/components/ConnectionView.vue'
import DataView from '../../app/components/DataView.vue'
import LogView from '../../app/components/LogView.vue'
import NavRail from '../../app/components/NavRail.vue'
import SessionLogPanel from '../../app/components/SessionLogPanel.vue'
import { labViews } from '../../app/utils/labNav'
import type {
  ObdSessionEvent
} from '../../core/obd/logging/ObdSessionLog'

/**
 * Nuxt UI components are auto-imported by Nuxt and unresolved here. The
 * stubs render their slots and let attributes fall through, so the
 * assertions below read the DOM the templates actually produced.
 */
const stubs = {
  UApp: { template: '<div><slot /></div>' },
  UCard: { template: '<div><slot /></div>' },
  UContainer: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UAlert: {
    props: ['title', 'description'],
    template:
      '<div><p>{{ title }}</p><p>{{ description }}</p><slot /></div>'
  },
  UButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  UInput: { template: '<input>' },
  USelect: { template: '<select><slot /></select>' },
  USelectMenu: { template: '<select><slot /></select>' },
  UFormField: { template: '<label><slot /></label>' },
  UTextarea: { template: '<textarea></textarea>' },
  USwitch: { template: '<input type="checkbox">' },
  UProgress: { template: '<progress />' },
  USeparator: { template: '<hr>' },
  UTooltip: { template: '<div><slot /></div>' },
  UCollapsible: { template: '<div><slot /></div>' }
}

/**
 * happy-dom replaces the global `URL`, and `fileURLToPath` does not accept
 * that object — resolving through `node:path` from this file's own
 * location keeps the lookup independent of the test environment.
 */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..'
)

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

function sessionEvent(
  value: Record<string, unknown>
): ObdSessionEvent {
  return {
    sequence: 1,
    timestamp: '2026-08-10T20:00:00.000Z',
    elapsedMs: 182,
    ...value
  } as unknown as ObdSessionEvent
}

const CONNECTION_PROPS = {
  transportChoice: 'android-ble',
  sessionState: 'idle',
  sessionStateLabel: 'Inactivo',
  transportState: 'disconnected',
  transportError: '',
  sessionBusy: false,
  sessionBadgeColor: 'neutral'
} as const

const DATA_PROPS = {
  sessionState: 'ready',
  telemetryRunning: false,
  engineRpmMetric: undefined,
  vehicleSpeedMetric: undefined,
  coolantTemperatureMetric: undefined,
  engineLoadMetric: undefined,
  throttlePositionMetric: undefined,
  supportedPids: [],
  commands: ['0100', '03'],
  selectedCommand: '0100',
  transportChoice: 'android-ble'

} as const

describe('lab navigation', () => {
  describe.each([
    ['NavRail', NavRail],
    ['BottomTabBar', BottomTabBar]
  ])('%s', (_name, component) => {
    function render(active: string) {
      return mount(component, {
        props: { views: labViews, active },
        global: { stubs }
      })
    }

    it('names itself for a screen reader', () => {
      expect(
        render('connection').find('nav').attributes('aria-label')
      ).toBe('Navegación principal del laboratorio')
    })

    it('renders every destination', () => {
      const text = render('connection').text()

      for (const view of labViews) {
        expect(text).toContain(view.label)
      }
    })

    /**
     * The behavioural half of the accessibility claim. Source text can
     * show that `aria-current` is written somewhere; only the rendered
     * DOM can show it lands on exactly one destination, and the right
     * one.
     */
    it.each(labViews.map(view => view.value))(
      'marks only %s as the current page when it is active',
      (active) => {
        const current = render(active).findAll('[aria-current="page"]')

        expect(current).toHaveLength(1)
        expect(current[0]!.text()).toBe(
          labViews.find(view => view.value === active)!.label
        )
      }
    )

    it('emits the destination the user pressed', async () => {
      const wrapper = render('connection')

      await wrapper.findAll('button')[2]!.trigger('click')

      expect(wrapper.emitted('select')).toEqual([['log']])
    })

    /**
     * A glance-and-go, engine-on read needs an obvious focus ring. The
     * classes are asserted on the rendered controls, so a button added
     * later without them fails here.
     */
    it('gives every control a visible keyboard focus ring', () => {
      for (const button of render('connection').findAll('button')) {
        const classes = button.attributes('class') ?? ''

        expect(classes).toContain('focus-visible:ring-2')
        expect(classes).toContain('focus-visible:ring-primary')
      }
    })
  })
})

describe('lab destinations', () => {
  it('opens the connection view on preparing a connection', () => {
    const text = mount(ConnectionView, {
      props: CONNECTION_PROPS,
      global: { stubs }
    }).text()

    expect(text).toContain('Conectar con el coche')
    expect(text).toContain('Buscar adaptador')
    expect(text).toContain('Comprobaciones técnicas')
    expect(text).toContain('Controles técnicos')
  })

  /**
   * `WebSerialRfcommTransport` was deleted on 2026-08-25 and
   * `PHYSICAL_TRANSPORT_KINDS` has one entry. Offering a transport that
   * does not exist sends somebody looking for a control they will never
   * find — worst of all at the car, mid-procedure.
   */
  it('offers only the transports that still exist', () => {
    const wrapper = mount(ConnectionView, {
      props: CONNECTION_PROPS,
      global: { stubs }
    })

    expect(
      wrapper.findAll('option').map(option => option.attributes('value'))
    ).toEqual(['android-ble'])
    expect(wrapper.text()).not.toContain('Mock')
    expect(wrapper.text()).not.toContain('Replay')
  })

  /**
   * Checked for every choice, not just the default. The first version of
   * this test used `mock` alone and passed while a dead `v-else` branch
   * still named Web Serial — it shipped into the APK, where a text search
   * found it. A per-branch claim needs a per-branch assertion.
   */
  it.each(['mock', 'replay', 'android-ble'] as const)(
    'never names a deleted transport with %s selected',
    (transportChoice) => {
      const wrapper = mount(ConnectionView, {
        props: { ...CONNECTION_PROPS, transportChoice },
        global: { stubs }
      })

      expect(wrapper.text()).not.toContain('Web Serial')
      expect(wrapper.text()).not.toContain('RFCOMM')
    }
  )

  it('separates vehicle data from manual queries', () => {
    const text = mount(DataView, {
      props: DATA_PROPS,
      global: { stubs }
    }).text()

    expect(text).toContain('Lecturas en directo')
    expect(text).toContain('Lecturas disponibles')
    expect(text).toContain('Ver lecturas')
    expect(text).toContain('Más lecturas')
  })

  it('shows the log through the session log panel', () => {
    const wrapper = mount(LogView, {
      props: {
        events: [],
        droppedEvents: 0,
        truncated: false
      },
      global: { stubs, components: { SessionLogPanel } }
    })

    expect(wrapper.findComponent(SessionLogPanel).exists()).toBe(true)
  })

  it('forwards a log action from the panel to its parent', async () => {
    const wrapper = mount(LogView, {
      props: {
        events: [],
        droppedEvents: 0,
        truncated: false
      },
      global: { stubs, components: { SessionLogPanel } }
    })

    wrapper.findComponent(SessionLogPanel).vm.$emit('export')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('export')).toHaveLength(1)
  })

  /**
   * Raw protocol bytes are read at arm's length in a lit garage, so they
   * get a dedicated high-contrast surface rather than body text.
   */
  it('puts raw payloads on the terminal surface', () => {
    const wrapper = mount(SessionLogPanel, {
      props: {
        events: [
          sessionEvent({
            type: 'rx-frame',
            direction: 'rx',
            command: '0100',
            rawText: '41 00 BE 3E B8 13\r>',
            normalizedText: '41 00 BE 3E B8 13',
            responseKind: 'obd-data'
          })
        ],
        droppedEvents: 0,
        truncated: false
      },
      global: { stubs }
    })

    const surfaces = wrapper.findAll('pre')

    expect(surfaces.length).toBeGreaterThan(0)

    for (const surface of surfaces) {
      const classes = surface.attributes('class') ?? ''

      expect(classes).toContain('bg-terminal')
      expect(classes).toContain('text-terminal-foreground')
    }
  })
})

/**
 * What is left as a source or configuration assertion, and why.
 *
 * Everything above mounts, because a component that takes props and
 * renders DOM can be asked what it renders. These cannot, and saying so
 * is more useful than dressing a text search up as a test:
 *
 * - `app/app.vue` calls `useColorMode`, `useHead` and `useSeoMeta`, and
 *   renders `NuxtPage`. Mounting it means standing up Nuxt itself.
 * - `nuxt.config.ts` is build configuration; there is no runtime to ask.
 * - `main.css` declares theme tokens, and no Tailwind pipeline runs in
 *   the test environment, so a computed style would be empty either way.
 * - `app/pages/lab/index.vue` builds a transport, an executor, a poll
 *   scheduler and a session log at setup. Mounting it means standing up
 *   the whole stack; it is covered by `pnpm build` and by the unit tests
 *   of the pieces it composes.
 */
describe('what cannot be mounted', () => {
  it('brands the shell as this project, not the starter template', () => {
    const source = readProjectFile('app/app.vue')

    expect(source).toContain('const title = \'Kia Rio Assistant\'')
    expect(source).toContain('Área de diagnóstico local')
    expect(source).not.toContain('Nuxt Starter Template')
    expect(source).not.toContain('TemplateMenu')
  })

  it('bundles interface icons for the offline Android shell', () => {
    const source = readProjectFile('nuxt.config.ts')

    expect(source).toContain('provider: \'none\'')
    expect(source).toContain('clientBundle:')
    expect(source).toContain('scan: true')
  })

  it('defines the terminal surface tokens the panels ask for', () => {
    const source = readProjectFile('app/assets/css/main.css')

    expect(source).toContain('--color-terminal:')
    expect(source).toContain('--color-terminal-foreground:')
  })

  it('keeps the read-only framing and the mobile safe area on the page', () => {
    const source = readProjectFile('app/pages/lab/index.vue')

    expect(source).toContain('Solo lectura')
    expect(source).toContain('pb-[calc(7rem+env(safe-area-inset-bottom))]')
  })

  it('composes three destinations without a stray log panel', () => {
    const source = readProjectFile('app/pages/lab/index.vue')

    expect(source).toContain('<NavRail')
    expect(source).toContain('<BottomTabBar')
    expect(source).toContain('<ConnectionView')
    expect(source).toContain('<DataView')
    expect(source).toContain('<LogView')
    expect(source).not.toContain('<SessionLogPanel')
  })

  it('reacts to an unexpected transport drop instead of a stale ready badge', () => {
    const source = readProjectFile('app/pages/lab/index.vue')

    // The page must observe raw transport state, not only its own operations.
    expect(source).toContain('transport.subscribeState(')
    expect(source).toContain('isObdTransportUnavailable')
    // An unexpected loss while connected must fail the session and stop polling.
    expect(source).toContain('sessionState.value !== \'ready\'')
    expect(source).toContain('failSession()')
    // The subscription must be released when the transport is swapped.
    expect(source).toContain('unsubscribeTransportState()')
  })

  it('persists Mode 03 observations on the v2 state and type boundary', () => {
    const source = readProjectFile('app/pages/lab/index.vue')

    expect(source).toMatch(/decoded: \{\s+kind: 'dtc',\s+observations/)
    expect(source).toContain('schemaVersion: 2 as const')
  })

  /**
   * GATT discovery imports its Capacitor service at module scope, and
   * that service reports unsupported outside the Android shell — so a
   * mounted panel renders the "open this from the app" branch and never
   * the numbered workflow this asserts.
   */
  it('presents GATT discovery as a numbered, read-only workflow', () => {
    const source = readProjectFile('app/components/GattInspectorPanel.vue')

    expect(source).toContain('Inventario Bluetooth')
    expect(source).toContain('1. Buscar adaptador')
    expect(source).toContain('2. Elegir dispositivo')
    expect(source).toContain('3. Descubrir servicios')
    expect(source).toContain('No lee ni escribe datos del vehículo')
  })
})

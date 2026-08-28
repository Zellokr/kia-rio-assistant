// @vitest-environment nuxt
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
import LabPage from '../../app/pages/lab/index.vue'
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
  /**
   * `USelect` takes its options as an `items` prop rather than as slotted
   * `<option>` markup, so a slot-only stub renders an empty control and the
   * assertions below would pass against nothing. This stub renders the
   * items it is given, which is what the real component does.
   */
  USelect: {
    props: ['items'],
    template:
      '<select><option v-for="item in items" :key="item.value"'
      + ' :value="item.value">{{ item.label }}</option></select>'
  },
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
  telemetry: {
    engineRpm: undefined,
    vehicleSpeed: undefined,
    coolantTemperature: undefined,
    engineLoad: undefined,
    throttlePosition: undefined
  },
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
 *   renders `NuxtLayout`/`NuxtPage`. Mounting it means standing up Nuxt
 *   itself, and the same goes for `app/layouts/default.vue`, which is only
 *   ever rendered through that machinery.
 * - `nuxt.config.ts` is build configuration; there is no runtime to ask.
 * - `main.css` declares theme tokens, and no Tailwind pipeline runs in
 *   the test environment, so a computed style would be empty either way.
 *
 * `app/pages/lab/index.vue` used to be on that list, on the grounds that
 * mounting it meant standing up the whole stack. That turned out to be
 * wrong. Everything it had here has moved: what needed only rendered
 * output into `describe('the lab page renders')` below, and what needed a
 * session in `ready` into `labPageSession`, which injects a transport
 * through `labTransportFactoryKey` and drives the real handshake.
 *
 * `GattInspectorPanel` left the list for the same reason. It was here
 * because it named its Capacitor service directly and could only ever
 * render its unavailable branch; the bridge is injected now, so
 * `bleInspectionPanels` mounts it and reads the workflow off the screen.
 */
describe('what cannot be mounted', () => {
  it('brands the document as this project, not the starter template', () => {
    const source = readProjectFile('app/app.vue')

    expect(source).toContain('const title = \'Kia Rio Assistant\'')
    expect(source).not.toContain('Nuxt Starter Template')
    expect(source).not.toContain('TemplateMenu')
  })

  /**
   * The visible chrome moved out of `app.vue` and into the default layout,
   * so that `error.vue` could render inside the same frame instead of
   * dropping the driver onto Nuxt's own error screen.
   */
  it('brands the visible chrome from the default layout', () => {
    const source = readProjectFile('app/layouts/default.vue')

    expect(source).toContain('Kia Rio Assistant')
    expect(source).toContain('Área de diagnóstico local')
    expect(source).toContain('<slot />')
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
})

describe('the lab page renders', () => {
  function mountPage() {
    return mount(LabPage, { global: { stubs } })
  }

  it('keeps the read-only framing and the mobile safe area', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('Solo lectura')
    expect(wrapper.html())
      .toContain('pb-[calc(7rem+env(safe-area-inset-bottom))]')
  })

  /**
   * The stray panel this names was real. `<LogView v-else>` bound to the
   * `<template v-if="activeView === 'data'">` above it rather than to the
   * ConnectionView/DataView chain, so the log rendered underneath the
   * connection view in the shipped application. It was invisible here
   * because the old test environment never resolved the auto-imported
   * SessionLogPanel, and this assertion pinned the broken state as correct.
   */
  it('offers both navigations without a stray log panel', () => {
    const wrapper = mountPage()

    expect(wrapper.findComponent(NavRail).exists()).toBe(true)
    expect(wrapper.findComponent(BottomTabBar).exists()).toBe(true)
    expect(wrapper.findComponent(LogView).exists()).toBe(false)
    expect(wrapper.findComponent(SessionLogPanel).exists()).toBe(false)
  })

  it('reaches all three destinations', async () => {
    const wrapper = mountPage()

    expect(wrapper.findComponent(ConnectionView).exists()).toBe(true)

    await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'data')
    expect(wrapper.findComponent(DataView).exists()).toBe(true)

    await wrapper.findComponent(BottomTabBar).vm.$emit('select', 'log')
    expect(wrapper.findComponent(LogView).exists()).toBe(true)
    // LogView's whole template is SessionLogPanel, so on this destination it
    // must be present. The old assertion said absent, which only held while
    // the component failed to resolve.
    expect(wrapper.findComponent(SessionLogPanel).exists()).toBe(true)
  })
})

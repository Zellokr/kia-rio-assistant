// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import ElmPipeProbePanel from '~/components/ElmPipeProbePanel.vue'
import GattInspectorPanel from '~/components/GattInspectorPanel.vue'
import {
  androidBleBridgeKey,
  gattInspectorBridgeKey
} from '~/utils/bleServiceKeys'
import type {
  GattInspectorBridge,
  GattInventory
} from '~~/core/bluetooth/GattInspectorController'
import type { AndroidBleBridge } from '~~/core/bluetooth/AndroidBleBridge'

/**
 * Both panels named their Capacitor service directly, and both services
 * report unsupported off the Android shell — so a mounted panel rendered
 * only its "open this from the app" branch and every control below it was
 * unreachable. The suite matched the panels' source text instead, which
 * proves a line was typed rather than that a button does anything.
 *
 * The bridge is injected now, so these drive the real interface.
 *
 * None of this is hardware validation. A fake bridge is a fake bridge; what
 * is proved here is that the panels ask it the right things and render what
 * it answers.
 */
const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UIcon: { template: '<i />' },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: {
    props: ['title', 'description'],
    template: '<div>{{ title }}{{ description }}<slot /></div>'
  },
  UButton: {
    props: ['disabled'],
    emits: ['click'],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  UInput: { template: '<input />' },
  USelect: { template: '<select><slot /></select>' },
  UTextarea: { template: '<textarea></textarea>' },
  USeparator: { template: '<hr />' },
  UFormField: { template: '<label><slot /></label>' }
}

const inventory: GattInventory = {
  device: { id: 'AA:BB:CC:DD:EE:FF', name: 'VEEPEAK' },
  services: [{
    uuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    characteristics: [{
      uuid: '0000fff1-0000-1000-8000-00805f9b34fb',
      properties: {
        read: false,
        write: true,
        writeWithoutResponse: true,
        notify: true,
        indicate: false
      },
      descriptors: [{ uuid: '00002902-0000-1000-8000-00805f9b34fb' }]
    }]
  }]
}

function gattBridge(supported = true): GattInspectorBridge {
  return {
    isSupported: () => supported,
    scan: vi.fn().mockResolvedValue([
      { id: 'AA:BB:CC:DD:EE:FF', name: 'VEEPEAK', rssi: -45 }
    ]),
    inspect: vi.fn().mockResolvedValue(inventory),
    disconnect: vi.fn().mockResolvedValue(undefined)
  }
}

function mountGatt(bridge: GattInspectorBridge) {
  return mount(GattInspectorPanel, {
    global: {
      stubs,
      provide: { [gattInspectorBridgeKey as symbol]: bridge }
    }
  })
}

function clickButton(
  wrapper: ReturnType<typeof mountGatt>,
  label: string
) {
  const button = wrapper.findAll('button')
    .find(candidate => candidate.text().includes(label))

  if (!button) {
    throw new Error(`no button labelled ${label}`)
  }

  return button.trigger('click')
}

describe('GattInspectorPanel', () => {
  /**
   * Asserted on the branch's own copy and on the absence of the scan
   * control. The panel heading renders either way, so a test that only
   * looked for it would pass against the supported branch too.
   */
  it('tells the user where to open it when the bridge is unavailable', () => {
    const text = mountGatt(gattBridge(false)).text()

    expect(text).toContain('Abre esta sección desde la aplicación Android')
    expect(text).not.toContain('Buscar VEEPEAK')
  })

  /**
   * The branch that could not be reached before: a supported bridge renders
   * the scan control rather than the unavailable notice.
   */
  it('offers the scan control on a supported bridge', () => {
    expect(mountGatt(gattBridge()).text()).toContain('Buscar VEEPEAK')
  })

  it('lists what the scan found', async () => {
    const wrapper = mountGatt(gattBridge())

    await clickButton(wrapper, 'Buscar VEEPEAK')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('AA:BB:CC:DD:EE:FF')
    })
  })

  /**
   * Replaces a `readFileSync` assertion in `labVisualShell` that looked for
   * all three step headings in the panel's source at once. They live in
   * mutually exclusive branches, so no user ever sees more than one — the
   * old assertion passed on text that cannot co-occur on screen, which is
   * the failure mode source matching always has.
   *
   * The workflow is driven instead: each step appears when its turn comes,
   * and the ones that have not arrived are absent.
   */
  it('walks the driver through one discovery step at a time', async () => {
    const wrapper = mountGatt(gattBridge())

    expect(wrapper.text()).toContain('1. Buscar adaptador')
    expect(wrapper.text()).not.toContain('2. Elegir dispositivo')

    await clickButton(wrapper, 'Buscar VEEPEAK')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('2. Elegir dispositivo')
    })
    expect(wrapper.text()).not.toContain('3. Descubrir servicios')

    await wrapper.find('#gatt-device').setValue('AA:BB:CC:DD:EE:FF')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('3. Descubrir servicios')
    })
  })

  /**
   * The step indicator is the one place all three do appear together, and
   * it is what makes the sequence legible before it has been walked.
   */
  it('shows the whole sequence in its step indicator', () => {
    const text = mountGatt(gattBridge()).text()

    expect(text).toContain('Inventario Bluetooth')
    expect(text).toContain('Buscar')
    expect(text).toContain('Elegir')
    expect(text).toContain('Descubrir')
  })

  /**
   * The panel's own safety claim, asserted against rendered output rather
   * than against the string in its template.
   */
  it('states that it never touches the vehicle bus', () => {
    expect(mountGatt(gattBridge()).text())
      .toContain('No lee ni escribe datos del vehículo')
  })

  it('surfaces a scan failure instead of staying silent', async () => {
    const bridge = gattBridge()

    bridge.scan = vi.fn().mockRejectedValue(new Error('bluetooth off'))

    const wrapper = mountGatt(bridge)

    await clickButton(wrapper, 'Buscar VEEPEAK')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('bluetooth off')
    })
  })
})

function bleBridge(supported = true): AndroidBleBridge {
  return {
    isSupported: () => supported,
    requestDevice: vi.fn(),
    connect: vi.fn(),
    write: vi.fn(),
    disconnect: vi.fn(),
    addListener: vi.fn().mockReturnValue(() => {})
  } as unknown as AndroidBleBridge
}

describe('ElmPipeProbePanel', () => {
  function mountProbe(bridge: AndroidBleBridge) {
    return mount(ElmPipeProbePanel, {
      global: {
        stubs,
        provide: { [androidBleBridgeKey as symbol]: bridge }
      }
    })
  }

  it('offers the probe on a supported bridge', () => {
    expect(mountProbe(bleBridge()).text()).toContain('Sonda de tubería BLE')
  })

  /**
   * The probe sends one ATZ, which the ELM327 chip answers itself. Saying so
   * on screen is the whole reason a driver would run it, so it is asserted
   * from rendered output.
   */
  it('states that it does not talk to the vehicle', () => {
    expect(mountProbe(bleBridge()).text())
      .toContain('No comunica con el vehículo')
  })

  /**
   * Same trap as the GATT panel: the heading and the safety badge render in
   * both branches, so the claim has to rest on the unavailable copy and on
   * the probe control being gone.
   */
  it('offers no probe control when the bridge is unavailable', () => {
    const wrapper = mountProbe(bleBridge(false))
    const text = wrapper.text()

    expect(text).toContain('Abre esta sección desde la aplicación Android')
    expect(text).toContain('El navegador web no puede abrir el puente BLE nativo.')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})

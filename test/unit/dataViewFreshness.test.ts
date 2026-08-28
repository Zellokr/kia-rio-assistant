// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import DataView from '~/components/DataView.vue'
import type {
  ObdTelemetryMetric
} from '~~/core/obd/telemetry/ObdTelemetryStore'

/**
 * The defect found at the car on 2026-08-28, asserted on rendered output.
 *
 * A frozen reading and a live one were pixel-identical: the same bold value
 * over the round-trip time of the command that fetched it. Nothing on the
 * card said when it was taken, so the screen went on claiming the engine
 * was doing something it had stopped confirming.
 */
const NOW = Date.parse('2026-08-28T15:00:00.000Z')

const stubs = {
  UCard: { template: '<div><slot /></div>' },
  UContainer: { template: '<div><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UButton: { template: '<button type="button"><slot /></button>' },
  UInput: { template: '<input />' },
  USelect: { template: '<select><slot /></select>' },
  UAlert: {
    props: ['title', 'description'],
    template: '<div>{{ title }} {{ description }}<slot /></div>'
  }
}

function metric(updatedAt: string, value = 812): ObdTelemetryMetric {
  return {
    key: 'engineRpm',
    pid: '010C',
    label: 'RPM',
    value,
    unit: 'rpm',
    updatedAt,
    latencyMs: 40
  }
}

function mountWith(engineRpm: ObdTelemetryMetric | undefined) {
  return mount(DataView, {
    props: {
      sessionState: 'ready',
      telemetryRunning: true,
      telemetry: {
        engineRpm,
        vehicleSpeed: undefined,
        coolantTemperature: undefined,
        engineLoad: undefined,
        throttlePosition: undefined
      },
      supportedPids: ['0C'],
      commands: ['010C'],
      selectedCommand: '010C',
      transportChoice: 'android-ble'
    },
    global: { stubs }
  })
}

describe('DataView reading freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows how old a fresh reading is, not how fast it arrived', () => {
    const text = mountWith(metric('2026-08-28T14:59:57.000Z')).text()

    expect(text).toContain('hace 3 s')
    expect(text).not.toContain('40 ms')
  })

  it('says the readings stopped when one goes stale', () => {
    const text = mountWith(metric('2026-08-28T14:59:30.000Z')).text()

    expect(text).toContain('Lecturas sin actualizar')
    expect(text).toContain('Sin actualizar hace 30 s')
  })

  it('leaves the warning off while the readings are current', () => {
    const text = mountWith(metric('2026-08-28T14:59:59.000Z')).text()

    expect(text).not.toContain('Lecturas sin actualizar')
  })

  /**
   * The heart of it. Nothing in the store changes once polling stops, so
   * the age has to advance on the component's own clock — otherwise the
   * card freezes at "hace 1 s" forever and the lie comes back.
   */
  it('keeps ageing a reading after the vehicle goes quiet', async () => {
    const wrapper = mountWith(metric('2026-08-28T15:00:00.000Z'))

    expect(wrapper.text()).not.toContain('Lecturas sin actualizar')

    vi.setSystemTime(NOW + 30_000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(wrapper.text()).toContain('Lecturas sin actualizar')
  })

  /**
   * A card that was never polled shows an em dash. Warning that the car
   * stopped answering, when it was never asked, would be a different lie.
   */
  it('says nothing about staleness when there is no reading at all', () => {
    const text = mountWith(undefined).text()

    expect(text).not.toContain('Lecturas sin actualizar')
    expect(text).toContain('Sin muestra')
  })
})
